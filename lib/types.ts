// Shared types between API routes and the client.

export type PropertyGroup = "database" | "preferred" | "dnu" | "unknown";

/** Pin payload returned by properties_within_radius (13 fields). */
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
}

export interface ClaimResponse {
  id: string;
  name: string;
  loss: { lat: number; lng: number; address: string } | null;
  needs: ClaimNeeds;
  attached: AttachedOption[];
  attachedPins: AttachedPin[];
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

export interface HealthResponse {
  ok: true;
  dryRun: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
}

/** Normalise the free-text Monday group title into a fixed set. */
export function classifyGroup(title: string | null | undefined): PropertyGroup {
  const t = (title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (t.includes("do not use") || t === "dnu") return "dnu";
  if (t.includes("preferred")) return "preferred";
  if (t.includes("data base") || t.includes("database")) return "database";
  return "unknown";
}
