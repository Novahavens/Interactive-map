import { assertEquals, assert } from "jsr:@std/assert@1";
import {
  acceptCensus, acceptGeocodio, acceptListing, addressQueries, furnishedFinderId, parseCandidate, parseListingUrl,
  parseStreetOnly, readFurnishedFinder, stateCode, streetCore, tidyName, type Candidate,
} from "./locate.ts";

const row = (o: Partial<Candidate>): Candidate => ({
  monday_item_id: "1", name: "", city: null, state: null, zipcode: null, property_link: null, kind: "address", input_hash: "h", ...o,
});

Deno.test("state names and codes normalise", () => {
  assertEquals(stateCode("Ohio"), "OH");
  assertEquals(stateCode("tx"), "TX");
  assertEquals(stateCode("New York"), "NY");
  assertEquals(stateCode("Ln"), null);
});

Deno.test("names lose pasted distances and links", () => {
  assertEquals(tidyName("34167 Shasta Dr, Lake Elsinore, CA 92532 (8.3 miles)"), "34167 Shasta Dr, Lake Elsinore, CA 92532");
  assertEquals(tidyName("3578 Rambla Pl, Santa Clara, CA 95051 3.4 Miles"), "3578 Rambla Pl, Santa Clara, CA 95051");
});

Deno.test("numbered names parse for Census, listing ids do not", () => {
  const p = parseCandidate(row({ name: "34167 Shasta Dr, Lake Elsinore, CA 92532 (8.3 miles)", state: "CA", zipcode: "92532" }))!;
  assertEquals(p.street, "34167 Shasta Dr");
  assertEquals(p.city, "Lake Elsinore");
  assertEquals(p.zip, "92532");
  assertEquals(parseCandidate(row({ name: "739664_1 - Loudonville 3/2 SFH" })), null);
  // A street number with nothing to check a match against is not worth a guess.
  assertEquals(parseCandidate(row({ name: "740 West Sacramento Avenue, Apt 4 (4.9 miles)" })), null);
});

Deno.test("the name's tail fills blank columns: units, ', USA', full state names, bare zips", () => {
  const iowa = parseCandidate(row({ name: "24 Lincoln Avenue, Unit 9, Iowa City, IA" }))!;
  assertEquals([iowa.street, iowa.city, iowa.state], ["24 Lincoln Avenue", "Iowa City", "IA"]);
  const phx = parseCandidate(row({ name: "12239 North 26th Way, Phoenix, AZ, USA" }))!;
  assertEquals([phx.city, phx.state], ["Phoenix", "AZ"]);
  const katy = parseStreetOnly(row({ name: "Valley Landing dr , Katy , Tx,77455" }))!;
  assertEquals([katy.street, katy.city, katy.state, katy.zip], ["Valley Landing dr", "Katy", "TX", "77455"]);
  const ny = parseCandidate(row({ name: "5 Main St, Albany, New York 12207" }))!;
  assertEquals([ny.city, ny.state, ny.zip], ["Albany", "NY", "12207"]);
  // Not enough to check a match against: stays unparsable rather than guessed.
  assertEquals(parseCandidate(row({ name: "175 Madre Street, Pasadena" })), null);
  assertEquals(parseCandidate(row({ name: "1172 Breezy Oak Cove" })), null);
  // Board columns win over the name.
  assertEquals(parseCandidate(row({ name: "9 Oak St, Springfield, IL", state: "MO" }))!.state, "MO");
});

