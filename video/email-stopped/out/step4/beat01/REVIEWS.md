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

## v4 — fresh reviewer (no context): DON'T SEND

Must fix: (1) Bigsby froze mid-stride after the walk (rear foot on tiptoe for 2.8 s); (2) the wall sign flipped back to
"MARKET OPENS", implying email was back. Should fix: (3) the planted shoe crept ~14 px over a step; (4) Bigsby's eyes
looked away from the fax; (5) a trouser leg showed through a gap between desks; (6) the pillar stopped short of the
ceiling in the final wide. Nits: colleague popping into view across the first cut; a lone fist in the two-shot;
the SKREE word popping in small at the cut.

**Cause of (3):** the ankle was locked, but the rig tilted the shoe with the shin, so heel and toe rolled along the
floor. My check measured the ankle, not the sole.

## v5 fixes

- Walk ends properly: the last stride lands and the back foot is brought up beside it (closing step), so he stands
  on both feet from frame 228; arms settle; legs then stay put.
- Shoes stay flat while walking (rig: new optional `shoeL`/`shoeR` tilt). Checks now measure the **heel and toe in
  the room** (not on screen, so camera moves don't count): a shoe on the floor may not move 0.5 px in a frame or creep
  1 px over a whole planted spell. The two-shot camera is square to the set.
- Eyelines: the rig's `look` is mirrored by `flip`; Bigsby and the turned colleagues now look screen-left, at the fax.
- Sign: once email goes down (frame 45) it stays "EMAIL: NOT CONNECTED", flashing.
- One continuous modesty panel along the back row; pillar runs to the ceiling; SKREE is full size after the cut.

## v5 — fresh reviewer (no context): DON'T SEND

Must fix: (1) Bigsby never looks at the fax (pupils point right). Should fix: (2) the woman hidden behind Bigsby's head in
the close-up and early two-shot; (3) cut 164→165 jumps from standing to mid-step; (4) the walk reads as a sidestep
because his face points at the camera. Nits: plant pot sliced by the close-up's bottom edge; a background monitor cut
at the right edge; the ending (printing, cheering) runs into beat 2's territory; CONFIRM small in the last wide.
Feet: the reviewer measured planted shoes locked to the pixel — rule 5 passes.

**Cause of (1): my own error.** After the v4 review said he looked away, I flipped the `look` sign without measuring.
Measured afterwards: with `flip`, `look = +1` already puts the pupils screen-left; v5's `-1` turned them right. The
offset (about 4 px) was also too small to read.

## v6 fixes

- Eyes: `look` +1.6 (stronger) toward the fax. Rig: new `turn` option slides the face across the head (3/4 view), so he
  faces the fax rather than the camera; he turns his head toward the noise at frame 150. New check measures pupil vs eye
  centre from the drawing for every frame after the shriek (and fails if the sign is wrong — tested).
- Walk starts on screen in the two-shot (frame 169) after a beat of standing, so the cut matches.
- Colleagues re-spaced (3.9 and 5.2) so neither hides behind Bigsby at rest; plant pot removed.
- v6 review: the fresh reviewer could not run (account spend limit reached). Not yet reviewed.

## v6 — self-review (fresh reviewer blocked by the account's spend limit)

Found: at the cut into the two-shot Bigsby stood on one foot (his ready stance was taken from mid-stride).

## v7 fixes

- The walk starts from a phase where both feet are on the floor (ready stance), steps off at frame 169, and still ends
  with feet together (frame 235). Walk tracking breaks ties (both feet down) by which foot stays down next frame.
- Entering the walk blends only the upper body; legs stay on their planned paths (no 0.6 px slip).
- Two-shot camera re-aimed (the longer walk moved the fax left). All automated checks pass.
- Fresh no-context review of v7 still to run once the limit resets (07:20 UTC).

## v7 — fresh reviewer (no context): DON'T SEND

Feet and eyelines now pass (reviewer measured: planted shoe within ±1 px; pupils toward the fax in every shot).
Must fix: (1) the woman colleague swapped sides of Bigsby across the first cut (she stepped along her desk behind
him in the wide). Should fix: (2) the phone read as a wristwatch during the walk (drawn above a hanging fist);
(3) everyone smiled into the lens for the first second although email was already down; (4) the woman hidden in
the two-shot. Nits: a colleague's pose jump at the cut; a monitor cut at the right edge; faint ground shadow;
a calm closed-eye blink in the middle of the shriek.

## v8 fixes

- Both colleagues sit on Bigsby's right for the whole clip (no move); back-row desks re-laid; Bigsby starts a little
  further left so the woman shows beside him in the opening wide.
- Before the shriek: Bigsby and the colleagues are worried and look at their phone/screens, not the lens.
- Walking, the phone hand is carried up in front (forearm raised), so the phone is held, not on the wrist.
- No blink during the shriek; ground shadow darker and wider.

## v8 — fresh reviewer (no context): DON'T SEND

Must fix: (1) after the startle hop Bigsby stayed 6 px in the air until the cut, over a dark shadow that read as a
blob under his shoes; (2)/(3) the reviewer read his pupils as pointing away from the fax in the wide and the walk.
Should fix: (4) crossed-leg stance at the cut into the two-shot, woman hidden behind his head; (5) final wide too
far back and high. Nits: "SKREEEE!" vs "SKREE!"; a slow first 1.5 s.

**On (2)/(3):** I cropped the frames at full size: the pupils were on the fax's side, but in the scared face they
were small (about 4 px) beside a white highlight, so at normal size they read the other way. Two reviewers made the
same reading, so it is a real readability fault even though the measured direction was right.

## v9 fixes

- New `worried` face in the rig (scared brows and mouth, full-size pupils); Bigsby uses it, with a stronger look.
- The flinch is a quick hop that lands at once (no hovering).
- Ready stance has the near foot forward (less leg-crossing); two-shot camera raised a little.
- Final wide pulled in (ticker still fully in frame); one spelling of the sound word.
- Colleagues swapped seats so the woman sits furthest right and stays visible; the hoodie colleague throws up his
  hands at his dead screen at frame 24 (an earlier change in the opening).

## v9 — fresh reviewer (no context): DON'T SEND

Passes now (reviewer measured): eyelines toward the fax in every shot, no foot slide or creep, screen sides hold.
Must fix: (1) the CONFIRM page slid down behind the table top at the end (hidden). Should fix: (2) overlapping
back-row monitors cut a label to "NOT CONNECT"; (3) colleagues jammed behind Bigsby's head in the opening wide.
Nits: a colleague's pose jump at the first cut; sound arcs drawn over Bigsby; the final wide looked tilted; the
celebration ending may run ahead of the script (the user's call).

## v10 fixes

- The page never hangs below the table top; at 285 a green tick stamps it instead of it dropping.
- Back-row monitors narrower so neighbours never overlap.
- Opening wide shot from further right, so the colleagues stand clear of Bigsby.
- Sound arcs always draw behind the characters; final wide camera points straight at the set (no tilt, no card turn).

## v10 — fresh reviewer (no context): **SEND**

No must-fix problems. Reviewer measured: cuts exact (89/90, 164/165, 254/255) in the right order; screen sides hold;
pupils toward the fax at every cut; planted shoes hold to within 1 px, no creep; something changes at least every 2 s.
Should fix: (1) two monitors doubled up at the right frame edge; (2) the green tick covered the M of CONFIRM;
(3) nothing in the close-up showed the fax was still shrieking. Nits: a colleague briefly behind Bigsby's head at the
start of the two-shot; pupils up-left during the recoil; colleagues' heads overlapping at the end; a crouched walk.

## v11 (final picture for approval) fixes

- Far-right monitors removed (no sliced or doubled screens at the frame edge).
- Tick moved beside the word: "CONFIRM ✓".
- Close-up: the shriek's arcs keep coming in from off-screen left (own effect card, close-up only).
- Self-check of v11: all automated checks pass; cut frames reviewed.

## v11 — approved by the user, with one change: end beat 1 on the shriek

## v12 changes (ending)

- No page, no tick, no cheering (the confirmation belongs to beat 2).
- Faxie shrieks to the end and gets louder from frame 196 (bigger hops, strobing light).
- Bigsby leans in (224), then the shriek hits him: hands clamped over his ears, wincing (238 →).
- The colleagues cover their ears too (268, 272); the sound word grows to "SKREEEEEE!!" at the peak (282) and is
  checked to stay in frame in the final wide.

## v12 — fresh reviewer (no context): **SEND**

No must-fix problems; cuts, sides, eyelines, framing, pacing all pass; no foot slides. Should fix: (1) the walk read
as a step-together shuffle — the far foot landed ~10 px beside the near one instead of passing it. Nits: a one-frame
gap with no visible planted foot (f181), heads overlapping at the start of the two-shot, the fax's hand near
Bigsby's elbow, a pale square behind the wall clock, dust dots outside the fax outline, hands on heads rather than
literally on ears.

**Cause of (1):** each foot's path was planned from its own hip, and the hips sit a hip-width apart; in this side
view that put every far-foot landing a hip-width short.

## v13 fixes

- Foot paths planned from the body's centre line (each leg still reaches from its own hip): footfalls now alternate
  evenly about 95 px apart (measured R 1299 → L 1205 → R 1101 → L 1007 → R 903, then feet together).
- Clock drawn on a transparent panel (no pale square).
