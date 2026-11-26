import json
from datetime import datetime, timedelta, timezone

import pytest

from nearsite_core import router as Rt, runtime as R
from test_runtime import T0, at, homes, rec, walk_to_ready  # noqa: F401


@pytest.fixture
def rt(tmp_path, cfg):
    r, *_ = R.local(str(tmp_path / "rt.db"), cfg, {})
    return r


def test_inbox_rows_resume_the_right_claim_once(rt, claims):
    rt.start(rec(claims), T0)
    rt.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    k = homes(claims)[0]["home_key"]
    marks = {}
    rows = [{"id": 2, "claim_id": "nearsite:90003", "home_key": homes(claims)[1]["home_key"], "type": "human_pick", "payload": {"decision": "decline"}},
            {"id": 1, "claim_id": "nearsite:90003", "home_key": k, "type": "human_pick", "payload": json.dumps({"decision": "accept"}), "created_by": "Will"},
            {"id": 3, "claim_id": "nearsite:90003", "home_key": k, "type": "submitted", "payload": {}},
            {"id": 4, "claim_id": "nearsite:90003", "home_key": "nope", "type": "human_pick", "payload": {"decision": "accept"}}]
    out = Rt.consume_inbox(rt, rows, lambda i, e: marks.__setitem__(i, e))
    assert out == {"applied": 2, "refused": 2}
    assert marks[1] is None and marks[2] is None and "can't send submitted" in marks[3] and "unknown home" in marks[4]
    v = rt.app.get_state(rt.config("90003")).values["c"]["homes"]
    assert v[k]["status"] == "accepted" and v[homes(claims)[1]["home_key"]]["status"] == "declined"


def test_slack_approvals_need_both_real_people(rt, claims, fx, cfg):
    walk_to_ready(rt, claims, fx)
    rt.send("90003", {"type": "submit_pressed", "now": at(6)})
    W, L = cfg["approvals"]["people"]["william"]["slack_user"], cfg["approvals"]["people"]["lou"]["slack_user"]
    batch = {"batch_id": "b1", "claims": ["nearsite:90003"]}
    rows = [{"batch_id": "b1", "person": "william", "action": "approve", "slack_user": W, "pressed_at": "1"},
            {"batch_id": "b1", "person": "lou", "action": "approve", "slack_user": "UIMPOSTER", "pressed_at": "2"}]
    r = Rt.on_approvals(rt, batch, rows, cfg)
    assert r["approvals"] == {"william": "approved", "lou": "waiting"}
    rows.append({"batch_id": "b1", "person": "lou", "action": "approve", "slack_user": L, "pressed_at": "3"})
    Rt.on_approvals(rt, batch, rows, cfg)
    assert rt.status("90003")["work"]["nearsite:90003:-:submit_claim:0"] == "held_switch_off"


def test_quo_stop_drops_the_home_at_once(rt, claims):
    rt.start(rec(claims), T0)
    rt.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    k = homes(claims)[0]["home_key"]
    rt.send("90003", {"type": "human_pick", "home": k, "decision": "accept", "now": at(2)})
    rt.send("90003", {"type": "outreach_sent", "home": k, "at": at(3), "now": at(3)})
    find = lambda phone: ("nearsite:90003", k) if phone == "+15550100000" else None  # noqa: E731
    assert Rt.from_quo_message({"type": "message.received", "data": {"object": {"from": "+19999999999", "text": "hi"}}}, find) is None
    key, ev = Rt.from_quo_message({"type": "message.received", "data": {"object": {"from": "+15550100000", "text": "STOP"}}}, find)
    rt.send(key, {**ev, "now": at(4)})
    assert rt.app.get_state(rt.config(key)).values["c"]["homes"][k]["status"] == "dropped"


def test_a_normal_reply_queues_the_outreach_agent_to_read_it(rt, claims):
    rt.start(rec(claims), T0)
    rt.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    k = homes(claims)[0]["home_key"]
    rt.send("90003", {"type": "human_pick", "home": k, "decision": "accept", "now": at(2)})
    rt.send("90003", {"type": "outreach_sent", "home": k, "at": at(3), "now": at(3)})
    s = rt.send("90003", {"type": "landlord_message", "home": k, "text": "Yes it's free, I'm Pat, call me anytime", "now": at(4)})
    assert any(":parse_reply:" in w and st in ("in_progress", "queued") for w, st in s["work"].items())
    s = rt.send("90003", {"type": "landlord_reply", "home": k, "available": True, "landlord_name": "Pat", "address": "1 Main St",
                          "landlord_phone": "+15550100000", "call_consent": True, "now": at(5)})
    assert s["waiting_for"]["homes"][k]["status"] == "ok_to_call"
    assert all(st == "done" for w, st in s["work"].items() if ":parse_reply:" in w)


def test_projection_is_written_for_the_map(tmp_path, claims, cfg):
    seen = {}
    r, *_ = R.local(str(tmp_path / "p.db"), cfg, {})
    r.project = lambda key, proj: seen.__setitem__(key, proj)
    r.start(rec(claims), T0)
    r.send("90003", {"type": "homes_scored", "homes": homes(claims), "now": at(1)})
    p = seen["nearsite:90003"]
    assert p["stage"] == "sourcing" and len(p["homes"]) == 3 and p["homes"][homes(claims)[0]["home_key"]]["label"].startswith("Suggested")
