# 🚀 Phase 2 Implementation Guide — Nova Havens Property Map

## Overview

This document specifies all Phase 2 features for the Nova Havens Property Map and provides instructions for efficient multi-agent implementation using Claude and sub-agents.

---

## 📋 Phase 2 Features (Complete Specification)

### Feature 1: Active Claims Drawer

**Purpose:** Quick-access slide-out panel showing all claims awaiting property options, without leaving the map.

#### Requirements

- **Slide-out panel** (left side or modal overlay) showing claims ready for options
- **Filter criteria:** Status = "Awaiting Options" (configurable), no sub-items created, created within past 7 days
- **Display per claim:**
  - Claim ID / Policy number
  - Family name
  - Damaged address (loss location)
  - Family preview: "2 adults, 1 child | 3 bed | Pets: Yes"
  - Date created
  - Quick "Open Claim" button (pre-fills map with `?claimId=`)
- **Interactions:**
  - Slide-out toggle (header button or keyboard shortcut `Ctrl/Cmd + K`)
  - Search within list (by address, name, ID)
  - Count badge showing "{N} claims ready"
  - Sorting options: by date created (default) or distance to current map center
- **Persistence:** Remember open/closed state in localStorage

**Backend Requirements:**
- New API route: `GET /api/claims/active`
  - Query params: `days?=7`, `status?=awaitingOptions`, `limit?=50`
  - Returns: `{ claims: [{ id, name, lossAddress, lossLat, lossLng, familyPreview, createdAt, attachedCount }] }`
  - GraphQL query to Monday Claim Process Board (`9030696652`), filter by status, left join sub-items board (`9205253360`) and count

**Frontend Components:**
- `ActiveClaimsDrawer.tsx`: Main drawer component with list, search, and open buttons
- Integration into `MapApp.tsx`: Toggle button, keyboard handler, state management

**Testing:**
- Verify filtering logic (status, attachedCount)
- Test with 0, 1, 5, 50+ active claims
- Verify "Open Claim" pre-fills map and updates list
- Test search and sorting

---

### Feature 2: Availability Calendar / Next-Move-In Date

**Purpose:** Show which properties are available on the family's target move-in date; filter by availability.

#### Requirements

- **Monday integration:** Add "Availability Date" or "Next Available" column to PROPERTY DATABASE (if not present)
- **Property panel display:**
  - Show "Next Available: 2026-10-20"
  - Highlight mismatch in red if not available by move-in date
- **Filter chip in header:** "Available by move-in date" (toggles on/off)
  - Only shows properties with `availability_date <= claimMoveInDate`
- **List sorting:** Optional "Sort by availability" option
- **Map UI:** Grey out or de-emphasize unavailable properties

**Backend Requirements:**
- Supabase table migration: Add `availability_date` (DATE) to `properties` table
  - Backfill from Monday via edge function (sync on webhook + backfill job)
- New SQL function: `available_by_date(lat FLOAT, lng FLOAT, miles INT, target_date DATE)` → returns properties available by target date
- Update existing function: `property_detail(id)` → include `availability_date` in response
- Update existing function: `properties_within_radius(...)` → add optional `target_date` param to filter

**Frontend Components:**
- `AvailabilityFilter.tsx`: Chip/toggle in filter bar
- Update `PropertyPanel.tsx`: Display availability status with visual indicators (green checkmark if OK, red warning if too late)
- Update `PropertyListItem.tsx`: Show availability hint ("Available 10/15")

**Testing:**
- Backfill availability data from Monday (manual + automated)
- Test filter with move-in date in past, future, and edge cases
- Verify grey-out and sorting work correctly
- Test with properties missing availability_date (show "Unknown" or "Call to confirm")

---

### Feature 3: Last-Used Date on Property Card

**Purpose:** Show when a property was last viewed or added to a claim (useful for searchers to recall recently-viewed options).

#### Requirements

- **Column in Supabase:** `last_used_at` (TIMESTAMP) on `properties` table
- **Auto-update triggers:**
  - When property panel opens: `GET /api/properties/[id]`
  - When property added to claim: `POST /api/claim/add`
  - Any interaction that "views" the property
