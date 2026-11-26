"""Fills the company option templates used for email submissions.

Two templates exist (found in the team's Sep 15 email, saved under
nearsite-agent/submission-templates/):
  crs                  "Option CRS Fully & Partially Furnished"
  all_other_companies  Lou's "Master All other companies" (Example Insurance and the rest)

Each fill returns the rows of the table in the template's own order, plus a
plain-text email body. A person sends the email after pressing Submit; the
agent only drafts it.
"""
from __future__ import annotations


def _money(v) -> str:
    return "" if v in (None, "") else f"${float(v):,.0f}"


def _pet_fee(claim: dict, total) -> str:
    """The quote's pet fee is one total for the stay; the templates' column is per pet, so split it and
    show the total, so an adjuster never reads the total as each pet's fee."""
    from . import claims as C
    if not total:
        return ""
    n = max(C.pets_count(claim), 1)
    if n == 1:
        return _money(total)
    return f"{_money(float(total) / n)} per pet ({_money(total)} total for {n})"


def template_for(company: str | None, cfg: dict) -> str:
    c = str(company or "").strip().upper()
    for key, name in cfg["email_templates"].items():
        if key != "_default" and key.upper() in c:
            return name
    return cfg["email_templates"]["_default"]


def fill(option_no: int, claim: dict, home: dict, quote: dict, cfg: dict) -> dict:
    name = template_for(claim.get("company"), cfg)
    ot = quote["one_time"]
    unit = (
        "Fully Furnished Rental Property Including Utilities; "
        f"Utility Caps: {_money(quote.get('utility_cap'))}; Parking: {home.get('parking') or ''}"
    )
    if name == "crs":
        rows = [
            ("Option", str(option_no)),
            ("Address (include property name & unit number)", home.get("address", "")),
            ("Distance from Damaged Property", f"{home.get('distance_mi', '')} miles"),
            ("No. of Bedrooms", str(home.get("bedrooms", ""))),
            ("No. of Bathrooms", str(home.get("bathrooms", ""))),
            ("Sq. Ft.", str(home.get("sqft") or "")),
            ("Furnished or Unfurnished (by owner or vendor?)", "Furnished by owner"),
            ("Rental Cost (Fully furnished with utilities)", _money(quote["quote_monthly"])),
            ("Rental Cost (Partially furnished with utilities)", _money(home.get("partial_quote_monthly"))),
            ("Refundable Security Deposit", _money(quote.get("deposit"))),
            ("Non-Refundable Pet Fee (Per Pet)", _pet_fee(claim, ot.get("pet_nonrefundable")) or "NA"),
            ("One-Time App & Admin", f"Application Fee (per Adult 18+) {_money(cfg['pricing']['app_fee_per_adult'])}; Admin Fee {_money(ot['admin'])}"),
            ("One-Time Clean", _money(ot["cleaning"])),
            ("Notice to Vacate Term", f"{quote['notice_days']} days"),
            ("Extension Term", f"{cfg['pricing']['extension_term_days']} days"),
            ("First Available Move In Date", str(home.get("available_from", ""))),
            ("Requirements", "Background Screen on all adults"),
            ("Additional Notes", f"Fully furnished Rental including Utilities. Utility Cap: {_money(quote.get('utility_cap'))}. Bed Type: {', '.join(home.get('bed_sizes') or [])}. Parking: {home.get('parking') or ''}"),
            ("Cost to remove furniture", "Furniture can not be removed, housewares & linens can be."),
            ("Link for pictures", home.get("photos_url", "")),
        ]
    else:
        rows = [
            ("Option", str(option_no)),
            ("Available", str(home.get("available_from", ""))),
            ("Address", home.get("address", "")),
            ("Distance", f"{home.get('distance_mi', '')} miles"),
            ("Unit Details", unit),
            ("Sq. Ft.", str(home.get("sqft") or "")),
            ("No. of Bedrooms", str(home.get("bedrooms", ""))),
            ("No. of Bathrooms", str(home.get("bathrooms", ""))),
            ("Rent", _money(quote["quote_monthly"])),
            ("Pet Rent (Per Pet)", "$0"),
            ("Refundable Security Deposit", _money(quote.get("deposit"))),
            ("Non-Refundable Pet Fee (Per)", _pet_fee(claim, ot.get("pet_nonrefundable")) or "$0"),
            ("One-Time Admin & App", f"Admin Fee: {_money(ot['admin'])}; Application Fee: {_money(cfg['pricing']['app_fee_per_adult'])}/per adult; Move In Fee: {_money(ot.get('move_in'))}"),
            ("One-Time Clean", _money(ot["cleaning"])),
            ("Notice to Vacate Term (NTV)", f"{quote['notice_days']} days"),
            ("Link for pictures", home.get("photos_url", "")),
        ]
    missing = [label for label, val in rows if val in ("", "$", " miles")]
    width = max(len(r[0]) for r in rows)
    body = "\n".join(f"{label.ljust(width)}  {val}" for label, val in rows)
    return {"template": name, "rows": rows, "text": body, "missing": missing}


def email_draft(claim: dict, options: list[dict]) -> dict:
    """Draft only. `options` are fill() results. Never sent by the agent."""
    ref = claim.get("claim_ref") or claim.get("claim_number") or ""
    first = claim.get("adjuster_first_name") or "there"
    parts = [f"Hi {first},", "", f"Here {'is the option' if len(options) == 1 else 'are the options'} for claim {ref}.", ""]
    for o in options:
        parts += [o["text"], ""]
    parts += ["Let me know which one works and I'll lock it in with the landlord.", "", "Thanks,"]
    return {
        "to": claim.get("adjuster_email"),
        "subject": f"Housing options - claim {ref}".strip(),
        "body": "\n".join(parts),
        "status": "draft_only",
    }
