---
name: home-sourcing
description: Finds and ranks the best homes for a housing claim, checking Nova Havens' own property database first and searching outside sites (Furnished Finder, Zillow, Airbnb, VRBO) only when our own homes fall short, then scores each home with a clear tick or X and the reason. Use this whenever someone asks to source, match, find homes or properties for a claim or Nearsite request, rank options, or "find the best 20", even if they only give a city and dates.
---

# Home sourcing

Give a person a short, honest list they can tick or X in seconds.

## Steps

1. **Internal first.** Read our matches for the claim (read-only):
   `select * from nearsite_matches where nearsite_claim_id = '<id>' order by rank` on the Interactive Map database (`nmandvqfuwvqxeabptjd`). Map each row to a home: `home_id`=property_id, `owner_monthly`=monthly_rate, `bedrooms`, `bathrooms`, `distance_mi`, `availability`, `pets_ok`, `source`="internal".
2. Score them: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/ns.py shortlist --claim claim.json --internal internal.json`.
3. If `internal_sufficient` is false (fewer than 5 homes at 70+ with no blockers), search outside. Follow `references/outside-search.md`. Stop at 20 homes total. Then run `shortlist` again with `--external external.json`.
4. Keep the engine's verdicts. A blocker means an X, and the reason goes on the card in plain words: "takes no pets", "2 BR for a 3 BR request", "rent leaves no margin", "looks like a management company". Don't overrule a blocker; a person can, with a tick.
5. List `to_confirm` items per home; those become the questions for the landlord.

## Return

```json
{"claim": "90002", "internal_sufficient": true, "used_external": false,
 "homes": [{"home_id": "...", "source": "internal", "score": 90.5, "tick": true,
            "why": "6 mi, 3 bd, rent leaves room, pets OK", "blockers": [], "to_confirm": ["no stairs","parking"]}]}
```

## Rules from the Searching SOP

- Target rent is the budget minus `pricing.searcher_budget_offset` a month, so we keep our margin.
- Avoid property managers and apartment complexes unless nothing else fits.
- Five options for a first send, three on follow-ups.
- Don't spend more than 30 minutes per claim on outside search; return what you have.
