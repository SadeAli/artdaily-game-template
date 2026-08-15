/* ============================================================
   game.js — the drill itself. This template ships a tiny working
   demo (tap five targets dead-center) so you can play the pattern
   before replacing it: keep the skeleton — init → round → input →
   score → ArtDaily.report — and swap in your drill's geometry.
   Everything draws on one theme-aware canvas; no libraries.
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

  /* ---- theme-aware inks (re-read on every repaint) ---- */
  function inks() {
    var cs = getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue('--ink').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      accent: cs.getPropertyValue('--game-accent').trim() || cs.getPropertyValue('--mint').trim(),
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

  /* Fractions → pixels, always inside the canvas whatever its size. */
  function targetAt() {
    if (!target) return null;
    var r = targetRadius();
    var pad = r + 10;
    return {
      x: (W > pad * 2) ? pad + target.fx * (W - pad * 2) : W / 2,
      y: (H > pad * 2) ? pad + target.fy * (H - pad * 2) : H / 2,
      r: r,
    };
  }

  function nextTarget() { target = { fx: Math.random(), fy: Math.random() }; }

  function newRound() {
    round += 1;
    targetIdx = 0;
    accuracies = [];
    playing = true;
    nextTarget();
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    hideToast();          /* the last round's score must not hang over this one */
    hint.textContent = 'Target ' + (targetIdx + 1) + ' of ' + TARGETS_PER_ROUND + ' — tap the bullseye.';
    draw();
  }

  /* ---- painting (canvas bg stays clear so the CSS dot-grid shows) ---- */
  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    var t = playing ? targetAt() : null;
    if (!t) return;
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

  /* ---- input → accuracy → score ---- */
  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    /* Second finger of a two-finger tap must not burn a second target —
       nothing is ever punished for a UI reason. */
    if (!playing || !target || ev.isPrimary === false) return;
    ev.preventDefault();
    var t = targetAt();
    var p = pointerPos(ev);
    var d = Math.hypot(p.x - t.x, p.y - t.y);
    /* Zero-point through the SDK, so an honest miss reads as an honest
       miss on a pen, a trackpad and a finger alike. */
    accuracies.push(tapAccuracy(d, zeroPoint()));
    targetIdx += 1;
    if (targetIdx < TARGETS_PER_ROUND) {
      nextTarget();
      hint.textContent = 'Target ' + (targetIdx + 1) + ' of ' + TARGETS_PER_ROUND + ' — tap the bullseye.';
      draw();
      return;
    }
    finishRound();
  });

  function finishRound() {
    playing = false;                  /* set first: report() fires exactly once */
    target = null;
    draw();
    var res = ArtDaily.report(roundScore(accuracies));
    hudScore.textContent = String(res.score);
    hudBest.textContent = res.best === null ? '–' : String(res.best);
    hint.textContent = 'Round done — press “new round” to go again.';
    showToast((res.isNewBest ? 'new best! ' : 'score ') + res.score + ' / 100', res.isNewBest);
  }

  var toastTimer = null;
  function hideToast() { clearTimeout(toastTimer); toast.hidden = true; }
  function showToast(msg, celebrate) {
    toast.innerHTML = '';
    var s = document.createElement('span');
    s.className = celebrate ? 'toast-accent' : '';
    s.textContent = msg;
    toast.appendChild(s);
    toast.hidden = false;
    clearTimeout(toastTimer);
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
