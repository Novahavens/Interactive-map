"""Gate tickets: the only way a final submit gets past the live gate hook.

A ticket is written after the checker passes AND (for Nearsite) both approvals
are in. The hook consumes one ticket per final submit click or email send.
No ticket, expired ticket, or a ticket for another action means the hook
blocks the tool call.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

STATE_DIR = Path(os.environ.get("NEARSITE_AGENT_STATE") or Path.home() / ".nearsite-agent" / "tickets")
ACTIONS = ("nearsite_submit", "nearsite_add_property", "email_send")


def _sig(d: dict) -> str:
    core = {k: d[k] for k in sorted(d) if k != "sig"}
    return hashlib.sha256(json.dumps(core, sort_keys=True).encode()).hexdigest()[:16]


def issue(action: str, claim_id: str, home_ids: list[str], checker_passed: bool, approvals: dict,
          ttl_minutes: int, state_dir: Path | None = None) -> Path:
    if action not in ACTIONS:
        raise ValueError(f"unknown action {action}")
    if not checker_passed:
        raise PermissionError("checker did not pass; no ticket")
    d = {
        "action": action,
        "claim_id": str(claim_id),
        "home_ids": [str(h) for h in home_ids],
        "approvals": approvals,
        "issued_at": time.time(),
        "expires_at": time.time() + ttl_minutes * 60,
        "used": False,
    }
    d["sig"] = _sig(d)
    sd = state_dir or STATE_DIR
    sd.mkdir(parents=True, exist_ok=True)
    p = sd / f"{action}-{claim_id}-{int(d['issued_at'])}.json"
    p.write_text(json.dumps(d, indent=1))
    return p


def find_valid(action: str, state_dir: Path | None = None) -> Path | None:
    sd = state_dir or STATE_DIR
    if not sd.exists():
        return None
    now = time.time()
    for p in sorted(sd.glob(f"{action}-*.json")):
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        if d.get("used") or d.get("expires_at", 0) < now or d.get("sig") != _sig(d):
            continue
        return p
    return None


def consume(p: Path) -> None:
    d = json.loads(p.read_text())
    d["used"] = True
    d["used_at"] = time.time()
    p.write_text(json.dumps(d, indent=1))
