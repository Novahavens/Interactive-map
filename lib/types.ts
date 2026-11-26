// Shared types between API routes and the client.

import type { FeatureKey } from "./feature-keys";
import type { MapStatus } from "./status";

/** Link-quality label (ZZ.Status on the property board) that "Report bad link" sets. Other labels are free text from Monday. */
export const BAD_LINK = "BAD LINK";

/** An active option (claim sub-item) that points at a property. From the claim_options mirror. */
export interface ClaimOption {
  subitemId: string;
  claimId: string;
  claimName: string;
  status: string | null;
}

/** Pin payload returned by properties_within_radius (14 fields). */
export interface Pin {
  monday_item_id: string;
  name: string;
  lat: number;
  lng: number;
  group_title: string;
  addable: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  monthly_rate: number | null;
  pet_status: string | null;
  has_photos: boolean;
  available_from: string | null;
  distance_miles: number;
  /** Pinned to an area, not a street address (listing-site coordinates or a street centroid). */
  approximate?: boolean | null;
  /** Dot colour: green (used before / preferred), yellow (neutral), red (do not use). Never blank. */
  map_status: MapStatus;
  /** Availability label as Monday has it (Monday label, free text); null when the monitor has not checked it. */
  availability: string | null;
  /** When the availability monitor last checked (YYYY-MM-DD). */
  availability_checked: string | null;
  /** Property-board "Last Contact Date" (YYYY-MM-DD). */
  last_contact: string | null;
  /** Link quality label (Monday label, free text, e.g. BAD_LINK); null when never checked. */
  link_status: string | null;
  /** Every active option on any claim that points at this property. Empty when none. The client drops the current claim. */
  other_claims: ClaimOption[];
}

export interface Coverage {
  mappable: number;
  unmapped: number;
}

export interface PropertiesResponse {
  pins: Pin[];
  coverage: Coverage;
}

/** Full record from property_detail (SETOF properties, minus geom/fields). */
export interface PropertyDetail {
  monday_item_id: string;
  name: string | null;
  group_id: string | null;
  group_title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  monthly_rate: number | null;
  pet_status: string | null;
  property_type: string | null;
  sqft: number | null;
  furnished: string | null;
  fenced_yard: string | null;
  next_availability: string | null;
  last_contact: string | null;
  ntv: number | null;
  property_link: string | null;
  photo_folder_url: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  notes: string | null;
  security_deposit: number | null;
  cleaning_fee: number | null;
  admin_fee: number | null;
  application_fee: number | null;
  move_in_fee: number | null;
  pet_rent: number | null;
  pet_deposit: number | null;
  pet_fee: number | null;
  other_fee_1: number | null;
  other_fee_1_desc: string | null;
  other_fee_2: number | null;
  other_fee_2_desc: string | null;
  move_in_total: number | null;
  landlord_item_id: string | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  landlord_contact: string | null;
  landlord_type: string | null;
  landlord_approval: string | null;
  landlord_approval_note: string | null;
  geocode_status: string | null;
  /** "exact" | "approximate" | null (no coordinates). */
  location_precision?: string | null;
  /** Dot colour and why (from property_map_status). */
  map_status?: MapStatus;
  map_reason?: string;
  availability?: string | null;
  availability_checked?: string | null;
  link_status?: string | null;
  /** Active options on any claim that point at this property (from property_claim_options). */
  other_claims?: ClaimOption[];
  synced_at: string | null;
  updated_at: string | null;
}

export interface ClaimNeeds {
  bedrooms: number | null;
  bathrooms: number | null;
  pets: number | null;
  frv: number | null;
  moveIn: string | null;
  adults: number | null;
  children: number | null;
}

export interface AttachedOption {
  subitemId: string;
  subitemName: string;
  status: string | null;
  propertyId: string | null;
}

/** Already-attached property as a plottable pin (from properties_by_ids). */
export interface AttachedPin {
  monday_item_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  group_title: string | null;
  monthly_rate: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  map_status?: MapStatus;
}

/** What the team needs to see about the claim while choosing options. No tenant contact details. */
export interface ClaimBrief {
  status: string | null;
  group: string | null;
  receivedOn: string | null;
  moveIn: string | null;
  leaseMonths: number | null;
  frv: number | null;
  adults: number | null;
  children: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  pets: number | null;
  petDescription: string | null;
  utilityCap: number | null;
  specialRequests: string | null;
  accountManager: string | null;
  searcher: string | null;
  coordinator: string | null;
  company: string | null;
}

export interface ClaimResponse {
  id: string;
  name: string;
  loss: { lat: number; lng: number; address: string } | null;
  needs: ClaimNeeds;
  attached: AttachedOption[];
  attachedPins: AttachedPin[];
  brief: ClaimBrief;
}

/** One row of the Active Claims drawer (GET /api/claims/active). */
export interface ActiveClaim {
  id: string;
  name: string;
  lossAddress: string | null;
  lat: number | null;
  lng: number | null;
  needs: ClaimNeeds;
  createdAt: string;
  status: string | null;
  attachedCount: number;
  group: string;
  isTest: boolean;
  /** Who is working the claim ("Account Manager" people column). */
  accountManager: string | null;
}

