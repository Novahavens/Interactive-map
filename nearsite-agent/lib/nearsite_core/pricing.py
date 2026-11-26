"""Pricing, following the Master Markup Calculator and the Nearsite fee model.

Owner cost is what the landlord charges us. The quote is what we offer the
adjuster. On Nearsite, the platform fee and the referral fee come out of the
quote, so we work back from the net we need.

The rule shapes (every number lives in config `pricing`; the real values are in the private overlay,
never in this repo):
- Monthly markup: aim for monthly_markup_target; under monthly_markup_floor, management must agree.
- One-time fees: application per adult, admin fee, exit clean up-charged over the owner's, non-refundable
  pet fee up-charged over the owner's, move-in fee. Aim for one_time_markup_target across them.
- Security deposit is passed through at cost.
- Utility caps by bedrooms (utility_caps).
- Our notice to vacate: nh_notice_days.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict

from . import claims as C


def fee_factor(claim: dict, cfg: dict) -> float:
    """Share of the quote we keep. 1.0 for email claims (no platform)."""
    if claim.get("source", "nearsite") != "nearsite":
        return 1.0
    platform = float(claim.get("platform_fee_pct") or cfg["pricing"]["platform_fee_pct_default"]) / 100
    referral = 0.0
    if (claim.get("referral_fee_type") or "percentage") == "percentage":
        referral = float(claim.get("referral_fee_rate") or 0) / 100
    return max(0.0, 1.0 - platform - referral)


def ceiling_monthly(claim: dict) -> float | None:
    """The most the client will pay per month: Nearsite budget, else FRV."""
    for key in ("budget_monthly", "frv_monthly", "frv"):
        v = claim.get(key)
        if v not in (None, "", 0):
            return float(v)
    return None


def utility_cap(bedrooms: float | int | None, cfg: dict) -> int | None:
    if not bedrooms:
        return None
    caps = cfg["pricing"]["utility_caps"]
    b = str(min(int(round(float(bedrooms))), 5))
    return caps.get(b)


@dataclass
class Quote:
    owner_monthly: float
    quote_monthly: float
    quote_per_day: float
    net_monthly: float
    markup_monthly: float
    fee_factor: float
    ceiling_monthly: float | None
    capped_by_ceiling: bool
    markup_ok: bool
    markup_needs_management: bool
    one_time: dict = field(default_factory=dict)
    one_time_markup: float = 0.0
    deposit: float | None = None
    utility_cap: int | None = None
    notice_days: int = 30
    warnings: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def quote(claim: dict, home: dict, cfg: dict) -> Quote:
    """Build the quote for one home on one claim.

    home keys used: owner_monthly (required), owner_clean, owner_pet_fee,
    owner_deposit, bedrooms.
    """
    p = cfg["pricing"]
    owner = float(home["owner_monthly"])
    ff = fee_factor(claim, cfg)
    ceiling = ceiling_monthly(claim)
    warnings: list[str] = []

    wanted_net = owner + p["monthly_markup_target"]
    gross = wanted_net / ff if ff > 0 else float("inf")
    capped = False
    if ceiling is not None and gross > ceiling:
        gross = ceiling
        capped = True
    gross = round(gross, 2)
    net = round(gross * ff, 2)
    markup = round(net - owner, 2)
    markup_ok = markup >= p["monthly_markup_floor"]
    if not markup_ok:
        warnings.append(
            f"Monthly markup ${markup:,.0f} is under the ${p['monthly_markup_floor']:,} floor; management must agree."
        )
    if ceiling is None:
        warnings.append("No budget or FRV on the claim, so the quote is not checked against a ceiling.")

    adults = C.adults(claim)
    owner_clean = float(home.get("owner_clean") or 0)
    owner_pet = float(home.get("owner_pet_fee") or 0)
    pets = C.has_pets(claim)
    one_time = {
        "application": p["app_fee_per_adult"] * adults,
        "admin": p["admin_fee"],
        "cleaning": max(p["clean_fee_min"], owner_clean + p["clean_fee_upcharge"]),
        "move_in": p["move_in_fee"],
        "pet_nonrefundable": max(p["pet_fee_nonref"], owner_pet + p["pet_fee_upcharge"]) if pets else 0,
    }
    owner_one_time = owner_clean + (owner_pet if pets else 0)
    one_time_markup = round(sum(one_time.values()) - owner_one_time, 2)
    if one_time_markup < p["one_time_markup_target"]:
        warnings.append(f"One-time fee markup ${one_time_markup:,.0f} is under the ${p['one_time_markup_target']:,} target.")

    return Quote(
        owner_monthly=owner,
        quote_monthly=gross,
        quote_per_day=round(gross / p["month_days"], 2),
        net_monthly=net,
        markup_monthly=markup,
        fee_factor=round(ff, 4),
        ceiling_monthly=ceiling,
        capped_by_ceiling=capped,
        markup_ok=markup_ok,
        markup_needs_management=not markup_ok,
        one_time=one_time,
        one_time_markup=one_time_markup,
        deposit=float(home["owner_deposit"]) if home.get("owner_deposit") not in (None, "") else None,
        utility_cap=utility_cap(home.get("bedrooms"), cfg),
        notice_days=p["nh_notice_days"],
        warnings=warnings,
    )


def searcher_target_rent(claim: dict, cfg: dict) -> float | None:
    """The SOP's quick rule for searchers: budget minus searcher_budget_offset."""
    c = ceiling_monthly(claim)
    return None if c is None else c - cfg["pricing"]["searcher_budget_offset"]
