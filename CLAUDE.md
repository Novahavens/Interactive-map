# CLAUDE.md

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: Next.js 15 App Router on Vercel prj_zSihjixsFypaSv342c7Z9jBVKO6K team team_YEcPHHbzFoa1DSSKBbNDiyEk, prod nova-havens-map.vercel.app
- Supabase nmandvqfuwvqxeabptjd; env MAP_EDIT_SECRET = sync_config MAP_EDIT_KEY
- Monday board 18415735059, Last Contact Date col date_mm5yh71z
- Quo API version 2026-03-30; QUO_TIMEZONE default America/Chicago
- User has ADHD: short replies, no jargon; never touch hand-added Monday options; PR #12 stays draft; merge only on explicit user word

### Key Decisions
- Decision: Standard Webhooks signature check, keys in sync_config QUO_WEBHOOK_KEYS — Reason: rotate without deploy
- Decision: modes shadow/live/off in sync_config, 5s cache, QUO_LIVE_USERS pilot list — Reason: instant kill switch
- Decision: answered calls + any text move date; notes one per property/day/slot (call:<id> per answered call) — Reason: avoid Monday spam
- Decision: claim note before posting; timeout/5xx keeps claim; partial failure returns 503 — Reason: Quo retries 8x/27h, never double-post
- Decision: smart pick = active-claim properties else up to 5; summary goes to named street else smart pick — Reason: shared owner numbers
- Decision: Owner said rule-based, no AI model; contradictory facts dropped — Reason: predictable, cheap
- Decision: Update Monday prefills Edit form, saves via existing edit route with source quo_call — Reason: reuse audited path
- Decision: all DB writes via SECURITY DEFINER RPCs gated by listing_edit_key_ok(MAP_EDIT_KEY) — Reason: app holds only publishable key

<!-- handoff:learnings:end -->
