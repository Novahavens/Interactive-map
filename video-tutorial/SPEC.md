# SPEC: Property Map tutorial

GOAL:    a new searcher (or a stakeholder) can name every function on the map, and knows which jobs it now does for them.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps.
TIME:    ~140 s x 30 = ~4200 frames. Voice is the clock (15 lines, Kokoro af_heart at 0.9 speed, 0.9 s between lines).
LOOK:    the app's own canvas. Ground #fafafa, surface #ffffff, hairline #eaeaea, ink #171717, muted #666666.
         One accent: loss amber #f5a623, only on the highlighted caption word, the heading's step number and the end card.
         Display: Geist 700, headings 64 px, tracking -2%. Body: Geist 500 40 px captions. Numbers: Geist Mono.
         Medium: real product UI, recorded at 2x (3200 x 1800) so a 2x punch-in stays sharp.
         Depth: heading cards and the phone frames sit on 1 px #eaeaea with a 0 18 48 rgba(0,0,0,.14) shadow. No grain, no vignette.
OBJECTS: the map with its green / yellow / red pins and the amber loss pin; the property panel; the owner's phone number with Call and Text;
         the Owner said card; the Edit form; the summary email; two phones.
MOTION:  camera (punch-in): power2.inOut, 0.9 s, scale 1.0-2.0, origin clamped so the frame never shows past the footage.
         heading enter: x -40 -> 0 + opacity, 0.45 s power3.out; exit opacity 0.3 s power2.in. Captions: words light up as spoken.
SHOTS:   one scene per line of the script (audio/vo/script.tsv), each its own sub-composition:
         open (hero map, slow push to the loss pin, title "Property Map" on the line's last phrase) ->
         pick (Ctrl K, drawer, search, pick: punch into the drawer) -> claim (punch into the claim card) ->
         find (radius + filters, then hover a row: its pin grows) -> colours (legend, then the pins) ->
         status (list chips) -> fit (panel: fit checks, move-in total) -> call (Call / Text) ->
         log (Last contact Oct 29, contact history: Will's call) -> said (Owner said card, Update Monday, the form) ->
         edit (Save -> "Saved to Monday", rent $2,400) -> add (Add to claim -> on this claim) ->
         send (summary preview, Email) -> phone (two phones, light and dark) -> close (map, the five verbs, the address).
         Each scene opens with a heading card (step number + function name) top-left inside title-safe for ~2.4 s.
BANNED:  dark void grounds, glow, gradients, glass; bullet slides, three cards in a row; the logo docked in a corner;
         every element fading and sliding up; text moving while read; invented numbers (time saved is told as before/after only).
QA:      0 s (thumbnail: the map with pins and the title line), each scene's punch-in at its peak, the Owner said form,
         "Saved to Monday", the end card. Captions never cover the part of the UI being shown.
