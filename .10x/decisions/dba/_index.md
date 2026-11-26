# DBA — index

## Principles
- The app holds only the publishable key. Anything it calls is SECURITY DEFINER and takes the server secret first (`listing_edit_key_ok`).
- Migrations are additive and re-runnable; versions by suffix, never changed in place. Rollback lives in the file header.
- No index on a small table without a measured need.

## Features
| Slug | What | Status |
|---|---|---|
| map-agent | Read functions for the housing agent on the map; phone-lookup log | Reviewed, two fixes requested, not applied |
