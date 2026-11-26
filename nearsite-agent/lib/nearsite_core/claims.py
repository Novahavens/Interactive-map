"""Reads what a claim needs out of its fields and free-text notes.

Nearsite and the website form both leave important needs in the notes
("elderly couple - no stairs 2 cars"). These helpers turn them into flags
the scorer and the checker can act on, so a need in the notes is never lost.
"""
from __future__ import annotations

import re

NEED_PATTERNS = {
    "no_stairs": r"\bno stairs\b|\bsingle[- ]level\b|\bone[- ]story\b|\bground floor\b|\bwheelchair\b|\bada\b|\belderly\b",
    "near_school": r"\bschool\b",
    "fenced_yard": r"\bfenced\b",
    "garage": r"\bgarage\b",
    "washer_dryer": r"\bwasher\b|\bdryer\b|\blaundry\b",
}


def text_of(claim: dict) -> str:
    return " ".join(str(claim.get(k) or "") for k in ("notes", "pets", "pet_details", "title")).lower()


def has_pets(claim: dict) -> bool:
    if claim.get("pets_count"):
        return True
    p = str(claim.get("pets") or "").strip().lower()
    if not p or p.startswith("no") or p in ("none", "n/a", "na", "0"):
        return False
    return True


def pets_count(claim: dict) -> int:
    if claim.get("pets_count"):
        return int(claim["pets_count"])
    m = re.search(r"(\d+)\s*(dog|cat|pet)", text_of(claim))
    return int(m.group(1)) if m else (1 if has_pets(claim) else 0)


def pet_weights_known(claim: dict) -> bool:
    """The SOP asks for breed and weight. 'TBD 1 lbs' means unknown."""
    d = str(claim.get("pet_details") or "").lower()
    if not has_pets(claim):
        return True
    if not d or "tbd" in d:
        return False
    weights = [int(w) for w in re.findall(r"(\d+)\s*lbs?", d)]
    return bool(weights) and all(w > 1 for w in weights)


def parking_needed(claim: dict) -> int:
    t = text_of(claim)
    m = re.search(r"parking:\s*(\d+)", t) or re.search(r"(\d+)\s*cars?\b", t)
    return int(m.group(1)) if m else 0


def needs(claim: dict) -> set[str]:
    t = text_of(claim)
    found = {k for k, pat in NEED_PATTERNS.items() if re.search(pat, t)}
    if has_pets(claim):
        found.add("pets")
    if parking_needed(claim):
        found.add("parking")
    return found


def adults(claim: dict) -> int:
    for k in ("adults", "guests"):
        if claim.get(k):
            return int(claim[k])
    m = re.search(r"guests:\s*(\d+)", text_of(claim))
    return int(m.group(1)) if m else 1
