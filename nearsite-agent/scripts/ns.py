#!/usr/bin/env python3
"""One command line for every skill. JSON in (a file or stdin), JSON out. No network.

    python3 scripts/ns.py live-status
    python3 scripts/ns.py shortlist   --claim claim.json --internal homes.json [--external ext.json]
    python3 scripts/ns.py message     --kind in_app|sona_text|sona_call|follow_up --claim c.json --home h.json
    python3 scripts/ns.py check-outreach --claim c.json --home h.json --message-file m.txt [--ctx ctx.json]
    python3 scripts/ns.py check-call  --claim c.json --home h.json [--ctx ctx.json]
    python3 scripts/ns.py quote       --claim c.json --home h.json
    python3 scripts/ns.py check-submit --claim c.json --home h.json [--ctx ctx.json]
    python3 scripts/ns.py nearsite-payloads --claim c.json --home h.json
    python3 scripts/ns.py email-option --claim c.json --home h.json --option 1
    python3 scripts/ns.py slack-card  --batch-id B --items items.json
    python3 scripts/ns.py issue-ticket --action nearsite_submit --claim c.json --home h.json --approvals approvals.json

issue-ticket re-runs the checker itself and refuses unless it passes; the agent
cannot hand it a pass. Each command prints JSON; exit code 0 means it ran, and
"passed" inside says whether a check passed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from nearsite_core import checker, config, messages, payloads, pricing, scoring, slack_card, templates, tickets  # noqa: E402


def _j(path):
    if path in (None, "-"):
        return json.load(sys.stdin)
    return json.loads(Path(path).read_text())


def _ctx(a):
    ctx = _j(a.ctx) if getattr(a, "ctx", None) else {}
    if "landlord_local_time" in ctx and isinstance(ctx["landlord_local_time"], str):
        from datetime import time
        ctx["landlord_local_time"] = time.fromisoformat(ctx["landlord_local_time"])
    if "now" in ctx and isinstance(ctx["now"], str):
        from datetime import datetime
        ctx["now"] = datetime.fromisoformat(ctx["now"])
    return ctx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd")
    for f in ("--claim", "--home", "--internal", "--external", "--ctx", "--message-file", "--items", "--approvals"):
        ap.add_argument(f)
    ap.add_argument("--kind", default="in_app")
    ap.add_argument("--option", type=int, default=1)
    ap.add_argument("--batch-id")
    ap.add_argument("--action")
    a = ap.parse_args()
    cfg = config.load()
    out: object

    if a.cmd == "live-status":
        out = {"live": cfg["live"], "env_lock": __import__("os").environ.get("NEARSITE_AGENT_LIVE") == "1",
               "effective": config.live_report(cfg)}
    elif a.cmd == "shortlist":
        r = scoring.shortlist(_j(a.claim), _j(a.internal), _j(a.external) if a.external else [], cfg)
        out = {**r, "homes": [h.__dict__ | {"tick": not h.blockers} for h in r["homes"]]}
    elif a.cmd == "message":
        fn = {"in_app": messages.in_app_draft, "sona_text": messages.sona_text_task,
              "sona_call": messages.sona_call_task, "follow_up": messages.follow_up}[a.kind]
        out = {"kind": a.kind, "text": fn(_j(a.claim), _j(a.home) if a.home else {}, cfg)}
    elif a.cmd == "check-outreach":
        out = checker.check_outreach(_j(a.claim), _j(a.home), Path(a.message_file).read_text(), _ctx(a), cfg).to_dict()
    elif a.cmd == "check-call":
        out = checker.check_call(_j(a.claim), _j(a.home), _ctx(a), cfg).to_dict()
    elif a.cmd == "quote":
        out = pricing.quote(_j(a.claim), _j(a.home), cfg).to_dict()
    elif a.cmd == "check-submit":
        c, h = _j(a.claim), _j(a.home)
        q = pricing.quote(c, h, cfg).to_dict()
        out = {"quote": q, **checker.check_submit(c, h, q, _ctx(a), cfg).to_dict()}
    elif a.cmd == "nearsite-payloads":
        c, h = _j(a.claim), _j(a.home)
        q = pricing.quote(c, h, cfg).to_dict()
        out = {"add_property": payloads.add_property(h, cfg), "proposal": payloads.proposal(c, h, q, cfg)}
    elif a.cmd == "email-option":
        c, h = _j(a.claim), _j(a.home)
        q = pricing.quote({**c, "source": c.get("source", "email")}, h, cfg).to_dict()
        out = templates.fill(a.option, c, h, q, cfg)
    elif a.cmd == "slack-card":
        out = slack_card.build(a.batch_id, _j(a.items), cfg)
    elif a.cmd == "issue-ticket":
        c, h = _j(a.claim), _j(a.home)
        live = config.is_live("nearsite_writes", cfg) or config.is_live("email_send", cfg)
        if live:
            # Live: approvals come only from the agent_approvals table (written by the Slack
            # button handler), never from a file the agent could write.
            if not a.batch_id:
                print(json.dumps({"issued": False, "blockers": ["--batch-id is required in live mode"]}))
                return 0
            from nearsite_core import approvals as A
            approvals = A.from_rows(A.fetch(a.batch_id, cfg), a.batch_id, cfg)
        else:
            approvals = _j(a.approvals) if a.approvals else {}
        q = pricing.quote(c, h, cfg).to_dict()
        v = checker.check_submit(c, h, q, {"approvals": approvals}, cfg)
        if not v.passed:
            out = {"issued": False, "blockers": v.blockers}
        else:
            p = tickets.issue(a.action, c.get("nearsite_claim_id") or c.get("claim_ref"), [str(h.get("home_id"))],
                              True, approvals, cfg["approvals"]["ticket_ttl_minutes"])
            out = {"issued": True, "ticket": p.name}
    else:
        ap.error(f"unknown command {a.cmd}")
        return 2
    print(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
