// Fictional payloads for every housing-agent route, in the exact shapes of lib/types.ts. Used by the browser
// tests (which mock every API) and by anyone building UI before the database functions are live.
// Nothing here is a real home, person, phone number or claim: addresses are invented, phone numbers are in
// the 555-01xx range reserved for fiction, and URLs point at example.com.
//
//   import { HEALTH_ON, OUTSIDE, SCORES, … } from "../fixtures/map-agent.mjs";
//   await page.route("**/api/claim/*/outside", (r) => r.fulfill({ json: OUTSIDE }));

/** The claim every fixture belongs to (fictional Monday item id) and its loss location (downtown Tulsa). */
export const CLAIM_ID = "9900000001";
export const LOSS = { lat: 36.154, lng: -95.9928 };

const KEYS = ["outside", "bestMatch", "chat", "addOutside", "submit", "mine", "nearsite", "findPhone", "templates"];
/** GET /api/health → `features`, all on / all off. */
export const FEATURES_ON = Object.fromEntries(KEYS.map((k) => [k, true]));
export const FEATURES_OFF = Object.fromEntries(KEYS.map((k) => [k, false]));
export const HEALTH_ON = { ok: true, dryRun: true, quo: false, editing: false, features: FEATURES_ON };
export const HEALTH_OFF = { ok: true, dryRun: true, quo: false, editing: false, features: FEATURES_OFF };

const home = (o) => ({
  source: "zillow", url: null, addressKnown: true, city: "Tulsa", state: "OK", beds: 3, baths: 2, rent: 2400, lat: null, lng: null,
  precision: null, distanceMiles: null, score: null, fits: true, excludedBy: [], isNew: false, inPropertyDb: false,
  propertyItemId: null, onClaim: false, hasPhone: false, availableFrom: null, pets: null, photo: null, outreach: null, ...o,
});

/** Ids of the fixture homes, by what they demonstrate. */
export const HOME = {
  zillowExact: "11111111-1111-4111-8111-111111111101",
  zillowNew: "11111111-1111-4111-8111-111111111102",
  zillowOnClaim: "11111111-1111-4111-8111-111111111103",
  zillowApprox: "11111111-1111-4111-8111-111111111104",
  ffArea: "11111111-1111-4111-8111-111111111105",
  ffNoCoords: "11111111-1111-4111-8111-111111111106",
  ffAsked: "11111111-1111-4111-8111-111111111107",
  stretch: "11111111-1111-4111-8111-111111111108",
};

/**
 * GET /api/claim/:claimId/outside. Eight homes: Zillow with an exact pin (one new, one already on the claim and
 * in PROPERTY DATABASE, one approximate), Furnished Finder area-level (one with an area pin, one with no
 * coordinates at all, one whose landlord was asked for the address), and one stretch that does not fit (rent).
 */
