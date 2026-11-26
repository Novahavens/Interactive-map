import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from nearsite_core import config, graph as G, harness as H

T0 = datetime(2026, 11, 26, 18, tzinfo=timezone.utc)
ROOT = Path(__file__).resolve().parents[1]


def at(m):
    return T0 + timedelta(minutes=m)


@pytest.fixture
def store(tmp_path):
    return H.LocalStore(tmp_path / "st")


@pytest.fixture
def seeded(store, claims, cfg):
    """Claim 90003 with three homes scored."""
    c = {k: v for k, v in claims["90003"].items() if k not in ("internal_homes", "external_homes")}
    H.ingest(store, {"type": "claim_new", "claim_record": c}, at(0))
    homes = [dict(h, home_key=h["home_id"]) for h in claims["90003"]["internal_homes"][:3]]
    homes[0]["landlord_phone"] = "+15550100000"
    H.ingest(store, {"type": "homes_scored", "claim": "90003", "homes": homes}, at(1))
    return store, [h["home_key"] for h in homes]


def status(store, hk):
    return store.load()["claims"]["90003"]["homes"][hk]["status"]


def test_graph_is_valid_and_exports():
    assert G.validate() == []
    ex = G.export()
    assert ex["version"] == G.GRAPH_VERSION
    assert {"human_pick", "approvals_both", "checker_submit"} <= set(ex["gates"])
    assert "flowchart LR" in G.to_mermaid("home") and "flowchart LR" in G.to_mermaid("claim")


def test_every_outward_work_edge_needs_a_switch():
    for e in G.HOME_EDGES + G.CLAIM_EDGES:
        if e.work in ("send_outreach", "send_follow_up", "place_call", "submit_claim"):
            assert e.switch and any(g.startswith("switch_") for g in e.gates), e.label


def test_new_claim_queues_sourcing_once(store, claims, cfg):
    c = {k: v for k, v in claims["90001"].items() if k not in ("internal_homes", "external_homes")}
    H.ingest(store, {"type": "claim_new", "claim_record": c}, at(0))
    H.tick(store, cfg, at(1), env={})
    H.tick(store, cfg, at(2), env={})
    work = store.load()["work"]
    assert [w["kind"] for w in work.values()] == ["source_homes"]
    assert list(work.values())[0]["status"] == "queued"  # reading needs no switch


def test_nothing_moves_without_a_person(seeded, cfg):
    store, hks = seeded
    H.tick(store, cfg, at(2), env={})
    s = store.load()["claims"]["90003"]
    assert s["stage"] == "sourcing" and all(h["status"] == "suggested" for h in s["homes"].values())
    assert "tick" in s["waiting_on"] or "person" in s["waiting_on"]


def test_outreach_is_held_while_switch_off_and_never_duplicated(seeded, cfg):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    for m in (3, 4, 5):
        H.tick(store, cfg, at(m), env={})
    work = [w for w in store.load()["work"].values() if w["kind"] == "send_outreach"]
    assert len(work) == 1 and work[0]["status"] == "held_switch_off" and work[0]["agent"] == "outreach-agent"
    assert status(store, hks[0]) == "accepted"


def test_outreach_queued_when_live(seeded, cfg):
    store, hks = seeded
    live = json.loads(json.dumps(cfg)); live["live"]["master"] = True; live["live"]["quo_texts"] = True
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.tick(store, live, at(3), env={"NEARSITE_AGENT_LIVE": "1"})
    w = [w for w in store.load()["work"].values() if w["kind"] == "send_outreach"][0]
    assert w["status"] == "queued"


def test_checker_blocks_outreach_without_a_way_to_reach_landlord(seeded, cfg):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[1], "decision": "accept"}, at(2))
    H.tick(store, cfg, at(3), env={})
    h = store.load()["claims"]["90003"]["homes"][hks[1]]
    assert h["status"] == "accepted" and "No way to reach the landlord" in h["waiting_on"]
    assert not [w for w in store.load()["work"].values() if w["home_key"] == hks[1]]


