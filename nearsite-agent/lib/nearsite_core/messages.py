"""Words the agent sends to landlords, written per claim so they don't read like a template.

Three kinds:
  in_app_draft   pre-filled into the listing site's message box by the Chrome
                 extension; a person presses Send
  sona_text_task the task handed to Quo's Sona to run a text conversation
  sona_call_task the task handed to Sona for the verification call

All three follow the Searching SOP: never share the insured's details or any
contact info between parties, ask everything a searcher asks, one follow-up at
most. Sona tasks are capped at 2,000 characters by Quo.
"""
from __future__ import annotations

from . import claims as C

MAX_TASK = 2000


def _nice(d) -> str:
    try:
        from datetime import date
        x = date.fromisoformat(str(d)[:10])
        return x.strftime("%b %-d, %Y")
    except Exception:
        return str(d)


def _when(claim: dict) -> str:
    mi, mo = claim.get("move_in"), claim.get("move_out")
    if mi and mo:
        return f"from {_nice(mi)} to {_nice(mo)}"
    return f"from {_nice(mi)}" if mi else "soon"


def _pets_phrase(claim: dict) -> str:
    """Count and kind only. Weights go in only when known (never 'TBD 1 lbs')."""
    n = C.pets_count(claim)
    kind = "dog" if "dog" in C.text_of(claim) else ("cat" if "cat" in C.text_of(claim) else "pet")
    base = f"{n} {kind}{'s' if n != 1 else ''}"
    if C.pet_weights_known(claim):
        d = str(claim.get("pet_details") or "")
        detail = d.split(":", 1)[1].strip() if ":" in d else ""
        if detail:
            return f"{base} ({detail})"
    return base


def _who(claim: dict) -> str:
    bits = []
    a = C.adults(claim)
    bits.append(f"{a} adult{'s' if a != 1 else ''}")
    if claim.get("children"):
        bits.append(f"{claim['children']} child{'ren' if int(claim['children']) != 1 else ''}")
    if C.has_pets(claim):
        bits.append(_pets_phrase(claim))
    return bits[0] if len(bits) == 1 else ", ".join(bits[:-1]) + " and " + bits[-1]


def in_app_draft(claim: dict, home: dict, cfg: dict) -> str:
    sender = cfg["outreach"]["sender_name"]
    need = []
    if "no_stairs" in C.needs(claim):
        need.append("everything on one level (no stairs)")
    p = C.parking_needed(claim)
    if p:
        need.append(f"parking for {p} cars")
    needs_line = f" They need {' and '.join(need)}." if need else ""
    if C.has_pets(claim):
        needs_line += f" Are {_pets_phrase(claim).split(' (')[0]} OK, and do you have any size or breed limits?"
    return (
        f"Hi! This is {sender}. We place families who've been displaced from their homes "
        f"(insurance-covered stays, paid on time, fully vetted). Your home could be a great fit for a family of "
        f"{_who(claim)}, {_when(claim)}.{needs_line} Is it available for those dates? If so, could you reply with "
        f"your name, the property address and the best number to reach you, and let us know if it's OK for our "
        f"agent to give you a quick call to confirm the details? Thank you!"
    )[:MAX_TASK]


def sona_text_task(claim: dict, home: dict, cfg: dict) -> str:
    t = (
        "Goal: find out if this furnished rental is available and collect the landlord's details. "
        f"Home: {home.get('address') or home.get('listing_url') or 'the listing we asked about'}. Dates: {_when(claim)}. "
        f"Guests: {_who(claim)}. "
        "Ask, one at a time and politely: is it available for those dates; are these pets OK and any size or breed limits; their name; the exact property "
        "address; the best number to reach them; and whether our agent may call to confirm the details. "
        "Done when you have all five answers, or they say it's not available, or they decline. "
        "Never share the guests' names, phone numbers or emails. Never agree a price, sign or commit to "
        "anything; say the team will confirm. If they reply STOP or ask not to be contacted, stop at once. "
        "Collect: available (yes/no/dates), landlord_name, address, best_phone, ok_to_call (yes/no)."
    )
    return t[:MAX_TASK]


CALL_QUESTIONS = [
    "available_from and available_to for these dates",
    "monthly rent, and whether utilities are included (and any cap)",
    "refundable security deposit",
    "cleaning fee, pet fee and any other one-time fees",
    "pets allowed for these pets (breed and weight), and any limits",
    "bedrooms, bed sizes in each room, bathrooms",
    "single level or stairs",
    "parking: how many spaces, covered or not, garage",
    "furnished: linens, towels, kitchenware, washer/dryer, Wi-Fi",
    "landlord's notice to vacate, and minimum stay",
    "OK with a corporate lease paid by Nova Havens (insurance placement)",
    "email address to send the rental terms summary to",
]


def sona_call_task(claim: dict, home: dict, cfg: dict) -> str:
    t = (
        "Goal: confirm the rental details with the landlord, like our searchers do. "
        f"The landlord ({home.get('landlord_name') or 'the owner'}) already said by text that we may call. "
        f"Home: {home.get('address') or 'the home we texted about'}. Dates needed: {_when(claim)}. Guests: {_who(claim)}. "
        f"Ask about: {'; '.join(CALL_QUESTIONS)}. "
        "Be warm and brief. Never share the guests' names or contact details. Never agree a price or "
        "commit; say the team will send the terms in writing. If they ask to stop, end politely. "
        "Done when every question is answered, or the home is not available. "
        "Collect every answer as its own field."
    )
    return t[:MAX_TASK]


def follow_up(claim: dict, home: dict, cfg: dict) -> str:
    return (
        f"Hi again from {cfg['outreach']['sender_name']}. Just checking whether your home is "
        f"free {_when(claim)}. A quick yes or no helps us a lot. Thanks!"
    )
