#!/usr/bin/env python3
"""Command line for the looping harness.

    harness.py --store DIR tick                 one pass over every claim
    harness.py --store DIR loop --ticks 50 --interval 300
    harness.py --store DIR ingest --event e.json   (or - for stdin)
    harness.py --store DIR explain --claim 90003
    harness.py --store DIR work [--status queued]
    harness.py graph [--mermaid home|claim] [--validate]
    harness.py simulate --store DIR              full walk on fixtures, simulated results, nothing sent

--store is a local folder (dry runs). Supabase as the store is used only when
supabase_writes is live; until then the harness keeps its graph state in the folder.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from nearsite_core import config, graph as G, harness as H, scoring  # noqa: E402


def simulate(store_dir: Path, now: datetime) -> dict:
    """Walks request 90003 from new to submitted with simulated agent results.
    Every 'sent' and 'called' here is SIMULATED; the live switches stay off and the
    work items stay held, which the report shows."""
    cfg = config.load()
    # Everything here is simulated and nothing is sent, so example pricing is allowed for the walk.
    cfg["pricing"].pop("_example", None)
    fx = json.loads((ROOT / "fixtures" / "claims.json").read_text())
    claim = next(c for c in fx["claims"] if c["nearsite_claim_id"] == "90003")
    rec = {k: v for k, v in claim.items() if k not in ("internal_homes", "external_homes")}
    st = H.LocalStore(store_dir)
    t = lambda m: now + timedelta(minutes=m)  # noqa: E731
    log = []

    def step(name, fn):
        r = fn()
        log.append({"step": name, "summary": H.summary(st.load())["claims"]["90003"]})
        return r

    step("claim arrives", lambda: H.ingest(st, {"type": "claim_new", "claim_record": rec}, t(0)))
    step("tick", lambda: H.tick(st, cfg, t(1)))
    sl = scoring.shortlist(claim, claim["internal_homes"], [], cfg)
    by = {h["home_id"]: h for h in claim["internal_homes"]}
    scored = [{**by[s.home_id], "home_key": s.home_id, "score": s.score, "blockers": s.blockers} for s in sl["homes"]]
    step("sourcing agent reports homes", lambda: H.ingest(st, {"type": "homes_scored", "claim": "90003", "homes": scored}, t(2)))
    step("tick", lambda: H.tick(st, cfg, t(3)))
    target = "9900000140"
    other = next(s["home_key"] for s in scored if s["home_key"] != target and not s["blockers"])
    step("person ticks one home", lambda: H.ingest(st, {"type": "human_pick", "claim": "90003", "home": target, "decision": "accept", "by": "searcher"}, t(4)))
    step("person Xs another", lambda: H.ingest(st, {"type": "human_pick", "claim": "90003", "home": other, "decision": "decline", "by": "searcher"}, t(4)))
    # the property record gives the landlord's contact (synthetic)
    s = st.load(); s["claims"]["90003"]["homes"][target]["home"]["landlord_phone"] = "+15550100000"; st.save(s)
    step("tick (outreach held: switch off)", lambda: H.tick(st, cfg, t(5)))
    step("SIMULATED: outreach agent sent the first text", lambda: H.ingest(st, {"type": "outreach_sent", "claim": "90003", "home": target, "channel": "sona_text", "at": H._iso(t(6))}, t(6)))
    step("tick", lambda: H.tick(st, cfg, t(7)))
    v = fx["verified"]["90003:" + target]
    step("SIMULATED: landlord replies", lambda: H.ingest(st, {"type": "landlord_reply", "claim": "90003", "home": target, "available": True,
                                                               "landlord_name": v["landlord_name"], "address": v["address"],
                                                               "landlord_phone": v["landlord_phone"], "call_consent": True, "at": H._iso(t(60))}, t(60)))
    step("tick (call held: switch off)", lambda: H.tick(st, cfg, t(61)))
    answers = {k: v[k] for k in v if not k.startswith("_") and k not in ("landlord_phone", "call_consent")}
    step("SIMULATED: verification call done", lambda: H.ingest(st, {"type": "call_result", "claim": "90003", "home": target, "answers": answers, "verified": True}, t(90)))
    step("tick", lambda: H.tick(st, cfg, t(91)))
    step("person presses Submit", lambda: H.ingest(st, {"type": "submit_pressed", "claim": "90003", "by": "searcher"}, t(100)))
    step("tick (waiting for approvals)", lambda: H.tick(st, cfg, t(101)))
    step("SIMULATED: William and Lou approve", lambda: H.ingest(st, {"type": "approvals", "claim": "90003", "batch_id": "sim-1",
                                                                     "approvals": {"william": "approved", "lou": "approved"}}, t(110)))
    step("tick (submit held: switch off)", lambda: H.tick(st, cfg, t(111)))
    step("SIMULATED: Nearsite agent submitted", lambda: H.ingest(st, {"type": "submitted", "claim": "90003", "homes": [target]}, t(120)))
    step("tick", lambda: H.tick(st, cfg, t(121)))
    return {"steps": log, "explain": H.explain(st, "90003"), "work": [w for w in st.load()["work"].values()]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--store")
    ap.add_argument("cmd")
    ap.add_argument("--event")
    ap.add_argument("--claim")
    ap.add_argument("--ticks", type=int, default=20)
    ap.add_argument("--interval", type=float, default=0)
    ap.add_argument("--status")
    ap.add_argument("--mermaid")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--now")
    a = ap.parse_args()
    now = datetime.fromisoformat(a.now) if a.now else datetime.now(timezone.utc)

    if a.cmd == "graph":
        if a.validate:
            p = G.validate()
            print(json.dumps({"valid": not p, "problems": p}, indent=1))
            return 1 if p else 0
        print(G.to_mermaid(a.mermaid) if a.mermaid else json.dumps(G.export(), indent=1))
        return 0
    if not a.store:
        ap.error("--store is required")
    st = H.LocalStore(a.store)
    if a.cmd == "tick":
        out = H.tick(st, now=now)
    elif a.cmd == "loop":
        out = [r["summary"] for r in H.run_loop(st, a.ticks, a.interval)]
    elif a.cmd == "ingest":
        ev = json.load(sys.stdin) if a.event in (None, "-") else json.loads(Path(a.event).read_text())
        out = H.ingest(st, ev, now)
    elif a.cmd == "explain":
        out = H.explain(st, a.claim)
    elif a.cmd == "work":
        out = [w for w in st.load()["work"].values() if not a.status or w["status"] == a.status]
    elif a.cmd == "simulate":
        out = simulate(Path(a.store), datetime.fromisoformat(a.now) if a.now else datetime(2026, 11, 26, 18, tzinfo=timezone.utc))
    else:
        ap.error(f"unknown command {a.cmd}")
        return 2
    print(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
