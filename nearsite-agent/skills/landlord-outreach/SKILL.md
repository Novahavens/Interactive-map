---
name: landlord-outreach
description: Writes and (only when switched on) sends the first message and one follow-up to landlords of homes a person ticked for a claim, through Quo's Sona text agent from William's number or as a pre-filled draft in a listing site's in-app messenger, then maps the landlord's replies (name, address, phone, availability, OK to call) back onto the home. Use this whenever someone wants to contact, text, message or reach out to landlords or hosts for a claim, check landlord replies, or move ticked homes forward.
---

# Landlord outreach

The landlord should get one friendly, clear message that never exposes the family, and we should end up with five answers: available for the dates, name, exact address, best phone number, and a written yes to a short call.

## Pick the channel per home

- **Landlord phone known** → Sona text conversation from +15550100000 (the shared Quo inbox). Build the task: `ns.py message --kind sona_text --claim c.json --home h.json`.
- **Only a listing link** (Furnished Finder, Airbnb, Zillow) → in-app message. Build the draft: `ns.py message --kind in_app ...`. The Chrome extension pre-fills it in the listing's message box inside the map; **a person presses Send**. You never press Send on a listing site; the gate blocks it.

## Before anything goes out

1. Run the checker on the exact text: `ns.py check-outreach --claim c.json --home h.json --message-file m.txt --ctx ctx.json` where ctx holds `landlord_local_time` (HH:MM in the landlord's time zone) and `thread_open_for_landlord`.
2. Blockers stop that home. Warnings go in the report (for example, unknown pet weights: ask the account manager).
3. One thread per landlord: if a landlord owns several ticked homes, ask about them in one conversation.
4. Only send when `quo_texts` is live. Otherwise write the task to the run folder as "would send".

## Follow-up

At most one, 24 hours after the first message with no reply: `ns.py message --kind follow_up`. Never a third.

## Reading replies

Map each answer onto the home: `landlord_name`, `address`, `landlord_phone`, `available_from/to`, `call_consent` (true only for a clear written yes, like "yes you can call"). "Sure" to the availability question isn't consent to a call. STOP, "don't contact me" or "not interested" → `opted_out: true`, home dropped, never contact again.

Move the home: messaged → answers_in → ok_to_call (only with `call_consent: true`).

## Never

Never share the family's names, phone, email, claim number or damaged-home address. Never agree a price or terms by text; say the team will confirm in writing.
