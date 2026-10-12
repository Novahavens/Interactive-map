#!/usr/bin/env python3
"""Writes index.html from index.template.html, inlining captions.json (compositions must not fetch at render time)."""
import json
import pathlib

here = pathlib.Path(__file__).parent
captions = json.loads((here / "captions.json").read_text())

# Group words into caption phrases: break on punctuation, pauses > 0.18s, or 5 words.
groups = []
for line in captions:
    cur = []
    for i, w in enumerate(line["words"]):
        cur.append(w)
        nxt = line["words"][i + 1] if i + 1 < len(line["words"]) else None
        brk = (
            nxt is None
            or w["text"][-1] in ".,?!"
            or len(cur) >= 5
            or (nxt["start"] - w["end"]) > 0.18
        )
        if brk:
            groups.append({"start": cur[0]["start"], "end": (nxt["start"] if nxt and nxt["start"] - w["end"] < 0.35 else w["end"] + 0.25), "words": cur})
            cur = []

# Merge flash groups (< 0.45s) into the previous group of the same line so no caption blinks or outlives its window.
merged = []
for g in groups:
    if merged and (g["end"] - g["start"]) < 0.45 and abs(merged[-1]["end"] - g["start"]) < 0.01:
        merged[-1]["words"] += g["words"]
        merged[-1]["end"] = g["end"]
    else:
        merged.append(g)
groups = merged

tpl = (here / "src" / "index.template.html").read_text()
out = tpl.replace("/*__CAPTION_GROUPS__*/[]", json.dumps(groups, separators=(",", ":")))
(here / "index.html").write_text(out)
print(f"index.html written: {len(groups)} caption groups")