- **Display:**
  - In property list: Small badge "Last used 2d ago" or "Used today"
  - In property panel: "Last viewed Oct 4"
- **Sort option:** "Recently used" (sorts by `last_used_at DESC`)
- **Privacy:** Show only date/time, not who used it (can add user ID in `last_used_by` field for future multi-team features)

**Backend Requirements:**
- Supabase table migration: Add `last_used_at` (TIMESTAMP DEFAULT now()), `last_used_by` (UUID, optional) to `properties`
- Update `properties_within_radius(...)` and `property_detail(id)` to return `last_used_at`
- Add tracking logic to API routes:
  - `GET /api/properties/[id]` → run `UPDATE properties SET last_used_at = now() WHERE id = ?` (server-side, no user tracking)
  - `POST /api/claim/add` → also updates `last_used_at`

**Frontend Components:**
- `LastUsedBadge.tsx`: Reusable badge component, formats timestamp nicely ("2d ago", "Today", "Oct 4")
- Update `PropertyListItem.tsx`: Show badge next to property address
- Update `PropertyPanel.tsx`: Display in property header
- Update `MapApp.tsx` sort options: Add "Recently used"

**Testing:**
- Verify `last_used_at` updates on property panel open
- Test timestamp formatting (edge cases: today, yesterday, >30 days ago, future dates)
- Test sorting by last_used_at
- Verify data persists across sessions

---

### Feature 4: Email Generator for Relocation Specialist

**Purpose:** Generate and send a pre-filled summary email with all relevant claim and property info.

#### Requirements

- **Button in property panel:** "📧 Email to Relocation Specialist"
- **Email includes:**
  - Claim summary: Family name, adults/children, bedrooms, bathrooms, FRV, move-in date
  - Property details: Address, beds/baths, rent, all fees, move-in total, property type, pet policy
  - Distance to loss address
  - Owner/landlord contact info (name, phone)
  - Direct Monday links to claim and property
  - Photo folder link (if available)
  - Searcher name and timestamp
- **Output formats:**
  - Pre-filled HTML email (for copy-paste)
  - Direct send via email API (optional)
  - Configurable templates (stored in Supabase)
- **Recipients:** Default to relocation specialist from Monday, editable in modal

**Backend Requirements:**
- New API route: `POST /api/email/generate`
  - Body: `{ claimId, propertyId }`
  - Returns: `{ htmlBody, textBody, subject, recipientEmail }`
- Optional route: `POST /api/email/send` (if using Resend or SendGrid)
  - Body: `{ claimId, propertyId, recipientEmail, message? }`
  - Returns: `{ emailId, status, sentAt }`
- Utility function: `generatePropertyEmail(claim, property)` → formats HTML/text
- Supabase table (optional): `email_templates(id, name, template, createdAt, updatedAt)` for custom templates

**Monday Integration:**
- Query claim's relocation specialist email (from Monday user or custom field)
- Include direct links: `https://novahavens-company.monday.com/boards/9030696652?item_id={claimId}`, `https://novahavens-company.monday.com/boards/18415735059?item_id={propertyId}`

**Frontend Components:**
- `EmailGenerator.tsx`: Modal with email preview, copy button, and optional send form
- Update `PropertyPanel.tsx`: Add "Email" button
- Toast notifications for copy/send success

**Email Service Setup (Optional):**
- If using Resend: `RESEND_API_KEY` env var
- If using SendGrid: `SENDGRID_API_KEY` env var
- Email template in HTML (Tailwind-styled)

**Testing:**
- Test email generation with complete claim/property data
- Test with missing fields (phone, photos, etc.) → graceful fallbacks
- Test copy-to-clipboard functionality
- Test send via email API (if implemented)
- Verify markdown/HTML formatting in recipient email

---

### Feature 5: Call / Text via Quo Integration

**Purpose:** Initiate calls and SMS directly from the property panel without leaving the map.

#### Requirements

- **Buttons in property panel (Contacts section):**
  - ☎️ "Call Owner"
  - 💬 "Text Owner"
  - Similar buttons for landlord/property manager (if different)
- **Workflow:**
  1. Searcher taps button
  2. Backend initiates Quo session with owner phone
  3. Quo masks phone numbers (neither party sees actual number)
  4. Call/SMS initiated
  5. Conversation logged in Quo and optionally synced to Monday
