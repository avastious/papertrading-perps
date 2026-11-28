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
