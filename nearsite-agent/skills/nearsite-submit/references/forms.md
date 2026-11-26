# Nearsite form map

## Add Property (Properties → Add property)
| Field on the page | Payload key |
|---|---|
| Property type | property_type (Single Family House, Apartment, Town House, Condo) |
| Location | location (full address) |
| Property name | property_name (street only) |
| Area (sq ft) | area_sqft |
| Furnishing | furnishing = Furnished |
| Bedrooms + bed size per room | bedrooms, bed_sizes |
| Bathrooms, full kitchens, living rooms, in-unit laundry, attached garages | bathrooms, full_kitchens, living_rooms, in_unit_laundry, attached_garages |
| Max guests | max_guests |
| Parking availability, type, spaces | parking.* |
| Pets: dogs, cats | pets.dogs, pets.cats |
| ADA compliant | ada_compliant |
| Floor (apartments) | floor |
| Unit amenities | unit_amenities |
| Photos | photos.source (up to 10) |
| Description | description (2,000 characters max) |

## Proposal wizard (/v2/provider/proposals/create/housing/{requestId})
1. Find property: search our inventory only, pick by property_name.
2. Create proposal:
| Field | Payload key |
|---|---|
| Unit | unit_name |
| Base rent (per day) | base_rent_per_day |
| Security deposit | security_deposit |
| Misc fees (name + amount, repeat) | misc_fees |
| Utilities included, electric cap | utilities |
| Notice to vacate (days) | notice_to_vacate_days |
| Background check | background_check |
| Contact name, contact number | contact_name, contact_number |
| Selling point | selling_point |
| Description | description |
| Available from | available_from |
3. Review: compare every value with the payload, then Submit (gated).

Nearsite takes a 6% platform fee and the request's referral fee (usually 10%) out of the rate, which is why the quote is grossed up by 0.84.