- **Fallback:** If phone missing, show "Contact info not available" or redirect to Monday
- **Context:** Quo session includes property address and claim ID for reference

**Backend Requirements:**
- New route: `POST /api/contact/call`
  - Body: `{ propertyId, contactType }` (contactType: "owner" | "landlord")
  - Returns: `{ quoSessionId, status, externalUrl?, message }`
  - Calls: `GET /api/properties/[id]` to fetch phone numbers
  - Validates: Phone exists, searcher authenticated (if needed)
  - Calls Quo API: `POST https://api.quo.com/sessions/initiate` (or equivalent)
- Route: `POST /api/contact/sms`
  - Body: `{ propertyId, contactType, message? }`
  - Similar flow, sends SMS instead

**Monday Integration:**
- Fetch owner/landlord phone from PROPERTY DATABASE (owner_phone, landlord_phone columns)
- Fetch searcher phone from Claim Process Board (searcher contact info or Monday user profile)
- Optional: Log call/SMS event to Monday as comment on claim

**Supabase Additions:**
- Add columns to `properties`: `owner_phone` (VARCHAR), `landlord_phone` (VARCHAR)
- Add table (optional): `contact_logs(id, propertyId, claimId, type, duration, quoSessionId, createdAt)` for analytics

**Quo Setup:**
- Supabase env vars: `QUO_API_KEY`, `QUO_WORKSPACE_ID`, `QUO_API_ENDPOINT`
- Quo account already created (prerequisite)
- Webhook configured for call/SMS completion events (POST back to `/api/webhooks/quo`)

**Frontend Components:**
- `QuoContactCard.tsx`: Reusable card with call/text buttons
- Loading states and error handling (phone missing, Quo API down)
- Success toast: "Call initiated" or "SMS sent"
- Optional analytics drawer (future): show recent contact history

**Testing:**
- Test with valid phone numbers (mock Quo API)
- Test with missing phone → graceful error
- Test call vs. SMS flow
- Verify Quo session ID is stored correctly
- Test webhook: Ensure completion events logged

---

### Feature 6: Embedded Search Agent in Monday

**Purpose:** Let searchers use the Property Map directly inside Monday without opening a separate tab.

#### Requirements

- **Embeddable iframe/frame** in Monday via custom URL field or board view
- **Auto-populated:** Reads claim's loss address and family needs automatically
- **Minimal UI:** Compact layout optimized for Monday embed (~400–600px width)
  - Map takes up most space
  - Basic filters: radius, pets allowed, has photos
  - Condensed property list or card grid
  - No header, no theme toggle, no extra nav
- **One-click add:** Tap property → instantly creates sub-item in Monday
  - No modal confirmation, just a toast "Added to claim"
  - Auto-refresh Monday sub-items board or send postMessage to parent
- **Frame-ancestors CSP:** Already set in `next.config.ts`, allow Monday embeds

#### Requirements

- New URL param: `?embedded=true&claimId=...`
- Component: `EmbeddedMap.tsx` (simplified version of `MapApp.tsx`)
- Conditional rendering:
  - Hide: Header logo, theme toggle, "Active Claims" button
  - Show: Map, basic filters, condensed property list
  - Adjust: Remove large sidebars, full-width map

**Integration with Monday:**
- Create custom "App" URL in Monday (Board view or custom field)
  - URL: `https://nova-havens-map.vercel.app/?embedded=true&claimId={claim_item_id}`
- Alternative: Custom field URL that renders in an iframe
- postMessage API (optional): Send "property added" event back to Monday parent

**Frontend Changes:**
- New component: `EmbeddedMap.tsx` (thin wrapper around existing components)
- Environment check: Detect `?embedded=true` and adjust UI
- CSS media query: Ensure responsive on narrow widths
- Remove scroll/overflow; fit content to iframe dimensions

**No new backend routes required** (reuse `/api/properties`, `/api/claim/add`)

**Testing:**
- Test embedded frame loads correctly in Monday iframe sandbox
- Test with various claim IDs
- Verify "Add to claim" works from embedded view
- Test responsiveness: 400px, 600px, mobile widths
- Verify CSP allows Monday embeds (no console errors)