export const OUTSIDE = {
  enabled: true,
  searchId: "22222222-2222-4222-8222-222222222201",
  versionNo: 2,
  run: { status: "done", found: 8, fitting: 7, newHomes: 2, finishedAt: "2026-11-26T15:04:00.000Z" },
  homes: [
    home({ listingId: HOME.zillowExact, rank: 1, title: "4100 Sample Ave", url: "https://example.com/zillow/4100-sample-ave", lat: 36.1612, lng: -95.9801, precision: "exact", distanceMiles: 0.9, score: 91, rent: 2350, hasPhone: true, pets: "Pets allowed", availableFrom: "2026-12-01", photo: "https://example.com/photos/4100.jpg" }),
    home({ listingId: HOME.zillowNew, rank: 2, title: "77 Placeholder Ln", url: "https://example.com/zillow/77-placeholder-ln", lat: 36.1399, lng: -95.9702, precision: "exact", distanceMiles: 1.6, score: 86, rent: 2600, beds: 4, baths: 2.5, isNew: true, photo: "https://example.com/photos/77.jpg" }),
    home({ listingId: HOME.zillowOnClaim, rank: 3, title: "912 Example St", url: "https://example.com/zillow/912-example-st", lat: 36.1702, lng: -96.0105, precision: "exact", distanceMiles: 1.5, score: 80, rent: 2200, inPropertyDb: true, propertyItemId: "9900000101", onClaim: true }),
    home({ listingId: HOME.zillowApprox, rank: 4, title: "2300 Fixture Blvd", url: "https://example.com/zillow/2300-fixture-blvd", lat: 36.1208, lng: -95.9406, precision: "approx", distanceMiles: 3.7, score: 72, rent: 2500, isNew: true }),
    home({ listingId: HOME.ffArea, rank: 5, source: "furnished_finder", title: "Cozy 3BR near Midtown", url: "https://example.com/ff/cozy-3br-midtown", addressKnown: false, lat: 36.1335, lng: -95.9609, precision: "area", distanceMiles: 2.3, rent: 2700, pets: "Pets allowed", availableFrom: "2026-12-15" }),
    home({ listingId: HOME.ffNoCoords, rank: 6, source: "furnished_finder", title: "Furnished bungalow, fenced yard", url: "https://example.com/ff/furnished-bungalow", addressKnown: false, precision: "area", rent: 2450, beds: 2, baths: 1 }),
    home({ listingId: HOME.ffAsked, rank: 7, source: "furnished_finder", title: "Quiet 3BR for traveling families", url: "https://example.com/ff/quiet-3br", addressKnown: false, precision: "area", rent: 2550, city: "Broken Arrow", outreach: { status: "sent", channel: "ff_message", sentAt: "2026-11-25T18:30:00.000Z", sentBy: "Alex Example", repliedAt: null } }),
    home({ listingId: HOME.stretch, rank: 8, title: "5 Stretch Ct", url: "https://example.com/zillow/5-stretch-ct", lat: 36.0903, lng: -95.9204, precision: "exact", distanceMiles: 5.9, score: 48, rent: 3400, beds: 4, baths: 3, fits: false, excludedBy: ["rent"] }),
  ],
};

/** The same route before the agent has searched for the claim, and with the feature off. */
export const OUTSIDE_EMPTY = { enabled: true, searchId: null, versionNo: null, run: null, homes: [] };
export const OUTSIDE_OFF = { enabled: false, searchId: null, versionNo: null, run: null, homes: [] };

/** GET /api/claim/:claimId/scores. Six of our own homes (fictional property ids); the fifth is a price stretch, the sixth a far one. */
export const SCORES = {
  enabled: true,
  scores: [
    { propertyId: "9900000101", rank: 1, score: 96, why: "Margin $1,150/mo · 1.5 mi · 3 bd / 2 ba · Available", stretch: false, stretchBy: null, distanceMiles: 1.5 },
    { propertyId: "9900000102", rank: 2, score: 88, why: "Margin $900/mo · 2.8 mi · 3 bd / 2 ba · Availability not checked", stretch: false, stretchBy: null, distanceMiles: 2.8 },
    { propertyId: "9900000103", rank: 3, score: 81, why: "Margin $1,400/mo · 4.1 mi · 4 bd / 3 ba · Available", stretch: false, stretchBy: null, distanceMiles: 4.1 },
    { propertyId: "9900000104", rank: 4, score: 74, why: "Margin $650/mo · 6.3 mi · 3 bd / 1.5 ba · Thin margin (under $800)", stretch: false, stretchBy: null, distanceMiles: 6.3 },
    { propertyId: "9900000105", rank: 5, score: 61, why: "Over the cap by $250/mo · 3.0 mi · 4 bd / 2 ba", stretch: true, stretchBy: 250, distanceMiles: 3.0 },
    { propertyId: "9900000106", rank: 6, score: 44, why: "Margin $1,900/mo · 61.2 mi · 3 bd / 2 ba · Beyond 50 mi", stretch: true, stretchBy: null, distanceMiles: 61.2 },
  ],
};
export const SCORES_OFF = { enabled: false, scores: [] };

