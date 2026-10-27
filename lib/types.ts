// Shared types between API routes and the client.

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
  /** Listing edits from the map are switched on (MAP_EDITING is not "off"). */
  editing: boolean;
}

/** POST /api/properties/:id/edit → 200. `detail` is the property as the map now has it. */
export interface EditListingResponse {
  ok: true;
  detail: PropertyDetail;
  /** The change note was posted on the Monday item. */
  noted: boolean;
  /** The Supabase mirror took the new values at once (otherwise the Monday webhook brings them within seconds). */
  mirrored: boolean;
  dryRun?: boolean;
}

/** POST /api/properties/:id/edit → 409 code "conflict": someone changed these fields in Monday since the form opened. */
export interface EditConflictResponse extends ApiError {
  code: "conflict";
  fields: string[];
  /** Monday's values now, for the conflicting fields. */
  current: Record<string, number | string | null>;
}

export interface ApiError {
  error: string;
  code?: string;
}

