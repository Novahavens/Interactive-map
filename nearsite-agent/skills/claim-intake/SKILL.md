---
name: claim-intake
description: Turns a new housing claim from any source (a Nearsite request, the website JotForm, or an adjuster's email) into one clean claim record with its needs pulled out of the free-text notes. Use this whenever a new claim, Nearsite request, ALE placement or adjuster email about housing arrives, or someone asks to add a claim to the All Claims board or map, even if they just paste the claim text.
---

# Claim intake

Make one clean record per claim so every later step reads the same fields.

## Steps

1. Identify the source: `nearsite` (has a request id), `website` (JotForm), or `email` (adjuster). Email claims also need the company, the adjuster's email and the claim reference.
2. Map the fields to the claim shape in `references/claim-shape.md`. Keep the original text in `notes`; never drop it.
3. Pull needs out of the notes with the engine (they hide there: "elderly couple - no stairs 2 cars"):
   ```
   python3 -c "import sys,json; sys.path.insert(0,'${CLAUDE_PLUGIN_ROOT}/lib'); from nearsite_core import claims as C; c=json.load(open('claim.json')); print(sorted(C.needs(c)), C.parking_needed(c), C.pets_count(c), C.pet_weights_known(c), C.adults(c))"
   ```
4. Budget: Nearsite gives per day; monthly = per day × 30. Email claims give an FRV (fair rental value); put it in `frv`.
5. Duplicates: the same Nearsite id, or the same company + claim reference, is one claim. Merge, don't add.
6. Flag what a searcher would need and is missing: pet breed and weight (SOP asks for both; "TBD 1 lbs" means unknown), number of adults, parking, move-out date.

## Return

```json
{"claim": {...}, "needs": ["no_stairs","pets","parking"], "missing": ["pet breeds and weights"], "duplicate_of": null}
```

## Writing it down

Writes to Supabase and Monday happen only when `supabase_writes` / `monday_writes` are live. Until then, write the record to the run folder and say what would be written where (Monday All Claims board, group New, Source column set).
