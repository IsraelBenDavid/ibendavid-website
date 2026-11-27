/* Pipeline explorer: one Wan 2.1 text-to-stereo run (the penguin of the paper's Fig. 2), step by step.
   Timeline: the left lane spans the 50 steps; the right lane forks at r0 = 5; refreshes at r1 = 10, r2 = 15, rm = 20.
   Panes: D(L-hat), D(R-hat) and their anaglyph at the chosen step; the latest warp's inverse depth z, cell shifts w(p),
   and S[L-hat] with the holes H (yellow) and padding cells (cyan). Data: static/data/pipeline.json + images/pipeline/. */
(function () {
  "use strict";
  var SG = window.SG;
  var canvas = document.getElementById("pipe-canvas");
  if (!canvas) { return; }
  var fig = document.getElementById("pipe");
  var cv = SG.fluidCanvas(canvas);
  var $ = function (id) { return document.getElementById(id); };
  var im = { L: $("pipe-L"), R: $("pipe-R"), A: $("pipe-A"), z: $("pipe-z"), w: $("pipe-w"), S: $("pipe-S") };
  var empty = { R: $("pipe-R-empty"), A: $("pipe-A-empty"), z: $("pipe-z-empty"), w: $("pipe-w-empty"), S: $("pipe-S-empty") };
  var status = $("pipe-status"), warpLabel = $("pipe-warp-label"), warpHint = $("pipe-warp-hint"), warpRow = $("pipe-warp");
  var bPlay = $("pipe-play"), bPrev = $("pipe-prev"), bNext = $("pipe-next"), bReplay = $("pipe-replay");
  var D = null, N = 50, R0 = 5, RUNGS = [5, 10, 15, 20], step = 0, loaded = {}, started = false;
  var playing = false, timer = null, everPlayed = false;
  var IMG = "static/images/pipeline/";

  function url(kind, s) {
    if (kind === "L" || kind === "R" || kind === "A") { return IMG + kind + "_" + SG.pad2(s) + ".webp"; }
    return IMG + kind + "_r" + SG.pad2(s) + ".webp";
  }
  function rungIndex(r) { return RUNGS.indexOf(r); }
  function rName(r) { var k = rungIndex(r); return k === RUNGS.length - 1 ? "r<sub>m</sub>" : "r<sub>" + k + "</sub>"; }
  function latestRung(s) { var r = -1; RUNGS.forEach(function (x) { if (x <= s) { r = x; } }); return r; }
  function rung(r) { return D.rungs.filter(function (x) { return x.step === r; })[0]; }

  function setImg(el, src) {
    if (!src) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    if (el.getAttribute("src") !== src) { el.src = src; }
  }
  function setEmpty(k, on) { if (empty[k]) { empty[k].style.display = on ? "grid" : "none"; } }

  /* ---------------------------------------------------------------- panes + status */
  function update() {
    var s = step;
    setImg(im.L, url("L", s));
    var paneR = $("pipe-R-pane");
    if (s < R0) {
      setImg(im.R, null); setEmpty("R", true); setImg(im.A, null); setEmpty("A", true);
      empty.R.textContent = "Branches after step " + R0; empty.A.textContent = "Branches after step " + R0;
    } else if (s === R0) {
      setImg(im.R, url("S", R0)); setEmpty("R", false);
      setImg(im.A, null); setEmpty("A", true); empty.A.textContent = "Both views from the next step";
    } else {
      setImg(im.R, url("R", s)); setEmpty("R", false);
      setImg(im.A, url("A", s)); setEmpty("A", false);
    }
    paneR.querySelector(".nt").innerHTML = s === R0 ? "<i class=\"m\">S</i>[<i class=\"m\">L&#770;</i>] at the branch" : "D(<i class=\"m\">R&#770;</i>)";

    var r = latestRung(s);
    if (r < 0) {
      ["z", "w", "S"].forEach(function (k) { setImg(im[k], null); setEmpty(k, true); });
      warpLabel.innerHTML = "Depth-guided warp";
      warpHint.textContent = "Runs after steps " + RUNGS.join(", ") + ".";
      warpRow.classList.remove("is-now");
    } else {
      ["z", "w", "S"].forEach(function (k) { setImg(im[k], url(k, r)); setEmpty(k, false); });
      var x = rung(r), now = s === r;
      warpLabel.innerHTML = (now ? "Warp after step " : "Latest warp, after step ") + r + " (<i class=\"m\">" + rName(r) + "</i>)";
      warpHint.textContent = SG.fmt(x.holes_frame) + " holes" + (x.pad_frame ? " + " + SG.fmt(x.pad_frame) + " padding cells" : "") +
        " in this latent frame; shifts 0 to " + x.max_shift + " cells.";
      warpRow.classList.toggle("is-now", now);
    }

    status.innerHTML = sentence(s);
    canvas.setAttribute("aria-valuenow", String(s));
    canvas.setAttribute("aria-valuetext", "Step " + s + " of 50");
    bPrev.disabled = s <= 0; bNext.disabled = s >= N - 1;
    draw();
  }

  function sentence(s) {
    var t = D ? D.t[s].toFixed(2) : "";
    if (s <= 1) { return "The left view starts from noise (<i class=\"m\">t</i> = " + t + ")."; }
    if (s < R0) { return "Step " + s + ": the left view is sampled as an ordinary video."; }
    if (s === R0) {
      return "After step " + R0 + " (<i class=\"m\">r</i><sub>0</sub>): every latent cell moves left by its shift; cells nothing lands on become holes and start from a background guess.";
    }
    var k = rungIndex(s);
    if (k > 0) {
      var x = rung(s);
      return "After step " + s + " (<i class=\"m\">" + rName(s) + "</i>): refresh. Shared cells copy the warped left again; " +
        SG.fmt(x.holes_frame + x.pad_frame) + " hole and padding cells keep the right view's own prediction.";
    }
    if (s < RUNGS[RUNGS.length - 1]) { return "Step " + s + ": both views are sampled side by side; the right view fills its holes."; }
    if (s < N - 1) { return "Step " + s + ": after the last refresh, both views finish independently."; }
    return "Step " + s + ", the last: the left and right views are complete.";
  }

  /* ---------------------------------------------------------------- timeline canvas */
  function geom() {
    var w = cv.w, narrow = w < 560;
    return {
      w: w, h: cv.h, narrow: narrow,
      x0: narrow ? 12 : 18, x1: w - (narrow ? 12 : 18),
      yMark: 46, yL: narrow ? 80 : 84, yR: narrow ? 118 : 124, yAx: cv.h - 8
    };
  }
  function sx(g, s) { return g.x0 + (g.x1 - g.x0) * s / (N - 1); }

  function draw() {
    cv.fit();
    var ctx = cv.ctx, g = geom(), c = SG.colors();
    ctx.clearRect(0, 0, cv.w, cv.h);
    var px = sx(g, step);
    // step and t readout above the playhead; end labels when there is room
    var lbl = D ? "step " + step + "  \u00b7  t = " + D.t[step].toFixed(2) : "";
    ctx.font = SG.font(12, 600); ctx.textBaseline = "alphabetic";
    var tw = ctx.measureText(lbl).width;
    var tx = SG.clamp(px - tw / 2, g.x0, g.x1 - tw);
    ctx.font = SG.font(11, 500); ctx.fillStyle = c.muted;
    if (tx > g.x0 + 48) { ctx.textAlign = "left"; ctx.fillText("noise", g.x0, 13); }
    if (tx + tw < g.x1 - 48) { ctx.textAlign = "right"; ctx.fillText("video", g.x1, 13); }
    ctx.font = SG.font(12, 600); ctx.fillStyle = c.ink; ctx.textAlign = "left"; ctx.fillText(lbl, tx, 13);
    // axis
    ctx.strokeStyle = c.hair; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, g.yAx - 12.5); ctx.lineTo(g.x1, g.yAx - 12.5); ctx.stroke();
    ctx.textAlign = "center"; ctx.font = SG.font(10.5, 500);
    for (var s = 0; s <= 50; s += 5) {
      if (g.narrow && s % 10) { continue; }
      if (s === 50) { s = N - 1; }
      var xs = sx(g, s);
      ctx.beginPath(); ctx.moveTo(xs, g.yAx - 16); ctx.lineTo(xs, g.yAx - 12); ctx.stroke();
      ctx.fillStyle = c.muted; ctx.fillText(String(s), xs, g.yAx);
    }
    // warp markers and labels
    RUNGS.forEach(function (r, k) {
      var x = sx(g, r);
      SG.triangle(ctx, x, g.yMark - 12, 9, c.warpMark);
      ctx.fillStyle = step >= r ? c.ink : c.muted;
      var sub = k === RUNGS.length - 1 ? "m" : String(k);
      var wdt = SG.drawSub(ctx, "r", sub, x + 7, g.yMark - 13, 13, { subMath: sub === "m" });
      if (!g.narrow && (k === 0 || k === 1)) {
        ctx.font = SG.font(11, 500); ctx.textAlign = "left";
        ctx.fillText(k === 0 ? "branch" : "refresh", x + 10 + wdt, g.yMark - 13);
      }
    });
    // lanes: solid up to the playhead, faint after
    function lane(xa, xb, y, color, lw) {
      if (xb <= xa) { return; }
      var xm = SG.clamp(px, xa, xb);
      ctx.lineCap = "round"; ctx.lineWidth = lw;
      ctx.strokeStyle = SG.alpha(color, c.dark ? 0.28 : 0.22);
      ctx.beginPath(); ctx.moveTo(xm, y); ctx.lineTo(xb, y); ctx.stroke();
      if (xm > xa) { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xm, y); ctx.stroke(); }
    }
    var xr0 = sx(g, R0);
    lane(g.x0, g.x1, g.yL, c.left, 4);
    // fork from the left lane at r0
    var forkEnd = xr0 + Math.min(34, (g.x1 - g.x0) * 0.05);
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.strokeStyle = step >= R0 ? c.right : SG.alpha(c.right, c.dark ? 0.28 : 0.22);
    ctx.beginPath(); ctx.moveTo(xr0, g.yL);
    ctx.bezierCurveTo(xr0 + 12, g.yL, forkEnd - 16, g.yR, forkEnd, g.yR); ctx.stroke();
    lane(forkEnd, g.x1, g.yR, c.right, 4);
    // refresh connectors: S[L] copied onto R
    RUNGS.slice(1).forEach(function (r) {
      var x = sx(g, r), on = step >= r;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = on ? c.arrow : SG.alpha(c.arrow, 0.35); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, g.yL + 6); ctx.lineTo(x, g.yR - 9); ctx.stroke();
      ctx.setLineDash([]);
      SG.arrow(ctx, x, g.yR - 14, x, g.yR - 5, on ? c.arrow : SG.alpha(c.arrow, 0.35), 1.3, 6);
    });
    // lane labels
    ctx.textAlign = "left"; ctx.font = SG.font(12, 600);
    ctx.fillStyle = c.leftText; ctx.fillText("left view", g.x0 + 2, g.yL - 10);
    var lw = ctx.measureText("left view ").width;
    SG.drawSub(ctx, "L", "", g.x0 + 2 + lw, g.yL - 10, 14);
    ctx.font = SG.font(12, 600); ctx.fillStyle = c.rightText;
    var rw = ctx.measureText("right view ").width;
    var roomLeft = xr0 - g.x0 > rw + 22;
    if (roomLeft) {
      ctx.fillText("right view", g.x0 + 2, g.yR + 5);
      SG.drawSub(ctx, "R", "", g.x0 + 2 + rw, g.yR + 5, 14);
    } else {
      // narrow timelines: only the symbol, left of the fork (the words would run into the axis labels; the legend names it)
      SG.drawSub(ctx, "R", "", g.x0 + 2, g.yR + 5, 14);
    }
    // playhead
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 19); ctx.lineTo(px, g.yAx - 18); ctx.stroke();
    var dot = function (y, col) { ctx.beginPath(); ctx.arc(px, y, 6, 0, Math.PI * 2); ctx.fillStyle = c.bg; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.stroke(); };
    dot(g.yL, c.left);
    if (step >= R0 && px >= forkEnd - 0.5) { dot(g.yR, c.right); }
    ctx.fillStyle = c.ink;
    SG.roundRect(ctx, px - 8, g.yAx - 22, 16, 7, 2); ctx.fill();
  }

  /* ---------------------------------------------------------------- playback */
  function uiPlay() {
    bPlay.setAttribute("data-state", playing ? "playing" : "paused");
    bPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function stop() { playing = false; if (timer) { clearTimeout(timer); timer = null; } uiPlay(); }
  function tick() {
    if (!playing) { return; }
    if (step >= N - 1) { stop(); return; }
    step += 1; update();
    var hold = RUNGS.indexOf(step) >= 0 ? 1700 : step < R0 ? 260 : step < RUNGS[RUNGS.length - 1] ? 210 : 90;
    if (step >= N - 1) { stop(); return; }
    timer = setTimeout(tick, hold);
  }
  function play(fromStart) {
    if (SG.reduced) { step = N - 1; update(); return; }
    if (fromStart || step >= N - 1) { step = 0; update(); }
    playing = true; everPlayed = true; uiPlay();
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(tick, 500);
  }
  bPlay.addEventListener("click", function () { if (playing) { stop(); } else { play(false); } });
  bReplay.addEventListener("click", function () { play(true); });
  bPrev.addEventListener("click", function () { stop(); step = Math.max(0, step - 1); update(); });
  bNext.addEventListener("click", function () { stop(); step = Math.min(N - 1, step + 1); update(); });

  function fromPointer(e) {
    var r = canvas.getBoundingClientRect(), g = geom();
    var x = (e.clientX - r.left) * (cv.w / r.width);
    return SG.clamp(Math.round((x - g.x0) / (g.x1 - g.x0) * (N - 1)), 0, N - 1);
  }
  var dragging = false;
  canvas.addEventListener("pointerdown", function (e) { stop(); dragging = true; canvas.setPointerCapture(e.pointerId); step = fromPointer(e); update(); });
  canvas.addEventListener("pointermove", function (e) { if (dragging) { var s = fromPointer(e); if (s !== step) { step = s; update(); } } });
  canvas.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("keydown", function (e) {
    var k = e.key, s = step;
    if (k === "ArrowRight" || k === "ArrowUp") { s++; } else if (k === "ArrowLeft" || k === "ArrowDown") { s--; }
    else if (k === "Home") { s = 0; } else if (k === "End") { s = N - 1; }
    else if (k === "PageDown") { s = RUNGS.filter(function (r) { return r > step; })[0]; if (s == null) { s = N - 1; } }
    else if (k === "PageUp") { var lower = RUNGS.filter(function (r) { return r < step; }); s = lower.length ? lower[lower.length - 1] : 0; }
    else if (k === " ") { e.preventDefault(); if (playing) { stop(); } else { play(false); } return; }
    else { return; }
    e.preventDefault(); stop(); step = SG.clamp(s, 0, N - 1); update();
  });

  function preload() {
    if (started) { return; }
    started = true;
    var list = [];
    for (var s = 0; s < N; s++) { list.push(url("L", s)); }
    RUNGS.forEach(function (r) { list.push(url("S", r), url("z", r), url("w", r)); });
    for (s = R0 + 1; s < N; s++) { list.push(url("R", s), url("A", s)); }
    SG.preload(list);
  }

  SG.json("static/data/pipeline.json").then(function (d) {
    D = d; N = d.steps; RUNGS = d.rungs.map(function (x) { return x.step; }); R0 = RUNGS[0];
    step = SG.reduced ? N - 1 : 0;
    update(); uiPlay();
    SG.watchVisible(fig, function (on) { if (on) { preload(); } }, { rootMargin: "700px 0px" });
    SG.onceVisible(canvas, function () { if (!everPlayed) { play(true); } }, 0.6);
    if (SG.reduced) { bReplay.hidden = true; }
  }).catch(function () { status.textContent = "Interactive data could not be loaded."; });

  SG.onResize(draw);
  SG.onTheme(draw);
})();
