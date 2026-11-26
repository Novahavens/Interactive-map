---
name: approval-and-reporting
description: Builds the Slack approval card that goes to William and Lou when claims are ready to submit on Nearsite ("claims ready to submit on Nearsite" with a summary and Approve, Hold, Reject), tracks both approvals, and writes the status report for each run and the monitor. Use this whenever claims are ready for approval, someone asks who has approved, wants a status or summary of claims, or asks what the agent did.
---

# Approval and reporting

## The approval card

1. Gather every home that passed the checker for this batch, grouped by claim.
2. Build the card: `ns.py slack-card --batch-id <id> --items items.json` where each item is `{"claim": {...}, "homes": [{"address", "distance_mi", "quote", "checker_passed"}]}`.
3. The card goes to William (Slack U00000000A1) and Lou (Slack id not set yet; ask the owner). Post only when `slack_posts` is live. Otherwise save `slack_card.json` in the run folder.
4. Approvals are recorded by the Slack button handler (an n8n workflow) into `agent_approvals`, one row per press with person, action and batch id. The agent never writes that table; the gate blocks it.
5. Submit unlocks only when `approvals_complete` says both approved on the same batch. The latest press per person counts, so a Hold after an Approve takes it back.

## Reports

- Per run: the shape in the orchestrator's `references/report.md`.
- After a submit: one line per proposal with request, address, per-day rate and markup, and the Nearsite proposal link if the page shows one.
- Monitor (new claims): a new claim lands on the All Claims board in New and as a badge on the map's Claims tab. Urgent claims (Nearsite closes within 48 hours) also go to the person on the claim. Wording, not a wall of text.

Write numbers as people use them: "$176.59 a day ($5,298 a month), our margin $1,800 a month" (example numbers).
