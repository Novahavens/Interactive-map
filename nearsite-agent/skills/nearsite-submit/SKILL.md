---
name: nearsite-submit
description: Loads verified homes into Nova Havens' Nearsite supplier portal (Add Property, following Lou's rules) and prepares proposals for a Nearsite request in the proposal wizard (Find property, Create proposal, Review), then submits only after the checker passes and both William and Lou approve. Use this whenever someone mentions Nearsite proposals, adding a property to Nearsite, submitting options for a Nearsite request, or "claims ready to submit on Nearsite".
---

# Nearsite submit

Nearsite is where an adjuster sees our offer, so what lands there must match what we verified, to the dollar.

## Order of work

1. **Payloads first, browser second.** Build both payloads: `ns.py nearsite-payloads --claim c.json --home h.json`. If `add_property.missing` isn't empty, stop and report what's missing.
2. **Property in our inventory?** On www.nearsite.com/v2/provider, Properties, search by street. If it isn't there, open Add Property and fill it field by field from `add_property` (form map: `references/forms.md`). Typing is fine; the save click is gated (`nearsite_add_property` ticket).
3. **Proposal.** Open `/v2/provider/proposals/create/housing/<request id>`. Step 1 Find property: pick the property by its street name. Step 2 Create proposal: fill from `proposal`. Step 3 Review.
4. **Compare on Review.** Read the Review screen into JSON and run `payloads.review_matches(expected, review)`. Any difference: go back and fix, don't submit.
5. **Submit only with a ticket.** A ticket exists only when `ns.py issue-ticket --action nearsite_submit` passes, which re-runs the checker including both approvals. The gate consumes one ticket per Submit click. If the click is blocked, stop and report; never look for another route.

While `nearsite_writes` is off, stop after step 4 with screenshots or the Review JSON in the run folder, and say "ready to submit, waiting on approvals and the switch".

## Rules from Lou

- Property name is the street address only (no city).
- Furnished. Max guests = 2 per bedroom. Bed sizes for every bedroom.
- Apartments need the floor.
- Up to 10 photos from the landlord's link.
- Notice to vacate 30 days (ours), background check on.
- Contact name and number on every proposal (config `nearsite.proposal_contact`; empty today, so the checker blocks until it's set).