def test_state_resumes_from_disk(seeded, cfg, tmp_path):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.tick(store, cfg, at(3), env={})
    again = H.LocalStore(tmp_path / "st")          # a fresh process
    H.ingest(again, {"type": "outreach_sent", "claim": "90003", "home": hks[0], "at": at(4).isoformat()}, at(4))
    H.tick(again, cfg, at(5), env={})
    assert status(again, hks[0]) == "messaged"
    assert again.load()["ticks"] == 2


def test_stop_drops_the_home(seeded, cfg):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.ingest(store, {"type": "outreach_sent", "claim": "90003", "home": hks[0], "at": at(3).isoformat()}, at(3))
    H.ingest(store, {"type": "landlord_reply", "claim": "90003", "home": hks[0], "opted_out": True}, at(4))
    H.tick(store, cfg, at(5), env={})
    assert status(store, hks[0]) == "dropped"


def test_one_follow_up_then_drop(seeded, cfg):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.ingest(store, {"type": "outreach_sent", "claim": "90003", "home": hks[0], "at": at(3).isoformat()}, at(3))
    H.tick(store, cfg, at(4), env={})
    H.tick(store, cfg, at(60 * 25), env={})
    fu = [w for w in store.load()["work"].values() if w["kind"] == "send_follow_up"]
    assert len(fu) == 1
    H.ingest(store, {"type": "outreach_sent", "claim": "90003", "home": hks[0], "at": at(60 * 26).isoformat()}, at(60 * 26))
    H.tick(store, cfg, at(60 * 30), env={})
    assert len([w for w in store.load()["work"].values() if w["kind"] == "send_follow_up"]) == 1  # never a third message
    H.tick(store, cfg, at(60 * 75), env={})
    assert status(store, hks[0]) == "dropped"


def test_no_call_without_written_consent(seeded, cfg):
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.ingest(store, {"type": "outreach_sent", "claim": "90003", "home": hks[0], "at": at(3).isoformat()}, at(3))
    H.ingest(store, {"type": "landlord_reply", "claim": "90003", "home": hks[0], "available": True, "landlord_name": "A",
                     "address": "1 Main St", "landlord_phone": "+15550100000"}, at(4))
    H.tick(store, cfg, at(5), env={})
    assert status(store, hks[0]) == "answers_in"
    assert not [w for w in store.load()["work"].values() if w["kind"] == "place_call"]


def _walk_to_called(store, hks, fx, cfg, verified=True, answers=None):
    v = fx["verified"]["90003:9900000140"]
    hk = hks[0]
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hk, "decision": "accept"}, at(2))
    H.ingest(store, {"type": "outreach_sent", "claim": "90003", "home": hk, "at": at(3).isoformat()}, at(3))
    H.ingest(store, {"type": "landlord_reply", "claim": "90003", "home": hk, "available": True, "landlord_name": "A",
                     "address": v["address"], "landlord_phone": "+15550100000", "call_consent": True}, at(4))
    H.tick(store, cfg, at(5), env={})
    a = {k: x for k, x in v.items() if not k.startswith("_")}
    a.update(answers or {})
    H.ingest(store, {"type": "call_result", "claim": "90003", "home": hk, "answers": a, "verified": verified}, at(6))
    return hk


def test_verified_home_passes_checker_and_waits_for_people(seeded, fx, cfg):
    store, hks = seeded
    hk = _walk_to_called(store, hks, fx, cfg)
    H.tick(store, cfg, at(7), env={})
    s = store.load()["claims"]["90003"]
    assert s["homes"][hk]["status"] == "ready" and s["stage"] == "ready"
    H.ingest(store, {"type": "submit_pressed", "claim": "90003"}, at(8))
    H.ingest(store, {"type": "approvals", "claim": "90003", "approvals": {"william": "approved"}}, at(8))
    H.tick(store, cfg, at(9), env={})
    s = store.load()["claims"]["90003"]
    assert s["stage"] == "ready" and cfg["approvals"]["people"]["lou"]["name"] in s["waiting_on"]
    assert not [w for w in store.load()["work"].values() if w["kind"] == "submit_claim"]
    H.ingest(store, {"type": "approvals", "claim": "90003", "approvals": {"william": "approved", "lou": "approved"}}, at(10))
    H.tick(store, cfg, at(11), env={})
    sub = [w for w in store.load()["work"].values() if w["kind"] == "submit_claim"]
    assert len(sub) == 1 and sub[0]["status"] == "held_switch_off" and sub[0]["agent"] == "nearsite-agent"