---

### Feature 7: Advanced Claims Drawer (Stretch Goal)

**Purpose:** Enhanced version of the claims drawer with pinned favorites, real-time sync, and claim notes.

#### Requirements (Future / Nice-to-Have)

- **Pin/favorite claims:** Save frequently-accessed claims to top of list
- **Real-time sync:** Use WebSocket or polling to detect new claims and status changes
- **Claim notes:** Quick notes field per claim (stored in Supabase, synced to Monday)
- **Status indicators:** Show visual status: "No options", "Partial match", "Good fit", "Awaiting response"
- **Claim history:** Mini timeline: "Options sent 2d ago → 0 responses", "Family updated details yesterday"
- **Quick actions:** Buttons to create new claim, open claim in Monday, copy claim ID

**Implementation:** Phase 2c (low priority, after features 1–6 are stable)

---

## 🏗️ Architecture & Database Schema

### Supabase Migrations

```sql
-- Migration 1: Add availability tracking
ALTER TABLE properties ADD COLUMN availability_date DATE;
ALTER TABLE properties ADD COLUMN availability_label VARCHAR(100); -- "Immediate", "2 weeks", etc.
CREATE INDEX idx_properties_availability ON properties(availability_date);

-- Migration 2: Add phone numbers
ALTER TABLE properties ADD COLUMN owner_phone VARCHAR(20);
ALTER TABLE properties ADD COLUMN landlord_phone VARCHAR(20);
ALTER TABLE properties ADD COLUMN landlord_name VARCHAR(255);
ALTER TABLE properties ADD COLUMN landlord_email VARCHAR(255);

-- Migration 3: Add usage tracking
ALTER TABLE properties ADD COLUMN last_used_at TIMESTAMP DEFAULT now();
ALTER TABLE properties ADD COLUMN last_used_by UUID;
CREATE INDEX idx_properties_last_used ON properties(last_used_at DESC);

-- Migration 4: Create contact log (optional)
CREATE TABLE contact_logs (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  property_id INT REFERENCES properties(id),
  claim_id INT,
  contact_type VARCHAR(50), -- "owner" | "landlord"
  interaction_type VARCHAR(50), -- "call" | "sms"
  duration_seconds INT,
  quo_session_id VARCHAR(255),
  status VARCHAR(50), -- "initiated" | "completed" | "failed"
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID
);

-- Migration 5: Email templates (optional)
CREATE TABLE email_templates (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  name VARCHAR(255) UNIQUE NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Updated SQL Functions

```sql
-- Updated: properties_within_radius → include new columns
CREATE OR REPLACE FUNCTION properties_within_radius(
  lat FLOAT, lng FLOAT, miles INT, target_date DATE DEFAULT NULL
) RETURNS TABLE (
  id INT, monday_item_id INT, street VARCHAR, ... ,
  availability_date DATE, last_used_at TIMESTAMP,
  owner_phone VARCHAR, landlord_phone VARCHAR
) AS $$
  SELECT p.id, p.monday_item_id, p.street, ... ,
         p.availability_date,
         p.last_used_at,
         p.owner_phone,
         p.landlord_phone
  FROM properties p
  WHERE ST_DWithin(
    p.geom,
    ST_SetSRID(ST_Point(lng, lat), 4326)::geography,
    miles * 1609.34
  )
  AND (target_date IS NULL OR p.availability_date IS NULL OR p.availability_date <= target_date)
  ORDER BY p.geom <-> ST_SetSRID(ST_Point(lng, lat), 4326)::geography;
$$ LANGUAGE SQL;

-- New: property_distance_miles (already exists, for reference)
CREATE OR REPLACE FUNCTION property_distance_miles(property_id INT, lat FLOAT, lng FLOAT)
RETURNS FLOAT AS $$
  SELECT ST_DistanceSphere(geom, ST_SetSRID(ST_Point(lng, lat), 4326)::geography) / 1609.34
  FROM properties WHERE id = property_id;
$$ LANGUAGE SQL;
```

### New API Routes

```text
Routes to implement:

GET    /api/claims/active
       Query: ?days=7&status=awaitingOptions&limit=50
       Returns: { claims: [...], count: N }

