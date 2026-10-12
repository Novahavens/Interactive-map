#!/usr/bin/env python3
"""Builds captions.json: the script's exact words on Whisper's word timings, shifted to each line's place in the video."""
import json
import pathlib

here = pathlib.Path(__file__).parent
# Where each voiceover line starts in the video (seconds). Keep in sync with the <audio id="vo-*"> data-start values.
PLACE = {"02_problem": 6.3, "03_title": 12.6, "04_pick": 16.5, "05_find": 27.3, "06a_fit": 40.0,
         "06b_add": 46.3, "07_send": 54.3, "08_mobile": 64.6, "09_outro": 70.2}
script = dict(l.rstrip("\n").split("\t") for l in (here / "audio/vo/script.tsv").open())

out = []
for vid, at in PLACE.items():
    tw = json.loads((here / f"transcripts/{vid}.json").read_text())
    tw = tw if isinstance(tw, list) else tw["words"]
    words = script[vid].split()
    t = [dict(text=x["text"], start=x["start"], end=x["end"]) for x in tw]
    # Whisper wrote "15,000" for "Fifteen thousand" and "cop is" for "copies"; map them back to the script's tokens.
    if vid == "02_problem":
        a = t[0]; mid = (a["start"] + a["end"]) / 2
        t = [dict(text="Fifteen", start=a["start"], end=mid), dict(text="thousand", start=mid, end=a["end"])] + t[1:]
    if vid == "07_send":
        i = next(i for i, x in enumerate(t) if x["text"].lower().startswith("cop"))
        t = t[:i] + [dict(text="copies", start=t[i]["start"], end=t[i + 1]["end"])] + t[i + 2:]
    assert len(t) == len(words), f"{vid}: {len(t)} timed words vs {len(words)} script words"
    out.append(dict(id=vid, at=at, words=[dict(text=w, start=round(at + x["start"], 3), end=round(at + x["end"], 3)) for w, x in zip(words, t)]))

(here / "captions.json").write_text(json.dumps(out, indent=1))
print(f"captions.json: {sum(len(l['words']) for l in out)} words in {len(out)} lines")