/** GET /api/claim/:claimId/submit-status. One option in each state. */
export const SUBMIT_STATUS = {
  enabled: true,
  options: [
    { subitemId: "9900000201", propertyId: "9900000101", state: "submitted", reason: null, approvedBy: "Alex Example", approvedAt: "2026-11-24T16:00:00.000Z", submittedBy: "Sam Sample", submittedAt: "2026-11-24T17:10:00.000Z" },
    { subitemId: "9900000202", propertyId: "9900000102", state: "ready", reason: null, approvedBy: "Alex Example", approvedAt: "2026-11-26T14:20:00.000Z", submittedBy: null, submittedAt: null },
    { subitemId: "9900000203", propertyId: "9900000103", state: "todo", reason: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null },
    { subitemId: "9900000204", propertyId: "9900000104", state: "blocked", reason: "Availability has not been checked in the last 7 days", approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null },
  ],
  counts: { ready: 1, submitted: 1 },
};
export const SUBMIT_STATUS_OFF = { enabled: false, options: [], counts: { ready: 0, submitted: 0 } };

/** GET /api/claims/nearsite. Five open claims, newest first; the last has no assignee, budget or pin. */
export const NEARSITE_CLAIMS = {
  enabled: true,
  claims: [
    { id: "90001", mondayItemId: "9900000301", title: "Family of 4 · Tulsa, OK", company: "Example Mutual", city: "Tulsa", state: "OK", lat: 36.154, lng: -95.9928, lossAddress: "100 Fiction Rd, Tulsa, OK 74103", beds: 3, baths: 2, budgetMonthly: 4200, maxRate: 3500, moveIn: "2026-12-05", daysLeft: 6, feeGroup: "Standard", homesFound: 12, status: "Open", assignedTo: "Alex Example", url: "https://example.com/nearsite/90001" },
    { id: "90002", mondayItemId: "9900000302", title: "Couple with a dog · Broken Arrow, OK", company: "Sample Insurance", city: "Broken Arrow", state: "OK", lat: 36.0526, lng: -95.7908, lossAddress: "22 Made Up Way, Broken Arrow, OK 74012", beds: 2, baths: 1, budgetMonthly: 3000, maxRate: 2500, moveIn: "2026-12-01", daysLeft: 2, feeGroup: "Standard", homesFound: 4, status: "Open", assignedTo: "Sam Sample", url: "https://example.com/nearsite/90002" },
    { id: "90003", mondayItemId: "9900000303", title: "Family of 6 · Owasso, OK", company: "Example Mutual", city: "Owasso", state: "OK", lat: 36.2695, lng: -95.8547, lossAddress: "7 Pretend Pl, Owasso, OK 74055", beds: 4, baths: 3, budgetMonthly: 5600, maxRate: 4700, moveIn: "2026-12-12", daysLeft: 11, feeGroup: "Premium", homesFound: 0, status: "Open", assignedTo: "Alex Example", url: "https://example.com/nearsite/90003" },
    { id: "90004", mondayItemId: "9900000304", title: "Single adult · Jenks, OK", company: "Placeholder Relocation", city: "Jenks", state: "OK", lat: 36.0229, lng: -95.9683, lossAddress: "310 Invented St, Jenks, OK 74037", beds: 1, baths: 1, budgetMonthly: 2400, maxRate: 2000, moveIn: "2026-11-30", daysLeft: 0, feeGroup: "Standard", homesFound: 7, status: "Open", assignedTo: "Sam Sample", url: "https://example.com/nearsite/90004" },
    { id: "90005", mondayItemId: null, title: "Family of 3 · Sand Springs, OK", company: null, city: "Sand Springs", state: "OK", lat: null, lng: null, lossAddress: null, beds: 3, baths: 2, budgetMonthly: null, maxRate: null, moveIn: null, daysLeft: null, feeGroup: null, homesFound: null, status: "Open", assignedTo: null, url: null },
  ],
};
export const NEARSITE_CLAIMS_OFF = { enabled: false, claims: [] };

