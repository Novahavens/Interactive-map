"""The LangGraph runtime: durable, event-driven, idempotent, serialised per claim."""
import json
import os
import threading
from datetime import datetime, timedelta, timezone

import pytest

from nearsite_core import config as CFG
from nearsite_core import runtime as R

T0 = datetime(2026, 11, 26, 18, tzinfo=timezone.utc)
ON = {"NEARSITE_AGENT_LIVE": "1"}


def at(m):
    return (T0 + timedelta(minutes=m)).isoformat()


def rec(claims, cid="90003"):
    return {k: v for k, v in claims[cid].items() if k not in ("internal_homes", "external_homes")}


def homes(claims, n=3):
    hs = [dict(h, home_key=h["home_id"]) for h in claims["90003"]["internal_homes"][:n]]
    hs[0]["landlord_phone"] = "+15550100000"
    return hs


def live(cfg, *switches):
    c = json.loads(json.dumps(cfg))
    c["live"]["master"] = True
    for s in switches:
        c["live"][s] = True
    return c


@pytest.fixture
def rt(tmp_path, cfg):
    return R.local(str(tmp_path / "rt.db"), cfg, {})


def walk_to_ready(r, claims, fx):
    hs = homes(claims)
    k = hs[0]["home_key"]
    v = fx["verified"]["90003:" + k]
    r.start(rec(claims), T0)
    r.send("90003", {"type": "homes_scored", "homes": hs, "now": at(1)})
    r.send("90003", {"type": "human_pick", "home": k, "decision": "accept", "now": at(2)})
    r.send("90003", {"type": "outreach_sent", "home": k, "at": at(3), "now": at(3)})
    r.send("90003", {"type": "landlord_reply", "home": k, "available": True, "landlord_name": "A", "address": v["address"],
                     "landlord_phone": "+15550100000", "call_consent": True, "now": at(4)})
    answers = {x: y for x, y in v.items() if not x.startswith("_")}
    return k, r.send("90003", {"type": "call_result", "home": k, "answers": answers, "verified": True, "now": at(5)})


def test_pauses_on_people_and_resumes_on_events(rt, claims, fx):
    r, ob, dq = rt
    s = r.start(rec(claims), T0)
    assert s["paused"] and s["stage"] == "new" and s["waiting_for"]["waiting_on"] == "no homes scored yet"
    k, s = walk_to_ready(r, claims, fx)
    assert s["stage"] == "ready" and s["paused"]
    assert "Submit" in s["waiting_for"]["waiting_on"]


def test_full_path_to_submitted_with_outward_work_held(rt, claims, fx):
    r, ob, dq = rt
    k, _ = walk_to_ready(r, claims, fx)
    r.send("90003", {"type": "submit_pressed", "now": at(6)})
    s = r.send("90003", {"type": "approvals", "approvals": {"william": "approved", "lou": "approved"}, "now": at(7)})
    assert s["work"]["nearsite:90003:-:submit_claim:0"] == "held_switch_off"
    s = r.send("90003", {"type": "submitted", "homes": [k], "now": at(8)})
    assert s["stage"] == "submitted"
    s = r.send("90003", {"type": "outcome", "result": "won", "now": at(9)})
    assert s["stage"] == "won" and not s["paused"]
    assert [d["kind"] for d in dq.sent] == ["source_homes"]   # the only work dispatched: reading needs no switch
    assert r.send("90003", {"type": "tick", "now": at(10)})["stage"] == "won"   # finished claims ignore events


def test_one_approval_is_not_enough(rt, claims, fx):
    r, *_ = rt
    walk_to_ready(r, claims, fx)
    r.send("90003", {"type": "submit_pressed", "now": at(6)})
    s = r.send("90003", {"type": "approvals", "approvals": {"william": "approved"}, "now": at(7)})
    assert CFG.load(CFG.CONFIG_PATH)["approvals"]["people"]["lou"]["name"] in s["waiting_for"]["waiting_on"] and "nearsite:90003:-:submit_claim:0" not in s["work"]


def test_survives_a_restart(tmp_path, claims, cfg):
    path = str(tmp_path / "rt.db")
    r1, *_ = R.local(path, cfg, {})
    r1.start(rec(claims), T0)
    r1.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    del r1
    r2, *_ = R.local(path, cfg, {})                       # a new process, same database
    s = r2.send("90003", {"type": "human_pick", "home": homes(claims)[0]["home_key"], "decision": "accept", "now": at(2)})
    assert s["stage"] == "outreach"
    assert len(r2.timeline("90003")) > 5 and r2.explain("90003")["path"][0].startswith("new -> sourcing")


