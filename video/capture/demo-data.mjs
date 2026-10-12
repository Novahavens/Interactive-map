export const LOSS = { lat: 29.7604, lng: -95.3698, address: "1200 Demo Street, Houston, TX 77002, USA" };

// Deterministic pseudo-random so reruns produce identical shots.
let seed = 7; export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const streets = ["Oak Ridge Dr","Maple Ave","Cedar Ln","Willow Bend","Pecan St","Magnolia Ct","Bayou Pkwy","Heights Blvd","Elm Grove","Laurel Way","Sycamore Rd","Birch Hollow","Aspen Trl","Juniper St","Cypress Cove","Hickory Ln","Live Oak Dr","Briar Glen","Holly Hill","Sunset Blvd","Montrose Ct","River Oaks Pl","Westheimer Ter","Kirby Sq"];
export const groups = ["Data Base","Data Base","Data Base","Preferred Landlord","Data Base","DO NOT USE"];
export const pins = streets.map((s, i) => {
  const ang = rnd() * Math.PI * 2, r = 0.01 + rnd() * 0.12;
  const lat = LOSS.lat + Math.sin(ang) * r, lng = LOSS.lng + Math.cos(ang) * r * 1.15;
  const dist = Math.hypot((lat - LOSS.lat) * 69, (lng - LOSS.lng) * 60);
  return { monday_item_id: String(900000 + i), name: `${1000 + Math.floor(rnd() * 8000)} ${s}`, lat, lng, group_title: groups[i % groups.length], addable: groups[i % groups.length] !== "DO NOT USE",
    bedrooms: 2 + (i % 3), bathrooms: 1 + (i % 2) + (i % 4 === 0 ? 0.5 : 0), monthly_rate: i % 7 === 3 ? null : 2400 + Math.round(rnd() * 26) * 100, pet_status: i % 3 === 0 ? "No" : "Yes", has_photos: i % 4 !== 1, available_from: null, distance_miles: dist };
});
export const attachedPins = [pins[0], pins[4]].map((p) => ({ monday_item_id: p.monday_item_id, name: p.name, lat: p.lat, lng: p.lng, group_title: p.group_title, monthly_rate: p.monthly_rate, bedrooms: p.bedrooms, bathrooms: p.bathrooms }));
export const needs = { adults: 2, children: 2, bedrooms: 3, bathrooms: 2, pets: 1, frv: 4500, moveIn: "2026-10-20" };
export const claim = { id: "100000001", name: "Demo Family — Rivera #DEMO-1042", loss: LOSS, needs, attached: [], attachedPins };
export const claims = [
  { id: "100000001", name: "Demo Family — Rivera #DEMO-1042", lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-11T15:00:00Z", status: "Working on it", attachedCount: 2, group: "New Housing Request", isTest: false },
  { id: "100000002", name: "Demo Family — Chen #DEMO-1038", lossAddress: "45 Sample Ave, Austin, TX, USA", lat: 30.27, lng: -97.74, needs: { ...needs, bedrooms: 2, pets: 0 }, createdAt: "2026-10-10T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false },
  { id: "100000003", name: "Demo Family — Okafor #DEMO-1031", lossAddress: "88 Example Rd, Dallas, TX, USA", lat: 32.78, lng: -96.8, needs: { ...needs, bedrooms: 4 }, createdAt: "2026-10-08T15:00:00Z", status: "2nd Option", attachedCount: 5, group: "New Option Needed", isTest: false },
  { id: "100000004", name: "Demo Family — Novak #DEMO-1027", lossAddress: "310 Placeholder Ln, San Antonio, TX, USA", lat: 29.42, lng: -98.49, needs: { ...needs, bedrooms: 3, pets: 2 }, createdAt: "2026-10-06T15:00:00Z", status: "3rd Option", attachedCount: 3, group: "New Option Needed", isTest: false },
  { id: "100000005", name: "Demo Family — Haddad #DEMO-1019", lossAddress: "9 Fictional Blvd, Plano, TX, USA", lat: 33.02, lng: -96.7, needs: { ...needs, bedrooms: 2 }, createdAt: "2026-10-03T15:00:00Z", status: "Working on it", attachedCount: 1, group: "New Housing Request", isTest: false },
];
export const sel = pins[2];
export const detail = { monday_item_id: sel.monday_item_id, name: sel.name, group_id: "g", group_title: sel.group_title, address: sel.name, city: "Houston", state: "TX", zipcode: "77006", lat: sel.lat, lng: sel.lng,
  bedrooms: 3, bathrooms: 2, monthly_rate: 3200, pet_status: "Yes", property_type: "Single family", sqft: 1650, furnished: "Yes", fenced_yard: "Yes", next_availability: "2026-10-18", last_contact: "2026-10-09", ntv: null,
  property_link: "https://example.com/listing", photo_folder_url: "https://example.com/photos", owner_name: "Demo Owner", owner_phone: "(555) 010-0100", owner_email: "owner@example.com", notes: "Fictional demo record.",
  security_deposit: 3200, cleaning_fee: 250, admin_fee: 150, application_fee: 75, move_in_fee: null, pet_rent: 50, pet_deposit: 500, pet_fee: null, other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null,
  move_in_total: 7375, landlord_item_id: null, landlord_name: "Demo Property Mgmt", landlord_phone: "(555) 010-0199", landlord_contact: null, landlord_type: "Property manager", landlord_approval: "Approved", landlord_approval_note: null, geocode_status: "ok", synced_at: null, updated_at: null };
export const summaryHtml = `<p><b>2 housing options for Demo Family — Rivera #DEMO-1042</b><br>Loss address: ${LOSS.address}<br>Family needs: 2 adults · 2 children · 3 bed · 2 bath · 1 pet · FRV $4,500 · move-in Oct 20, 2026<br>Prepared Oct 12, 2026</p>`
  + [pins[0], pins[4]].map((p, i) => `<p><b>${i + 1}. ${p.name}, Houston, TX 77006</b></p><ul><li>Beds / baths: ${p.bedrooms} bd / ${p.bathrooms} ba</li><li>Type: Single family</li><li>Pets: Yes</li><li>Monthly rent: $${(p.monthly_rate ?? 3000).toLocaleString()}</li><li>Security deposit: $${(p.monthly_rate ?? 3000).toLocaleString()}</li><li>Pet deposit: $500</li><li>Move-in total: <b>$${((p.monthly_rate ?? 3000) * 2 + 500).toLocaleString()}</b></li><li>Distance to loss: ${p.distance_miles.toFixed(1)} mi</li><li>Available: Oct 18, 2026</li></ul><p><a href="#">Listing</a> · <a href="#">Photos</a></p>`).join("") + `<p>Prepared with the Nova Havens Property Map</p>`;
export const summary = { subject: "2 housing options for Demo Family — Rivera #DEMO-1042", text: "", html: summaryHtml, optionCount: 2, recipient: { name: "Jordan Demo", emails: ["jordan.demo@example.com"] } };


