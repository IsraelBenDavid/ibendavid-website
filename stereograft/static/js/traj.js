/* Key observation: drag along the sampling steps to see the clean prediction D(L-hat) and its depth, with the median
   Pearson correlation between each step's depth and the final depth (50 Wan 2.1 videos). Data: static/data/traj.json. */
(function () {
  "use strict";
  var SG = window.SG;
  var canvas = document.getElementById("traj-canvas");
  if (!canvas) { return; }
  var imgX = document.getElementById("traj-x0"), imgZ = document.getElementById("traj-z");
  var tag = document.getElementById("traj-tag"), readout = document.getElementById("traj-readout");
  var fig = document.getElementById("traj");
  var cv = SG.fluidCanvas(canvas);
  var D = null, step = 10, loadedX = {}, loadedZ = {}, anim = null, started = false;
  var N = 50;

  function urlX(s) { return "static/images/traj/x0_" + SG.pad2(s) + ".webp"; }
  function urlZ(s) { return "static/images/traj/z_" + SG.pad2(s) + ".webp"; }

  function nearestLoaded(map, s) {
    if (map[s]) { return s; }
    for (var d = 1; d < N; d++) { if (map[s - d]) { return s - d; } if (map[s + d]) { return s + d; } }
    return -1;
  }
  function showImages() {
    var a = nearestLoaded(loadedX, step), b = nearestLoaded(loadedZ, step);
    if (a >= 0 && imgX.getAttribute("src") !== urlX(a)) { imgX.src = urlX(a); }
    if (b >= 0 && imgZ.getAttribute("src") !== urlZ(b)) { imgZ.src = urlZ(b); }
  }

  function geom() {
    var w = cv.w, hgt = cv.h;
    var padL = w < 520 ? 44 : 58, padR = 14, top = 26, bottom = 46;
    return { x0: padL, x1: w - padR, y0: top, y1: hgt - bottom, w: w, h: hgt };
  }
  function sx(g, s) { return g.x0 + (g.x1 - g.x0) * s / (N - 1); }
  function sy(g, v) { var lo = 0.3, hi = 1.0; return g.y1 - (g.y1 - g.y0) * (v - lo) / (hi - lo); }

  function draw() {
    cv.fit();
    var ctx = cv.ctx, g = geom(), c = SG.colors();
    ctx.clearRect(0, 0, cv.w, cv.h);
    if (!D) { return; }
    // grid
    ctx.strokeStyle = c.hair; ctx.lineWidth = 1;
    ctx.font = SG.font(11, 500); ctx.fillStyle = c.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0.4, 0.6, 0.8, 1.0].forEach(function (v) {
      var y = Math.round(sy(g, v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), g.x0 - 8, y);
    });
    // x axis: steps and t
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    var ticks = cv.w < 520 ? [0, 10, 20, 30, 40, 49] : [0, 5, 10, 15, 20, 30, 40, 49];
    ticks.forEach(function (s) {
      var x = sx(g, s);
      ctx.fillStyle = c.muted; ctx.font = SG.font(11, 500);
      ctx.fillText(String(s), x, g.y1 + 16);
      ctx.font = SG.font(10.5, 500); ctx.fillStyle = c.muted;
      ctx.fillText(D.t[s].toFixed(2), x, g.y1 + 31);
    });
    ctx.textAlign = "left"; ctx.font = SG.font(10.5, 600); ctx.fillStyle = c.muted;
    ctx.fillText("step", 0, g.y1 + 16);
    SG.drawSub(ctx, "t", "", 2, g.y1 + 31, 13);
    // quartile band
    ctx.beginPath();
    for (var i = 0; i < N; i++) { var x = sx(g, i), y = sy(g, Math.max(0.3, D.q3[i])); if (i) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } }
    for (i = N - 1; i >= 0; i--) { ctx.lineTo(sx(g, i), sy(g, Math.max(0.3, D.q1[i]))); }
    ctx.closePath(); ctx.fillStyle = SG.alpha(c.left, c.dark ? 0.18 : 0.12); ctx.fill();
    // median curve
    ctx.beginPath();
    for (i = 0; i < N; i++) { x = sx(g, i); y = sy(g, D.median[i]); if (i) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } }
    ctx.strokeStyle = c.left; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    // warp markers
    D.warps.forEach(function (s, k) {
      var xx = sx(g, s);
      SG.triangle(ctx, xx, g.y0 - 6, 9, c.warpMark);
      ctx.fillStyle = c.muted;
      SG.drawSub(ctx, "r", k === D.warps.length - 1 ? "m" : String(k), xx + 7, g.y0 - 9, 12, { subMath: k === D.warps.length - 1 });
    });
    // cursor
    var cx = sx(g, step), cy = sy(g, D.median[step]);
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, g.y0 - 2); ctx.lineTo(cx, g.y1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = c.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.left; ctx.stroke();
    // handle (APEX-like)
    ctx.fillStyle = c.ink;
    SG.roundRect(ctx, cx - 7, g.y1 + 1, 14, 6, 2); ctx.fill();
  }

  function setStep(s, fromUser) {
    s = SG.clamp(Math.round(s), 0, N - 1);
    if (fromUser && anim) { cancelAnimationFrame(anim); anim = null; }
    step = s;
    canvas.setAttribute("aria-valuenow", String(s));
    canvas.setAttribute("aria-valuetext", "Step " + s + ", t = " + (D ? D.t[s].toFixed(2) : ""));
    if (D) {
      tag.textContent = "t = " + D.t[s].toFixed(2);
      readout.innerHTML = "<b>Step " + s + "</b> &nbsp;&middot;&nbsp; t = " + D.t[s].toFixed(2) +
        " &nbsp;&middot;&nbsp; median correlation <b>" + D.median[s].toFixed(2) + "</b>";
    }
    showImages();
    draw();
  }

  function fromPointer(e) {
    var r = canvas.getBoundingClientRect(), g = geom();
    var x = (e.clientX - r.left) * (cv.w / r.width);
    return (x - g.x0) / (g.x1 - g.x0) * (N - 1);
  }
  var dragging = false;
  canvas.addEventListener("pointerdown", function (e) { dragging = true; canvas.setPointerCapture(e.pointerId); setStep(fromPointer(e), true); });
  canvas.addEventListener("pointermove", function (e) { if (dragging) { setStep(fromPointer(e), true); } });
  canvas.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("keydown", function (e) {
    var k = e.key, s = step;
    if (k === "ArrowRight" || k === "ArrowUp") { s++; } else if (k === "ArrowLeft" || k === "ArrowDown") { s--; }
    else if (k === "Home") { s = 0; } else if (k === "End") { s = N - 1; }
    else if (k === "PageUp") { s -= 5; } else if (k === "PageDown") { s += 5; } else { return; }
    e.preventDefault(); setStep(s, true);
  });

  function sweep() {
    if (SG.reduced) { setStep(10); return; }
    var t0 = null, dur = 3600, to = 10;
    function f(ts) {
      if (t0 == null) { t0 = ts; }
      var p = Math.min(1, (ts - t0) / dur);
      setStep(SG.easeOut(p) * to);
      anim = p < 1 ? requestAnimationFrame(f) : null;
    }
    setStep(0);
    anim = requestAnimationFrame(f);
  }

  function start() {
    if (started) { return; }
    started = true;
    var order = [];
    for (var s = 0; s < N; s++) { order.push(s); }
    SG.preload(order.map(urlX), function (i) { loadedX[i] = true; if (Math.abs(i - step) < 2) { showImages(); } });
    SG.preload(order.map(urlZ), function (i) { loadedZ[i] = true; if (Math.abs(i - step) < 2) { showImages(); } });
  }

  SG.json("static/data/traj.json").then(function (d) {
    D = d; N = d.steps.length;
    setStep(10);
    SG.watchVisible(fig, function (on) { if (on) { start(); } }, { rootMargin: "500px 0px" });
    SG.onceVisible(fig, sweep);
  }).catch(function () { readout.textContent = "Interactive data could not be loaded."; });

  SG.onResize(draw);
  SG.onTheme(draw);
})();