GET    /api/properties/[id]
       (Update to track last_used_at server-side and return availability_date)

POST   /api/claim/add
       (Update to track last_used_at on property)

POST   /api/email/generate
       Body: { claimId: INT, propertyId: INT }
       Returns: { htmlBody, textBody, subject, recipientEmail }

POST   /api/email/send (optional)
       Body: { claimId, propertyId, recipientEmail, message? }
       Returns: { emailId, status, sentAt }

POST   /api/contact/call
       Body: { propertyId: INT, contactType: "owner" | "landlord" }
       Returns: { quoSessionId, status, externalUrl? }

POST   /api/contact/sms
       Body: { propertyId: INT, contactType, message? }
       Returns: { quoSessionId, status }

POST   /api/webhooks/quo (if using Quo)
       Receives: Quo webhook payload on call/SMS completion
       Stores in contact_logs table

GET    /api/claims/active (NEW)
       Returns active claims ready for options
```

### New Frontend Components

```text
components/
├── ActiveClaimsDrawer.tsx
│   ├── ClaimList.tsx
│   ├── ClaimCard.tsx
│   └── ClaimSearch.tsx
├── AvailabilityFilter.tsx
├── LastUsedBadge.tsx
├── EmailGenerator.tsx
│   ├── EmailPreview.tsx
│   └── EmailForm.tsx
├── QuoContactCard.tsx
├── EmbeddedMap.tsx
└── updates to:
    ├── MapApp.tsx (add claims drawer toggle)
    ├── PropertyPanel.tsx (add email, call, sms, availability, last-used)
    ├── PropertyListItem.tsx (add last-used badge)
    └── SearchBox.tsx (unchanged)
