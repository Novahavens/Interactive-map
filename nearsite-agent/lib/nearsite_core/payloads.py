"""What the Nearsite agent types into Nearsite, built before it opens the page.

Two payloads, both checked by the checker and shown in the Slack card before
anything is entered:

add_property  Nearsite > Properties > Add property (Lou's walkthrough, 16 Nov)
proposal      Nearsite > request > Create proposal, wizard step 2 (seen 26 Nov)

Lou's rules: property name = street address; furnished = yes; guests = 2 per
bedroom; bed sizes, bathrooms and garage confirmed with the landlord; an
apartment needs its floor; amenities ticked only when the listing or landlord
says so; photos uploaded by hand (max 10); description adapted, never copied.
"""
from __future__ import annotations

NEARSITE_TYPES = {"single family": "Single Family House", "house": "Single Family House",
                  "townhouse": "Townhouse", "town house": "Townhouse", "apartment": "Apartment",
                  "condo": "Apartment"}

UNIT_AMENITIES = ["AC", "Desk & chair", "Dishes & utensils", "In-unit laundry", "Hot tub",
                  "Iron & board", "Kitchenettes", "Linens & towels", "Microwave", "Oven",
                  "Refrigerator", "Wifi"]


def street_of(address: str) -> str:
    return str(address or "").split(",")[0].strip()


def nearsite_type(t: str | None) -> str | None:
    t = str(t or "").lower()
    for k, v in NEARSITE_TYPES.items():
        if k in t:
            return v
    return None


def add_property(home: dict, cfg: dict) -> dict:
    beds = int(home.get("bedrooms") or 0)
    amen = [a for a in (home.get("amenities") or []) if a in UNIT_AMENITIES]
    missing = []
    for k in ("address", "bedrooms", "bathrooms", "bed_sizes", "parking"):
        if home.get(k) in (None, "", []):
            missing.append(k)
    ptype = nearsite_type(home.get("property_type"))
    if ptype is None:
        missing.append("property_type")
    if ptype == "Apartment" and not home.get("floor"):
        missing.append("floor")
    return {
        "form": "nearsite.add_property",
        "property_type": ptype,
        "location": home.get("address"),
        "property_name": street_of(home.get("address")),
        "area_sqft": home.get("sqft"),
        "furnishing": "Furnished",
        "bedrooms": beds or None,
        "bed_sizes": home.get("bed_sizes") or [],
        "bathrooms": home.get("bathrooms"),
        "full_kitchens": 1,
        "living_rooms": home.get("living_rooms", 1),
        "in_unit_laundry": 1 if "In-unit laundry" in amen else 0,
        "attached_garages": home.get("garages", 0),
        "max_guests": beds * 2 if beds else None,
        "parking": {
            "availability": home.get("parking_availability") or ("Reserved" if home.get("parking_spaces") else None),
            "type": home.get("parking_type"),
            "spaces": home.get("parking_spaces"),
        },
        "pets": {"dogs": bool(home.get("dogs_ok", home.get("pets_ok"))), "cats": bool(home.get("cats_ok", home.get("pets_ok")))},
        "ada_compliant": bool(home.get("ada")),
        "floor": home.get("floor"),
        "unit_amenities": amen,
        "photos": {"source": home.get("photos_url"), "max": 10, "uploaded_by": "agent from the photo folder"},
        "description": (home.get("description_draft") or "")[: cfg["nearsite"]["description_max_chars"]],
        "missing": missing,
    }


def proposal(claim: dict, home: dict, quote: dict, cfg: dict) -> dict:
    c = cfg["nearsite"]["proposal_contact"]
    ot = quote["one_time"]
    misc = [
        {"name": "Application", "amount": ot["application"]},
        {"name": "Admin", "amount": ot["admin"]},
        {"name": "Cleaning", "amount": ot["cleaning"]},
    ]
    if ot.get("move_in"):
        misc.append({"name": "Move-in", "amount": ot["move_in"]})
    if ot.get("pet_nonrefundable"):
        misc.append({"name": "Pet fee (non-refundable)", "amount": ot["pet_nonrefundable"]})
    return {
        "form": "nearsite.proposal",
        "request_id": claim.get("nearsite_claim_id"),
        "property_name": street_of(home.get("address")),
        "unit_name": home.get("unit") or street_of(home.get("address")),
        "base_rent_per_day": quote["quote_per_day"],
        "security_deposit": quote.get("deposit"),
        "misc_fees": misc,
        "utilities": {"included": True, "electric_cap": quote.get("utility_cap")},
        "notice_to_vacate_days": quote["notice_days"],
        "background_check": cfg["nearsite"]["background_check"],
        "contact_name": c.get("name"),
        "contact_number": c.get("phone"),
        "selling_point": home.get("selling_point"),
        "description": (home.get("description_draft") or "")[: cfg["nearsite"]["description_max_chars"]],
        "available_from": home.get("available_from"),
        "_net_to_us_monthly": quote["net_monthly"],
        "_markup_monthly": quote["markup_monthly"],
    }


def review_matches(expected: dict, review_screen: dict) -> list[str]:
    """Compare what the Review step shows with what we meant to send.

    Returns the differences; an empty list means it is safe to submit.
    """
    diffs = []
    for k in ("base_rent_per_day", "security_deposit", "notice_to_vacate_days", "contact_name", "contact_number", "property_name"):
        if k in review_screen and str(review_screen[k]).strip() != str(expected.get(k)).strip():
            diffs.append(f"{k}: review shows {review_screen[k]!r}, expected {expected.get(k)!r}")
    exp_fees = {f["name"]: float(f["amount"]) for f in expected.get("misc_fees", [])}
    got_fees = {f["name"]: float(f["amount"]) for f in review_screen.get("misc_fees", [])}
    if review_screen.get("misc_fees") is not None and exp_fees != got_fees:
        diffs.append(f"misc_fees: review shows {got_fees}, expected {exp_fees}")
    return diffs
