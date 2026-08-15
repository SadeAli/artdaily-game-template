# Art Daily game starter

Copy this folder to start a new drill for [artdaily.sadeali.com](https://artdaily.sadeali.com/).
Zero build step, zero dependencies. It ships as a *working* demo game
(tap-the-centre-dot, with a reveal after every tap) — replace the drill,
keep the skeleton.

Design + protocol details live in the artdaily repo's `GAME_GUIDE.md`;
this file is just the checklist.

## Launch checklist

1. **Copy** this folder to `../<slug>/` and `git init` it — every game is
   its own repo, named `artdaily-<slug>`.
2. **Rename**: grep-replace `GAME_NAME`, `GAME_TAGLINE` and `game-slug`
   (title/meta/canonical, term-bar, HUD, `man` line, and `SLUG` in
   `js/game.js`). Pick the emoji favicon and `--game-accent` in
   `css/style.css` (use the accent you'll give its registry card).
3. **Build the drill** in `js/game.js`: one canvas, rounds of ~30–60
   seconds, every finished drill ends in `ArtDaily.report(score0to100)`.
   Never edit `js/artdaily-sdk.js` — it's a vendored copy of the
   protocol (canonical copy: artdaily repo `sdk/`).
4. **Verify**: `node --check js/game.js`, then
   `python3 -m http.server 8080` — play it standalone, then embedded
   (open the artdaily page locally; its registry `dev` path points at
   your folder). Check dark + light, mobile width, touch — and **rotate
   the phone mid-round**, which must not lose the round. Then **tab
   through it**: every stop a control you can operate, in reading order,
   focus ring visible on both sheets. Lift the pure scoring functions into
   node and check the four cases the guide names: perfect ≥ 95, garbage
   ≤ 30, monotonic, degenerate → finite 0–100.
5. **Repo**: create `github.com/SadeAli/artdaily-<slug>` (public), push
   `main`; Settings → Pages → deploy `main` / root. The game is now live
   at `https://sadeali.github.io/artdaily-<slug>/`.
6. **Register it**: add one entry to `js/registry.js` in the artdaily
   repo (slug, name, tagline, icon, accent, skills, minutes, url, dev,
   plus `cat` for its chapter and `tag` for how it's scored).
   Push — the Art Daily page now lists, embeds and scores your game.

## Before you call it done

The bar every shipped drill is held to (the long version, with the
reasoning, is in the artdaily repo's `GAME_GUIDE.md`):

Open it cold, the way a beginner does, and answer the four
first-thirty-seconds questions before anything else:

- does the **first screen teach the verb** — hint line + visible
  affordances, before anyone opens the how-to?
- is the **first item genuinely easy** (an easier item, not kinder
  scoring — random placement will eventually open a round in a corner)?
- is any **word jargon** the drill does not teach on the spot?
- is the **first reveal a lesson or just a number**? And does round one
  say what the score is *for*, instead of "new best!" — which is
  trivially true on it, so branch on `report().isFirst`

Then the rest of the bar:

- **nothing is punished for UI reasons**: stray taps and too-short
  strokes reset free, misplacements are undoable, a tap that lands
  while a reveal holds the screen is ignored rather than scored, and a
  press that does not mean "here" — right-click, middle-click, a pen's
  barrel button — is ignored too (`if (ev.button > 0) return;`, which
  costs a finger and a pen tip nothing since both report `button` 0)
- **no dead states** — do nothing · press done immediately · draw during
  a reveal · resize mid-item · press "new round" mid-round
- **reveal after every attempt**, truth over their attempt, delta named
  in words — including the last attempt of the round, whose correction
  the round-end score must not wipe out
- **the scale is drawn too**, faintly, in the reveal: the ring you aim at
  is *not* the ring the score is measured on (`startRadius` vs `ease`
  rank the hardware in opposite orders), so without it a 62 has nothing
  on screen to be read against
- **the round names its own habit** when there is one — five misses that
  all lean the same way are one mistake, and saying "aim high and left
  next round" is the only correction that outlives the round
- **44px touch targets**, pointerId-guarded strokes
- **the loop feels listened to**: full-rate samples (`ArtDaily.samples`),
  one repaint per frame, no `getComputedStyle` inside the repaint, nothing
  animated from JS that ignores `prefers-reduced-motion`
- **3:1 in both themes** for anything meaning-bearing on canvas — including
  anything you drew at a low `globalAlpha`, because alpha is contrast (the
  demo's "faint" zero-ring was 1.74:1 on paper until it wasn't). The
  watercolor accents are decorative-strength on paper: on the light sheet
  the raw palette measures 1.97–3.48:1, so meaning goes in `--canvas-accent`
  (defined below the CSS marker), never in the raw `--game-accent` wash
- **one live region — the hint line.** Two of them written in the same tick
  queue up and say the same thing twice; the toast is a sticker
  (`aria-hidden`), not a second voice
- **the canvas's `aria-label` is the picture, kept current** by
  `describeSheet()` in `js/game.js` — a name set once in the HTML describes
  a blank rectangle for the whole session
- **no `tabindex` on a canvas you cannot play with the keyboard**, and no
  keyboard drill without the `tabindex` — a tab stop that focuses a picture
  and does nothing reads as a broken control. Tab the whole drill before you
  ship: every stop a control, in reading order, ring visible on both sheets
- **draw, don't tap**, unless the lesson really is a decomposition or a
  judgement call

## What's wired in already

- `js/artdaily-sdk.js` — embed detection, theme sync with the parent
  page, `?theme=` no-flash boot, personal-best storage, score reporting
- **Hardware fairness**: the SDK detects pen / mouse / touch silently and
  fills the `#inputMode` HUD chip. Take tolerances from
  `ArtDaily.ease(BASE)` and aim-at sizes from `ArtDaily.startRadius(BASE)`
  — both from your own base constant, never one fed into the other
  (`js/game.js` shows the pattern and why)
- **Full-rate sampling for strokes**: `ArtDaily.samples(ev)` returns every
  position a `pointermove` actually carried, not just the one the browser
  got round to dispatching. A pen samples far faster than the screen
  repaints, and a drill that scores geometry off the delivered events
  alone loses the corner of every fast stroke — so a confident line scores
  worse than a timid one. Total: always an array, `[ev]` where the browser
  cannot coalesce
- **A loop that stays out of the way**: inks are resolved once per theme
  instead of once per repaint (a repaint follows a text change, so each
  one was flushing a style recalculation), and both resize sources are
  coalesced into one measure + one repaint per frame — a 40-event resize
  drag costs 1 canvas reallocation, not 40. A drill that draws strokes
  should route its repaints through `requestAnimationFrame` the same way;
  sample at full rate, paint once a frame
- **Correctness scaffolding in `js/game.js`**: pure scoring functions at
  the top of the file, target geometry stored as canvas fractions so a
  rotation cannot lose the round, `report()` on exactly one path
- **A worked reveal**: after every tap the demo holds the ring, draws the
  truth, your mark, the gap between them and — faintly — the ring where
  the score reaches zero (stored *with* the reveal, so plugging a pen in
  while it is up cannot redraw the scale at half its size under a number
  measured on the old one), then names the miss in plain words ("a little
  high and left") from a pure function graded against the same tolerance
  as the score, with its bands cut where the score changes character so
  the adjective never oversells the number. At round end a second pure
  function names the round's *habit* if the misses leaned one way, and
  says which way to aim next time. The target is stored as canvas
  fractions but the mark as the **pixel offset that was scored**, so
  rotating the phone while the reveal is up cannot redraw a 26px miss as a
  5px one and contradict the 61 printed under it. Replace the geometry, keep the shape —
  reveal marks read `--canvas-accent` (defined below the CSS marker), not
  the raw `--game-accent` wash, so they stay legible on paper
- Shared studio chrome: HUD (round / score / best), hint line, dot-grid
  canvas, toast, buttons, "how to play" box — all theme-aware
- Standalone mode: backlink to artdaily, theme toggle, footer, Stage-0
  support links; embedded mode (`?embed=1`) sheds all of it. The SDK's
  score hand-off bar keeps its link node across rounds, so a keyboard
  player who tabbed onto it does not lose focus when a round ends
- Reduced-motion and keyboard-focus styles (3px `--focus` ring, 3.9:1 on
  paper / 6.6:1 in the night studio), one live region, and decorative
  glyphs (`→ ✓ ↻`) hidden from screen readers rather than read out
