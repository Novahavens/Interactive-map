"""The two state machines the orchestrator moves things through.

Claim stages match the groups on the Monday All Claims board.
Home statuses match the status chip on each home in the map's claim panel.
A move that is not listed here is refused, so nothing skips a gate.
"""
from __future__ import annotations

CLAIM_STAGES = ["new", "sourcing", "outreach", "verifying", "ready", "submitted", "won", "lost"]
CLAIM_MOVES = {
    "new": {"sourcing", "lost"},
    "sourcing": {"outreach", "lost"},
    "outreach": {"verifying", "sourcing", "lost"},
    "verifying": {"ready", "outreach", "sourcing", "lost"},
    "ready": {"submitted", "verifying", "lost"},
    "submitted": {"won", "lost", "ready"},
    "won": set(),
    "lost": set(),
}

HOME_STATUSES = ["suggested", "accepted", "declined", "messaged", "answers_in", "ok_to_call", "called",
                 "verified", "ready", "submitted", "dropped", "needs_person"]
HOME_MOVES = {
    "suggested": {"accepted", "declined"},
    "accepted": {"messaged", "dropped", "needs_person"},
    "messaged": {"answers_in", "dropped", "needs_person"},
    "answers_in": {"ok_to_call", "dropped", "needs_person"},
    "ok_to_call": {"called", "dropped", "needs_person"},
    "called": {"verified", "dropped", "needs_person"},
    "verified": {"ready", "dropped", "needs_person"},
    "ready": {"submitted", "verified", "dropped"},
    "submitted": set(),
    "declined": set(),
    "dropped": set(),
    "needs_person": {"messaged", "ok_to_call", "called", "verified", "dropped"},
}

CHIP_LABEL = {
    "suggested": "Not picked", "accepted": "Accepted", "declined": "Declined", "messaged": "Messaged",
    "answers_in": "Answers in", "ok_to_call": "OK to call", "called": "Called", "verified": "Verified",
    "ready": "Ready", "submitted": "Submitted", "dropped": "Dropped", "needs_person": "Needs a person",
}


class BadMove(ValueError):
    pass


def move_claim(current: str, new: str) -> str:
    if new not in CLAIM_MOVES.get(current, set()):
        raise BadMove(f"claim cannot go from {current} to {new}")
    return new


def move_home(current: str, new: str) -> str:
    if new not in HOME_MOVES.get(current, set()):
        raise BadMove(f"home cannot go from {current} to {new}")
    return new