Deno.test("prefixes and comma-less addresses still find the street", () => {
  const g = parseCandidate(row({ name: "Unfurnished - 249 Moonbeam Ln. Grand Prairie, TX 75052", state: "TX", zipcode: "75052" }))!;
  assertEquals([g.street, g.city, g.zip], ["249 Moonbeam Ln.", "Grand Prairie", "75052"]);
  const f = parseCandidate(row({ name: "The Flats at Dorsett Ridge: 12703 Dorsett Rd Maryland Heights, MO 63043" }))!;
  assertEquals([f.street, f.city, f.state, f.zip], ["12703 Dorsett Rd", "Maryland Heights", "MO", "63043"]);
  const k = parseCandidate(row({ name: "1124 E 79th Street Kansas City MO 64131" }))!;
  assertEquals([k.street, k.city, k.state, k.zip], ["1124 E 79th Street", "Kansas City", "MO", "64131"]);
  const c = parseCandidate(row({ name: "1237 Fall Creek Loop Cedar Park Texas" }))!;
  assertEquals([c.street, c.city, c.state], ["1237 Fall Creek Loop", "Cedar Park", "TX"]);
  const t = parseCandidate(row({ name: "Townhomes, 303 Grace Lane, Fruitland, ID 83619" }))!;
  assertEquals([t.street, t.city, t.state], ["303 Grace Lane", "Fruitland", "ID"]);
  assertEquals(parseCandidate(row({ name: "265 Old Holders Cove Road, Winchester, TN, USA" }))!.street, "265 Old Holders Cove Road");
  assertEquals(parseCandidate(row({ name: "2471 Stoughton Circle in Aurora, Illinois" }))!.city, "Aurora");
  assertEquals(parseCandidate(row({ name: "65 St. Virgil St., Florissant, MO", city: "Florissant," }))!.city, "Florissant");
  const junkZip = parseCandidate(row({ name: "12703 Dorsett Rd Maryland Heights, MO 63043", zipcode: "63043 The Flats At Dorsett Ridge: 12703 Dorsett Rd" }))!;
  assertEquals(junkZip.zip, "63043");
  assertEquals(parseCandidate(row({ name: "7809 285th Pl NW", city: "Stanwood", state: "WA" }))!.street, "7809 285th Pl NW");
  assertEquals(parseCandidate(row({ name: "23800 County Road 16, Unit 306, Oak Creek, CO 80467" }))!.street, "23800 County Road 16");
  const z = addressQueries(row({ name: "7033 Canyon Run", city: "El Paseo", state: "TX", property_link: "https://www.zillow.com/homedetails/7033-Canyon-Run-Dr-El-Paso-TX-79912/27491047_zpid/" }));
  assertEquals(z.geocodio?.from, "listing_url");
  // Bedroom counts and garages are not house numbers.
  assertEquals(parseCandidate(row({ name: "Bright & Roomy 4BR/3BA in O'Fallon - 3-Car Garage", city: "O'Fallon", state: "MO" })), null);
});

Deno.test("street-only names keep the street and drop the city the columns already have", () => {
  assertEquals(parseStreetOnly(row({ name: "Altama Ave Brunswick GA", city: "Brunswick", state: "GA" }))?.street, "Altama Ave");
  assertEquals(parseStreetOnly(row({ name: "SW Crestwood Drive", city: "Oak Harbor", state: "WA" }))?.street, "SW Crestwood Drive");
  assertEquals(parseStreetOnly(row({ name: "(tbd) 24th Street", city: "Virginia Beach", state: "VA" }))?.street, "24th Street");
  assertEquals(parseStreetOnly(row({ name: "P.O. Box 906", city: "Westhampton Beach", state: "NY", zipcode: "11978" })), null);
  assertEquals(parseStreetOnly(row({ name: "Binyam - ID 565701_1" })), null);
});

Deno.test("listing URLs give an address when the slug has one", () => {
  const z = parseListingUrl("https://www.zillow.com/homedetails/123-Main-St-Houston-TX-77001/12345_zpid/")!;
  assertEquals(z.oneline, "123 Main St Houston, TX 77001");
  assertEquals([z.state, z.zip], ["TX", "77001"]);
  assertEquals(parseListingUrl("https://www.zillow.com/homedetails/Las-Vegas-NV-89144/52225248_zpid/"), null);
  assertEquals(parseListingUrl("https://www.trulia.com/home/address-not-disclosed-cumming-ga-30041-14642024"), null);
  const r = parseListingUrl("https://www.redfin.com/TX/Houston/123-Main-St-77001/home/123")!;
  assertEquals([r.street, r.city, r.state, r.zip], ["123 Main St", "Houston", "TX", "77001"]);
});

Deno.test("address rows pick the cheapest route that can work", () => {
  assert(addressQueries(row({ name: "7559 Discovery Pt Dr NW, Huntsville, AL 35806", city: "Huntsville", state: "AL", zipcode: "35806" })).census);
  const slug = addressQueries(row({ name: "Nice house", property_link: "https://www.zillow.com/homedetails/9-Elm-Ct-Austin-TX-78701/1_zpid/" }));
  assertEquals(slug.census, null);
  assertEquals(slug.geocodio?.from, "listing_url");
  assertEquals(addressQueries(row({ name: "ID 769259_1" })), { census: null, geocodio: null });
});

Deno.test("street cores compare spellings, not different streets", () => {
  assertEquals(streetCore("3628 SE Rhone St"), streetCore("3628 Southeast Rhone Street"));
  assert(streetCore("3628 SE Rhone St") !== streetCore("3628 SE Rhine St"));
});

Deno.test("Census: exact matches pass, a zip in another town does not", () => {
  const p = parseCandidate(row({ name: "3480 Old Fairburn Rd", city: "Atlanta", state: "GA", zipcode: "30331" }))!;
  const ok = acceptCensus(p, { matchType: "Exact", matched: "3480 OLD FAIRBURN RD, ATLANTA, GA, 30331", lat: 33.7, lng: -84.5 });
  assert(ok.ok);
  if (ok.ok) assertEquals(ok.place.address, "3480 Old Fairburn Rd, Atlanta, GA 30331");
  const bad = acceptCensus(p, { matchType: "Non_Exact", matched: "3480 OLD FAIRBURN RD, FAIRBURN, GA, 30213", lat: 33.5, lng: -84.6 });
  assertEquals(bad.ok, false);
});