def test_live_work_is_dispatched_exactly_once(tmp_path, claims, cfg):
    r, ob, dq = R.local(str(tmp_path / "rt.db"), live(cfg, "quo_texts"), ON)
    r.start(rec(claims), T0)
    r.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    k = homes(claims)[0]["home_key"]
    r.send("90003", {"type": "human_pick", "home": k, "decision": "accept", "now": at(2)})
    for m in (3, 4, 5):
        r.sweep(["90003"], T0 + timedelta(minutes=m))       # replays and sweeps must not resend
    outreach = [d for d in dq.sent if d["kind"] == "send_outreach"]
    assert len(outreach) == 1 and outreach[0]["idempotency_key"]
    assert sum(1 for o in ob.all() if o["kind"] == "send_outreach") == 1


def test_outbox_refuses_a_second_hand_off(tmp_path):
    import sqlite3
    ob = R.Outbox(conn=sqlite3.connect(str(tmp_path / "o.db")))
    item = {"id": "1:h:send_outreach:0", "kind": "send_outreach"}
    k = R.idempotency_key(item)
    assert ob.claim(k, item) is True and ob.claim(k, item) is False


def test_checker_gate_holds_outward_work_that_fails_now(tmp_path, claims, cfg):
    r, ob, dq = R.local(str(tmp_path / "rt.db"), live(cfg, "quo_calls", "quo_texts"), ON)
    k, _ = walk_to_ready(r, claims, fx_stub := json.loads(open(os.path.join(os.path.dirname(__file__), "..", "fixtures", "claims.json")).read()))
    # the call already happened in walk_to_ready; check a fresh home whose consent is missing
    hs = homes(claims)
    k2 = hs[1]["home_key"]
    r.send("90003", {"type": "human_pick", "home": k2, "decision": "accept", "now": at(10)})
    s = r.status("90003")
    assert all(w != "in_progress" for wid, w in s["work"].items() if k2 in wid)   # no contact: never dispatched


def test_concurrent_events_are_serialised(rt, claims, fx):
    r, *_ = rt
    walk_to_ready(r, claims, fx)
    k2 = homes(claims)[1]["home_key"]
    r.send("90003", {"type": "human_pick", "home": k2, "decision": "accept", "now": at(10)})

    def worker():
        for _ in range(5):
            r.send("90003", {"type": "call_attempt", "home": k2, "now": at(11)})
    ts = [threading.Thread(target=worker) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    v = r.app.get_state(r.config("90003")).values
    assert v["c"]["homes"][k2]["facts"]["call_attempts"] == 20


def test_expiry_by_sweep(rt, claims):
    r, *_ = rt
    r.start(rec(claims), T0)
    r.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    assert r.sweep(["90003"], datetime(2026, 12, 1, 1, tzinfo=timezone.utc)) == {"90003": "lost"}


def test_postgres_runtime_refuses_while_switch_off(cfg):
    with pytest.raises(PermissionError):
        R.postgres("postgresql://unused", cfg, {})


PG = os.environ.get("NEARSITE_TEST_PG")


@pytest.mark.skipif(not PG, reason="set NEARSITE_TEST_PG to a throwaway Postgres to run")
def test_on_real_postgres(claims, fx, cfg):
    import psycopg
    with psycopg.connect(PG, autocommit=True) as c:
        for t in ("checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations", "agent_outbox"):
            c.execute(f"drop table if exists {t} cascade")
    r, ob, dq = R.postgres(PG, live(cfg, "supabase_writes"), ON)
    k, s = walk_to_ready(r, claims, fx)
    assert s["stage"] == "ready"
    r2, *_ = R.postgres(PG, live(cfg, "supabase_writes"), ON)   # restart against the same database
    s = r2.send("90003", {"type": "submit_pressed", "now": at(6)})
    assert s["stage"] == "ready" and "approval" in s["waiting_for"]["waiting_on"]
    assert len(r2.timeline("90003")) > 10


@pytest.mark.skipif(not os.environ.get("NEARSITE_TEST_PG_ASCII"), reason="needs a SQL_ASCII database")
def test_refuses_a_non_utf8_database(cfg):
    with pytest.raises(RuntimeError, match="UTF8"):
        R.postgres(os.environ["NEARSITE_TEST_PG_ASCII"], live(cfg, "supabase_writes"), ON)