export interface ActiveClaimsResponse {
  claims: ActiveClaim[];
  count: number;
}

export interface SummaryResponse {
  subject: string;
  text: string;
  html: string;
  optionCount: number;
  recipient: { name: string | null; emails: string[] };
}

export interface SummaryLogResponse {
  ok: true;
  updateId: string;
  dryRun?: boolean;
}

export interface AddToClaimRequest {
  claimId: string;
  propertyId: string;
}

export interface AddToClaimResponse {
  ok: true;
  subitemId: string;
  alreadyAttached: boolean;
  dryRun?: boolean;
}

/** POST /api/properties/[id]/flag-link */
export interface FlagLinkRequest {
  /** Who is reporting, as typed on the map (remembered on the device). Optional, max 80 chars. */
  reportedBy?: string;
  /** What was wrong, optional, max 300 chars. */
  note?: string;
}

export interface FlagLinkResponse {
  ok: true;
  /** True when the property was already BAD LINK; nothing was written. */
  alreadyFlagged: boolean;
  /** False when the Monday update (the note saying who reported it) failed; the flag itself was set. */
  noted: boolean;
  dryRun?: boolean;
}

export interface HealthResponse {
  ok: true;
  dryRun: boolean;
  /** QUO_API_KEY is set: the owner card offers the Quo contact history. */
  quo: boolean;
  /** Listing edits from the map are switched on: MAP_EDIT_SECRET is set and MAP_EDITING is not "off". */
  editing: boolean;
  /** Housing-agent features, one switch each (lib/feature-keys.ts). All false unless MAP_FEATURES turns them on. */
  features: Record<FeatureKey, boolean>;
}

/** POST /api/properties/:id/edit → 200. `detail` is the property as the map now has it. */
export interface EditListingResponse {
  ok: true;
  detail: PropertyDetail;
  /** The change note was posted on the Monday item. */
  noted: boolean;
  /** The Supabase mirror took the new values at once (otherwise the Monday webhook brings them within seconds). */
  mirrored: boolean;
  /**
   * Changed fields Monday did not confirm when it was read back after the write (it ignored them, or the read-back
   * failed). They are not mirrored and not in the note; reopen the property to see what Monday holds. Usually [].
   */
  unconfirmed: string[];
  /**
   * Every requested value was already in Monday before this request wrote anything (a repeat of a save that
   * landed, or someone made the same edit): nothing was written to Monday. `noted` then only says whether this
   * request posted a note (one owed by an earlier save that failed before its note); false is not a failure.
   */
  alreadySaved: boolean;
  /** With alreadySaved: this request owed a change note from an earlier save that landed without one. With
   *  noted:false it means that note couldn't be posted (and won't be offered again). */
  noteOwed?: boolean;
  dryRun?: boolean;
}

/** POST /api/properties/:id/edit → 409 code "conflict": someone changed these fields in Monday since the form opened. */
export interface EditConflictResponse extends ApiError {
  code: "conflict";
  fields: string[];
  /** Monday's values now, for the conflicting fields. */
  current: Record<string, number | string | { address: string; lat: number; lng: number } | null>;
}

export interface ApiError {
  error: string;
  code?: string;
}


/** One answered call's Quo AI summary on the property panel ("Owner said"). */
export interface OwnerSaidCall {
  callId: string;
  /** When the call happened (ISO). */
  at: string;
  /** The teammate on the call (first name), when Quo names one. */
  by: string | null;
  durationSec: number | null;
  /** How many properties the number is on. Above 1, the summary may be about another of them. */
  propertyCount: number | null;
  summary: string[];
  nextSteps: string[];
  /** Listing facts read from the summary (lib/owner-said.ts), each with the sentence it came from. */
  facts: { key: string; value: string | number; evidence: string }[];
  /** Set once someone saved values from this call through the Edit form. */
  applied: { by: string; at: string; fields: string[] } | null;
}

/** GET /api/properties/:id/owner-said: the property's latest call summaries, newest first (at most 3). */
export interface OwnerSaidResponse {
  enabled: boolean;
  calls: OwnerSaidCall[];
}


// ---------------------------------------------------------------------------------------------------------
// Housing agent on the map (release of 26 Nov 2026). Every route below answers `enabled: false` (or state
// "off") with 200 when its feature switch is off. Fixtures for all of them: tests/fixtures/map-agent.mjs.
// ---------------------------------------------------------------------------------------------------------

/** Latest message to a landlord about a home (never failed or cancelled ones). */
export interface OutreachStatus {
  /** queued | sending | sent | replied | address_found | no_answer */
  status: string;
  channel: string | null;
  sentAt: string | null;
  sentBy: string | null;
  repliedAt: string | null;
}