/** POST /api/claim/:claimId/ask, one answer per kind of step. */
export const ASK = {
  open: { ok: true, say: "Found 7 homes that fit.", running: false, searchId: OUTSIDE.searchId, versionNo: 1, summary: { homes: 7, newHomes: 2 } },
  message: { ok: true, say: "Capping rent at $3,000 and widening to 30 miles. Found 9 homes that fit.", running: false, searchId: OUTSIDE.searchId, versionNo: 2, summary: { homes: 9, newHomes: 3 } },
  reject: { ok: true, say: "Hidden. 5 Stretch Ct will not come back for this claim.", running: false, searchId: OUTSIDE.searchId, versionNo: 3, summary: { homes: 7, newHomes: 2 } },
  moreLike: { ok: true, say: "Searching within 10 miles of 4100 Sample Ave. Found 5 homes that fit.", running: false, searchId: OUTSIDE.searchId, versionNo: 4, summary: { homes: 5, newHomes: 1 } },
  undo: { ok: true, say: "Back to version 1. Found 7 homes that fit.", running: false, searchId: OUTSIDE.searchId, versionNo: 3, summary: { homes: 7, newHomes: 0 } },
  nothingToUndo: { ok: true, say: "There is no earlier search to go back to.", running: false, searchId: OUTSIDE.searchId, versionNo: 1, summary: null },
  running: { ok: true, say: "Still searching. New homes will show here when it finishes.", running: true, searchId: OUTSIDE.searchId, versionNo: 2, summary: null },
  answer: { ok: true, say: "I can change the area, budget, beds, baths, dates or pets, explain why a home is missing, or go back to an earlier search.", running: false, searchId: OUTSIDE.searchId, versionNo: 2, summary: { homes: 7, newHomes: 2 } },
  off: { ok: false, say: "The agent is switched off.", running: false, searchId: null, versionNo: null, summary: null },
  rateLimited: { error: "Too many messages; try again in a few minutes", code: "rate_limited" }, // 429
  failed: { error: "The agent did not answer. Try again in a minute.", code: "agent_error" }, // 502
};

/** A short conversation for the chat window (ChatMessage[]; the browser keeps these, the server does not). */
export const CHAT_MESSAGES = [
  { id: "m1", role: "agent", text: ASK.open.say, at: "2026-11-26T15:04:05.000Z" },
  { id: "m2", role: "user", text: "under 3k and a bit wider", at: "2026-11-26T15:05:10.000Z" },
  { id: "m3", role: "agent", text: ASK.message.say, at: "2026-11-26T15:05:48.000Z" },
];

/** POST /api/claim/:claimId/add-outside. */
export const ADD_OUTSIDE = {
  added: { ok: true, propertyId: "9900000107", subitemId: "9900000205", alreadyOnClaim: false }, // 201
  already: { ok: true, propertyId: "9900000101", subitemId: "9900000201", alreadyOnClaim: true }, // 200
  dryRun: { ok: true, propertyId: null, subitemId: null, alreadyOnClaim: false, dryRun: true }, // 200
  noAddress: { error: "This home has no street address yet. Ask the landlord for it first", code: "no_address" }, // 409
  off: { error: "Adding outside homes is switched off", code: "feature_off" }, // 503
};

