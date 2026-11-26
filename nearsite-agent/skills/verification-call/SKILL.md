---
name: verification-call
description: Places a short verification call to a landlord through Quo's Sona voice agent, only after the landlord agreed in writing, asking every question a Nova Havens searcher would ask (dates, rent, utilities, deposit, fees, pets, beds, stairs, parking, furnishings, notice, corporate lease, email), then records each answer on the home and marks it verified. Use this whenever someone wants to call, verify or confirm a landlord or a home for a claim, or asks what a landlord said on a call.
---

# Verification call

Sona's call stands in for the searcher's phone call. It is the step that turns a listing into a home we can offer.

## Before the call

1. The home must be at `ok_to_call`, meaning the landlord wrote yes to a call. AI-voice calls need that prior consent.
2. Run `ns.py check-call --claim c.json --home h.json --ctx ctx.json` with `credits_used_this_month` from Quo and `landlord_local_time`. A call uses 50 of the 1,000 monthly automation credits and the checker keeps 100 in reserve, so plan on about 18 calls a month.
3. Build the call task: `ns.py message --kind sona_call`. It lists the questions in `references/call-questions.md`. Max 5 minutes; hang up on voicemail and try once more later (2 attempts max).
4. Call only when `quo_calls` is live. Otherwise write the task to the run folder.

## After the call

Map every answer onto the home with the field names in `references/call-questions.md`. Set `verified: true` only when the landlord answered the dates, rent, deposit, pets, bedrooms and parking questions themselves. Anything missing stays missing; never fill it from the listing.

If the landlord's terms change the fit (pets not allowed after all, stairs, dates short), drop the home with the reason.

Move the home: ok_to_call → called → verified.
