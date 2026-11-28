# Beat 1 — review log

Every version is kept in its own folder (`v1/`, `v2/`, `v3/`): `beat01.mp4`, `review/` contact sheets, and `stills/` where made.
The 300 PNG frames per version are not in git (about 175 MB each); `node tools/render.js beat01 --video vN` rebuilds them
exactly, because every frame is a pure function of its number — but only from the code as it was at that version's commit.

## v1 (first full render)

**Self-review:** the fax machine's card was half in frame for the whole close-up; the ticker board and clock were sliced
by the top edge in the close-up and two-shot; the page covered Faxie's mouth; the last wide was small and empty.

**Fresh reviewer (no context): DON'T SEND.** Must fix: (1) trader's planted foot appears to skate in the two-shot walk;
(2) the shriek doesn't read. Should fix: fax half-in at the close-up's edge; ticker sliced; CONFIRM text runs off the page;
phone appears from nowhere in the close-up; trader barely acts in the opening wide; final wide shows the set's edges and
the pillar cuts the ticker. Nits: overlapping monitors, waves over a face, a colleague hidden, last shot holds one pose.

**Cause of the skating:** the world maths was right (the planted foot was fixed in the 3D world), but the two-shot camera
panned with the walk over a featureless floor, so on screen the foot drifted; a smaller part came from each card turning
toward the camera's position as it moved.

## v2 → v3 fixes

- Walk: the two-shot camera is locked off; carpet tiles on the floor; cards now turn to lie parallel to the picture plane
  (not toward the camera's position), so a walker keeps one angle to the lens. New check measures the planted foot **on
  screen**: under 1.5 px per frame for every walking frame.
- Shriek: new `shriek` face in the rig (wide eyes, angry brows, screaming mouth), bigger and bolder sound waves, and a
  bouncing "SKREEEE!" sound word in the wide and two-shot (its own card, checked to stay in frame).
- Close-up: camera fixed and re-aimed so the fax is fully out of frame; the waves come in from the left edge as
  off-screen noise (their own card). New check: background characters fully in frame or fully out, never half.
- Ticker and clock moved above the windows. New check: wall signs fully in frame or fully out, never sliced.
- Phone: Bigsby holds it in his near hand in every shot (stares at it, shakes it, jumps with it, walks with it, cheers with it).
- Opening wide: Bigsby jabs keys and shakes his dead phone, gets cross, then flinches at the shriek.
- Page: comes out of the slot under the mouth; CONFIRM fits the page.
- Final wide: pulled back to a real wide with the ticker fully in; windows and desks extended so the room doesn't end;
  Bigsby cheers when the page lands (frame 284); trader 2 steps along her desk to look, so the traders aren't hidden.
- v2 was an intermediate render with some of these fixes; v3 has all of them.

**Self-review of v3:** passes every automated check (framing, signs, extras, foot slide, camera side, change spacing).
Remaining weak spot I can see: in the two-shot trader 2 is mostly behind trader 1 (background huddle).

## v3 — fresh reviewer (no context): DON'T SEND

Must fix: (1) the swinging foot slid ~200 px **backwards along the floor** before lifting (the planted foot was fine).
Should fix: (2) feet shuffle 10–15 px as the poses settle after the walk; (3) monitor stands poked through the screens
("CANNOT CO|NECT"); (4) the crawling ticker cut words mid-letter; (5) a colleague's raised hand floated beside a monitor;
(6) a stub of Bigsby's far hand stuck out at his shoulder when pointing. Nits: desk fronts overlapping in the close-up,
colleagues frozen in one pose, a colleague popping into view across the first cut.

**Cause of (1), confirmed by measuring both feet:** the walk cycle swung the legs by angle, and bending the knee at
lift-off dragged the foot back along the floor (180 px back, 10 px up). My v2 check only watched the planted foot.

## v4 fixes

- Walk rebuilt from **planned foot paths** (two-bone IK): relative to the hip the planted foot moves straight back along the floor (so in the room it stays put), the
  swinging foot lifts in an arc (about 43 px) and only ever moves forward. Two 30-frame cycles; body moved by walkTrack.
- New check: **any foot touching the floor must not move** on screen (both feet, every frame, all shots where visible).
- One standing stance for every grounded pose in the wide shot; Bigsby's legs change only while he's in the air or off
  screen; after the walk his legs stay exactly where they stopped.
- Monitor stands sit behind their screens; back-row desks no longer overlap.
- Ticker swaps two whole messages every 1.5 s (MARKET OPENS 09:00 / EMAIL: NOT CONNECTED) instead of crawling.
- Colleague 2 reacts with both arms up (no floating hand); both colleagues keep moving a little and cheer at the end.
- Bigsby points and cheers with his phone hand; the far arm hangs relaxed (no stub at the shoulder).
