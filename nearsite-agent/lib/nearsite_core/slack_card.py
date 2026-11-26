"""Builds the Slack approval card for William and Lou (Block Kit JSON).

Both must approve. Each person gets the same card; each button press is
recorded with who pressed it, and submit unlocks only when every person in
approvals.nearsite_required has pressed Approve on the same batch id.
The card is built here and posted by the approval agent only when
live.slack_posts is on. In dry runs it is written to a file.
"""
from __future__ import annotations


def _claim_block(item: dict) -> list:
    c, homes = item["claim"], item["homes"]
    lines = [f"*Request {c.get('nearsite_claim_id')}* · {c.get('company', '')} · {c.get('city', '')}, {c.get('state', '')} · "
             f"{c.get('beds', '?')} BR · {c.get('move_in')} to {c.get('move_out')}"]
    for h in homes:
        q = h["quote"]
        lines.append(
            f"• {h['address']} · {h.get('distance_mi', '?')} mi · ${q['quote_per_day']:,.0f}/day "
            f"(margin ${q['markup_monthly']:,.0f}/mo) · checker {'✅' if h['checker_passed'] else '⛔'}"
        )
    return [{"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines)}}, {"type": "divider"}]


def build(batch_id: str, items: list[dict], cfg: dict) -> dict:
    who = " and ".join(p["name"] for k, p in cfg["approvals"]["people"].items() if k in cfg["approvals"]["nearsite_required"])
    total = sum(len(i["homes"]) for i in items)
    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": "Claims ready to submit on Nearsite"}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": f"{len(items)} claim{'s' if len(items) != 1 else ''} · {total} proposal{'s' if total != 1 else ''} · needs {who}"}]},
    ]
    for it in items:
        blocks += _claim_block(it)
    blocks.append({
        "type": "actions",
        "block_id": f"nearsite_approval:{batch_id}",
        "elements": [
            {"type": "button", "style": "primary", "text": {"type": "plain_text", "text": "Approve all"}, "action_id": "approve", "value": batch_id},
            {"type": "button", "text": {"type": "plain_text", "text": "Hold"}, "action_id": "hold", "value": batch_id},
            {"type": "button", "style": "danger", "text": {"type": "plain_text", "text": "Reject"}, "action_id": "reject", "value": batch_id},
        ],
    })
    return {"text": f"Claims ready to submit on Nearsite ({len(items)})", "blocks": blocks, "batch_id": batch_id}


def approvals_complete(presses: list[dict], batch_id: str, cfg: dict) -> dict:
    """presses: [{person, action, batch_id}]. Latest press per person wins."""
    latest = {}
    for p in presses:
        if p.get("batch_id") == batch_id:
            latest[p["person"]] = p["action"]
    need = cfg["approvals"]["nearsite_required"]
    status = {person: ("approved" if latest.get(person) == "approve" else latest.get(person, "waiting")) for person in need}
    return {"all_approved": all(v == "approved" for v in status.values()), "status": status}