const geo = (o: Record<string, unknown>) => [{
  address_components: { formatted_street: "Altama Ave", city: "Brunswick", state_province: "GA", postal_code: "31520", country: "US" },
  formatted_address: "Altama Ave, Brunswick, GA 31520",
  location: { lat: 31.17, lng: -81.49 },
  accuracy: 0.9,
  accuracy_type: "street_center",
  ...o,
}];

Deno.test("Geocodio: street centre is approximate, address level is exact, city centre is refused", () => {
  const q = addressQueries(row({ name: "Altama Ave Brunswick GA", city: "Brunswick", state: "GA" })).geocodio!;
  const centre = acceptGeocodio(q, geo({}));
  assert(centre.ok);
  if (centre.ok) assertEquals(centre.place.precision, "approximate");
  const roof = acceptGeocodio(q, geo({ accuracy_type: "rooftop", accuracy: 1 }));
  assert(roof.ok);
  if (roof.ok) assertEquals(roof.place.precision, "exact");
  assertEquals(acceptGeocodio(q, geo({ accuracy_type: "place" })).ok, false);
  assertEquals(acceptGeocodio(q, geo({ address_components: { formatted_street: "Altama Ave", city: "Brunswick", state_province: "FL", country: "US" } })).ok, false);
  assertEquals(acceptGeocodio(q, geo({ address_components: { formatted_street: "Norwich St", city: "Brunswick", state_province: "GA", country: "US" } })).ok, false);
  assertEquals(acceptGeocodio(q, []).ok, false);
});

// Shaped like the real page: the record is escaped JSON in a script, and a
// "similar rentals" card with its own coordinates may sit on the same page.
const page = (id: string) => `<script>self.__next_f.push([1,"{\\"similarRentals\\":[{\\"coordinates\\":{\\"latitude\\":41.49,\\"longitude\\":-81.69,\\"__typename\\":\\"Coordinates\\"},\\"details\\":{\\"id\\":\\"648794_1\\",\\"city\\":\\"Cleveland\\",\\"state\\":\\"Ohio\\",\\"__typename\\":\\"Details\\"}}],\\"bedrooms\\":{\\"amount\\":3},\\"coordinates\\":{\\"latitude\\":41.395732,\\"longitude\\":-81.452237,\\"__typename\\":\\"Coordinates\\"},\\"details\\":{\\"avgRating\\":0,\\"city\\":\\"Solon\\",\\"description\\":\\"Large yard. \\\\\\"Quiet\\\\\\" street\\",\\"id\\":\\"${id}\\",\\"state\\":\\"Ohio\\",\\"__typename\\":\\"Details\\"}}"])</script>`;

Deno.test("Furnished Finder: reads this listing's block, never a similar rental's", () => {
  const r = readFurnishedFinder(page("450855_1"), "450855_1");
  assertEquals(r, { kind: "found", lat: 41.395732, lng: -81.452237, city: "Solon", state: "OH" });
  assertEquals(readFurnishedFinder(page("450855_1"), "648794_2").kind, "unreadable");
  assertEquals(readFurnishedFinder("", "1_1", 404).kind, "gone");
  assertEquals(readFurnishedFinder(page("100003_9"), "100003_9", 200, "https://www.furnishedfinder.com/").kind, "gone");
  assertEquals(readFurnishedFinder(page("450855_1"), "450855_1", 200, "https://www.furnishedfinder.com/property/450855_1?moveDate=x").kind, "found");
  assertEquals(readFurnishedFinder(page("450855_1").replaceAll("coordinates", "coords") + "no longer available", "450855_1").kind, "unreadable");
});

Deno.test("Furnished Finder: ids from links or names, and the board's state must agree", () => {
  assertEquals(furnishedFinderId({ name: "x", property_link: "https://www.furnishedfinder.com/property/914878_1" }), "914878_1");
  assertEquals(furnishedFinderId({ name: "ID: 488237_1 - Quiet Country Living", property_link: null }), "488237_1");
  const found = { kind: "found" as const, lat: 41.39, lng: -81.45, city: "Solon", state: "OH" };
  const ok = acceptListing({ city: null, state: null }, found);
  assert(ok.ok);
  if (ok.ok) assertEquals([ok.place.precision, ok.place.address], ["approximate", "Solon, OH"]);
  assertEquals(acceptListing({ city: null, state: "TX" }, found).ok, false);
});
