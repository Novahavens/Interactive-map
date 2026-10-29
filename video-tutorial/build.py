#!/usr/bin/env python3
"""Builds the tutorial composition: index.html (scene hosts, voice, music) and one file per scene in compositions/.

Timing comes from the voiceover: each scene lasts its line plus GAP, and its footage is sped up or slowed down to
fill the scene exactly. Captions come from transcripts/<line>.json (word timings), matched to the script's words.
Camera keys are written in the footage's own seconds and converted here.

    python3 build.py
"""
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).parent
GAP = 0.9          # silence between lines
LEAD = 0.6         # before the first line
TAIL = 5.0         # end card hold after the last line
W, H = 1920, 1080

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode().strip())

script = [l.split("\t", 1) for l in (HERE / "audio/vo/script.tsv").read_text().strip().splitlines()]

# id, footage, heading (number, title), camera keys [(clip_t, scale, focus_x, focus_y)] in 1920x1080 footage px
SCENES = {
    "01_open":    dict(clip="hero",    head=None, cam=[(0, 1.0, 960, 540), (2.0, 1.18, 900, 560)]),
    "02_pick":    dict(clip="pick",    head=("01", "Pick a claim"), cam=[(0, 1.0, 960, 540), (1.6, 1.75, 300, 280), (5.9, 1.0, 960, 540)]),
    "03_claim":   dict(clip="claim",   head=("02", "Claim information"), cam=[(0, 1.0, 960, 540), (1.2, 1.9, 220, 560)]),
    "04_find":    dict(clip="find",    head=("03", "Find the right home"), cam=[(0, 1.0, 960, 540), (0.6, 1.7, 260, 260), (7.4, 1.0, 960, 540)]),
    "05_colours": dict(clip="colours", head=("04", "Every pin has a colour"), cam=[(0, 1.0, 960, 540), (0.8, 1.9, 640, 1010), (5.6, 1.3, 860, 520)]),
    "06_status":  dict(clip="status",  head=("05", "Live status"), cam=[(0, 1.0, 960, 540), (0.6, 1.9, 220, 640)]),
    "07_fit":     dict(clip="fit",     head=("06", "Fit and cost"), cam=[(0, 1.0, 960, 540), (2.4, 1.55, 1680, 520)]),
    "08_call":    dict(clip="call",    head=("07", "Call or text"), cam=[(0, 1.6, 1680, 560), (0.8, 2.0, 1700, 640)]),
    "09_log":     dict(clip="log",     head=("08", "Calls log themselves"), cam=[(0, 1.7, 1680, 260), (2.6, 1.6, 1680, 700)]),
    "10_said":    dict(clip="said",    head=("09", "Owner said"), cam=[(0, 1.6, 1680, 620), (4.2, 1.55, 1680, 560)]),
    "11_edit":    dict(clip="edit",    head=("10", "Save to Monday"), cam=[(0, 1.6, 1680, 760), (2.4, 1.6, 1680, 300)]),
    "12_add":     dict(clip="add",     head=("11", "Add to claim"), cam=[(0, 1.0, 960, 540), (0.6, 1.7, 1680, 940)]),
    "13_send":    dict(clip="send",    head=("12", "Send summary"), cam=[(0, 1.0, 960, 540), (2.0, 1.45, 1500, 540)]),
    "14_phone":   dict(clip=None,      head=None, cam=[]),
    "15_close":   dict(clip="hero",    head=None, cam=[(0, 1.12, 900, 560), (3.0, 1.0, 960, 540)]),
}

FONTS = """
@font-face { font-family: "Geist"; src: url("assets/fonts/geist.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Geist Mono"; src: url("assets/fonts/geist-mono.woff2") format("woff2"); font-weight: 100 900; font-display: block; }"""

# ---------- timing ----------
lines = []
t = LEAD
for lid, text in script:
    d = dur(HERE / f"audio/vo/{lid}.wav")
    lines.append(dict(id=lid, text=text, start=round(t, 3), vo=d))
    t += d + GAP
total = round(lines[-1]["start"] + lines[-1]["vo"] + TAIL, 2)
for i, l in enumerate(lines):
    s0 = 0 if i == 0 else l["start"] - GAP / 2
    s1 = total if i == len(lines) - 1 else lines[i + 1]["start"] - GAP / 2
    l["s0"], l["s1"] = round(s0, 3), round(s1, 3)

