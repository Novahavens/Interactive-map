"""Regressions found in the senior engineer review (26 Nov 2026). Each test reproduces a root cause."""
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest

from nearsite_core import harness as H
from test_harness import _walk_to_called, at, seeded, status, store  # noqa: F401  (fixtures)


def test_claim_goes_back_when_its_only_ready_home_drops(seeded, fx, cfg):
    """Root cause: claim edges only moved forward, so a claim could sit in 'ready' with no ready home."""
    store, hks = seeded
    hk = _walk_to_called(store, hks, fx, cfg)
    H.tick(store, cfg, at(7), env={})
    assert store.load()["claims"]["90003"]["stage"] == "ready"
    s = store.load(); s["claims"]["90003"]["homes"][hk]["facts"]["photos_url"] = ""; store.save(s)   # landlord pulls photos
    H.tick(store, cfg, at(8), env={})   # ready -> verified (re-check fails)
    H.tick(store, cfg, at(9), env={})   # verified -> needs_person
    H.ingest(store, {"type": "person_action", "claim": "90003", "home": hk, "action": "drop"}, at(10))
    H.tick(store, cfg, at(11), env={})
    for k in hks[1:]:
        H.ingest(store, {"type": "human_pick", "claim": "90003", "home": k, "decision": "decline"}, at(12))
    H.tick(store, cfg, at(13), env={})
    c = store.load()["claims"]["90003"]
    assert c["stage"] == "sourcing", c["history"]
    src = [w for w in store.load()["work"].values() if w["kind"] == "source_homes"]
    assert src and src[-1]["status"] == "queued"   # goes looking for more homes


def test_queued_work_is_held_again_if_the_switch_goes_off(seeded, cfg):
    """Root cause: _queue never re-checked a queued item, so switching off didn't stop queued work."""
    store, hks = seeded
    live = json.loads(json.dumps(cfg)); live["live"]["master"] = True; live["live"]["quo_texts"] = True
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))
    H.tick(store, live, at(3), env={"NEARSITE_AGENT_LIVE": "1"})
    H.tick(store, cfg, at(4), env={})
    w = [w for w in store.load()["work"].values() if w["kind"] == "send_outreach"]
    assert len(w) == 1 and w[0]["status"] == "held_switch_off"


def test_concurrent_ingests_lose_nothing(seeded, cfg):
    """Root cause: load-modify-save without a lock; agents reporting at the same time overwrote each other."""
    store, hks = seeded
    H.ingest(store, {"type": "human_pick", "claim": "90003", "home": hks[0], "decision": "accept"}, at(2))

    def worker():
        for _ in range(20):
            H.ingest(store, {"type": "call_attempt", "claim": "90003", "home": hks[0]}, at(3))

    ts = [threading.Thread(target=worker) for _ in range(3)]
    tk = threading.Thread(target=lambda: [H.tick(store, cfg, at(3), env={}) for _ in range(10)])
    for t in ts + [tk]:
        t.start()
    for t in ts + [tk]:
        t.join()
    assert store.load()["claims"]["90003"]["homes"][hks[0]]["facts"]["call_attempts"] == 60


def test_ingest_for_unknown_home_is_a_clear_error(seeded):
    store, _ = seeded
    with pytest.raises(KeyError, match="unknown home"):
        H.ingest(store, {"type": "human_pick", "claim": "90003", "home": "nope", "decision": "accept"}, at(2))


def test_needs_person_says_why_not_a_false_drop(cfg):
    """Regression (found in William's demo): a home the checker sent to a person read 'a person dropped it'."""
    from datetime import datetime, timezone
    from nearsite_core import harness as H
    now = datetime(2026, 11, 26, 20, tzinfo=timezone.utc)
    h = {"status": "needs_person", "home": {}, "facts": {}, "history": [
        {"at": "x", "from": "verified", "to": "needs_person", "edge": "checker blocked", "why": "Missing photo link."}]}
    st = {"claims": {"c1": {"claim": {"nearsite_claim_id": "c1"}, "stage": "verifying", "facts": {}, "homes": {"h1": h}, "history": []}}, "work": {}}
    H.advance(st, cfg, now, {})
    w = st["claims"]["c1"]["homes"]["h1"]["waiting_on"]
    assert w == "a person: Missing photo link." and "dropped" not in w


