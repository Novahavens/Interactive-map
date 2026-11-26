# Pipeline reference

## Claim stages (Monday groups on the All Claims board 18441658213)
new → sourcing → outreach → verifying → ready → submitted → won | lost.
Allowed moves are in `lib/nearsite_core/state.py` (`CLAIM_MOVES`). A claim can step back (verifying → sourcing) when every home drops.

## Home statuses (chips in the map's claim panel)
suggested → accepted | declined → messaged → answers_in → ok_to_call → called → verified → ready → submitted.
Any step can go to `dropped` or `needs_person`. Allowed moves: `HOME_MOVES`.

## Sources of claims
- Nearsite: workflow "Nearsite · 00" polls the portal into `nearsite_claims`.
- Website form: JotForm → "Website Intake v4" → Claim Process.
- Email: adjusters at CRS, Example Insurance and others; each company has its own option template.
All land in one place (the unified `all_claims` view, migration 001) and on the Monday All Claims board, with a Source column and views for Nearsite and Other.

## Sourcing defaults (config `sourcing`)
target 20 homes; internal is enough when 5 homes score 70+ with no blockers; radius 10 mi then 20 mi.

## Pricing (config `pricing`, from the Master Markup Calculator)
Monthly markup target and floor come from config `pricing` (real values in the private overlay; under the floor needs management). Nearsite takes 6% platform + the request's referral fee (usually 10%), so a Nearsite quote is (owner rent + markup target) ÷ 0.84, capped at the budget. Per-day rate = monthly ÷ 30.

## Who approves
Nearsite submits: William and Lou, both, in Slack. Email options: a person sends the draft.

## Quo
From +15550100000 (the shared Quo inbox). Sona text conversations and calls use automation credits: 1,000 a month, a call is 50, keep 100 in reserve. That's about 18 calls a month on the current plan.