def test_call_shows_pets_not_allowed_drops_home(seeded, fx, cfg):
    store, hks = seeded
    hk = _walk_to_called(store, hks, fx, cfg, answers={"pets_ok": False})
    H.tick(store, cfg, at(7), env={})
    assert status(store, hk) == "dropped"


def test_failing_check_goes_to_a_person_then_back(seeded, fx, cfg):
    store, hks = seeded
    hk = _walk_to_called(store, hks, fx, cfg, answers={"photos_url": ""})
    H.tick(store, cfg, at(7), env={})
    assert status(store, hk) == "verified"
    H.tick(store, cfg, at(8), env={})
    h = store.load()["claims"]["90003"]["homes"][hk]
    assert h["status"] == "needs_person" and "photo link" in h["history"][-1]["why"]
    s = store.load(); s["claims"]["90003"]["homes"][hk]["facts"]["photos_url"] = "https://example.com/p"; store.save(s)
    H.ingest(store, {"type": "person_action", "claim": "90003", "home": hk, "action": "resume", "resume_to": "verified"}, at(9))
    H.tick(store, cfg, at(10), env={})
    assert status(store, hk) == "ready"


def test_expired_claim_is_lost(seeded, cfg):
    store, hks = seeded
    H.tick(store, cfg, datetime(2026, 12, 1, 1, tzinfo=timezone.utc), env={})
    assert store.load()["claims"]["90003"]["stage"] == "lost"


def test_explain_tells_the_story(seeded, fx, cfg):
    store, hks = seeded
    hk = _walk_to_called(store, hks, fx, cfg)
    H.tick(store, cfg, at(7), env={})
    e = H.explain(store, "90003")
    assert e["stage"] == "ready" and e["graph_version"] == G.GRAPH_VERSION
    assert any("checker passed" in p for p in e["homes"][hk]["path"])
    assert any(e["homes"][k]["waiting_on"] for k in hks[1:])


def test_loop_stops_when_quiet(seeded, cfg):
    store, _ = seeded
    r = H.run_loop(store, ticks=10, cfg=cfg, env={}, now_fn=lambda: at(2))
    assert len(r) <= 4


def test_simulation_reaches_submitted(tmp_path):
    import subprocess, sys
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "harness.py"), "--store", str(tmp_path / "sim"), "simulate"],
                         capture_output=True, text=True, check=True)
    r = json.loads(out.stdout)
    assert r["explain"]["stage"] == "submitted"
    assert r["explain"]["homes"]["9900000140"]["status"] == "submitted"
    assert {w["kind"]: w["status"] for w in r["work"]} == {"source_homes": "done", "send_outreach": "done", "place_call": "done", "submit_claim": "done"}


def test_supabase_store_refuses_writes_while_off(cfg):
    calls = []
    st = H.SupabaseStore(lambda m, p, b: calls.append((m, p)) or [], cfg, env={})
    assert st.load()["claims"] == {}
    with pytest.raises(PermissionError):
        st.save({"graph_version": "x", "claims": {}, "work": {}, "ticks": 1})
    assert all(m == "GET" for m, _ in calls)


def test_supabase_store_writes_when_live(cfg):
    calls = []
    live = json.loads(json.dumps(cfg)); live["live"]["master"] = True; live["live"]["supabase_writes"] = True
    st = H.SupabaseStore(lambda m, p, b: calls.append((m, p, b)) or [], live, env={"NEARSITE_AGENT_LIVE": "1"})
    st.save({"graph_version": "v", "claims": {"1": {"stage": "new"}}, "work": {}, "ticks": 3})
    st.append_events([{"kind": "home_moved", "claim": "1", "home": "h"}])
    assert [c[1].split("?")[0] for c in calls] == ["/rest/v1/agent_state", "/rest/v1/agent_events"]
