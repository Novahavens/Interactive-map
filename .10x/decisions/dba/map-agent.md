# DBA — map-agent (26 Nov 2026)

## Change
`supabase/migrations/20261126_map_agent.sql`: 11 functions (`map_*`) and one new table (`map_phone_lookups`). Additive only.

## Data and access
- Read tables are small: external_listings ~5.6k rows, search_run_results ~6.4k, nearsite_matches ~9.2k, nearsite_claims ~1.2k, the rest under 1.2k.
- Access is one call per feature when a person opens a claim, plus one per chat reply. Tens of calls a minute at most.
- Every read is keyed by one claim item id or one property item id.

## Review findings
| # | Finding | Decision |
|---|---|---|
| 1 | `map_outside_homes` resolved the claim once per home (up to 200 scans of nearsite_claims per request; 4 ms warm, 490 ms cold each) | Resolve once at the top and reuse. Same in `map_claim_context`. |
| 2 | The claim lookup OR-ed three columns, forcing a seq scan | Three UNION ALL branches; the first uses the existing unique index on monday_item_id. |
| 3 | No index on searches(claim_source, claim_ref), claim_options(claim_item_id) | Leave. ~100 and ~1.1k rows; a seq scan is cheaper than the maintenance. Revisit above ~50k rows. |
| 4 | New table gets three indexes | Fine: created empty, so no lock or backfill. |
| 5 | Phone guard takes one advisory lock for all lookups | Fine at this volume (cap 200 a day). |

## Migration safety
- Online: `create or replace function` and `create table if not exists` take no locks on existing tables.
- Backward compatible: the deployed app calls none of these; with the feature switches off the new app calls none either.
- Apply one statement at a time (the connector cancels at about 60 s). The file is re-runnable.
- plpgsql bodies are not checked at create time, so each function is exercised in a rolled-back transaction before applying.

## Rollback
Drop statements are in the file header. Dropping `map_phone_lookups` deletes the log of paid lookups; export it first if any exist.

## Watch after applying
- Supabase advisor will list the `map_*` functions as SECURITY DEFINER callable by anon. Expected: each checks the server secret first, the same pattern as the listing-edit functions.
- `select count(*) from map_phone_lookups where created_at > now() - interval '1 day'` against the 200 a day cap.