/** A home the search agent found outside our database (Zillow, Furnished Finder) for the open claim. */
export interface OutsideHome {
  listingId: string;
  source: "zillow" | "furnished_finder" | string;
  url: string | null;
  /** The street address when known, otherwise the listing's own title. */
  title: string;
  addressKnown: boolean;
  city: string | null;
  state: string | null;
  beds: number | null;
  baths: number | null;
  rent: number | null;
  /** Null when the listing site gives no pin (most Furnished Finder homes): list row only, no pin. */
  lat: number | null;
  lng: number | null;
  /** "exact" street pin, "approx" (near), "area" (area-level, draw dashed), null when unknown. */
  precision: "exact" | "approx" | "area" | null;
  distanceMiles: number | null;
  rank: number;
  score: number | null;
  /** False = it broke a search rule; `excludedBy` says which (rent, beds, distance, available_late, no_price, no_location). */
  fits: boolean;
  excludedBy: string[];
  isNew: boolean;
  /** Already an item in PROPERTY DATABASE; `propertyItemId` is its id (it may also be a normal pin). */
  inPropertyDb: boolean;
  propertyItemId: string | null;
  /** Already an option on this claim. */
  onClaim: boolean;
  hasPhone: boolean;
  availableFrom: string | null;
  pets: string | null;
  photo: string | null;
  outreach: OutreachStatus | null;
}

/** GET /api/claim/:claimId/outside. `searchId` null = the agent has not searched for this claim yet. */
export interface OutsideResponse {
  enabled: boolean;
  searchId: string | null;
  versionNo: number | null;
  run: { status: string; found: number; fitting: number; newHomes: number; finishedAt: string | null } | null;
  /** Fitting homes first, then by rank. */
  homes: OutsideHome[];
}

/** One of our own homes scored against the open claim. */
export interface MatchScore {
  propertyId: string;
  rank: number;
  /** 0–100. */
  score: number;
  why: string | null;
  stretch: boolean;
  /** Dollars per month above the claim's cap; null when the stretch is not about price (e.g. far away). */
  stretchBy: number | null;
  distanceMiles: number | null;
}

/** GET /api/claim/:claimId/scores. Empty when the claim has not been matched. */
export interface ScoresResponse {
  enabled: boolean;
  scores: MatchScore[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  at: string;
}

/** POST /api/claim/:claimId/ask */
export interface AskRequest {
  action: "open" | "message" | "reject" | "more_like" | "undo";
  /** Required for "message", max 1000 chars. */
  message?: string;
  /** Required for "reject" and "more_like". */
  listingId?: string;
  /** The name remembered on this device, max 80 chars. */
  user?: string;
}

export interface AskResponse {
  ok: boolean;
  /** What the agent says, ready to show. */
  say: string;
  /** A search is still going; read /outside again shortly. */
  running: boolean;
  searchId: string | null;
  versionNo: number | null;
  /** Homes that fit after this step, and how many of them are new. Null when the step listed no homes. */
  summary: { homes: number; newHomes: number } | null;
}

export type SubmitState = "todo" | "ready" | "submitted" | "blocked";

/** Where one option (claim sub-item) is on the way to the adjuster. */
export interface SubmitStatus {
  subitemId: string;
  propertyId: string | null;
  state: SubmitState;
  /** Why it is blocked. */
  reason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
}

/** GET /api/claim/:claimId/submit-status */
export interface SubmitStatusResponse {
  enabled: boolean;
  options: SubmitStatus[];
  counts: { ready: number; submitted: number };
}

/** An open claim on the Nearsite marketplace. No tenant contact details. */
export interface NearsiteClaim {
  id: string;
  /** Its item on the Nearsite Claims board. */
  mondayItemId: string | null;
  title: string;
  company: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  lossAddress: string | null;
  beds: number | null;
  baths: number | null;
  budgetMonthly: number | null;
  maxRate: number | null;
  moveIn: string | null;
  /** Days until it expires on Nearsite (0 = today). */
  daysLeft: number | null;
  feeGroup: string | null;
  /** How many of our homes matched it. */
  homesFound: number | null;
  status: string | null;
  assignedTo: string | null;
  url: string | null;
}

/** GET /api/claims/nearsite?fresh= */
export interface NearsiteClaimsResponse {
  enabled: boolean;
  claims: NearsiteClaim[];
}

/**
 * GET|POST /api/properties/:id/find-phone. "off" = the feature is off. "not_found" with `lookedUpAt: null`
 * means nobody has looked this property up yet (the idle state).
 */
export interface PhoneLookup {
  state: "found" | "not_found" | "off";
  phone: string | null;
  source: string | null;
  confidence: "high" | "medium" | "low" | null;
  lookedUpAt: string | null;
}

export interface TextTemplate {
  key: "availability" | "address" | "rate";
  label: string;
}

/** GET /api/properties/:id/outreach (feature `templates`). */
export interface OutreachResponse {
  enabled: boolean;
  outreach: OutreachStatus | null;
}

/** POST /api/claim/:claimId/add-outside { listingId } */
export interface AddOutsideResponse {
  ok: true;
  /** The home's PROPERTY DATABASE item, when it has one. */
  propertyId: string | null;
  subitemId: string | null;
  alreadyOnClaim: boolean;
  dryRun?: boolean;
}
