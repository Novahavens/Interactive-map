#!/usr/bin/env python3
"""Dry run: runs the whole pipeline on fixtures with no network and no writes outside --out.

    python3 scripts/dry_run.py --out /path/to/folder

For each claim it scores and shortlists homes, writes the landlord message and
Sona tasks it would send, runs the checker on each, and for the synthetic
verified home it builds the quote, Nearsite add-property and proposal payloads,
the email option, the Slack card, and asks the live gate what it would do.
Nothing is sent anywhere.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import datetime, time, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ROOT / "hooks"))

from nearsite_core import checker, config, messages, payloads, pricing, scoring, slack_card, templates, tickets  # noqa: E402
import live_gate  # noqa: E402


def run(fixtures: Path, out: Path, now: datetime) -> dict:
    cfg = config.load()
    data = json.loads(fixtures.read_text())
    out.mkdir(parents=True, exist_ok=True)
    report = {"generated_at": now.isoformat(), "live": {s: config.is_live(s, cfg) for s in config.LIVE_SWITCHES}, "claims": []}
    slack_items = []

    for claim in data["claims"]:
        cid = claim["nearsite_claim_id"]
        sl = scoring.shortlist(claim, claim["internal_homes"], claim["external_homes"], cfg)
        homes_by_id = {h["home_id"]: h for h in claim["internal_homes"] + claim["external_homes"]}
        rows = []
        for s in sl["homes"]:
            h = dict(homes_by_id[s.home_id])
            h.setdefault("listing_url", f"https://example.invalid/listing/{s.home_id}")
            msg = messages.in_app_draft(claim, h, cfg)
            v_out = checker.check_outreach(claim, h, msg, {"landlord_local_time": time(11, 0)}, cfg)
            rows.append({"home_id": s.home_id, "source": s.source, "score": s.score, "tick": not s.blockers,
                         "blockers": s.blockers, "to_confirm": s.to_confirm, "outreach_check": v_out.to_dict()})
        entry = {"claim": cid, "city": claim["city"], "internal_sufficient": sl["internal_sufficient"],
                 "used_external": sl["used_external"], "homes": rows,
                 "sample_in_app_message": messages.in_app_draft(claim, {}, cfg),
                 "sample_sona_text_task": messages.sona_text_task(claim, {"address": "(listing)"}, cfg)}

        for key, ver in data.get("verified", {}).items():
            c_id, h_id = key.split(":")
            if c_id != cid:
                continue
            home = {**homes_by_id.get(h_id, {}), **ver}
            q = pricing.quote(claim, home, cfg).to_dict()
            call_v = checker.check_call(claim, home, {"credits_used_this_month": 0, "landlord_local_time": time(11, 0)}, cfg)
            ctx_none = {"now": now, "approvals": {}}
            v_before = checker.check_submit(claim, home, q, ctx_none, cfg)
            cfg_contact = json.loads(json.dumps(cfg))
            cfg_contact["nearsite"]["proposal_contact"] = {"name": "TEST CONTACT", "phone": "TEST"}
            v_after = checker.check_submit(claim, home, q, {"now": now, "approvals": {"william": "approved", "lou": "approved"}}, cfg_contact)
            prop = payloads.proposal(claim, home, q, cfg)
            addp = payloads.add_property(home, cfg)
            opt = templates.fill(1, claim, {**home, "distance_mi": home.get("distance_mi")}, q, cfg)
            entry["verified_home"] = {
                "home_id": h_id, "synthetic": True, "quote": q, "call_check": call_v.to_dict(),
                "submit_check_now": v_before.to_dict(), "submit_check_if_contact_set_and_both_approved": v_after.to_dict(),
                "nearsite_add_property": addp, "nearsite_proposal": prop, "email_option": opt["text"],
                "sona_call_task": messages.sona_call_task(claim, home, cfg),
            }
            slack_items.append({"claim": {**claim}, "homes": [{"address": home["address"], "distance_mi": home.get("distance_mi"),
                                                              "quote": q, "checker_passed": v_after.passed}]})
        report["claims"].append(entry)

    batch = f"dryrun-{now.strftime('%Y%m%d%H%M')}"
    card = slack_card.build(batch, slack_items, cfg)
    (out / "slack_card.json").write_text(json.dumps(card, indent=1))
    report["slack_card_file"] = "slack_card.json"
    report["approvals_one_press"] = slack_card.approvals_complete([{"person": "william", "action": "approve", "batch_id": batch}], batch, cfg)

    # Ask the gate what it would do, with an isolated tickets folder.
    with tempfile.TemporaryDirectory() as td:
        sd = Path(td)
        probes = {
            "quo_text": ("mcp__quo__send-message", {"to": "+1555", "content": "hi"}),
            "sona_call": ("mcp__quo__start-agent-call", {"to": "+1555"}),
            "slack_post": ("mcp__slack__slack_send_message", {"channel": "x", "text": "y"}),
            "nearsite_submit_click": ("mcp__remote-browser__browser_click", {"target": "e88 Submit proposal"}),
            "listing_send_click": ("mcp__remote-browser__browser_click", {"target": "e12 Send message"}),
            "edit_config": ("Edit", {"file_path": str(ROOT / "config" / "agent-config.json")}),
            "supabase_read": ("mcp__supabase__execute_sql", {"query": "select 1"}),
        }
        gate = {k: live_gate.decide(t, i, env={}, cfg=cfg, state_dir=sd)["decision"] for k, (t, i) in probes.items()}
        live_cfg = json.loads(json.dumps(cfg))
        live_cfg["live"] = {k: True for k in live_cfg["live"]}
        env_on = {"NEARSITE_AGENT_LIVE": "1"}
        gate["submit_all_switches_on_no_ticket"] = live_gate.decide(*probes["nearsite_submit_click"], env=env_on, cfg=live_cfg, state_dir=sd)["decision"]
        tickets.issue("nearsite_submit", "90003", ["9900000140"], True, {"william": "approved", "lou": "approved"}, 120, sd)
        gate["submit_all_switches_on_with_ticket"] = live_gate.decide(*probes["nearsite_submit_click"], env=env_on, cfg=live_cfg, state_dir=sd)["decision"]
        gate["second_submit_same_ticket"] = live_gate.decide(*probes["nearsite_submit_click"], env=env_on, cfg=live_cfg, state_dir=sd)["decision"]
        report["gate_probes"] = gate

    (out / "dry_run_report.json").write_text(json.dumps(report, indent=1, default=str))
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", default=str(ROOT / "fixtures" / "claims.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--now", default="2026-11-26T18:00:00+00:00")
    a = ap.parse_args()
    r = run(Path(a.fixtures), Path(a.out), datetime.fromisoformat(a.now))
    for c in r["claims"]:
        ticks = sum(1 for h in c["homes"] if h["tick"])
        print(f"{c['claim']} {c['city']}: {len(c['homes'])} homes, {ticks} ticked, internal_sufficient={c['internal_sufficient']}, used_external={c['used_external']}")
        if "verified_home" in c:
            v = c["verified_home"]
            print(f"   verified {v['home_id']}: ${v['quote']['quote_per_day']}/day, markup ${v['quote']['markup_monthly']}/mo; submit now={v['submit_check_now']['passed']}, with contact+approvals={v['submit_check_if_contact_set_and_both_approved']['passed']}")
    print("gate:", r["gate_probes"])
    print("any live switch on:", any(r["live"].values()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