```

---

## 🤖 Implementation Strategy: Multi-Agent Workflow

This section is **for Claude and sub-agents** to efficiently build and test Phase 2 features.

### Agent Roles & Responsibilities

#### **Flagship Agent (Claude 3.5 Sonnet or later)**
- **Role:** Architect, orchestrator, and QA lead
- **Responsibilities:**
  - Overall feature design and API specification
  - Complex business logic (claim filtering, email templates, Monday integration)
  - Code review and quality assurance
  - Debugging integration issues across services
  - PR reviews and final approval
- **Task allocation:** Routes specialized work to sub-agents
- **Output:** PR ready for human review

#### **Sub-Agent 1: Frontend Development (Claude 3.5 Haiku or Opus)**
- **Role:** React component builder
- **Responsibilities:**
  - Build `ActiveClaimsDrawer.tsx`, `AvailabilityFilter.tsx`, `LastUsedBadge.tsx`, `EmailGenerator.tsx`, `QuoContactCard.tsx`
  - Update `PropertyPanel.tsx`, `PropertyListItem.tsx`, `MapApp.tsx`
  - Implement UI state management, keyboard shortcuts, localStorage
  - Styling with Tailwind CSS
  - Component testing and visual regression
- **Focus:** Clean, maintainable React code with TypeScript types
- **Output:** Ready-to-merge component files

#### **Sub-Agent 2: Backend API (Claude 3.5 Haiku or Opus)**
- **Role:** Next.js API route builder
- **Responsibilities:**
  - Implement `/api/claims/active`, `/api/email/generate`, `/api/contact/call`, `/api/contact/sms`
  - Monday GraphQL queries and integrations
  - Error handling, validation, authentication
  - Environment variable configuration
- **Focus:** Secure, performant, well-documented routes
- **Output:** Ready-to-merge API code

#### **Sub-Agent 3: Database & Data Layer (Claude 3.5 Haiku)**
- **Role:** Supabase/PostgreSQL specialist
- **Responsibilities:**
  - Supabase migrations and index creation
  - SQL functions (`properties_within_radius`, `available_by_date`, etc.)
  - Schema validation and performance optimization
  - Seed data for testing
- **Focus:** Correct schema, efficient queries, data integrity
- **Output:** Migration files and SQL functions ready to deploy

#### **Sub-Agent 4: Integration & Testing (Claude 3.5 Haiku)**
- **Role:** QA and integration specialist
- **Responsibilities:**
  - End-to-end testing (claim drawer → add property → Monday)
  - Mock Quo API calls, email service responses
  - Error scenarios and edge cases
  - Performance testing (large claim lists, many properties)
  - Documentation of test cases
- **Focus:** Reliability and user experience
- **Output:** Test suite and test case documentation

---

### Task Breakdown by Agent

#### **Phase 2a: Active Claims Drawer** (1–2 sprints)

1. **Flagship Agent:**
   - Design API schema for `/api/claims/active`
   - Specify Monday GraphQL query structure
   - Review all sub-agent PRs

2. **Sub-Agent 3 (Database):**
   - Create migration for `claims` view (if needed)
   - Verify existing Monday board schema

3. **Sub-Agent 2 (Backend):**
   - Implement `GET /api/claims/active` endpoint
   - Write Monday GraphQL helper
   - Add rate limiting and error handling

4. **Sub-Agent 1 (Frontend):**
   - Build `ActiveClaimsDrawer.tsx`, `ClaimCard.tsx`, `ClaimSearch.tsx`
   - Integrate into `MapApp.tsx` with toggle and keyboard shortcut
   - Test with mock data

5. **Sub-Agent 4 (Testing):**
   - End-to-end test: Open drawer → click claim → map updates
   - Test search, sort, and filter
   - Load testing with 50+ active claims

---

#### **Phase 2b: Availability & Last-Used** (1 sprint, parallel with 2a)

1. **Flagship Agent:**
   - Review feature spec with team
   - Coordinate timing of data availability in Monday

2. **Sub-Agent 3 (Database):**
   - Create migrations for `availability_date`, `last_used_at`
   - Update SQL functions to filter by availability
   - Create backfill script for Monday data

3. **Sub-Agent 2 (Backend):**
   - Update `/api/properties` routes to track `last_used_at`
   - Update `/api/claim/add` to record usage

4. **Sub-Agent 1 (Frontend):**
   - Build `AvailabilityFilter.tsx` chip
   - Build `LastUsedBadge.tsx` component
   - Update `PropertyPanel.tsx` to show availability warnings
   - Add sort by "Recently used"

5. **Sub-Agent 4 (Testing):**
   - Test availability filtering with various move-in dates
   - Test `last_used_at` updates on property panel open
   - Test timestamp formatting edge cases

---

#### **Phase 2c: Email Generator** (1–2 sprints, can be parallel)

1. **Flagship Agent:**
   - Design email template structure
   - Decide on email service (Resend, SendGrid, or just mailto)

2. **Sub-Agent 2 (Backend):**
   - Implement `/api/email/generate` with HTML/text rendering
   - Optionally implement `/api/email/send` (if not using mailto)
   - Integrate Monday claim/property data

3. **Sub-Agent 1 (Frontend):**
   - Build `EmailGenerator.tsx` modal
   - Implement copy-to-clipboard
   - Optional: Direct send form

4. **Sub-Agent 4 (Testing):**
   - Test email generation with complete data
   - Test with missing fields (fallbacks)
   - Test copy, send, preview

---

#### **Phase 2d: Quo Integration** (1–2 sprints, sequential)

1. **Flagship Agent:**
   - Create Quo account and API credentials
   - Design call/SMS workflow
   - Document security best practices (mask phone numbers, log calls)

2. **Sub-Agent 3 (Database):**
   - Create `contact_logs` table and indexes
   - Update `properties` table with phone numbers

3. **Sub-Agent 2 (Backend):**
   - Implement `/api/contact/call`, `/api/contact/sms`
   - Create Quo API wrapper
   - Implement webhook handler for call/SMS completion
   - Add authentication/authorization checks

4. **Sub-Agent 1 (Frontend):**
   - Build `QuoContactCard.tsx` with call/text buttons
   - Implement loading and error states
   - Add success toasts

5. **Sub-Agent 4 (Testing):**
   - Mock Quo API and test call/SMS flows
   - Test error scenarios (missing phone, API down)
   - Test webhook payload handling

---

#### **Phase 2e: Embedded Map (Optional, Phase 2c)**

1. **Flagship Agent:**
   - Design Monday embedding strategy
   - Verify CSP configuration

2. **Sub-Agent 1 (Frontend):**
   - Create `EmbeddedMap.tsx` wrapper
   - Conditional rendering for `?embedded=true`
   - Test in Monday iframe sandbox

3. **Sub-Agent 4 (Testing):**
   - Test embedded frame in Monday
   - Verify responsiveness
   - Test CSP compliance

---

### Agent Communication & Handoff Protocol

**Workflow:**

1. **Flagship Agent** writes feature spec and task breakdown (this document)
2. **Flagship Agent** creates GitHub project with linked issues for each sub-task
3. **Sub-Agents** claim tasks via comments on issues
4. **Sub-Agents** create feature branches and open PRs
5. **Sub-Agents** post updates as PR comments (blockers, dependencies, questions)
6. **Flagship Agent** reviews PRs daily, unblocks dependencies, approves merges
7. **Flagship Agent** runs integration tests before merging feature branches

**Dependencies to Track:**
- Database migrations must complete before backend routes are tested
- Backend routes needed before frontend can integrate
- Mock data helpful for frontend to develop in parallel

**Commit Message Convention:**
```
feat(phase2-feature-name): brief description