def test_waiting_text_has_no_internal_names():
    """Regression (found in William's demo): the map read 'waiting for submit_claim (held_switch_off)'."""
    from nearsite_core import harness as H
    assert H._work_wait("submit_claim", "held_switch_off") == "the Nearsite submission: ready, held because Nearsite saves are switched off"
    assert "_" not in H._work_wait("place_call", "blocked_by_checker")


def _one_home_state(status, facts=None, claim=None):
    h = {"status": status, "home": {"home_id": "h1", "owner_monthly": 2000}, "facts": dict(facts or {}), "history": []}
    c = {"claim": claim or {"nearsite_claim_id": "c1", "move_in": "2099-01-01", "move_out": "2099-02-01"},
         "stage": "outreach", "facts": {}, "homes": {"h1": h}, "history": []}
    return {"claims": {"c1": c}, "work": {}}


def test_stop_drops_a_home_at_any_later_step(cfg):
    """Review of PR #29: STOP after the landlord agreed to a call left the home eligible for submission."""
    from datetime import datetime, timezone
    from nearsite_core import harness as H
    now = datetime(2026, 11, 26, 20, tzinfo=timezone.utc)
    for status in ("accepted", "ok_to_call", "called", "verified", "ready", "needs_person"):
        st = _one_home_state(status, {"opted_out": True})
        H.advance(st, cfg, now, {})
        assert st["claims"]["c1"]["homes"]["h1"]["status"] == "dropped", status


def test_each_landlord_reply_gets_its_own_parse_work(cfg):
    """Review of PR #29: a second single-message reply reused the finished parse_reply work id and was never read."""
    from datetime import datetime, timezone
    from nearsite_core import harness as H
    now = datetime(2026, 11, 26, 20, tzinfo=timezone.utc)
    st = _one_home_state("messaged", {"messages_sent": 1, "last_message_at": now.isoformat()})
    H.apply_event(st, {"type": "landlord_message", "claim": "c1", "home": "h1", "text": "Who is this?"}, now)
    H.advance(st, cfg, now, {})
    first = {k for k, w in st["work"].items() if w["kind"] == "parse_reply"}
    H.apply_event(st, {"type": "landlord_reply", "claim": "c1", "home": "h1"}, now)
    H.advance(st, cfg, now, {})
    assert all(st["work"][k]["status"] == "done" for k in first)
    H.apply_event(st, {"type": "landlord_message", "claim": "c1", "home": "h1", "text": "Is it still needed?"}, now)
    H.advance(st, cfg, now, {})
    second = {k for k, w in st["work"].items() if w["kind"] == "parse_reply"} - first
    assert len(first) == 1 and len(second) == 1
    assert st["work"][second.pop()]["status"] in ("queued", "in_progress")


def test_outside_homes_compete_when_internal_falls_short(cfg):
    """Review of PR #29: 20 blocked internal homes filled the list and every fitting outside home was dropped."""
    from nearsite_core import scoring
    claim = {"beds": 2, "budget_monthly": 5000, "max_rate": 4200, "pets": None, "move_in": "2099-01-01", "move_out": "2099-02-01"}
    internal = [{"home_id": f"i{n}", "distance_mi": 2, "owner_monthly": 9000, "bedrooms": 2, "bathrooms": 1, "pets_ok": True} for n in range(cfg["sourcing"]["target_homes"])]
    external = [{"home_id": "e1", "source": "zillow", "distance_mi": 3, "owner_monthly": 1500, "bedrooms": 2, "bathrooms": 1, "pets_ok": True}]
    sl = scoring.shortlist(claim, internal, external, cfg)
    assert not sl["internal_sufficient"] and sl["used_external"]
    assert sl["homes"][0].home_id == "e1" and not sl["homes"][0].blockers
    assert len(sl["homes"]) == cfg["sourcing"]["target_homes"]
