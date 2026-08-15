# Art Daily game starter

Copy this folder to start a new drill for [artdaily.sadeali.com](https://artdaily.sadeali.com/).
Zero build step, zero dependencies. It ships as a *working* demo game
(tap-the-bullseye) — replace the drill, keep the skeleton.

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
   the phone mid-round**, which must not lose the round. Lift the pure
   scoring functions into node and check the four cases the guide names:
   perfect ≥ 95, garbage ≤ 30, monotonic, degenerate → finite 0–100.
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

- the **first screen teaches the verb** — hint line + visible
  affordances, before anyone opens the how-to
- **nothing is punished for UI reasons**: stray taps and too-short
  strokes reset free, misplacements are undoable
- **no dead states** — do nothing · press done immediately · draw during
  a reveal · resize mid-item · press "new round" mid-round
- **reveal after every attempt**, truth over their attempt, delta named
- **44px touch targets**, pointerId-guarded strokes
- **AA contrast in both themes** for anything meaning-bearing on canvas
  (the watercolor accents are decorative-strength on paper — mix toward
  `--ink`, or define a `--canvas-accent` below the CSS marker)
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
- **Correctness scaffolding in `js/game.js`**: pure scoring functions at
  the top of the file, target geometry stored as canvas fractions so a
  rotation cannot lose the round, `report()` on exactly one path
- Shared studio chrome: HUD (round / score / best), hint line, dot-grid
  canvas, toast, buttons, "how to play" box — all theme-aware
- Standalone mode: backlink to artdaily, theme toggle, footer, Stage-0
  support links; embedded mode (`?embed=1`) sheds all of it
- Reduced-motion and keyboard-focus styles
