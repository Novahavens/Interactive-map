// Shared types between API routes and the client.

import type { MapStatus } from "./status";

/** Property "Availability" on the property board, set by the Property Availability Monitor. Free text in Monday; these are its labels today. */
export type Availability =
  | "Available Now"
  | "Available Soon"
  | "Available (Unverified)"
  | "Unavailable"
  | "Listing Removed"
  | "Check Failed";

/** Property "ZZ.Status" (link quality) on the property board. "BAD LINK" is what Report bad link sets. */
export type LinkStatus = "Good link" | "BAD LINK" | "Missing Link";

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
  /** Availability label as Monday has it (see Availability); null when the monitor has not checked it. */
  availability: string | null;
  /** When the availability monitor last checked (YYYY-MM-DD). */
  availability_checked: string | null;
  /** Property-board "Last Contact Date" (YYYY-MM-DD). */
  last_contact: string | null;
  /** Link quality label (see LinkStatus); null when never checked. */
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
  dryRun?: boolean;
}

export interface HealthResponse {
  ok: true;
  dryRun: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
}

