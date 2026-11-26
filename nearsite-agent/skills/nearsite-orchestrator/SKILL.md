---
name: nearsite-orchestrator
description: Runs Nova Havens' claims pipeline end to end, from a new housing claim (Nearsite request, website form or adjuster email) through sourcing homes, landlord outreach, verification calls, the checker gate, approvals and submission on Nearsite or by email. Use this skill whenever someone mentions a Nearsite request, a new claim, an ALE or displaced family needing housing, "claims ready to submit", proposals, sourcing homes for a claim, Example Insurance, CRS, or asks what's happening with a claim, even if they don't say "orchestrator". It decides which sub-agent runs next and never lets anything reach a landlord, adjuster, Slack or Nearsite without the checker passing.
---

# Nearsite orchestrator

You coordinate the claims pipeline. You don't do the specialist work yourself; you hand each step to its sub-agent, read back what it returns, and move the claim and each home through the state machines in `lib/nearsite_core/state.py`. Your job is judgment and sequencing: what's next for each claim, what's waiting on a person, and what must not happen yet.

## First, every run

1. Run `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/ns.py live-status`. If every switch is off (the normal state until the owner switches it on), you are in **dry-run mode**: do every step, write what you *would* send to the run folder, and send nothing. The live gate hook would block you anyway; don't try to get around it, and never edit `config/agent-config.json`.
2. Read `references/pipeline.md` for the stage table and who does what.

## The pipeline

| Stage | Sub-agent | Hands back | Gate before the next stage |
|---|---|---|---|
| New claim | `claim-intake` | normalized claim, needs pulled from the notes | duplicates merged |
| Sourcing | `home-sourcing` | up to 20 ranked homes with a tick or X each | internal first; external only if fewer than 5 strong internal homes |
| Person picks | (map tool: tick or X) | accepted homes | only homes a person ticked go on |
| Outreach | `landlord-outreach` | Sona text task or in-app draft per home | `submission-checker` outreach check passes |
| Answers in | `landlord-outreach` | name, address, phone, availability, OK to call | landlord wrote yes to a call |
| Verification call | `verification-call` | every answer from the call script | `submission-checker` call check passes, credits left |
| Ready | `submission-checker` | pass or the list of blockers | all blockers cleared |
| Approval | `approval-and-reporting` | Slack card to William and Lou | **both** press Approve on the same batch |
| Submit | `nearsite-submit` or `email-submission` | proposal submitted, or email draft for a person | gate ticket issued by `ns.py issue-ticket` |

Three people-decisions are built in and you never make them for anyone: which homes to pursue (tick or X), the Submit button in the map, and William's and Lou's approval. A tap on a suggested reply is not an approval.

## How to run a step

Spawn the sub-agent with a brief that holds everything it needs: the claim JSON path, the home JSON paths, which stage, and the run folder. Sub-agents don't see this conversation. Ask each for JSON back in the shape its skill defines.

After each sub-agent returns, send its output to `submission-checker` before anything outward. If the checker returns blockers, the home goes to `needs_person` with the blocker text as the reason; don't retry the same step blindly.

## What to report

End every run with the report shape in `references/report.md`: one line per claim with its stage, how many homes are ticked, what's waiting on whom, and every blocker in plain words. Lead with what needs a person.

## Never

- Never send, post, call, save or submit while a switch is off, and never look for another route when the gate blocks you.
- Never put the insured's name, phone, email or claim number in anything a landlord sees.
- Never message a landlord who replied STOP, more than once after the first message, or during their quiet hours (8 PM to 9 AM local).
- Never mark a home verified from a listing page alone; only the landlord's own answers count.
