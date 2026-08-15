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

  /* ---- theme-aware inks (re-read on every repaint) ----
     `accent` is the decorative wash; `mark` is the same accent mixed
     toward --ink for anything that CARRIES meaning on the canvas, because
     the watercolour accents are decorative-strength on light paper and a
     reveal a player cannot see is not a reveal. Defined as
     --canvas-accent below the marker in css/style.css. */
  function inks() {
    var cs = getComputedStyle(document.documentElement);
    var accent = cs.getPropertyValue('--game-accent').trim() || cs.getPropertyValue('--mint').trim();
    return {
      ink: cs.getPropertyValue('--ink').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      accent: accent,
      mark: cs.getPropertyValue('--canvas-accent').trim() || accent,
    };
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
    clearReveal();        /* a queued advance from the abandoned round must not fire */
    nextTarget(0);
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    hideToast();          /* the last round's score must not hang over this one */
    hint.textContent = itemHint(0);
    draw();
  }

  /* ---- painting (canvas bg stays clear so the CSS dot-grid shows) ---- */
  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    /* The reveal owns the canvas while it is up: one live target and one
       ghost of the last would just be two rings to choose between. */
    if (reveal) { drawReveal(c, reveal); return; }
    if (!playing) return;
    var t = targetAt(target);
    if (t) drawTarget(c, t);
  }

  function drawTarget(c, t) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.accent;
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
       aim at, and the aim ring is the one that matters then. */
    var zr = zeroPoint();
    if (isFinite(zr) && zr > t.r + 3) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
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
      words: missPhrase(dx, dy, zero),
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
  function showToast(msg, celebrate) {
    clearTimeout(toastTimer);
    /* Unhidden BEFORE the text lands: a live region that is still `hidden`
       when its content changes is not announced, so a screen-reader player
       finished the round and heard the score nowhere. */
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

  ArtDaily.onTheme(draw);
  /* The hardware can change mid-session; the ring is sized from it. */
  ArtDaily.onInput(draw);

  function onResize() { if (fitCanvas()) draw(); }
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
