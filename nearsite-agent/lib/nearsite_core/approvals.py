"""Reads William's and Lou's approval presses for a batch.

Rows come from public.agent_approvals, which only the Slack button handler
(handlers/slack-approvals) writes. A row only counts when its Slack user is
the one configured for that person, so a row written any other way with the
wrong Slack id is ignored.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request


def from_rows(rows: list[dict], batch_id: str, cfg: dict) -> dict:
    people = cfg["approvals"]["people"]
    latest: dict[str, str] = {}
    for r in sorted(rows, key=lambda r: str(r.get("pressed_at") or "")):
        p = r.get("person")
        if r.get("batch_id") != batch_id or p not in people:
            continue
        if r.get("slack_user") != people[p].get("slack_user"):
            continue
        latest[p] = "approved" if r.get("action") == "approve" else str(r.get("action"))
    return {p: latest.get(p, "waiting") for p in cfg["approvals"]["nearsite_required"]}


def fetch(batch_id: str, cfg: dict) -> list[dict]:
    """Read-only GET from Supabase REST. Needs SUPABASE_URL and SUPABASE_READ_KEY."""
    base, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_READ_KEY")
    if not base or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_READ_KEY are needed to read approvals")
    url = f"{base}/rest/v1/agent_approvals?batch_id=eq.{urllib.parse.quote(batch_id)}&order=pressed_at.asc"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())
