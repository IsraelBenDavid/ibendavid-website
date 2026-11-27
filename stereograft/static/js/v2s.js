/* Video-to-stereo: inversion from the input's clean latent back to r0, keeping the states at r1..rm; depth once from
   the input (fixed shifts and holes); then the right view branches at r0 and samples forward, refreshed from the stored
   left states. One-shot animation with Replay (Wan 2.1: 100 steps, warps after 30, 40, ..., 80). */
(function () {
  "use strict";
  var SG = window.SG;
  var canvas = document.getElementById("v2s-canvas");
  if (!canvas) { return; }
  var LW = 860, LH = 384, COMPACT = false, FS = 1, AXY = 352;
  canvas.width = LW; canvas.height = LH;
  var cv = SG.fixedCanvas(canvas);
  var statusEl = document.getElementById("v2s-status"), bReplay = document.getElementById("v2s-replay");
  var N = 100, WARPS = [30, 40, 50, 60, 70, 80];
  var X0 = 30, X1 = 610, YL = 134, YR = 282, BX = 664;
  function setLayout() {
    var compact = canvas.getBoundingClientRect().width < 600;
    if (compact === COMPACT) { return; }
    COMPACT = compact;
    if (compact) { LW = 560; LH = 430; X0 = 16; X1 = 544; YL = 128; YR = 290; AXY = 394; FS = 1.3; }
    else { LW = 860; LH = 384; X0 = 30; X1 = 610; YL = 134; YR = 282; AXY = 352; FS = 1; }
    canvas.width = LW; canvas.height = LH;
    cv = SG.fixedCanvas(canvas);
  }
  function F(n) { return n * FS; }
  var T = { inv0: 1100, inv1: 4300, depth0: 4500, depth1: 5700, fw0: 5900, fw1: 9300, out0: 9300, out1: 10300 };
  var TEXT = [
    [0, "The input video is the left view."],
    [T.inv0, "Inversion runs the sampler backward, from the clean latent <i class=\"m\">E</i>(<i class=\"m\">V</i>) toward noise, with two (Wan 2.1) or three (LTX-2.3) fixed-point iterations per step."],
    [2900, "It keeps the left states at the refresh steps and stops at the branching step <i class=\"m\">r</i><sub>0</sub>."],
    [T.depth0, "Depth is estimated once from the input, so the shifts and the holes stay fixed."],
    [T.fw0, "The right view branches at <i class=\"m\">r</i><sub>0</sub> and samples forward. Each refresh copies the stored left state outside the holes."],
    [T.out0, "Only the right view is generated; the left view is the input itself."]
  ];
  var t = 0, raf = null, start = null, lastText = -1;
  function sx(s) { return X0 + (X1 - X0) * s / N; }

  function strip(ctx, x, y, w, hgt, color, fill, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    for (var i = 2; i >= 0; i--) {
      var o = i * 6;
      ctx.fillStyle = fill; ctx.fillRect(x + o, y - o, w, hgt);
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.strokeRect(x + o + 1, y - o + 1, w - 2, hgt - 2);
    }
    ctx.restore();
  }
  function text(ctx, str, x, y, color, size, weight, align) {
    ctx.font = SG.font(F(size || 14), weight || 600); ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
  }

  function draw() {
    cv.fit();
    var ctx = cv.ctx, col = SG.colors();
    ctx.clearRect(0, 0, LW, LH);
    ctx.textBaseline = "alphabetic";
    text(ctx, "noise", X0, 22, col.muted, 13, 500);
    text(ctx, "video", X1, 22, col.muted, 13, 500, "right");
    // step axis
    ctx.strokeStyle = col.hair; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X0, AXY + 0.5); ctx.lineTo(X1, AXY + 0.5); ctx.stroke();
    for (var s = 0; s <= N; s += COMPACT ? 20 : 10) {
      ctx.fillStyle = col.muted; ctx.fillRect(sx(s) - 0.5, AXY - 3, 1, 4);
      text(ctx, String(s), sx(s), AXY + F(20), col.muted, 12.5, 500, "center");
    }
    if (!COMPACT) { text(ctx, "step", X1 + 16, AXY + 20, col.muted, 12.5, 600); }
    // warp markers
    WARPS.forEach(function (w, k) {
      SG.triangle(ctx, sx(w), 72, 11, col.warpMark);
      ctx.fillStyle = col.muted;
      var m = k === WARPS.length - 1;
      SG.drawSub(ctx, "r", m ? "m" : String(k), sx(w) + 8, 68, F(16), { subMath: m });
    });
    var inv = SG.clamp((t - T.inv0) / (T.inv1 - T.inv0), 0, 1);
    var head = SG.lerp(N, WARPS[0], SG.ease(inv));
    // input video
    var aIn = SG.clamp(t / 600, 0, 1);
    ctx.save(); ctx.globalAlpha = aIn;
    if (!COMPACT) {
      strip(ctx, BX, YL - 30, 104, 58, col.left, col.leftTint, 1);
      var wv = text(ctx, "input video ", BX, YL + 50, col.leftText, 14, 600);
      ctx.font = SG.mathFont(16); ctx.fillStyle = col.leftText; ctx.fillText("V", BX + wv, YL + 50);
    } else {
      ctx.font = SG.font(F(14), 600);
      var wc = ctx.measureText("input video ").width;
      text(ctx, "input video ", X1 - wc - F(11), YL - 16, col.leftText, 14, 600);
      ctx.font = SG.mathFont(F(16)); ctx.fillStyle = col.leftText; ctx.textAlign = "left"; ctx.fillText("V", X1 - F(11), YL - 16);
    }
    ctx.restore();
    // left lane: only the part that inversion recovers
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.strokeStyle = SG.alpha(col.left, 0.2);
    ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.moveTo(X0, YL); ctx.lineTo(sx(WARPS[0]) - 8, YL); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col.leftText; SG.drawSub(ctx, "L", "", X0, YL - 16, F(17));
    text(ctx, "left view", X0 + F(17), YL - 16, col.leftText, 14, 600);
    if (inv > 0) {
      ctx.strokeStyle = col.left; ctx.setLineDash([9, 6]);
      ctx.beginPath(); ctx.moveTo(COMPACT ? X1 : BX - 8, YL); ctx.lineTo(sx(head), YL); ctx.stroke(); ctx.setLineDash([]);
      if (inv < 1) { SG.arrow(ctx, sx(head) + 14, YL, sx(head) - 4, YL, col.left, 3, 12); }
      if (!COMPACT) {
        text(ctx, "inversion", (sx(85) + X1) / 2 + 6, YL - 16, col.leftText, 14, 600, "center");
        ctx.font = SG.mathFont(16); ctx.fillStyle = col.leftText; ctx.textAlign = "left"; ctx.fillText("E(V)", X1 + 8, YL + 24);
      }
    }
    WARPS.forEach(function (w) {
      if (head <= w + 0.01 && inv > 0) {
        ctx.fillStyle = col.left; ctx.fillRect(sx(w) - 7, YL - 7, 14, 14);
        ctx.strokeStyle = col.bg; ctx.lineWidth = 2; ctx.strokeRect(sx(w) - 7, YL - 7, 14, 14);
      }
    });
    if (inv >= 1) {
      ctx.fillStyle = col.left; ctx.fillRect(X0, YL + 22, F(11), F(11));
      text(ctx, "stored left states", X0 + F(18), YL + 22 + F(10), col.muted, 13, 500);
    }
    // depth once
    var aD = SG.clamp((t - T.depth0) / (T.depth1 - T.depth0), 0, 1);
    if (aD > 0) {
      ctx.save(); ctx.globalAlpha = aD;
      var gw = COMPACT ? 88 : 100, gh = 28, gx = COMPACT ? X1 - gw : sx(92.5) - gw / 2, gy = YL + 44;
      var grad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      ["#2c0b57", "#6a176e", "#a72d5f", "#dc5039", "#f98e08"].forEach(function (cc, i) { grad.addColorStop(i / 4, cc); });
      ctx.fillStyle = grad; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = col.hole; ctx.fillRect(gx + gw - 30, gy + 6, 12, 18);
      ctx.lineWidth = 1.5; ctx.strokeStyle = col.holeCase; ctx.strokeRect(gx + gw - 30, gy + 6, 12, 18);
      ctx.font = SG.font(F(14), 600);
      var w1 = ctx.measureText("depth and ").width, w2 = ctx.measureText(", once").width, wh = F(13);
      var lx = COMPACT ? X1 - (w1 + wh + w2) : gx + gw / 2 - (w1 + wh + w2) / 2, ly = gy + gh + F(19);
      text(ctx, "depth and ", lx, ly, col.ink, 14, 600);
      ctx.font = SG.mathFont(F(16)); ctx.fillStyle = col.ink; ctx.textAlign = "left"; ctx.fillText("H", lx + w1, ly);
      text(ctx, ", once", lx + w1 + wh, ly, col.ink, 14, 600);
      if (!COMPACT) { SG.arrow(ctx, BX - 4, YL + 30, gx + gw + 4, gy + 6, col.arrow, 1.4, 7); }
      ctx.restore();
    }
    // right lane forward
    var fw = SG.clamp((t - T.fw0) / (T.fw1 - T.fw0), 0, 1);
    var rh = SG.lerp(WARPS[0], N, SG.ease(fw));
    var xs = sx(WARPS[0]);
    if (fw > 0) {
      ctx.strokeStyle = col.right; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(xs, YL + 8);
      ctx.bezierCurveTo(xs + 4, YL + 60, xs + 8, YR, xs + 36, YR);
      ctx.lineTo(Math.max(xs + 36, sx(rh)), YR); ctx.stroke();
      if (fw < 1) { SG.arrow(ctx, sx(rh) - 12, YR, sx(rh) + 6, YR, col.right, 3, 12); }
      ctx.fillStyle = col.rightText; SG.drawSub(ctx, "R", "", X0, YR - 16, F(17));
      text(ctx, "right view", X0 + F(17), YR - 16, col.rightText, 14, 600);
      if (!COMPACT) { text(ctx, "sampled forward", X0, YR + 4, col.rightText, 13, 500); }
      WARPS.slice(1).forEach(function (w) {
        if (rh >= w - 0.01) {
          ctx.setLineDash([3, 4]); ctx.strokeStyle = col.arrow; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(sx(w), YL + 10); ctx.lineTo(sx(w), YR - 12); ctx.stroke(); ctx.setLineDash([]);
          SG.arrow(ctx, sx(w), YR - 18, sx(w), YR - 5, col.arrow, 1.5, 8);
        }
      });
      if (rh >= WARPS[WARPS.length - 1]) {
        if (COMPACT) { text(ctx, "refresh from the stored left states", (sx(WARPS[1]) + sx(WARPS[WARPS.length - 1])) / 2, YR + F(30), col.muted, 13, 500, "center"); }
        else {
          text(ctx, "refresh: stored left state outside the holes, the right view's own prediction inside",
            (sx(WARPS[1]) + sx(WARPS[WARPS.length - 1])) / 2, YR + 30, col.muted, 13, 500, "center");
        }
      }
    }
    var aO = SG.clamp((t - T.out0) / (T.out1 - T.out0), 0, 1);
    if (aO > 0) {
      if (!COMPACT) {
        strip(ctx, BX, YR - 28, 104, 58, col.right, col.rightTint, aO);
        ctx.save(); ctx.globalAlpha = aO; text(ctx, "right view", BX, YR + 50, col.rightText, 14, 600); ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = aO; ctx.fillStyle = col.right; ctx.beginPath(); ctx.arc(X1, YR, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    var k = 0; TEXT.forEach(function (e, i) { if (t >= e[0]) { k = i; } });
    if (k !== lastText) { lastText = k; statusEl.innerHTML = TEXT[k][1]; }
  }

  function loop(ts) {
    if (start == null) { start = ts; }
    t = ts - start;
    draw();
    if (t < T.out1 + 50) { raf = requestAnimationFrame(loop); }
  }
  function run() {
    cancelAnimationFrame(raf);
    if (SG.reduced) { t = T.out1 + 100; draw(); bReplay.hidden = true; return; }
    start = null; lastText = -1; raf = requestAnimationFrame(loop);
  }
  bReplay.addEventListener("click", run);
  setLayout();
  t = 0; draw();
  if (SG.reduced) { run(); } else { SG.onceVisible(canvas, run); }
  SG.onResize(function () { setLayout(); draw(); });
  SG.onTheme(draw);
})();
