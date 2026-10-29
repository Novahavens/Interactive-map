// Fictional demo data for the tutorial recordings. Every API the map calls is answered from here, so nothing
// real is read or written. Shapes follow tests/browser/{live-status,owner-said,contact-digest}.mjs.
export const LOSS = { lat: 36.1236, lng: -95.9180, address: "1200 Demo Street, Tulsa, OK 74104, USA" };
export const needs = { adults: 2, children: 2, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3200, moveIn: "2026-11-03" };
export const brief = {
  status: "Working on it", group: "New Housing Request", receivedOn: "2026-10-28", moveIn: "2026-11-03", leaseMonths: 3,
  frv: 3200, adults: 2, children: 2, bedrooms: 3, bathrooms: 2, pets: 1, petDescription: "One dog, about 30 lb",
  utilityCap: 250, specialRequests: "Close to the children's school if possible.\nGround-floor bedroom preferred.",
  accountManager: "Melissa C.", searcher: "Will", coordinator: "Louise", company: "Demo Insurance",
};
export const CLAIM_ID = "100000001";
const NAME = "Demo Family — Rivera #DEMO-1042";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const streets = ["Oak Ridge Dr", "Maple Ave", "Cedar Ln", "Willow Bend", "Pecan St", "Magnolia Ct", "Riverside Pkwy", "Harvard Ave", "Elm Grove", "Laurel Way",
  "Sycamore Rd", "Birch Hollow", "Aspen Trl", "Juniper St", "Cypress Cove", "Hickory Ln", "Live Oak Dr", "Briar Glen", "Holly Hill", "Sunset Blvd",
  "Lewis Ave", "Peoria Ave", "Yale Ave", "Utica Sq", "Brookside Ct", "Cherry St", "Swan Lake Dr", "Maple Ridge", "Woodward Pl", "Florence Ave"];
const OTHER = { subitemId: "9001", claimId: "100000003", claimName: "Demo Family — Okafor #DEMO-1031", status: "Option Submitted" };

// The property the film follows.
export const HERO_ID = "700002";
const statusFor = (i) => (i % 9 === 4 ? "red" : i % 3 === 0 ? "green" : "yellow"); // 6 is green and on another claim
const avail = ["Available Now", "Available Soon", null, "Available (Unverified)", "Unavailable", "Available Soon"];
export const pins = streets.map((s, i) => {
  const ang = rnd() * Math.PI * 2, r = 0.02 + rnd() * 0.12;
  const lat = LOSS.lat + Math.sin(ang) * r, lng = LOSS.lng + Math.cos(ang) * r * 1.2;
  const p = {
    monday_item_id: String(700000 + i), name: `${1000 + Math.floor(rnd() * 8000)} ${s}`, lat, lng, group_title: "Data Base",
    addable: statusFor(i) !== "red", bedrooms: 2 + (i % 3), bathrooms: 1 + (i % 2), monthly_rate: i % 7 === 3 ? null : 1700 + Math.round(rnd() * 14) * 100,
    pet_status: i % 3 === 1 ? "No" : "Yes", has_photos: i % 4 !== 1, available_from: null,
    distance_miles: Math.hypot((lat - LOSS.lat) * 69, (lng - LOSS.lng) * 56), approximate: false, map_status: statusFor(i),
    availability: avail[i % avail.length], availability_checked: "2026-10-27", last_contact: i % 4 === 0 ? "2026-10-14" : null, link_status: null,
    other_claims: i === 6 ? [OTHER] : [],
  };
  return p;
});
// The hero: close to the loss, green, available soon, fits the family.
Object.assign(pins[2], {
  name: "2418 Harvard Ave", lat: LOSS.lat + 0.011, lng: LOSS.lng - 0.014, distance_miles: 1.1, map_status: "green", addable: true,
  bedrooms: 3, bathrooms: 2, monthly_rate: 2200, pet_status: "Yes", has_photos: true, availability: "Available Soon", last_contact: "2026-10-14", other_claims: [],
});
pins.sort((a, b) => a.distance_miles - b.distance_miles);
export const hero = pins.find((p) => p.monday_item_id === HERO_ID);

