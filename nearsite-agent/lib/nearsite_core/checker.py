"""The checker: every outward step must pass here first.

Three gates, one per kind of outward step:
  outreach  before any text or in-app message to a landlord
  call      before any Sona verification call
  submit    before anything goes to Nearsite or to an adjuster by email

Each returns a Verdict with `blockers` (must be fixed, the step cannot run)
and `warnings` (shown to the person, the step may run). The rules are plain
code so they behave the same every time; the checker sub-agent adds a second,
model-based read on top (see skills/submission-checker).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, time, timezone

from . import claims as C

PHONE_RE = re.compile(r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


@dataclass
class Verdict:
    stage: str
    passed: bool
    blockers: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _d(v) -> date | None:
    if v in (None, ""):
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


PRICING_NOT_LOADED = "Pricing rules not loaded: the config still holds example values. Load the real overlay (NEARSITE_AGENT_CONFIG_LOCAL)."


def _verdict(stage: str, blockers: list, warnings: list) -> Verdict:
    return Verdict(stage=stage, passed=not blockers, blockers=blockers, warnings=warnings)


def _example_pricing(cfg: dict) -> list:
    """The committed config ships example pricing and placeholder people. Nothing goes out on those."""
    return [PRICING_NOT_LOADED] if cfg.get("pricing", {}).get("_example") else []


def check_outreach(claim: dict, home: dict, message: str, ctx: dict, cfg: dict) -> Verdict:
    b, w = _example_pricing(cfg), []
    o = cfg["outreach"]
    if home.get("opted_out"):
        b.append("Landlord opted out (STOP). Never contact again.")
    if not (home.get("landlord_phone") or home.get("listing_url")):
        b.append("No way to reach the landlord: no phone and no listing link.")
    sent = int(home.get("messages_sent") or 0)
    if sent > o["max_follow_ups"]:
        b.append(f"Already messaged {sent} times; the SOP allows one follow-up only.")
    if EMAIL_RE.search(message) or PHONE_RE.search(message.replace(o["from_number"], "")):
        b.append("Message contains a phone number or email. SOP: never share contact info between parties.")
    for k in ("insured_name", "tenant_name", "claim_number"):
        v = claim.get(k)
        if v and str(v).lower() in message.lower():
            b.append(f"Message mentions the {k.replace('_', ' ')}. Keep the insured private.")
    if len(message) > 2000:
        b.append("Message is over 2,000 characters (Sona's task limit).")
    if ctx.get("thread_open_for_landlord") and o["one_thread_per_landlord"]:
        b.append("This landlord already has an open thread. Add the home to that thread instead.")
    local = ctx.get("landlord_local_time")
    if local is not None and _quiet(local, o["quiet_hours_local"]):
        b.append("It's quiet hours in the landlord's time zone. Queue it for the morning.")
    if C.has_pets(claim) and not C.pet_weights_known(claim):
        w.append("Pet breeds and weights are unknown. Ask the account manager to get them (SOP).")
    return _verdict("outreach", b, w)


def _quiet(local: time, q: dict) -> bool:
    start = time.fromisoformat(q["start"])
    end = time.fromisoformat(q["end"])
    return local >= start or local < end


def check_call(claim: dict, home: dict, ctx: dict, cfg: dict) -> Verdict:
    b, w = _example_pricing(cfg), []
    c = cfg["calls"]
    consent = home.get("call_consent")
    if consent is not True:
        b.append("No written yes to a call from the landlord. AI-voice calls need prior consent.")
    if not home.get("landlord_phone"):
        b.append("No landlord phone number.")
    if home.get("opted_out"):
        b.append("Landlord opted out.")
    attempts = int(home.get("call_attempts") or 0)
    if attempts >= c["max_attempts"]:
        b.append(f"Already tried {attempts} calls. Hand it to a person.")
    used = int(ctx.get("credits_used_this_month") or 0)
    left = c["monthly_credit_budget"] - used
    if left - c["credits_per_call"] < c["credit_reserve"]:
        b.append(f"Only {left} Quo automation credits left this month (a call uses {c['credits_per_call']}).")
    local = ctx.get("landlord_local_time")
    if local is not None and _quiet(local, cfg["outreach"]["quiet_hours_local"]):
        b.append("Quiet hours for the landlord. Queue the call.")
    return _verdict("call", b, w)


REQUIRED_VERIFIED = (
    ("address", "street address"),
    ("bedrooms", "bedrooms"),
    ("bathrooms", "bathrooms"),
    ("owner_monthly", "landlord's monthly rent"),
    ("available_from", "available-from date"),
    ("available_to", "available-until date"),
    ("owner_deposit", "security deposit"),
    ("parking", "parking"),
    ("photos_url", "photo link"),
)


def check_submit(claim: dict, home: dict, quote: dict, ctx: dict, cfg: dict) -> Verdict:
    """Final gate before a proposal goes to Nearsite or an option goes by email."""
    b, w = _example_pricing(cfg), []

    if not home.get("verified"):
        b.append("The home has not been verified with the landlord (call or written answers).")
    for key, label in REQUIRED_VERIFIED:
        if home.get(key) in (None, "", []):
            b.append(f"Missing {label}.")
    addr = str(home.get("address") or "")
    if addr and not re.match(r"^\s*\d", addr):
        b.append("Address has no house number. Nearsite's property name must be the street address.")
    if str(home.get("property_type") or "").lower() in ("apartment", "condo") and not home.get("floor"):
        b.append("Apartment needs a floor number (Lou's rule).")

    need = float(claim.get("beds") or 0)
    if home.get("bedrooms") is not None and float(home["bedrooms"]) < need:
        if not home.get("smaller_ok_reason"):
            b.append(f"Home has {home['bedrooms']} bedrooms; the claim asks for {need:g}.")
        else:
            w.append(f"Smaller than requested, accepted because: {home['smaller_ok_reason']}")

    mi, mo = _d(claim.get("move_in")), _d(claim.get("move_out"))
    af, at = _d(home.get("available_from")), _d(home.get("available_to"))
    if mi and af and af > mi:
        b.append(f"Home is free from {af}, after the move-in date {mi}.")
    if mo and at and at < mo:
        b.append(f"Home is only free until {at}, before the move-out date {mo}.")

    if C.has_pets(claim):
        if home.get("pets_ok") is not True:
            b.append("Claim has pets and the landlord has not confirmed they're allowed.")
        elif home.get("pet_limits"):
            w.append(f"Landlord's pet limits: {home['pet_limits']}. Check against the claim's pets.")
    flags = C.needs(claim)
    if "no_stairs" in flags and home.get("single_level") is not True:
        b.append("Claim needs no stairs (notes), and the home is not confirmed single level.")
    p = C.parking_needed(claim)
    if p and int(home.get("parking_spaces") or 0) < p:
        b.append(f"Claim needs parking for {p}; the home has {home.get('parking_spaces') or 'unknown'}.")

    q = quote or {}
    if not q:
        b.append("No quote was built.")
    else:
        ceiling = q.get("ceiling_monthly")
        if ceiling is not None and q["quote_monthly"] > ceiling + 0.01:
            b.append(f"Quote ${q['quote_monthly']:,.0f} is over the client's ceiling ${ceiling:,.0f}.")
        if q.get("markup_needs_management") and not ctx.get("management_ok_markup"):
            b.append(
                f"Markup ${q['markup_monthly']:,.0f}/mo is under the $"
                f"{cfg['pricing']['monthly_markup_floor']:,} floor. Needs management's OK."
            )
        for wmsg in q.get("warnings", []):
            if "floor" not in wmsg:
                w.append(wmsg)

    exp = claim.get("expires_at")
    if exp:
        e = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
        now = ctx.get("now") or datetime.now(timezone.utc)
        if e <= now:
            b.append("The claim has expired on Nearsite.")

    if claim.get("source", "nearsite") == "nearsite":
        if not cfg["nearsite"]["proposal_contact"].get("name") or not cfg["nearsite"]["proposal_contact"].get("phone"):
            b.append("Nearsite needs a contact name and number on every proposal; none is set in the config.")
        approvals = ctx.get("approvals") or {}
        for person in cfg["approvals"]["nearsite_required"]:
            if approvals.get(person) != "approved":
                b.append(f"Waiting for {cfg['approvals']['people'][person]['name']}'s approval in Slack.")
    else:
        if not claim.get("adjuster_email"):
            b.append("No adjuster email on the claim to send the option to.")

    return _verdict("submit", b, w)