/** GET|POST /api/properties/:id/find-phone. `idle` is what GET answers before anyone has looked. */
export const PHONE = {
  found: { state: "found", phone: "+19185550142", source: "lookup", confidence: "high", lookedUpAt: "2026-11-26T15:10:00.000Z" },
  foundLow: { state: "found", phone: "+19185550177", source: "lookup", confidence: "low", lookedUpAt: "2026-11-26T15:10:00.000Z" },
  notFound: { state: "not_found", phone: null, source: "lookup", confidence: null, lookedUpAt: "2026-11-26T15:10:00.000Z" },
  idle: { state: "not_found", phone: null, source: null, confidence: null, lookedUpAt: null },
  off: { state: "off", phone: null, source: null, confidence: null, lookedUpAt: null },
  rateLimited: { error: "Too many lookups; try again in a few minutes", code: "rate_limited" }, // 429
};

/** GET /api/properties/:id/outreach (feature `templates`). */
export const OUTREACH = {
  sent: { enabled: true, outreach: { status: "sent", channel: "ff_message", sentAt: "2026-11-25T18:30:00.000Z", sentBy: "Alex Example", repliedAt: null } },
  replied: { enabled: true, outreach: { status: "replied", channel: "ff_message", sentAt: "2026-11-24T18:30:00.000Z", sentBy: "Alex Example", repliedAt: "2026-11-25T09:12:00.000Z" } },
  none: { enabled: true, outreach: null },
  off: { enabled: false, outreach: null },
};

