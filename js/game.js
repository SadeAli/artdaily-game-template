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
  var W = 0, H = 0;
  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.round(W * 0.62);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---- round state ---- */
  var round = 0, targetIdx = 0, accuracies = [], target = null, playing = false;

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function nextTarget() {
    var r = 22;
    target = { x: rand(r + 10, W - r - 10), y: rand(r + 10, H - r - 10), r: r };
  }

  function newRound() {
    round += 1;
    targetIdx = 0;
    accuracies = [];
    playing = true;
    nextTarget();
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    hint.textContent = 'Target ' + (targetIdx + 1) + ' of ' + TARGETS_PER_ROUND + ' — tap the bullseye.';
    draw();
  }

  /* ---- painting (canvas bg stays clear so the CSS dot-grid shows) ---- */
  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    if (!playing || !target) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.accent;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = c.muted;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- input → accuracy → score ---- */
  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (!playing || !target) return;
    ev.preventDefault();
    var p = pointerPos(ev);
    var d = Math.hypot(p.x - target.x, p.y - target.y);
    /* 100 at dead-center, 0 at twice the ring radius or further out. */
    accuracies.push(Math.max(0, 1 - d / (target.r * 2)) * 100);
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
    playing = false;
    target = null;
    draw();
    var avg = accuracies.reduce(function (a, b) { return a + b; }, 0) / accuracies.length;
    var res = ArtDaily.report(avg);
    hudScore.textContent = String(res.score);
    hudBest.textContent = res.best === null ? '–' : String(res.best);
    hint.textContent = 'Round done — press “new round” to go again.';
    showToast((res.isNewBest ? 'new best! ' : 'score ') + res.score + ' / 100', res.isNewBest);
  }

  var toastTimer = null;
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
  window.addEventListener('resize', function () { fitCanvas(); draw(); });

  /* ---- boot ---- */
  fitCanvas();
  var best = ArtDaily.best();
  hudBest.textContent = best === null ? '–' : String(best);
  newRound();
})();