def cam_js(sel, keys, rate):
    def xy(s, fx, fy):
        x = min(0, max(W - W * s, W / 2 - fx * s))
        y = min(0, max(H - H * s, H / 2 - fy * s))
        return round(x, 1), round(y, 1)
    out = []
    if not keys:
        return ""
    s, fx, fy = keys[0][1:]
    x, y = xy(s, fx, fy)
    out.append(f'tl.set("{sel}", {{ scale: {s}, x: {x}, y: {y}, transformOrigin: "0 0" }}, 0);')
    for (ct, s, fx, fy) in keys[1:]:
        x, y = xy(s, fx, fy)
        st = round(ct / rate, 3)
        out.append(f'tl.to("{sel}", {{ scale: {s}, x: {x}, y: {y}, duration: 0.9, ease: "power2.inOut" }}, {st});')
    return "\n    ".join(out)

HEAD_CSS = """
  .head { position: absolute; left: 192px; top: 108px; }
  .head.right { left: auto; right: 192px; }
  .head-in { display: flex; align-items: baseline; gap: 22px; padding: 22px 34px 24px 30px; background: #ffffff; border: 1px solid #eaeaea;
    border-radius: 18px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.14); }
  .head-num { font-family: "Geist Mono", monospace; font-size: 34px; font-weight: 600; color: #c17d0a; letter-spacing: 0; }
  .head-t { font-size: 60px; font-weight: 700; letter-spacing: -0.02em; color: #171717; line-height: 1; }"""

def head_html(sid, head, cam):
    if not head:
        return ""
    n, title = head
    # The heading sits on the side the camera is not pushing into.
    side = " right" if len(cam) > 1 and cam[1][2] < 960 else ""
    return f'''<div id="{sid}-head" class="clip head{side}" data-start="0.25" data-duration="2.9"><div class="head-in"><span class="head-num">{n}</span><span class="head-t">{title}</span></div></div>'''

def head_js(sid, head):
    if not head:
        return ""
    return (f'tl.fromTo("#{sid}-head .head-in", {{ opacity: 0, x: -40 }}, {{ opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }}, 0.25);\n'
            f'    tl.to("#{sid}-head .head-in", {{ opacity: 0, duration: 0.3, ease: "power2.in" }}, 2.8);')