Type: feature/fix/chore
Agent: Frontend/Backend/Database/Testing
Issue: #123
```

---

### Efficient Sub-Agent Tooling & Practices

#### **To optimize sub-agent output:**

1. **Use smaller, cheaper models for focused tasks:**
   - `claude-3-5-haiku`: SQL functions, component styling, UI polish
   - `claude-3-5-sonnet`: Complex API logic, Monday integration, testing strategies
   - `claude-opus`: Architecture decisions, debugging, PR reviews (when needed)

2. **Delegate specific, scoped tasks:**
   - Instead of "build the drawer," say: "Create `ActiveClaimsDrawer.tsx` component that accepts `claims` prop (array of objects with id, name, lossAddress, familyPreview) and renders a scrollable list with search."
   - Clear input/output specs reduce back-and-forth.

3. **Provide context via file references:**
   - Include relevant existing code snippets (e.g., how `PropertyPanel.tsx` is structured)
   - Link to existing components that follow the same pattern
   - Reduces re-invention and ensures consistency

4. **Use mock data for parallel development:**
   - Frontend can develop with hardcoded claim data while backend is being built
   - Database team provides schema docs for backend to target
   - Integration happens last

5. **Assign testing to dedicated agent:**
   - Prevents silos; testing agent knows all components
   - Can catch cross-feature issues early
   - Creates reusable test patterns

6. **Weekly check-ins (flagship + all sub-agents):**
   - Identify blockers (e.g., waiting on Quo API key)
   - Align on naming conventions, data structures
   - Adjust priorities if needed

---

### Estimated Effort (with sub-agents)

| Feature | Flagship | Frontend | Backend | Database | Testing | Total |
|---------|----------|----------|---------|----------|---------|-------|
| Active Claims Drawer | 8h | 12h | 8h | 2h | 8h | 38h |
| Availability & Last-Used | 4h | 10h | 6h | 4h | 6h | 30h |
| Email Generator | 4h | 8h | 8h | 0h | 4h | 24h |
| Quo Integration | 6h | 10h | 12h | 4h | 8h | 40h |
| Embedded Map | 3h | 6h | 0h | 0h | 4h | 13h |
| **Phase 2 Total** | **25h** | **46h** | **34h** | **10h** | **30h** | **~145h** |

**With parallel sub-agent work:** ~4–6 weeks of elapsed time (not calendar weeks, active development weeks)

---

## 📝 Implementation Checklist

### Before Starting
- [ ] Quo account created and API credentials obtained
- [ ] Email service selected (Resend, SendGrid, or mailto)
- [ ] Monday team confirms availability column will be added to PROPERTY DATABASE
- [ ] All sub-agents have GitHub write access and Vercel preview deploy rights

### Active Claims Drawer
- [ ] Sub-Agent 3: Migration created (if needed for claims view)
- [ ] Sub-Agent 2: `/api/claims/active` implemented and tested with Monday data
- [ ] Sub-Agent 1: `ActiveClaimsDrawer.tsx` built and integrated
- [ ] Sub-Agent 4: E2E test: drawer opens, lists claims, opens claim updates map
- [ ] Flagship: Code review, merge to `nextjs-source` branch

### Availability Calendar
- [ ] Sub-Agent 3: Migrations for `availability_date` created
- [ ] Sub-Agent 3: Backfill script runs (Monday data → Supabase)
- [ ] Sub-Agent 2: Updated `/api/properties` filtering
- [ ] Sub-Agent 1: Filter chip + warning indicators built
- [ ] Sub-Agent 4: Test filter with various move-in dates
- [ ] Flagship: Merge

### Last-Used Tracking
- [ ] Sub-Agent 3: Migrations for `last_used_at` created
- [ ] Sub-Agent 2: Tracking logic added to GET/POST routes
- [ ] Sub-Agent 1: Badge component built, sort option added
- [ ] Sub-Agent 4: Test timestamp updates and formatting
- [ ] Flagship: Merge

### Email Generator
- [ ] Sub-Agent 2: `/api/email/generate` and optional `/api/email/send` implemented
- [ ] Sub-Agent 1: Modal + preview + copy built
- [ ] Sub-Agent 4: Test generation, copy, send
- [ ] Flagship: Merge

### Quo Integration
- [ ] Quo API credentials in Vercel env vars
- [ ] Sub-Agent 3: `contact_logs` table created
- [ ] Sub-Agent 2: `/api/contact/call` and `/api/contact/sms` implemented
- [ ] Sub-Agent 2: Webhook handler implemented
- [ ] Sub-Agent 1: Call/Text buttons built, states handled
- [ ] Sub-Agent 4: Test with mock Quo responses
- [ ] Flagship: Merge

### Embedded Map (Optional)
- [ ] Sub-Agent 1: `EmbeddedMap.tsx` built
- [ ] Sub-Agent 4: Tested in Monday iframe
- [ ] Flagship: Merge

### Final QA & Deployment
- [ ] All migrations applied to production Supabase
- [ ] Vercel Preview URL stable and tested
- [ ] Production Vercel env vars set
- [ ] Monday team verifies new features
- [ ] Merge `nextjs-source` → `main` (triggers production deploy)
- [ ] Rollback plan documented

---

## 🔗 External Resources & APIs

### Quo Integration
- Docs: https://quo.com/api/docs (if available)
- Sandbox endpoint (for testing)
- Production endpoint
- Webhook event types: `call.completed`, `sms.delivered`

### Email Services
- **Resend:** https://resend.com/docs (recommended for simplicity)
- **SendGrid:** https://sendgrid.com/docs/

### Monday.com GraphQL
- GraphQL Playground: https://novahavens-company.monday.com/apps/graphql
- Scopes: Read/Write Claims, Read Properties, Create Sub-items

### Supabase
- Project: https://supabase.com/dashboard/project/nmandvqfuwvqxeabptjd
- Docs: https://supabase.com/docs

---

## 🚀 Deployment Strategy

### Staging / Preview
1. Feature branches push to Vercel preview URLs (automatic)
2. Sub-agents test in preview
3. Flagship agent reviews via PR

### Production
1. Merge feature branch to `nextjs-source`
2. Open PR from `nextjs-source` to `main`
3. Flagship agent final review
4. Merge to `main` → Vercel production deploy
5. Monitor for errors (Sentry, logs)
6. Announce to team

### Rollback
- Vercel: *Deployments → ⋯ → Instant Rollback* to last known good
- Database: Supabase backups available (24h retention on standard plan)

---

## 📞 Support & Questions

**For sub-agents during implementation:**
- Ask Flagship Agent (Claude 3.5 Sonnet) for design clarifications
- Post blocking issues in GitHub issues (tag `@Novahavens`)
- Document dependencies and share context via Slack/PR comments

**For the team:**
- Questions about Monday data structure? → Fazal Abed
- Questions about Quo setup? → TBD
- Questions about deployment? → TBD

---

## ✅ Sign-Off

**Spec Version:** 1.0  
**Last Updated:** 2026-10-06  
**Owner:** Fazal Abed  
**Flagship Agent:** Claude 3.5 Sonnet  

This document is ready for sub-agent implementation. Start with **Phase 2a (Active Claims Drawer)** as the foundation; other features can be built in parallel once the core is stable.