/** Raw rows as the SQL functions return them (snake_case), for the mapper unit tests. */
export const RAW = {
  outside: {
    ok: true, search_id: OUTSIDE.searchId, version_no: 2, claim_source: "monday", claim_ref: CLAIM_ID,
    run: { status: "done", found: 3, fitting: 2, new_homes: 1, finished_at: "2026-11-26T15:04:00+00:00" },
    homes: [
      { listing_id: HOME.zillowExact, source: "zillow", url: "https://example.com/zillow/4100-sample-ave", title: "4100 Sample Ave", address_known: true, city: "Tulsa", state: "OK", beds: "3", baths: "2.0", rent: "2350", lat: 36.1612, lng: -95.9801, precision: "exact", distance_mi: "0.90", rank: 1, score: "91.0", fits: true, excluded_by: [], is_new: true, in_property_db: false, property_item_id: null, on_claim: false, has_phone: true, available_from: "2026-12-01", pets: "Pets allowed", photo: "https://example.com/photos/4100.jpg", outreach: null },
      { listing_id: HOME.ffAsked, source: "furnished_finder", url: "https://example.com/ff/quiet-3br", title: "Quiet 3BR for traveling families", address_known: false, city: "Broken Arrow", state: "OK", beds: 3, baths: 2, rent: 2550, lat: null, lng: null, precision: "area", distance_mi: null, rank: 2, score: null, fits: true, excluded_by: [], is_new: false, in_property_db: false, property_item_id: null, on_claim: false, has_phone: false, available_from: null, pets: null, photo: null, outreach: { status: "sent", channel: "ff_message", sent_at: "2026-11-25T18:30:00+00:00", sent_by: "Alex Example", replied_at: null } },
      { listing_id: HOME.stretch, source: "zillow", url: "javascript:alert(1)", title: "5 Stretch Ct", address_known: true, city: "Tulsa", state: "OK", beds: 4, baths: 3, rent: 3400, lat: 36.0903, lng: -95.9204, precision: "pin", distance_mi: 5.9, rank: 3, score: 48, fits: false, excluded_by: ["rent"], is_new: false, in_property_db: true, property_item_id: 9900000101, on_claim: true, has_phone: false, available_from: null, pets: null, photo: null, outreach: null },
    ],
  },
  scores: { ok: true, source: "typed", scores: [
    { property_id: "9900000101", rank: 1, score: "96.0", why: "Margin $1,150/mo", stretch: false, stretch_by: null, distance_mi: "1.50" },
    { property_id: "9900000105", rank: 2, score: 61, why: null, stretch: true, stretch_by: "250", distance_mi: 3 },
    { property_id: null, rank: 3, score: 50 },
  ] },
  submit: { ok: true, counts: { ready: 9, submitted: 9 }, options: [
    { subitem_id: "9900000201", property_id: "9900000101", state: "submitted", reason: null, approved_by: "Alex Example", approved_at: "2026-11-24T16:00:00+00:00", submitted_by: "Sam Sample", submitted_at: "2026-11-24T17:10:00+00:00" },
    { subitem_id: "9900000202", property_id: "9900000102", state: "ready", reason: "left over", approved_by: "Alex Example", approved_at: "2026-11-26T14:20:00+00:00", submitted_by: null, submitted_at: null },
    { subitem_id: "9900000204", property_id: null, state: "blocked", reason: "Availability has not been checked", approved_by: null, approved_at: null, submitted_by: null, submitted_at: null },
    { subitem_id: "9900000203", property_id: "9900000103", state: "something new" },
  ] },
  nearsite: { ok: true, claims: [
    { id: "90001", monday_item_id: "9900000301", title: "Family of 4 · Tulsa, OK", company: "Example Mutual", city: "Tulsa", state: "OK", lat: 36.154, lng: -95.9928, loss_address: "100 Fiction Rd, Tulsa, OK 74103", beds: "3", baths: "2", budget_monthly: "4200", max_rate: "3500.00", move_in: "2026-12-05", days_left: 6, fee_group: "Standard", homes_found: 12, status: "Open", assigned_to: "Alex Example", url: "https://example.com/nearsite/90001" },
    { id: "90005", monday_item_id: null, title: null, company: null, city: null, state: null, lat: null, lng: -95, loss_address: null, beds: null, baths: null, budget_monthly: null, max_rate: null, move_in: null, days_left: null, fee_group: null, homes_found: null, status: null, assigned_to: null, url: null },
  ] },
  phoneFound: { ok: true, lookup: { state: "found", phone: "+19185550142", source: "lookup", confidence: "high", looked_up_at: "2026-11-26T15:10:00+00:00" } },
  phoneNotFound: { ok: true, lookup: { state: "not_found", phone: null, source: "lookup", confidence: "high", looked_up_at: "2026-11-26T15:10:00+00:00" } },
  phoneNone: { ok: true, lookup: null },
  context: { ok: true, known: true, board_id: "9030696652", search_id: OUTSIDE.searchId, version_no: 3, listing: { found: true, in_run: true, title: "4100 Sample Ave", property_item_id: null, subitem_id: null, on_claim: false, address_known: true } },
  forbidden: { ok: false, error: "forbidden" },
  /** The Search Chat webhook's answers (snake_case, as the workflow sends them). */
  chatAnswer: {
    ok: true, say: "Capping rent at $3,000. Found 2 homes that fit.", claim: { source: "monday", ref: CLAIM_ID }, changed: { rent_max: 3000 }, added_listing_id: null, outreach: null,
    result: { search_id: OUTSIDE.searchId, version_no: 3, params: {}, not_fitting: 4,
      run: { run_id: "33333333-3333-4333-8333-333333333301", status: "done", found: 6, fitting: 2, new_homes: 1, finished_at: "2026-11-26T15:05:40+00:00" },
      homes: [{ listing_id: HOME.zillowExact, is_new: true }, { listing_id: HOME.zillowNew, is_new: false }] },
  },
  chatBadKey: { ok: false, next: "reply", say: "This panel is not set up correctly (bad key)." },
  chatAdded: { ok: true, say: "4100 Sample Ave is now under this claim and in PROPERTY DATABASE.", claim: null, result: null, changed: null, added_listing_id: HOME.zillowExact, outreach: null },
  chatAlready: { ok: true, say: "Already on this claim.", claim: null, result: null, changed: null, added_listing_id: null, outreach: null },
  chatAddRefused: { ok: true, say: "Monday did not accept the new sub-item. Try again.", claim: null, result: null, changed: null, added_listing_id: null, outreach: null },
};
