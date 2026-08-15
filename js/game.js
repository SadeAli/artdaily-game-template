/* ============================================================
   game.js — the drill itself. This template ships a tiny working
   demo (tap five targets dead centre) so you can play the pattern
   before replacing it: keep the skeleton — init → round → input →
   REVEAL → score → ArtDaily.report — and swap in your drill's
   geometry. Everything draws on one theme-aware canvas; no libraries.

   The reveal is part of the skeleton, not decoration. A drill that
   answers an attempt with only a number teaches nothing in the first
   thirty seconds, which is the only thirty seconds a beginner gives
   it: they cannot tell 58 from 72 by feel yet, and nothing on screen
   tells them which way to move. So after EVERY item this demo draws
   the truth over the attempt with the gap between them, and names the
   miss in words. Replace the geometry, keep that.
   ============================================================ */
(function () {
  'use strict';

  var SLUG = 'game-slug'; /* TODO: your slug (matches the registry entry) */
  var TARGETS_PER_ROUND = 5;

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var hint = document.getElementById('hint');
  var toast = document.getElementById('toast');
  var hudRound = document.getElementById('hudRound');
  var hudScore = document.getElementById('hudScore');
  var hudBest = document.getElementById('hudBest');

  ArtDaily.init({ slug: SLUG });

  /* ============================================================
     SCORING — pure functions, kept at the top of the file so they can
     be lifted straight into node and hammered with degenerate input.
     Every drill in the arcade follows this shape. Two rules they must
     hold, whatever you replace them with:
       · finite 0–100 for ANY input — empty arrays, zero sizes, NaN,
         collinear points. Never NaN, never a throw. A NaN loses every
         comparison it touches, so one leaks silently through the whole
         round and lands as a bare 0 the player cannot explain.
       · monotonic in the error: more wrong can never score higher.
     ============================================================ */

  /* 100 dead-centre, 0 at `zero` px out or beyond. `zero` comes from
     ArtDaily.ease(), never from a raw constant — see the hardware note
     in GAME_GUIDE.md. */
  function tapAccuracy(dist, zero) {
    if (!isFinite(dist) || !isFinite(zero) || zero <= 0) return 0;
    return Math.max(0, Math.min(100, (1 - Math.abs(dist) / zero) * 100));
  }

  /* Mean of the round's taps. A round that somehow ends with nothing
     recorded scores 0 rather than 0/0 = NaN. */
  function roundScore(accuracies) {
    if (!accuracies || !accuracies.length) return 0;
    var sum = 0;
    for (var i = 0; i < accuracies.length; i++) {
      var a = Number(accuracies[i]);
      sum += isFinite(a) ? Math.max(0, Math.min(100, a)) : 0;
    }
    return sum / accuracies.length;
  }

  /* ---- the reveal, in words (pure too, and held to the same bar) ----
     A bare number teaches nothing on the round that matters most. A
     beginner who reads "58" only learns what 58 feels like after twenty
     rounds; "a little low and right" is a correction they can make on the
     very next tap. Every drill owes its player this — see the UX bar in
     GAME_GUIDE.md. Canvas y grows downward, so a negative dy is HIGH. */
  function missDirection(dx, dy) {
    var x = Number(dx), y = Number(dy);
    if (!isFinite(x) || !isFinite(y)) return '';
    var ax = Math.abs(x), ay = Math.abs(y);
    if (ax === 0 && ay === 0) return '';
    var v = y < 0 ? 'high' : 'low';
    var h = x < 0 ? 'left' : 'right';
    if (ay > ax * 2.5) return v;
    if (ax > ay * 2.5) return h;
    return v + ' and ' + h;
  }

  /* Graded against the SAME zero-point the score uses, so the words and
     the number can never disagree: "dead centre" next to a 40 would read
     as the drill being broken. Total — NaN, a zero tolerance and a
     zero-length miss all come back a usable sentence. */
  function missPhrase(dx, dy, zero) {
    var d = Math.hypot(Number(dx), Number(dy));
    if (!isFinite(d)) return 'Off the mark';
    var z = (isFinite(zero) && zero > 0) ? zero : 1;
    var dir = missDirection(dx, dy);
    /* Cut the bands where the SCORE changes character, not at tidy fractions
       of the tolerance. The adjective is printed in the same sentence as the
       number — "A hair low — 71 out of 100" reads as the drill lying to you,
       and a player who is told they were a hair off stops correcting. The
       score here is 100 - 100*d/z, so these edges are, as scores:
         92+ dead centre · 75+ a hair · 50+ a little · 20+ well · under 20 way out. */
    if (d <= z * 0.08) return 'Dead centre';
    if (d >= z * 0.8) return dir ? 'Way out, ' + dir : 'Way out';
    var much = d <= z * 0.25 ? 'A hair' : d <= z * 0.5 ? 'A little' : 'Well';
    return dir ? much + ' ' + dir : much + ' out';
  }

  /* ---- the round's lesson, which no single attempt can show ----
     Five taps that all land low and right are not five random misses, they
     are one habit, and naming it is the only correction that outlives the
     round: per-item words fix the next tap, this fixes the next round. Fires
     only on a lean that is BOTH consistent (most attempts on the same side)
     and big enough to be worth aiming off (a tenth of the tolerance), so it
     can never invent a pattern out of noise. Pure and total: junk offsets, a
     short round and a zero tolerance all come back a string — '' meaning
     "there is nothing honest to say", which the caller must treat as silence
     rather than print. */
  function roundBias(marks, zero) {
    if (!marks || !marks.length) return '';
    var z = (isFinite(zero) && zero > 0) ? zero : 1;
    var n = 0, sx = 0, sy = 0, left = 0, right = 0, high = 0, low = 0;
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (!m) continue;
      var x = Number(m.dx), y = Number(m.dy);
      if (!isFinite(x) || !isFinite(y)) continue;
      n++; sx += x; sy += y;
      if (x < 0) left++; else if (x > 0) right++;
      if (y < 0) high++; else if (y > 0) low++;   /* canvas y grows downward */
    }
    if (n < 3) return '';           /* too few attempts to call anything a habit */
    var mx = sx / n, my = sy / n;
    var most = Math.max(2, Math.ceil(n * 0.6));
    /* The count must be on the SAME side as the mean, or two wild misses one
       way outvote three small ones the other and the sentence points backwards. */
    var h = (Math.abs(mx) >= z * 0.1 && (mx < 0 ? left : right) >= most) ? (mx < 0 ? 'left' : 'right') : '';
    var v = (Math.abs(my) >= z * 0.1 && (my < 0 ? high : low) >= most) ? (my < 0 ? 'high' : 'low') : '';
    if (!h && !v) return '';
    var was = (v && h) ? v + ' and ' + h : (v || h);
    var fv = v === 'high' ? 'low' : v === 'low' ? 'high' : '';
    var fh = h === 'left' ? 'right' : h === 'right' ? 'left' : '';
    var fix = (fv && fh) ? fv + ' and ' + fh : (fv || fh);
    return 'Most taps landed ' + was + ' — aim ' + fix + ' next round.';
  }

  /* ---- where a target sits, in words (pure, total) ----
     Only the canvas knows where the target is, and a canvas is a blank to
     anyone who cannot see it. This feeds the sheet's accessible name — see
     describeSheet(). Junk fractions come back a usable phrase, never NaN. */
  function sheetZone(fx, fy) {
    var x = Number(fx), y = Number(fy);
    if (!isFinite(x) || !isFinite(y)) return 'the middle of the sheet';
    var h = x < 0.34 ? 'left' : x > 0.66 ? 'right' : '';
    var v = y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : '';
    if (!h && !v) return 'the middle of the sheet';
    return 'the ' + (v && h ? v + ' ' + h : v || h) + ' of the sheet';
  }

  /* ---- theme-aware inks (read once per THEME, not once per repaint) ----
     `accent` is the decorative wash — a tint, a fill, a flourish. `mark` is
     the same accent mixed toward --ink, and it is what ANYTHING CARRYING
     MEANING on the canvas must be drawn in: the watercolour accents are
     decorative-strength on light paper, and a shape a player cannot see is
     not a shape. Measured on the light sheet, raw --game-accent lands at
     2.9:1 for the template's mint, 3.0 for coral, 2.9 for bubblegum and
     1.97 for sunny — under the 3:1 a graphic that carries information owes.
     Mixed toward --ink, the whole palette clears it with room (worst 5.3).
     Defined as --canvas-accent below the marker in css/style.css.

     Every one of these is a custom property on :root and the ONLY thing
     that moves them is the data-theme attribute — so a read per theme is
     the same answer as a read per repaint, minus the cost.
     getComputedStyle().getPropertyValue() cannot answer until style has
     been resolved, and draw() is called from the input handler directly
     after the hint line's text changed, so each repaint flushed a style
     recalculation to fetch four values that had not moved since boot. A
     tap drill pays that once per tap; a drawing drill built on this
     skeleton pays it on every pointer sample, in the middle of the
     stroke, which is exactly where a player feels the hand stop being
     listened to. An empty read (stylesheet not parsed yet on a cold
     boot) is never cached, so the next repaint still corrects it. */
  var inkCache = null, inkTheme = '';
  function inks() {
    var t = ArtDaily.theme();
    if (inkCache && inkTheme === t) return inkCache;
    var cs = getComputedStyle(document.documentElement);
    var accent = cs.getPropertyValue('--game-accent').trim() || cs.getPropertyValue('--mint').trim();
    var c = {
      ink: cs.getPropertyValue('--ink').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      accent: accent,
      mark: cs.getPropertyValue('--canvas-accent').trim() || accent,
    };
    if (c.ink && c.muted && accent) { inkCache = c; inkTheme = t; }
    return c;
  }

  /* ---- crisp canvas at any devicePixelRatio; height tracks width ---- */
  var W = 0, H = 0, lastDpr = 0;
  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var dpr = window.devicePixelRatio || 1;
    if (w === W && dpr === lastDpr) return false;   /* mobile URL-bar resizes fire constantly */
    W = w;
    H = Math.max(1, Math.round(W * 0.62));
    lastDpr = dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /* ---- round state ----
     The target is stored as FRACTIONS of the canvas, not pixels. Rotate a
     phone mid-round and the canvas can go 900px → 390px wide; a target
     remembered at x=826 was then off the new canvas, impossible to tap,
     and the round could never finish — a dead round that never reported.
     Fractions survive any resize, so every round stays finishable. */
  var round = 0, targetIdx = 0, accuracies = [], target = null, playing = false;
  /* Every tap's scored offset, kept for the round-end bias line. The score
     only needs the accuracies; the LESSON needs to know which way each miss
     went, and that is gone once a distance has been collapsed to a number. */
  var marks = [];

  /* The last tap, held on screen over the target it was judged against —
     the reveal. The target keeps its fractions; the MARK is kept as the
     pixel offset that was actually scored (dx, dy), not as its own fraction
     of the canvas. The round-end reveal stays up until "new round" is
     pressed, and the score under it is an absolute pixel miss judged
     against a canvas-independent zero-point — so a phone rotated while the
     player reads it must not change the gap they are looking at. Two
     fractions re-projected onto a 360px canvas drift apart: a 26px miss
     ("A little", 61) redrew as a 68px one on the way back to landscape,
     which is "Way out", 0. The picture then teaches the opposite of the
     number printed under it. An offset survives every resize exactly. */
  var reveal = null;
  var revealTimer = null;
  /* Long enough to read the mark, short enough that five of them do not
     turn a coffee-break drill into a slideshow. */
  var REVEAL_MS = 620;

  function clearReveal() {
    clearTimeout(revealTimer);
    revealTimer = null;
    reveal = null;
  }

  /* The drill's own reference size. TWO different SDK knobs hang off it,
     and mixing them up quietly inverts the fairness they exist for:
       · startRadius(BASE_R) — how big the thing you AIM AT is drawn. A
         screenless tablet aims with the hand out of sight, so it gets the
         biggest dot even though it is the most precise instrument.
       · ease(BASE_R * 2)    — where the SCORE reaches zero. A mouse pivots
         at the wrist and cannot creep, so it gets the most room.
     Feed the already-enlarged ring into ease() and the two multipliers
     compound: a finger ended up scored more generously than a trackpad,
     the opposite of what the profile table says. Always ease the base. */
  var BASE_R = 22;

  function targetRadius() {
    /* the drawn ring is also clamped so it can never swallow a tiny canvas */
    return Math.max(12, Math.min(ArtDaily.startRadius(BASE_R), Math.min(W, H) / 4));
  }

  /* Kept off the canvas size on purpose: the same tap must score the same
     on a phone and a desktop. */
  function zeroPoint() { return ArtDaily.ease(BASE_R * 2); }

  /* Fractions → pixels, always inside the canvas whatever its size.
     Takes the fraction pair rather than reading `target`, so the reveal
     can re-place a target that the round has already cleared. */
  function targetAt(tf) {
    if (!tf) return null;
    var r = targetRadius();
    var pad = r + 10;
    return {
      x: (W > pad * 2) ? pad + tf.fx * (W - pad * 2) : W / 2,
      y: (H > pad * 2) ? pad + tf.fy * (H - pad * 2) : H / 2,
      r: r,
    };
  }

  /* The first target of a round lands in the middle. A cold beginner's
     very first tap should be a target that is obviously there and
     obviously reachable — a corner-spawned first item reads as the drill
     being unfair before they have any idea what fair looks like here.
     From the second on, anywhere: difficulty ramps WITHIN the round. */
  function nextTarget(idx) {
    target = idx ? { fx: Math.random(), fy: Math.random() }
                 : { fx: 0.4 + Math.random() * 0.2, fy: 0.4 + Math.random() * 0.2 };
  }

  /* Says the verb and the goal in the words for the thing actually drawn,
     so the first screen teaches without the how-to being opened. */
  function itemHint(idx) {
    return 'Target ' + (idx + 1) + ' of ' + TARGETS_PER_ROUND + ' — tap the centre dot.';
  }

  function newRound() {
    round += 1;
    targetIdx = 0;
    accuracies = [];
    marks = [];
    playing = true;
    lastScore = null;
    clearReveal();        /* a queued advance from the abandoned round must not fire */
    nextTarget(0);
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    hideToast();          /* the last round's score must not hang over this one */
    hint.textContent = itemHint(0);
    draw();
  }

  /* ---- the sheet, in words ----
     The canvas is `role="img"`, so its accessible name IS the picture to
     anyone who cannot see it — and a name fixed at boot ("GAME_NAME drill
     area") describes a blank rectangle for the whole session. It says what
     was actually painted instead, refreshed from draw() so the two can
     never drift apart. NOT a live region: a name is spoken when the player
     navigates onto the element, so this costs no announcement and never
     competes with the hint line, which is the drill's ONE spoken channel.
     The write is guarded because a drill that paints per pointer sample
     calls draw() sixty times a second. */
  var sheetName = '';
  var lastScore = null;     /* the round-end number, for the name only */

  function describeSheet() {
    var txt;
    if (reveal) {
      /* Held to the same bar as the scoring functions: total. This runs
         inside draw(), which runs inside the pointer handler, so a throw
         here would not just garble a sentence — it would stop the canvas
         painting and leave the round dead under the player's finger. And a
         name is READ ALOUD: "NaN out of 100" is worse than saying nothing. */
      var words = String(reveal.words || 'off the mark').toLowerCase();
      var pct = isFinite(reveal.acc) ? ', ' + Math.round(reveal.acc) + ' out of 100.' : '.';
      txt = 'Drill sheet: target ' + targetIdx + ' of ' + TARGETS_PER_ROUND +
            ' in ' + sheetZone(reveal.tf && reveal.tf.fx, reveal.tf && reveal.tf.fy) +
            ', with your mark beside it — ' + words + pct;
      /* `isFinite(null)` is true — null coerces to 0 — so the null check has
         to come first or a fresh round says "Round done: null out of 100". */
      if (!playing && typeof lastScore === 'number' && isFinite(lastScore)) {
        txt += ' Round done: ' + Math.round(lastScore) + ' out of 100.';
      }
    } else if (playing && target) {
      txt = 'Drill sheet: target ' + (targetIdx + 1) + ' of ' + TARGETS_PER_ROUND +
            ', a ring with a centre dot, in ' + sheetZone(target.fx, target.fy) + '.';
    } else {
      txt = 'Drill sheet: empty. Press “new round” to start.';
    }
    if (txt === sheetName) return;
    sheetName = txt;
    canvas.setAttribute('aria-label', txt);
  }

  /* ---- painting (canvas bg stays clear so the CSS dot-grid shows) ---- */
  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    describeSheet();       /* the name and the picture leave from the same place */
    /* The reveal owns the canvas while it is up: one live target and one
       ghost of the last would just be two rings to choose between. */
    if (reveal) { drawReveal(c, reveal); return; }
    if (!playing) return;
    var t = targetAt(target);
    if (t) drawTarget(c, t);
  }

  /* Every ring here carries meaning — this is the thing being aimed at — so
     it is drawn in `mark`, not in the raw `accent` wash. See inks(). */
  function drawTarget(c, t) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.mark;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = c.muted;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* The truth over the attempt, with the gap between them drawn as the
     thing it is. This is the pattern every drill owes its player after
     EVERY item, not just at round end — replace the geometry, keep the
     idea: what you did, what was right, and the distance named. */
  function drawReveal(c, rv) {
    var t = targetAt(rv.tf);
    if (!t) return;
    /* The mark is placed by the offset that was SCORED, so the gap on screen
       is always the gap the number and the words describe, whatever the
       canvas has done since. Kept on the sheet after a hard shrink: the
       dashed line still points the right way, and a mark drawn off the edge
       is no reveal at all. */
    var px = t.x + (isFinite(rv.dx) ? rv.dx : 0);
    var py = t.y + (isFinite(rv.dy) ? rv.dy : 0);
    px = Math.max(4, Math.min(W - 4, px));
    py = Math.max(4, Math.min(H - 4, py));
    /* The scale the number is measured on, drawn faintly — where the score
       runs out. Without it the only circle on the sheet is the ring you AIM
       at, which is a different size for a different reason (startRadius vs
       ease), and the two ranked the hardware in opposite orders: landing
       exactly on the drawn ring is 75 out of 100 on a mouse and 16 on a pen
       tablet. A player reading a 62 had nothing on screen to read it
       against. Reveal only — during play it would just be a second ring to
       aim at, and the aim ring is the one that matters then. Taken from the
       reveal, not from ease() again — see the note where it is stored. */
    var zr = (isFinite(rv.zero) && rv.zero > 0) ? rv.zero : zeroPoint();
    if (isFinite(zr) && zr > t.r + 3) {
      ctx.save();
      /* "Faint" is a look, not a licence to be unreadable. This ring is the
         scale the printed number was measured on — the how-to names it, so
         it carries information and owes 3:1 like every other mark. At the
         0.4 alpha it started life with, muted composited to 1.74:1 on paper
         and 2.02:1 in the night studio: a player was told to read their
         mark against a ring they could not see. 0.85 measures 3.8:1 on the
         card and still 3.3:1 over the darkest dot of the grid it crosses,
         and the dash plus the 1.5px stroke keep it clearly subordinate to
         the solid 2px target ring. */
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = c.muted;
      ctx.beginPath();
      ctx.arc(t.x, t.y, zr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.muted;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c.ink;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = c.ink;                 /* what you were aiming at */
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;                     /* where you landed */
    ctx.strokeStyle = c.mark;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ---- input → accuracy → score ---- */
  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    /* Second finger of a two-finger tap must not burn a second target,
       and neither may a tap that lands while the previous reveal is still
       up — the next target has not been drawn yet, so there is nothing it
       could honestly be judged against. Ignored, never counted against
       them: nothing is ever punished for a UI reason. */
    if (!playing || !target || reveal || ev.isPrimary === false) return;
    ev.preventDefault();
    var t = targetAt(target);
    var p = pointerPos(ev);
    var dx = p.x - t.x, dy = p.y - t.y;
    var d = Math.hypot(dx, dy);
    /* Zero-point through the SDK, so an honest miss reads as an honest
       miss on a pen, a trackpad and a finger alike. */
    var zero = zeroPoint();
    var acc = tapAccuracy(d, zero);
    accuracies.push(acc);
    marks.push({ dx: dx, dy: dy });
    targetIdx += 1;
    reveal = {
      tf: target,
      dx: dx,
      dy: dy,
      /* The zero-point is kept WITH the mark, for the same reason the mark
         is kept as an offset: the reveal outlives the moment it was scored,
         and the dotted ring is the scale the printed number was measured
         on. ease() answers for the hardware in use NOW, and the hardware
         can change while the reveal is up — a pen plugged in at the end of
         a round fires onInput, which repaints, and the ring would redraw at
         half its size with "A little low — 61" still printed under it. The
         number is history; the scale it was measured against is history
         too, and history does not get re-judged. */
      zero: zero,
      words: missPhrase(dx, dy, zero),
      acc: Math.round(acc),   /* what the picture is worth, for describeSheet() */
    };
    hint.textContent = reveal.words + ' — ' + Math.round(acc) + ' out of 100 for that tap.';
    draw();
    /* The last tap does NOT wait on the beat: finishing is synchronous, so
       report() cannot be raced by "new round" landing during the reveal.
       The reveal simply stays on the canvas behind the score. */
    if (targetIdx >= TARGETS_PER_ROUND) { finishRound(); return; }
    revealTimer = setTimeout(nextItem, REVEAL_MS);
  });

  function nextItem() {
    revealTimer = null;
    if (!playing) return;     /* the round was abandoned while the reveal was up */
    reveal = null;
    nextTarget(targetIdx);
    hint.textContent = itemHint(targetIdx);
    draw();
  }

  /* A number on its own is not a reveal, and "new best!" on the very first
     round celebrates nothing — it is true of every player's first round
     ever played, fired on the one round where they most need to be told
     what the number MEANS. So the first round says what the score is FOR
     and what to do next; after that the primary button speaks for itself.
     The last tap keeps its words here too: item five is an attempt like
     any other and is owed the same reveal as items one to four. And the
     round's own correction goes last, when there is one — the per-item
     words fix the next tap, the bias line fixes the next round. */
  function roundWords(res, last, bias) {
    var head = (last ? last + '. ' : '') + 'Round done — ' + res.score + ' out of 100';
    var tail = bias ? ' ' + bias : '';
    if (res.isFirst) return head + '. That is your bar now — press “new round” and beat it.' + tail;
    if (res.isNewBest) return head + ', your best yet.' + tail;
    return head + ' (best ' + res.best + ').' + tail;
  }

  function finishRound() {
    playing = false;                  /* set first: report() fires exactly once */
    target = null;
    clearTimeout(revealTimer);        /* nothing may advance past a finished round */
    revealTimer = null;
    draw();                           /* the last tap stays up as the reveal */
    var res = ArtDaily.report(roundScore(accuracies));
    /* The picture has not changed — only what is known about it has, and the
       score is not known until report() answers. Re-name without repainting. */
    lastScore = res.score;
    describeSheet();
    hudScore.textContent = String(res.score);
    hudBest.textContent = res.best === null ? '–' : String(res.best);
    hint.textContent = roundWords(res, reveal && reveal.words, roundBias(marks, zeroPoint()));
    showToast(res.isFirst ? 'first score ' + res.score + ' / 100'
            : res.isNewBest ? 'new best! ' + res.score + ' / 100'
            : 'score ' + res.score + ' / 100',
      res.isNewBest && !res.isFirst);
  }

  var toastTimer = null;
  function hideToast() { clearTimeout(toastTimer); toast.hidden = true; }
  /* The toast is a STICKER, not a second voice. It says nothing the hint line
     has not already said in a fuller sentence one statement earlier, and both
     used to be aria-live="polite" regions written in the same tick — so a
     screen-reader player heard the round's correction and then, queued behind
     it, "score 84 / 100" again. One drill, one spoken channel: the hint line.
     The toast is aria-hidden in index.html; keep it that way, and if your
     drill ever puts something in here that the hint does NOT say, move it to
     the hint instead. */
  function showToast(msg, celebrate) {
    clearTimeout(toastTimer);
    toast.hidden = false;
    toast.textContent = '';
    var s = document.createElement('span');
    s.className = celebrate ? 'toast-accent' : '';
    s.textContent = msg;
    toast.appendChild(s);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  /* ---- chrome wiring ---- */
  document.getElementById('btnRound').addEventListener('click', newRound);

  var btnHow = document.getElementById('btnHow');
  var howTo = document.getElementById('howTo');
  btnHow.addEventListener('click', function () {
    howTo.hidden = !howTo.hidden;
    btnHow.setAttribute('aria-expanded', String(!howTo.hidden));
  });

  /* The ink cache above is keyed on the theme, so it self-heals; dropping
     it here as well means a drill that later reads an ink from somewhere
     other than draw() cannot be caught holding yesterday's colour. */
  ArtDaily.onTheme(function () { inkCache = null; draw(); });
  /* The hardware can change mid-session; the ring is sized from it. */
  ArtDaily.onInput(draw);

  /* Both resize sources fire in bursts for a single drag, and a fit that
     really changes size REALLOCATES the canvas backing store — the most
     expensive thing in this file, plus a full clear on top. So measure and
     repaint at most once a frame, and only when the size actually moved.
     A drill that draws STROKES should coalesce the same way: the browser
     delivers pointermove faster than it paints, so a repaint per sample is
     several full-canvas washes per frame with all but one thrown away, and
     each one is main-thread time the next sample waits behind. Take the
     samples themselves at full rate — ArtDaily.samples(ev) — and only the
     PAINTING once a frame: fidelity and repaint cost are separate
     questions and the honest answer differs for each. The tap handler
     above still paints inline: the press that just landed is the one frame
     that must not wait for anything. */
  function raf(fn) {
    if (window.requestAnimationFrame) window.requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }
  var fitPending = false;
  function onResize() {
    if (fitPending) return;
    fitPending = true;
    raf(function () { fitPending = false; if (fitCanvas()) draw(); });
  }
  window.addEventListener('resize', onResize);
  /* ResizeObserver also catches the case window.resize cannot: the canvas
     measuring 0 at boot (opened in a background tab, or laid out late) and
     getting its real width a frame later. */
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

  /* ---- boot ---- */
  fitCanvas();
  var best = ArtDaily.best();
  hudBest.textContent = best === null ? '–' : String(best);
  newRound();
})();
