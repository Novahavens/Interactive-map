"""Shared engine for the Nearsite agent skills.

Pure functions: no network, no writes. The skills call these to score homes,
price quotes, check every outward step, and build the exact payloads that
would be typed or sent. Live actions happen only in the agents' own tool
calls, behind the live gate hook (hooks/live_gate.py).
"""
from . import approvals, checker, claims, config, messages, payloads, pricing, scoring, slack_card, state, templates, tickets  # noqa: F401

__version__ = "0.1.0"
