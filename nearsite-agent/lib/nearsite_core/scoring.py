"""Scores a home for a claim, 0 to 100, with the reasons shown.

The score is a ranking aid for the person ticking homes, not a decision.
Hard problems (pets refused, too small, over budget) are returned as
`blockers` so the claim panel can show them in red and the checker can stop
them later, whatever the score.

Weights (sum 100):
  distance 30 · size fit 20 · margin 25 · pets 10 · availability 10 · needs 5
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict

from . import claims as C
from . import pricing as P


@dataclass
class Scored:
    home_id: str
    source: str
    score: float
    reasons: list = field(default_factory=list)
    blockers: list = field(default_factory=list)
    to_confirm: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _distance_points(mi: float | None) -> tuple[float, str]:
    if mi is None:
        return 10, "distance unknown"
    if mi <= 3:
        return 30, f"{mi:.1f} mi"
    if mi <= 10:
        return 30 - (mi - 3) * 1.5, f"{mi:.1f} mi"
    if mi <= 20:
        return max(5, 19.5 - (mi - 10) * 1.2), f"{mi:.1f} mi"
    return 2, f"{mi:.1f} mi (far)"


def score(claim: dict, home: dict, cfg: dict) -> Scored:
    reasons: list[str] = []
    blockers: list[str] = []
    to_confirm: list[str] = []
    total = 0.0

    pts, why = _distance_points(home.get("distance_mi"))
    total += pts
    reasons.append(why)

    need_beds = float(claim.get("beds") or 0)
    beds = home.get("bedrooms")
    if beds is None:
        total += 8
        to_confirm.append("bedrooms")
    elif float(beds) >= need_beds:
        total += 20 if float(beds) - need_beds <= 1 else 16
        reasons.append(f"{beds:g} bd")
    else:
        total += 4
        blockers.append(f"smaller than requested ({beds:g} bd for {need_beds:g})")

    ceiling = claim.get("budget_monthly") or claim.get("frv")
    owner = home.get("owner_monthly") or home.get("monthly_rate")
    if owner is None or ceiling is None:
        total += 8
        to_confirm.append("rent")
    else:
        # What we keep after Nearsite's fees, not the gross budget.
        net_ceiling = float(ceiling) * P.fee_factor(claim, cfg)
        target = net_ceiling - cfg["pricing"]["monthly_markup_target"]
        if float(owner) <= target:
            total += 25
            reasons.append(f"rent ${float(owner):,.0f} leaves room")
        elif float(owner) <= net_ceiling - cfg["pricing"]["monthly_markup_floor"]:
            total += 14
            reasons.append("thin margin")
        else:
            blockers.append(f"rent too high: leaves under ${cfg['pricing']['monthly_markup_floor']:,} a month after fees")

    if C.has_pets(claim):
        ok = home.get("pets_ok")
        if ok is True:
            total += 10
            reasons.append("pets OK")
        elif ok is False:
            blockers.append("does not take pets")
        else:
            total += 4
            to_confirm.append("pets")
    else:
        total += 10

    avail = str(home.get("availability") or "").lower()
    if "now" in avail or avail == "available":
        total += 10
        reasons.append("available")
    elif "unverified" in avail or not avail:
        total += 5
        to_confirm.append("availability for the dates")
    elif "not" in avail or "unavailable" in avail:
        blockers.append("not available")

    claim_needs = C.needs(claim) - {"pets"}
    home_feats = set(home.get("features") or [])
    met = claim_needs & home_feats
    total += 5 if not claim_needs else 5 * len(met) / len(claim_needs)
    for n in sorted(claim_needs - home_feats):
        to_confirm.append(n.replace("_", " "))

    desc = " ".join(str(home.get(k) or "") for k in ("title", "host_name", "description")).lower()
    if any(w in desc for w in cfg["sourcing"]["avoid_keywords"]):
        blockers.append("looks like a management company (SOP: avoid unless nothing else)")

    return Scored(
        home_id=str(home.get("home_id") or home.get("property_id") or home.get("id")),
        source=home.get("source") or "internal",
        score=round(min(total, 100), 1),
        reasons=reasons,
        blockers=blockers,
        to_confirm=to_confirm,
    )


def rank(claim: dict, homes: list[dict], cfg: dict) -> list[Scored]:
    scored = [score(claim, h, cfg) for h in homes]
    scored.sort(key=lambda s: (len(s.blockers) > 0, -s.score))
    return scored


def internal_sufficient(scored_internal: list[Scored], cfg: dict) -> bool:
    s = cfg["sourcing"]
    strong = [x for x in scored_internal if x.score >= s["internal_sufficient_score"] and not x.blockers]
    return len(strong) >= s["internal_sufficient_count"]


def shortlist(claim: dict, internal: list[dict], external: list[dict], cfg: dict) -> dict:
    """Internal first; external only tops up when internal falls short."""
    s_int = rank(claim, internal, cfg)
    sufficient = internal_sufficient(s_int, cfg)
    target = cfg["sourcing"]["target_homes"]
    picked = s_int[:target]
    used_external = False
    if not sufficient and external:
        # Internal fell short, so outside homes compete for the whole list: a home that fits beats any home
        # with a blocker, wherever it came from (found in review of PR #29: blocked internal homes filled the list).
        used_external = True
        s_ext = rank(claim, external, cfg)
        picked = sorted(s_int + s_ext, key=lambda s: (len(s.blockers) > 0, -s.score))[:target]
    return {"internal_sufficient": sufficient, "used_external": used_external, "homes": picked}
