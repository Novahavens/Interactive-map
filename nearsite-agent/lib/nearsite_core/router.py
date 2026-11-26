"""Turns outside events into resumes of the right claim thread.

    map tick / X / Submit / send back   agent_inbox row          -> human_pick / submit_pressed / person_action
    Slack Approve (both people)         agent_approvals rows     -> approvals, then submission_approvals rows
    Quo message from a landlord          webhook payload          -> landlord_message (STOP honoured at once)
    Nearsite feed / expiry               scheduled sweep          -> start / tick

Everything here is plumbing: the graph decides what each event means.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable, Iterable

from . import approvals as A
from .runtime import Runtime, claim_key

INBOX_TYPES = {"human_pick", "submit_pressed", "person_action"}


def from_inbox(row: dict) -> tuple[str, dict]:
    """One agent_inbox row -> (claim key, event). Refuses anything the map may not send."""
    t = row["type"]
    if t not in INBOX_TYPES:
        raise ValueError(f"the map can't send {t}")
    p = row.get("payload") or {}
    if isinstance(p, str):
        p = json.loads(p)
    ev: dict = {"type": t, "by": row.get("created_by")}
    if t == "human_pick":
        if p.get("decision") not in ("accept", "decline"):
            raise ValueError("decision must be accept or decline")
        ev.update(home=row["home_key"], decision=p["decision"])
    elif t == "person_action":
        if p.get("action") not in ("drop", "resume"):
            raise ValueError("action must be drop or resume")
        ev.update(home=row["home_key"], action=p["action"], resume_to=p.get("resume_to"))
    return claim_key(row["claim_id"]), ev


def consume_inbox(rt: Runtime, rows: Iterable[dict], mark: Callable[[int, str | None], None]) -> dict:
    """Applies each unprocessed inbox row once, oldest first. `mark(id, error)` records it as done."""
    done, failed = 0, 0
    for row in sorted(rows, key=lambda r: r["id"]):
        try:
            key, ev = from_inbox(row)
            rt.send(key, ev)
            mark(row["id"], None)
            done += 1
        except Exception as e:  # a bad row is recorded and skipped, never retried forever
            mark(row["id"], f"{type(e).__name__}: {e}")
            failed += 1
    return {"applied": done, "refused": failed}


def on_approvals(rt: Runtime, batch: dict, rows: list[dict], cfg: dict) -> dict:
    """batch: {"batch_id", "claims": [claim keys]}. Resumes each claim with the approval state.
    Only rows whose Slack id matches the configured approver count (approvals.from_rows)."""
    ap = A.from_rows(rows, batch["batch_id"], cfg)
    out = {}
    for key in batch["claims"]:
        out[key] = rt.send(key, {"type": "approvals", "approvals": ap, "batch_id": batch["batch_id"]})["stage"]
    return {"approvals": ap, "claims": out}


STOP_WORDS = {"stop", "stop all", "unsubscribe", "cancel", "end", "quit"}


def from_quo_message(payload: dict, find_home: Callable[[str], tuple[str, str] | None]) -> tuple[str, dict] | None:
    """Quo 'message.received' webhook -> landlord_message for the home whose landlord texted.
    `find_home(phone)` returns (claim key, home key) for an open outreach thread, or None."""
    if payload.get("type") != "message.received":
        return None
    obj = (payload.get("data") or {}).get("object") or {}
    phone, text = obj.get("from"), str(obj.get("text") or obj.get("body") or "")
    hit = find_home(phone) if phone else None
    if not hit:
        return None
    key, home = hit
    ev = {"type": "landlord_message", "home": home, "text": text, "at": obj.get("createdAt")}
    if text.strip().lower() in STOP_WORDS:
        ev["stop"] = True
    return key, ev


def sweep(rt: Runtime, open_claims: Iterable[str], now: datetime | None = None) -> dict:
    return rt.sweep(list(open_claims), now or datetime.now(timezone.utc))


def pg_projector(conn) -> Callable[[str, dict], None]:
    """Writes each claim's projection to agent_state, which the map reads (map_agent_state)."""
    def project(key: str, proj: dict) -> None:
        with conn.cursor() as cur:
            cur.execute("""insert into agent_state (claim_id, stage, state, graph_version, updated_at)
                           values (%s, %s, %s, %s, now())
                           on conflict (claim_id) do update set stage = excluded.stage, state = excluded.state,
                             graph_version = excluded.graph_version, updated_at = now()""",
                        (key, proj["stage"], json.dumps(proj), proj["graph_version"]))
        conn.commit()
    return project