export const claim = { id: CLAIM_ID, name: NAME, loss: LOSS, needs, attached: [], attachedPins: [], brief };
export const claims = [
  { id: CLAIM_ID, name: NAME, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-28T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
  { id: "100000002", name: "Demo Family — Chen #DEMO-1038", lossAddress: "45 Sample Ave, Broken Arrow, OK, USA", lat: 36.05, lng: -95.79, needs: { ...needs, bedrooms: 2, pets: 0 }, createdAt: "2026-10-27T15:00:00Z", status: "Working on it", attachedCount: 1, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
  { id: "100000003", name: "Demo Family — Okafor #DEMO-1031", lossAddress: "88 Example Rd, Jenks, OK, USA", lat: 36.02, lng: -95.97, needs: { ...needs, bedrooms: 4 }, createdAt: "2026-10-25T15:00:00Z", status: "2nd Option", attachedCount: 3, group: "New Option Needed", isTest: false, accountManager: "Dana R." },
  { id: "100000004", name: "Demo Family — Novak #DEMO-1027", lossAddress: "310 Placeholder Ln, Owasso, OK, USA", lat: 36.27, lng: -95.85, needs: { ...needs, bedrooms: 3, pets: 2 }, createdAt: "2026-10-23T15:00:00Z", status: "3rd Option", attachedCount: 2, group: "New Option Needed", isTest: false, accountManager: "Melissa C." },
  { id: "100000005", name: "Demo Family — Haddad #DEMO-1019", lossAddress: "9 Fictional Blvd, Sand Springs, OK, USA", lat: 36.14, lng: -96.11, needs: { ...needs, bedrooms: 2 }, createdAt: "2026-10-21T15:00:00Z", status: "Working on it", attachedCount: 1, group: "New Housing Request", isTest: false, accountManager: "Dana R." },
];

export function detail(p, over = {}) {
  const isHero = p.monday_item_id === HERO_ID;
  return {
    monday_item_id: p.monday_item_id, name: p.name, group_id: "g", group_title: p.group_title, address: p.name, city: "Tulsa", state: "OK", zipcode: "74104",
    lat: p.lat, lng: p.lng, bedrooms: p.bedrooms, bathrooms: p.bathrooms, monthly_rate: p.monthly_rate, pet_status: p.pet_status, property_type: "Single family", sqft: 1650,
    furnished: "Yes", fenced_yard: "Yes", next_availability: "2026-11-01", last_contact: p.last_contact, ntv: null,
    property_link: "https://example.com/listing", photo_folder_url: "https://example.com/photos",
    owner_name: "Jane Demo", owner_phone: "(918) 555-0100", owner_email: "owner@example.com", notes: "Fictional demo record.",
    security_deposit: 2200, cleaning_fee: 150, admin_fee: 100, application_fee: 50, move_in_fee: null, pet_rent: 35, pet_deposit: 300, pet_fee: null,
    other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null, move_in_total: 5000,
    landlord_item_id: null, landlord_name: null, landlord_phone: null, landlord_contact: null, landlord_type: null, landlord_approval: isHero ? "Preferred" : null, landlord_approval_note: null,
    geocode_status: "ok", location_precision: "exact", map_status: p.map_status, map_reason: p.map_status === "green" ? "used_before" : p.map_status === "red" ? "dnu_group" : "none",
    availability: p.availability, availability_checked: p.availability_checked, link_status: p.link_status, other_claims: p.other_claims,
    synced_at: "2026-10-28T12:00:00Z", updated_at: "2026-10-28T12:00:00Z", ...over,
  };
}

export const contact = {
  enabled: true, numbers: [{ label: "Owner", phone: "+19185550100" }],
  digest: {
    calls: { total: 3, outgoing: 3, incoming: 0, missed: 1, last: { at: "2026-10-29T16:05:00Z", direction: "outgoing", by: "Will", answered: true, durationSec: 190 }, truncated: false },
    texts: { sent: 2, received: 1, last: { at: "2026-10-29T15:40:00Z", direction: "incoming", by: null, preview: "Yes, call me now" }, truncated: false },
    lastContactAt: "2026-10-29T16:05:00Z",
  },
};

const LONG = "The owner said the house is free from November 1 and she's happy to rent to a family with a dog.";
const RENT = "Rent is $2,400 a month with a $500 deposit.";
const PETS = "Pets are welcome, with $35 a month pet rent.";
export const ownerSaid = {
  enabled: true,
  calls: [{
    callId: "ACdemo1", at: "2026-10-29T16:05:00Z", by: "Will", durationSec: 190, propertyCount: 1,
    summary: [LONG, RENT, PETS], nextSteps: ["Send the lease packet to the owner"],
    facts: [
      { key: "next_availability", value: "2026-11-01", evidence: LONG },
      { key: "monthly_rate", value: 2400, evidence: RENT },
      { key: "security_deposit", value: 500, evidence: RENT },
      { key: "pet_status", value: "Yes", evidence: PETS },
      { key: "pet_rent", value: 35, evidence: PETS },
    ],
    applied: null,
  }],
};

export const summaryHtml = `<p><b>2 housing options for ${NAME}</b><br>Loss address: ${LOSS.address}<br>Family needs: 2 adults · 2 children · 3 bed · 2 bath · 1 pet · FRV $3,200 · move-in Nov 3, 2026<br>Prepared Oct 29, 2026</p>`
  + [hero, pins[5]].map((p, i) => `<p><b>${i + 1}. ${p.name}, Tulsa, OK 74104</b></p><ul><li>Beds / baths: ${p.bedrooms} bd / ${p.bathrooms} ba</li><li>Type: Single family</li><li>Pets: Yes</li><li>Monthly rent: $${(i ? 2300 : 2400).toLocaleString()}</li><li>Security deposit: $500</li><li>Move-in total: <b>$${(i ? 3135 : 3285).toLocaleString()}</b></li><li>Distance to loss: ${p.distance_miles.toFixed(1)} mi</li><li>Available: Nov 1, 2026</li></ul><p><a href="#">Listing</a> · <a href="#">Photos</a></p>`).join("")
  + `<p>Prepared with the Nova Havens Property Map</p>`;
export const summary = { subject: `2 housing options for ${NAME}`, text: "", html: summaryHtml, optionCount: 2, recipient: { name: "Jordan Demo", emails: ["jordan.demo@example.com"] } };