(HERE / "compositions").mkdir(exist_ok=True)
hosts = []
for i, l in enumerate(lines):
    sid = "s" + l["id"][:2]
    cfg = SCENES[l["id"]]
    D = round(l["s1"] - l["s0"], 3)
    extra_css, extra_html, extra_js = "", "", ""
    if cfg["clip"]:
        src = HERE / f"assets/clips/{cfg['clip']}.mp4"
        L = dur(src)
        media_start = 0.0
        if l["id"] == "15_close":
            media_start = 2.0
        rate = round(min(1.6, max(0.55, (L - media_start - 0.05) / D)), 3)
        body = f'''<div id="{sid}-cam" class="cam"><video id="{sid}-vid" class="clip" data-start="0" data-duration="{D}" data-media-start="{media_start}" data-playback-rate="{rate}" src="assets/clips/{cfg['clip']}.mp4" muted playsinline></video></div>'''
        cam = cam_js(f"#{sid}-cam", cfg["cam"], rate)
    else:
        rate, body, cam = 1, "", ""
    if l["id"] == "01_open":
        extra_css = """
  .title { position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; }
  .title-in { padding: 40px 72px 46px; background: #ffffff; border: 1px solid #eaeaea; border-radius: 28px; box-shadow: 0 24px 64px rgba(0,0,0,.16); text-align: center; }
  .title-k { font-size: 30px; font-weight: 600; color: #666666; letter-spacing: 0.02em; margin-bottom: 10px; }
  .title-t { font-size: 128px; font-weight: 700; letter-spacing: -0.035em; color: #171717; line-height: 1; }
  .title-t b { color: #f5a623; font-weight: 700; }"""
        tstart = round(lines[0]["vo"] - 2.5 + LEAD, 2)
        extra_html = f'''<div id="{sid}-title" class="clip title" data-start="{tstart}" data-duration="{round(D - tstart, 3)}"><div class="title-in"><div class="title-k">Nova Havens</div><div class="title-t">Property Map</div></div></div>'''
        extra_js = f'tl.fromTo("#{sid}-title .title-in", {{ opacity: 0, scale: 0.94 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }}, {tstart});'
    if l["id"] == "14_phone":
        extra_css = """
  .phones { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 96px; }
  .phone { width: 410px; height: 888px; border-radius: 56px; background: #171717; padding: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.22); }
  .phone img { width: 100%; height: 100%; object-fit: cover; border-radius: 44px; display: block; }"""
        extra_html = f'''<div id="{sid}-phones" class="clip phones" data-start="0" data-duration="{D}"><div class="phone" id="{sid}-p1"><img src="assets/clips/phone-light-map.png" alt=""></div><div class="phone" id="{sid}-p2"><img src="assets/clips/phone-dark-map.png" alt=""></div></div>'''
        extra_js = (f'tl.fromTo("#{sid}-p1", {{ y: 1100 }}, {{ y: 0, duration: 0.8, ease: "power3.out" }}, 0);\n'
                    f'    tl.fromTo("#{sid}-p2", {{ y: 1100 }}, {{ y: 0, duration: 0.8, ease: "power3.out" }}, 0.15);')
    if l["id"] == "15_close":
        extra_css = """
  .end { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .end-in { padding: 52px 84px 56px; background: #ffffff; border: 1px solid #eaeaea; border-radius: 28px; box-shadow: 0 24px 64px rgba(0,0,0,.16); text-align: center; }
  .end-verbs { font-size: 84px; font-weight: 700; letter-spacing: -0.03em; color: #171717; line-height: 1.05; }
  .end-verbs i { font-style: normal; color: #f5a623; padding: 0 14px; }
  .end-url { margin-top: 26px; font-family: "Geist Mono", monospace; font-size: 36px; color: #666666; }"""
        extra_html = f'''<div id="{sid}-end" class="clip end" data-start="0.3" data-duration="{round(D - 0.3, 3)}"><div class="end-in"><div class="end-verbs" id="{sid}-verbs"><span>Pick</span><i>·</i><span>Find</span><i>·</i><span>Call</span><i>·</i><span>Add</span><i>·</i><span>Send</span></div><div class="end-url" id="{sid}-url">nova-havens-map.vercel.app</div></div></div>'''
        extra_js = (f'tl.fromTo("#{sid}-end .end-in", {{ opacity: 0, scale: 0.95 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }}, 0.3);\n'
                    f'    tl.fromTo("#{sid}-verbs span", {{ opacity: 0.18 }}, {{ opacity: 1, duration: 0.25, stagger: 0.55, ease: "power2.out" }}, 0.5);\n'
                    f'    tl.fromTo("#{sid}-url", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.5 }}, 3.4);')
    html = f'''<template>
  <style>{FONTS}
  #root {{ position: absolute; inset: 0; overflow: hidden; background: #fafafa; font-family: "Geist", sans-serif; color: #171717; }}
  .cam {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; }}
  .cam video {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; object-fit: cover; }}{HEAD_CSS}{extra_css}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="{W}" data-height="{H}">
    {body}
    {extra_html}
    {head_html(sid, cfg["head"], cfg["cam"])}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {cam}
    {head_js(sid, cfg["head"])}
    {extra_js}
    tl.set({{}}, {{}}, {D});
    window.__timelines["{sid}"] = tl;
  </script>
</template>
'''
    (HERE / f"compositions/{sid}.html").write_text(html)
    hosts.append(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{l["s0"]}" data-duration="{D}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>')

# ---------- captions ----------
def words_for(l):
    tr = HERE / f"transcripts/{l['id']}.json"
    said = l["text"].split()
    timed = [w for w in json.loads(tr.read_text()) if w["text"].strip()] if tr.exists() else []
    if timed and len(timed) == len(said):
        return [dict(text=s, start=w["start"], end=w["end"]) for s, w in zip(said, timed)]
    # Counts differ (numbers, contractions): spread the spoken span by characters.
    a = timed[0]["start"] if timed else 0.15
    b = timed[-1]["end"] if timed else l["vo"] - 0.15
    n = sum(len(s) + 1 for s in said)
    out, c = [], 0
    for s in said:
        s0 = a + (b - a) * c / n
        c += len(s) + 1
        out.append(dict(text=s, start=s0, end=a + (b - a) * c / n))
    return out

groups = []
for l in lines:
    ws = words_for(l)
    cur = []
    for i, w in enumerate(ws):
        cur.append(w)
        nxt = ws[i + 1] if i + 1 < len(ws) else None
        if nxt is None or w["text"][-1] in ".,?!:" or len(cur) >= 6 or nxt["start"] - w["end"] > 0.2:
            groups.append(dict(start=l["start"] + cur[0]["start"], end=l["start"] + (nxt["start"] if nxt else w["end"] + 0.3),
                               words=[dict(t=x["text"], s=round(l["start"] + x["start"], 3)) for x in cur]))
            cur = []
merged = []
for g in groups:
    if merged and g["end"] - g["start"] < 0.5 and abs(merged[-1]["end"] - g["start"]) < 0.05 and len(merged[-1]["words"]) + len(g["words"]) <= 8:
        merged[-1]["words"] += g["words"]
        merged[-1]["end"] = g["end"]
    else:
        merged.append(g)
for g in merged:
    g["start"], g["end"] = round(g["start"] - 0.05, 3), round(g["end"], 3)

cap_html = []
for k, g in enumerate(merged):
    spans = "".join(f'<span class="w" id="cw{k}_{j}">{w["t"]}</span> ' for j, w in enumerate(g["words"]))
    cap_html.append(f'<div id="cg{k}" class="cg"><div class="cg-in">{spans.strip()}</div></div>')
cap_js = []
for k, g in enumerate(merged):
    cap_js.append(f'tl.set("#cg{k}", {{ opacity: 1, visibility: "visible" }}, {g["start"]}); tl.set("#cg{k}", {{ opacity: 0, visibility: "hidden" }}, {g["end"]});')
    for j, w in enumerate(g["words"]):
        cap_js.append(f'tl.fromTo("#cw{k}_{j}", {{ color: "rgba(255,255,255,0.55)" }}, {{ color: "#ffffff", duration: 0.12 }}, {w["s"]});')
(HERE / "compositions/captions.html").write_text(f'''<template>
  <style>{FONTS}
  #root {{ position: absolute; inset: 0; font-family: "Geist", sans-serif; }}
  .cg {{ position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; opacity: 0; visibility: hidden; }}
  .cg-in {{ display: inline-block; max-width: 1500px; padding: 14px 30px 16px; border-radius: 16px; background: rgba(23, 23, 23, 0.86);
    font-size: 44px; font-weight: 500; line-height: 1.25; letter-spacing: -0.01em; color: rgba(255,255,255,0.55); }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
    {chr(10).join("    " + c for c in cap_html)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {chr(10).join("    " + c for c in cap_js)}
    tl.set({{}}, {{}}, {total});
    window.__timelines["captions"] = tl;
  </script>
</template>
''')

# ---------- root ----------
vo = "\n".join(f'      <audio id="vo{l["id"][:2]}" class="clip" data-start="{l["start"]}" data-duration="{round(l["vo"], 3)}" data-track-index="3" data-volume="1" src="audio/vo/{l["id"]}.wav"></audio>' for l in lines)
MUSIC_IN = 8.0  # seconds into the track: its lift lands about 12 s into the film
(HERE / "index.html").write_text(f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <title>Property Map tutorial</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #fafafa; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; background: #fafafa; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">
{chr(10).join(hosts)}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{total}" data-track-index="2" data-track-kind="captions" data-width="{W}" data-height="{H}" style="z-index: 10"></div>
{vo}
      <audio id="music" class="clip" data-start="0" data-duration="{total}" data-media-start="{MUSIC_IN}" data-track-index="4" data-volume="0.16" data-fade-in="1.5" data-fade-out="3.5" src="audio/music/favorite.mp3"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
''')
print(f"built: {len(lines)} scenes, {len(merged)} caption groups, {total} s")
