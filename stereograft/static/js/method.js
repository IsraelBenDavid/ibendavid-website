/* How StereoGraft works: a guided stepper over one real Wan 2.1 text-to-stereo sample.
   Timeline (the 50 sampling steps, left and right lanes, the branch and the three refreshes), the algorithm as a
   numbered list, a stage with a left and a right pane, and one caption. Every picture is a pure function of
   (stop, time into the stop, P, layout), so any step can be shown directly and reduced motion gets the end states.
   Data: static/data/method.json, frames: static/images/method/. */
(function () {
  "use strict";
  var SG = window.SG;
  var fig = document.getElementById("hw");
  if (!fig || !SG) { return; }
  function $(id) { return document.getElementById(id); }

  var IMG = "static/images/method/";
  var COLS = 104, ROWS = 60, CELL = 8, FW = 832, FH = 480, CTX = 8;
  var HOLE = "#ffd32a", CASE = "#262b31", RED = "#f0353a", CYAN = "#19c6e0";
  var RAMP = ["#2c0b57", "#6a176e", "#a72d5f", "#dc5039", "#f98e08"];

  var timeCv = SG.fluidCanvas($("hw-time"));
  var stageEl = $("hw-stage"), stageBox = $("hw-stage-box"), sctx = stageEl.getContext("2d");
  var ptL = $("hw-pt-l"), ptR = $("hw-pt-r"), ptA = $("hw-pt-a");
  var noteL = $("hw-note-l"), noteR = $("hw-note-r"), keyEl = $("hw-key"), capEl = $("hw-cap");
  var countEl = $("hw-count"), nowPill = $("hw-now-pill"), nowT = $("hw-now-t"), pipsT = $("hw-pips-t");
  var bPrev = $("hw-prev"), bNext = $("hw-next"), bPlay = $("hw-play"), bReplay = $("hw-replay");
  var items = Array.prototype.slice.call(fig.querySelectorAll(".hw-list li"));
  var pips = Array.prototype.slice.call(fig.querySelectorAll("#hw-pips i"));
  var padBtns = Array.prototype.slice.call(fig.querySelectorAll(".hw-pad button"));

  var D = null, WARPS = [5, 10, 15, 20], WP = [], WIN = null, WINV = null;
  var P = 1, cur = 0, u = 0, playing = false, started = false, visible = false, raf = null, lastTs = null, dwell = 0;
  var ana = 0, anaTarget = 0;
  var lay = null, col = null, tileCv = null, tileKey = "", TD = 0, anaCv = null, anaKey = "", noiseCv = null, noisePat = null;
  var shownPhase = "", shownKey = "", dirty = true;

  /* ------------------------------------------------------------------ the walkthrough */
  var PH = {
    sample: 1900, depth: 1000, shift: 1800, branch: 2200, fill: 2000, denoise: 2300, redepth: 2100, graft: 1900, finish: 2400
  };
  var STOPS = [
    { item: 1, k: 0, ph: [["sample", 1]] },
    { item: 2, k: 0, ph: [["depth", 1]] },
    { item: 3, k: 0, ph: [["shift", 1]] },
    { item: 4, k: 0, ph: [["branch", 1]] },
    { item: 5, k: 0, ph: [["fill", 1]] },
    { item: 6, k: 1, ph: [["denoise", 1]] },
    { item: 7, k: 1, ph: [["redepth", 1]] },
    { item: 8, k: 1, ph: [["graft", 1]] },
    { item: 9, k: 2, ph: [["denoise", 1.45], ["redepth", 1.45], ["graft", 1.2]] },
    { item: 9, k: 3, ph: [["denoise", 1.45], ["redepth", 1.45], ["graft", 1.2]] },
    { item: 10, k: 3, ph: [["finish", 1]] }
  ];
  var TITLES = ["Sample the left view", "Estimate depth", "Turn depth into a shift", "Branch the right view", "Fill the holes",
    "Denoise both views", "Refresh: new depth, new holes", "Refresh: copy the left, keep the holes", "Repeat the refresh",
    "Finish and decode"];
  var M = function (s) { return "<i class=\"m\">" + s + "</i>"; };
  var LH = M("L&#770;"), RH = M("R&#770;");
  function rk(k) { return M("r") + (k === 3 ? "<sub>" + M("m") + "</sub>" : "<sub>" + k + "</sub>"); }
  function tOf(k) { return D.warps[k].t.toFixed(2); }

  function caption(i) {
    var k = STOPS[i].k;
    switch (i) {
      case 0: return "A frozen text-to-video model samples the <b>left view</b> as it would sample any video. At every step it also predicts the clean video " + LH + "; by step " + rk(0) + " = 5 of 50 that prediction is still soft, but the layout of the scene is there.";
      case 1: return "A depth estimator is applied to that early prediction. Depth settles long before appearance does, so the geometry needed for stereo is known while most of the sampling still lies ahead.";
      case 2: return "Depth becomes disparity: the farthest surface gets zero and the nearest gets " + M("d") + "<sub>max</sub> = 32 px. Divided by the 8-px width of a latent cell and rounded, that is a whole-cell shift: 3 cells for the penguin, 1 for the wall behind it.";
      case 3: return "Each cell of the left view's noisy latent " + M("L") + " moves left by its shift and starts the right view " + M("R") + ", so shared surfaces begin with the same content and the same noise. Where cells collide the nearer one wins; cells that nothing lands on are the <b>holes</b> " + M("H") + ".";
      case 4: return "A hole opens just to the right of a nearer object, so the nearest covered cell to its right is usually background: it is copied in as a guess. Fresh noise brings the guess to the current noise level (" + M("t") + " = " + tOf(0) + "), and the model repaints it in the steps that follow.";
      case 5: return "From here the same frozen model denoises both views side by side. The right view grows its own content in the holes, but details on shared surfaces can slowly drift away from the left view.";
      case 6: return "By the refresh step " + rk(1) + " = 10 the left view has sharpened, so depth is estimated again from its current prediction, and the shift and the holes are recomputed. " +
        (P ? "Each hole also grows by " + M("P") + " = 1 cell to the right, which removes slivers of foreground left at its border."
          : "With " + M("P") + " = 0 the holes are used as they are; " + M("P") + " = 1 would grow each one by a cell to the right, to remove slivers of foreground at its border.");
      case 7: return "Outside the holes, the shifted left latent is copied again to keep shared surfaces aligned. Inside them, the left view never saw that background, so the right view keeps its own prediction " + RH + ", re-noised to " + M("t") + " = " + tOf(1) + ": it is the <b>donor</b> of its own holes.";
      case 8: return "The same refresh at " + rk(2) + " = 15 (" + M("t") + " = " + tOf(2) + "): new depth, new holes, the left view copied again outside them, and the right view's own content carried forward inside them.";
      case 9: return "And once more at " + rk(3) + " = 20 (" + M("t") + " = " + tOf(3) + "). Each refresh hands the right view's holes on to the next one; together the refreshes form the <b>donor chain</b>.";
      default: return "After the last refresh both views finish sampling on their own and are decoded. The left view is exactly the video the model would have made alone; the right view shows the same scene from a second eye.";
    }
  }
  var K = function (cls, text) { return "<span><i class=\"k " + cls + "\"></i><span>" + text + "</span></span>"; };
  function phaseText(name, k) {
    var r = WARPS[k], wk;
    switch (name) {
      case "sample": return { l: "clean prediction " + LH + " at step 5", r: "", key: "<span><span>Pictures show the clean video the model predicts at a step, not the noisy latent itself.</span></span>" };
      case "depth": return { l: "depth of " + LH, r: "", key: K("k-ramp", "far to near") };
      case "shift":
        wk = [0, 1, 2, 3, 4].map(function (v) { return "<i class=\"k k-w\" style=\"background:" + RAMP[v] + (v === 4 ? ";color:#1d1d1f" : "") + "\">" + v + "</i>"; }).join("");
        return { l: "shift per latent cell &middot; zoom &times;4", r: "", key: "<span>" + wk + "<span>cells moved to the left &middot; one square is one 8-px latent cell</span></span>" };
      case "branch": return { l: "latent " + M("L") + ", cell by cell", r: "the shifted left latent", key: K("k-hole", "hole " + M("H") + ": no cell landed here") };
      case "fill": return { l: "latent " + M("L"), r: "holes filled", key: K("k-holeline", "hole " + M("H")) + K("k-noise", "background guess under fresh noise") };
      case "denoise": return { l: "clean prediction " + LH + " at step " + r, r: "clean prediction " + RH + " at step " + r, key: K("k-holeline", "where the holes were") };
      case "redepth": return { l: "new shift per cell, from new depth", r: "its own prediction " + RH + " at step " + r,
        key: K("k-holeline", "holes " + M("H") + ", recomputed") + (P ? K("k-pad", "padding: " + M("P") + " = 1 cell to the right of each hole") : "") };
      case "graft": return { l: "latent " + M("L"), r: "what the refresh writes",
        key: K("k-left", "copied again from the shifted left view") + K("k-right", "kept from its own prediction " + RH + ", re-noised") };
      default: return { l: "final video, frame 40 of 81", r: "final video, frame 40 of 81", key: "__switch__" };
    }
  }
  function phaseImgs(name, k) {
    var r = WARPS[k], a = [], s, r0;
    var L = function (x) { return "L_" + (typeof x === "number" ? SG.pad2(x) : x); }, R = function (x) { return "R_" + (typeof x === "number" ? SG.pad2(x) : x); };
    switch (name) {
      case "sample": for (s = 0; s <= 5; s++) { a.push(L(s)); } break;
      case "depth": case "shift": a.push(L(5), "z_05"); break;
      case "branch": a.push(L(5)); break;
      case "fill": a.push(L(5), "S_05"); break;
      case "denoise":
        r0 = WARPS[k - 1];
        a.push(k === 1 ? "S_05" : "C_" + r0, "S_" + SG.pad2(r0));
        for (s = r0; s <= r; s++) { a.push(L(s)); if (s > r0) { a.push(R(s)); } }
        break;
      case "redepth": a.push(L(r), R(r), "z_" + r); break;
      case "graft": a.push(L(r), R(r), "C_" + r, "S_" + r); break;
      default:
        a.push(L(20), "C_20", "S_20");
        D.finish.forEach(function (x) { a.push(L(x), R(x)); });
        a.push("L_fin", "R_fin");
    }
    return a;
  }
  function stopDur(i) { return STOPS[i].ph.reduce(function (acc, p) { return acc + PH[p[0]] / p[1]; }, 0); }
  function locate(i, ms) {
    var ph = STOPS[i].ph, off = 0, j, d;
    for (j = 0; j < ph.length; j++) {
      d = PH[ph[j][0]] / ph[j][1];
      if (ms < off + d || j === ph.length - 1) { return { name: ph[j][0], k: STOPS[i].k, lu: Math.min(PH[ph[j][0]], (ms - off) * ph[j][1]), idx: j }; }
      off += d;
    }
    return null;
  }
  function stopImgs(i) {
    var out = [];
    STOPS[i].ph.forEach(function (p) { phaseImgs(p[0], STOPS[i].k).forEach(function (n) { if (out.indexOf(n) < 0) { out.push(n); } }); });
    return out;
  }

  /* ------------------------------------------------------------------ images (loaded per step, next step preloaded) */
  var cache = {};
  function img(name) {
    var e = cache[name];
    if (!e) {
      e = cache[name] = { im: new Image(), ok: false };
      e.im.decoding = "async";
      e.im.onload = function () { e.ok = true; kick(); };
      e.im.src = IMG + name + ".webp";
    }
    return e.ok ? e.im : null;
  }
  function ready(names) { var ok = true; names.forEach(function (n) { if (!img(n)) { ok = false; } }); return ok; }

  /* ------------------------------------------------------------------ helpers */
  var seg = function (x, a, b) { return SG.clamp((x - a) / (b - a), 0, 1); };
  var ez = function (x, a, b) { return SG.ease(seg(x, a, b)); };
  function viewAt(z) {
    var w = FW * Math.pow(WINV.w / FW, z), f = (FW - w) / (FW - WINV.w);
    return { x: WINV.x * f, y: WINV.y * f, w: w, h: w * FH / FW };
  }
  function cellPx(v, p) { return p.w * CELL / v.w; }
  function cx(v, p, c) { return p.x + (c * CELL - v.x) * p.w / v.w; }
  function cy(v, p, r) { return p.y + (r * CELL - v.y) * p.h / v.h; }
  function span(v) {
    return { c0: Math.max(0, Math.floor(v.x / CELL)), c1: Math.min(COLS, Math.ceil((v.x + v.w) / CELL)),
      r0: Math.max(0, Math.floor(v.y / CELL)), r1: Math.min(ROWS, Math.ceil((v.y + v.h) / CELL)) };
  }
  function inPane(p, fn, bg) {
    sctx.save();
    SG.roundRect(sctx, p.x, p.y, p.w, p.h, 8); sctx.clip();
    if (bg !== false) { sctx.fillStyle = bg || col.panel; sctx.fillRect(p.x, p.y, p.w, p.h); }
    fn();
    sctx.restore();
  }
  function drawImg(p, name, v, a) {
    var im = img(name);
    if (!im || a <= 0) { return; }
    sctx.save();
    sctx.globalAlpha = Math.min(1, a);
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(im, v.x, v.y, v.w, v.h, p.x, p.y, p.w, p.h);
    sctx.restore();
  }
  /* frames[i] cross-fading into frames[i + 1]; f in [0, frames.length - 1] */
  function drawSeq(p, frames, f, v, drawFirst) {
    var i = Math.min(frames.length - 1, Math.floor(f)), fr = f - i, a = SG.ease(seg(fr, 0.35, 1));
    var one = function (j, al) { if (j === 0 && drawFirst) { drawFirst(al); } else { drawImg(p, frames[j], v, al); } };
    one(i, 1);
    if (i + 1 < frames.length && a > 0) { one(i + 1, a); }
  }
  function grid(p, v, a) {
    var cs = cellPx(v, p), s = span(v), c, r, x, y;
    if (a <= 0 || cs < 9) { return; }
    sctx.save();
    sctx.strokeStyle = "rgba(255,255,255," + (0.17 * a) + ")"; sctx.lineWidth = 1;
    sctx.beginPath();
    for (c = s.c0; c <= s.c1; c++) { x = Math.round(cx(v, p, c)) + 0.5; sctx.moveTo(x, p.y); sctx.lineTo(x, p.y + p.h); }
    for (r = s.r0; r <= s.r1; r++) { y = Math.round(cy(v, p, r)) + 0.5; sctx.moveTo(p.x, y); sctx.lineTo(p.x + p.w, y); }
    sctx.stroke();
    sctx.restore();
  }
  /* fill every visible cell with test(r, c) true, merged into row runs */
  function fillCells(p, v, test, color, a) {
    if (a <= 0) { return; }
    var s = span(v), cs = cellPx(v, p), r, c, c0;
    sctx.save(); sctx.globalAlpha = a; sctx.fillStyle = color;
    for (r = s.r0; r < s.r1; r++) {
      c0 = -1;
      for (c = s.c0; c <= s.c1; c++) {
        if (c < s.c1 && test(r, c)) { if (c0 < 0) { c0 = c; } }
        else if (c0 >= 0) { sctx.fillRect(cx(v, p, c0), cy(v, p, r), (c - c0) * cs, cs); c0 = -1; }
      }
    }
    sctx.restore();
  }
  function cellsPath(p, v, test) {
    var s = span(v), cs = cellPx(v, p), r, c;
    sctx.beginPath();
    for (r = s.r0; r < s.r1; r++) { for (c = s.c0; c < s.c1; c++) { if (test(r, c)) { sctx.rect(cx(v, p, c), cy(v, p, r), cs, cs); } } }
  }
  /* outline of a cell region: a coloured line cased in dark, as the paper draws holes */
  function outline(p, v, test, o) {
    if (o.a <= 0) { return; }
    var s = span(v), cs = cellPx(v, p), r, c, x, y, big = cs >= 9;
    var T = function (rr, cc) { return rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && test(rr, cc); };
    sctx.save();
    sctx.globalAlpha = o.a;
    sctx.beginPath();
    for (r = s.r0; r < s.r1; r++) {
      for (c = s.c0; c < s.c1; c++) {
        if (!T(r, c)) { continue; }
        x = cx(v, p, c); y = cy(v, p, r);
        if (!T(r - 1, c)) { sctx.moveTo(x, y); sctx.lineTo(x + cs, y); }
        if (!T(r + 1, c)) { sctx.moveTo(x, y + cs); sctx.lineTo(x + cs, y + cs); }
        if (!T(r, c - 1)) { sctx.moveTo(x, y); sctx.lineTo(x, y + cs); }
        if (!T(r, c + 1)) { sctx.moveTo(x + cs, y); sctx.lineTo(x + cs, y + cs); }
      }
    }
    sctx.lineCap = o.dash ? "butt" : "square";
    if (o.dash) { sctx.setLineDash(o.dash); }
    if (o.cased !== false) { sctx.strokeStyle = CASE; sctx.lineWidth = big ? 4.5 : 2.6; sctx.stroke(); }
    sctx.strokeStyle = o.color; sctx.lineWidth = big ? (o.lw || 2.2) : 1.3; sctx.stroke();
    sctx.restore();
  }
  function shiftTint(p, v, wp, ta, da) {
    var s = span(v), cs = cellPx(v, p), r, c, w, c0, x, y;
    if (ta > 0) {
      sctx.save(); sctx.globalAlpha = ta;
      for (r = s.r0; r < s.r1; r++) {
        c0 = s.c0;
        for (c = s.c0 + 1; c <= s.c1; c++) {
          if (c === s.c1 || wp.w[r * COLS + c] !== wp.w[r * COLS + c0]) {
            sctx.fillStyle = RAMP[wp.w[r * COLS + c0]];
            sctx.fillRect(cx(v, p, c0), cy(v, p, r), (c - c0) * cs, cs);
            c0 = c;
          }
        }
      }
      sctx.restore();
    }
    if (da > 0 && cs >= 12) {
      sctx.save();
      sctx.font = SG.font(cs >= 14 ? 12 : 10, 600); sctx.textAlign = "center"; sctx.textBaseline = "middle";
      for (r = s.r0; r < s.r1; r++) {
        for (c = s.c0; c < s.c1; c++) {
          w = wp.w[r * COLS + c];
          x = cx(v, p, c) + cs / 2; y = cy(v, p, r) + cs / 2 + 0.5;
          sctx.globalAlpha = da * (w === 4 ? 0.95 : 0.92);
          sctx.fillStyle = w === 4 ? "#1d1d1f" : "#ffffff";
          sctx.fillText(String(w), x, y);
        }
      }
      sctx.restore();
    }
    grid(p, v, Math.max(ta, da));
  }
  function noise(p, v, test, a, jitter) {
    if (a <= 0 || !noisePat) { return; }
    sctx.save();
    cellsPath(p, v, test); sctx.clip();
    sctx.globalAlpha = a;
    sctx.translate(p.x + (jitter * 37) % 96, p.y + (jitter * 59) % 96);
    sctx.fillStyle = noisePat;
    sctx.fillRect(-96, -96, p.w + 192, p.h + 192);
    sctx.restore();
  }
  function emptyPane(p, a, text) {
    if (a <= 0) { return; }
    sctx.save();
    sctx.globalAlpha = a;
    SG.roundRect(sctx, p.x + 0.75, p.y + 0.75, p.w - 1.5, p.h - 1.5, 8);
    sctx.setLineDash([5, 5]); sctx.strokeStyle = col.line; sctx.lineWidth = 1.5; sctx.stroke();
    sctx.setLineDash([]);
    sctx.fillStyle = col.muted; sctx.font = SG.font(13.5, 500); sctx.textAlign = "center"; sctx.textBaseline = "middle";
    sctx.fillText(text, p.x + p.w / 2, p.y + p.h / 2);
    sctx.restore();
  }
  function label(text, x, y, color, a, align) {
    if (a <= 0) { return; }
    sctx.save(); sctx.globalAlpha *= a;
    sctx.font = SG.font(12.5, 600); sctx.fillStyle = color; sctx.textAlign = align || "center"; sctx.textBaseline = "alphabetic";
    sctx.fillText(text, x, y);
    sctx.restore();
  }
  /* a straight arrow growing with t */
  function arrow(ctx, x1, y1, x2, y2, color, t, lw) {
    if (t <= 0) { return; }
    var e = SG.ease(t), X2 = x1 + (x2 - x1) * e, Y2 = y1 + (y2 - y1) * e;
    ctx.save(); ctx.globalAlpha *= Math.min(1, t * 4); ctx.lineCap = "round";
    SG.arrow(ctx, x1, y1, X2, Y2, color, lw || 2.2, Math.min(9, 4 + 3 * (lw || 2.2) * 0.8));
    ctx.restore();
  }
  /* a loop that leaves the lane at the left, goes around below and returns at the right, growing with t */
  function loop(ctx, x, y, r, color, t, lw) {
    if (t <= 0) { return; }
    var a0 = -150 * Math.PI / 180, sweep = -240 * Math.PI / 180 * SG.ease(t), a1 = a0 + sweep;
    ctx.save(); ctx.globalAlpha *= Math.min(1, t * 4);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1, true); ctx.stroke();
    if (t > 0.5) {
      var ex = x + r * Math.cos(a1), ey = y + r * Math.sin(a1), tx = Math.sin(a1), ty = -Math.cos(a1), hd = Math.max(5.5, r * 0.72);
      var bx = ex - tx * hd * 0.2, by = ey - ty * hd * 0.2, ang = Math.atan2(ty, tx);
      ctx.beginPath();
      ctx.moveTo(bx + tx * hd * 0.75, by + ty * hd * 0.75);
      ctx.lineTo(bx - hd * 0.7 * Math.cos(ang - 0.6), by - hd * 0.7 * Math.sin(ang - 0.6));
      ctx.lineTo(bx - hd * 0.7 * Math.cos(ang + 0.6), by - hd * 0.7 * Math.sin(ang + 0.6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ warp data */
  function parse() {
    WIN = D.window;
    WINV = { x: WIN.c0 * CELL, y: WIN.r0 * CELL, w: WIN.cols * CELL, h: WIN.rows * CELL };
    WARPS = D.warps.map(function (x) { return x.step; });
    WP = D.warps.map(function (x) {
      var w = new Int8Array(ROWS * COLS), H = new Uint8Array(ROWS * COLS), Pd = new Uint8Array(ROWS * COLS), r, c;
      for (r = 0; r < ROWS; r++) {
        for (c = 0; c < COLS; c++) {
          w[r * COLS + c] = x.w[r].charCodeAt(c) - 48;
          H[r * COLS + c] = x.H[r].charCodeAt(c) - 48;
          Pd[r * COLS + c] = x.P[r].charCodeAt(c) - 48;
        }
      }
      /* forward warp: left cell c lands on c - w; the largest shift (nearest surface) wins; off-frame cells drop */
      var src = new Int16Array(ROWS * COLS).fill(-1), t, q;
      for (r = 0; r < ROWS; r++) {
        for (c = 0; c < COLS; c++) {
          t = c - w[r * COLS + c];
          if (t < 0) { continue; }
          q = src[r * COLS + t];
          if (q < 0 || w[r * COLS + c] > w[r * COLS + q]) { src[r * COLS + t] = c; }
        }
      }
      /* nearest covered cell to the right of each hole (the background guess of the branch) */
      var rho = new Int16Array(ROWS * COLS).fill(-1), nxt;
      for (r = 0; r < ROWS; r++) {
        nxt = -2;
        for (c = COLS - 1; c >= 0; c--) { if (src[r * COLS + c] < 0) { rho[r * COLS + c] = nxt; } else { nxt = c; } }
      }
      return { step: x.step, w: w, H: H, P: Pd, src: src, rho: rho };
    });
  }
  function isH(k) { var m = WP[k].H; return function (r, c) { return m[r * COLS + c] === 1; }; }
  function isP(k) { var m = WP[k].P; return function (r, c) { return P === 1 && m[r * COLS + c] === 1; }; }
  function isKept(k) { var h = WP[k].H, p = WP[k].P; return function (r, c) { var i = r * COLS + c; return h[i] === 1 || (P === 1 && p[i] === 1); }; }
  function isCovered(k) { var f = isKept(k); return function (r, c) { return !f(r, c); }; }

  /* ------------------------------------------------------------------ layout */
  function layout() {
    var W = Math.floor(stageBox.clientWidth), dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (W < 40) { return false; }
    var stacked = W < 560, cell, pw, phh, G, x0, top = 26, L, R, Hh;
    if (stacked) {
      cell = Math.min(22, Math.floor(W / WIN.cols)); pw = cell * WIN.cols; phh = cell * WIN.rows; G = 58;
      x0 = Math.round((W - pw) / 2);
      L = { x: x0, y: top, w: pw, h: phh }; R = { x: x0, y: top + phh + G, w: pw, h: phh };
      Hh = R.y + phh + 2;
    } else {
      cell = Math.min(22, Math.floor((W - 64) / (2 * WIN.cols))); pw = cell * WIN.cols; phh = cell * WIN.rows;
      G = Math.min(112, W - 2 * pw);
      x0 = Math.round((W - 2 * pw - G) / 2);
      L = { x: x0, y: top, w: pw, h: phh }; R = { x: x0 + pw + G, y: top, w: pw, h: phh };
      Hh = top + phh + 2;
    }
    lay = { W: W, H: Hh, dpr: dpr, stacked: stacked, cell: cell, G: G, L: L, R: R,
      C: stacked ? { x: x0, y: Math.round((L.y + R.y) / 2), w: pw, h: phh } : { x: Math.round((L.x + R.x) / 2), y: top, w: pw, h: phh } };
    stageEl.style.height = Hh + "px";
    var cw = Math.round(W * dpr), ch = Math.round(Hh * dpr);
    if (stageEl.width !== cw || stageEl.height !== ch) { stageEl.width = cw; stageEl.height = ch; }
    [[ptL, L], [ptR, R], [ptA, lay.C]].forEach(function (a) {
      a[0].style.left = a[1].x + "px"; a[0].style.top = (a[1].y - 24) + "px"; a[0].style.width = a[1].w + "px";
    });
    return true;
  }
  function buildNoise() {
    noiseCv = document.createElement("canvas"); noiseCv.width = noiseCv.height = 96;
    var c = noiseCv.getContext("2d"), s = 12345, x, y, b = 3;
    var rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (y = 0; y < 96; y += b) {
      for (x = 0; x < 96; x += b) {
        c.fillStyle = "rgb(" + Math.round(60 + 180 * rnd()) + "," + Math.round(60 + 180 * rnd()) + "," + Math.round(60 + 180 * rnd()) + ")";
        c.fillRect(x, y, b, b);
      }
    }
    noisePat = sctx.createPattern(noiseCv, "repeat");
  }
  /* the zoom window of L-hat at the branch (plus a margin on the right), resampled once so that cells can be copied 1:1 */
  function tiles() {
    var im = img("L_05");
    if (!im || !lay) { return null; }
    var key = lay.cell + "@" + lay.dpr;
    if (tileKey !== key) {
      TD = Math.max(1, Math.round(lay.cell * lay.dpr));
      tileCv = tileCv || document.createElement("canvas");
      tileCv.width = (WIN.cols + CTX) * TD; tileCv.height = WIN.rows * TD;
      var c = tileCv.getContext("2d"); c.imageSmoothingQuality = "high";
      c.drawImage(im, WINV.x, WINV.y, (WIN.cols + CTX) * CELL, WINV.h, 0, 0, tileCv.width, tileCv.height);
      tileKey = key;
    }
    return tileCv;
  }
  function tile(leftCol, row, dx, dy) {
    var sc = leftCol - WIN.c0, sr = row - WIN.r0;
    if (sc < 0 || sc >= WIN.cols + CTX || sr < 0 || sr >= WIN.rows) { return; }
    sctx.drawImage(tileCv, sc * TD, sr * TD, TD, TD, dx, dy, lay.cell, lay.cell);
  }
  /* the left window's cells, each moved left by slide x its shift; nearer cells are drawn last, so they win */
  function drawTiles(p, slide, tintA, digitA) {
    if (!tiles()) { return; }
    var wp = WP[0], cs = lay.cell, base = sctx.globalAlpha, wv, r, c, w, x, y;
    for (wv = 0; wv <= 4; wv++) {
      for (r = WIN.r0; r < WIN.r0 + WIN.rows; r++) {
        for (c = WIN.c0; c < WIN.c0 + WIN.cols + CTX; c++) {
          w = wp.w[r * COLS + c];
          if (w !== wv) { continue; }
          x = p.x + (c - WIN.c0 - w * slide) * cs; y = p.y + (r - WIN.r0) * cs;
          if (x > p.x + p.w || x + cs < p.x) { continue; }
          tile(c, r, x, y);
          if (tintA > 0) { sctx.globalAlpha = base * tintA; sctx.fillStyle = RAMP[w]; sctx.fillRect(x, y, cs, cs); sctx.globalAlpha = base; }
          if (digitA > 0 && cs >= 12) {
            sctx.globalAlpha = base * digitA * 0.92; sctx.fillStyle = "#fff";
            sctx.font = SG.font(cs >= 14 ? 12 : 10, 600); sctx.textAlign = "center"; sctx.textBaseline = "middle";
            sctx.fillText(String(w), x + cs / 2, y + cs / 2 + 0.5); sctx.globalAlpha = base;
          }
        }
      }
    }
  }
  /* what warp j left in the right view, shown clean: S[L-hat] with the guess (j = 0) or the refresh's composite */
  function drawPost(p, v, j, a) {
    if (j === 0) { drawImg(p, "S_05", v, a); return; }
    var r = WARPS[j];
    drawImg(p, "C_" + r, v, a);
    if (P === 0) {
      /* without padding those cells are copied from the shifted left view instead */
      var im = img("S_" + r), m = WP[j].P, s = span(v), cs = cellPx(v, p), rr, c;
      if (!im) { return; }
      sctx.save(); sctx.globalAlpha = Math.min(1, a);
      for (rr = s.r0; rr < s.r1; rr++) {
        for (c = s.c0; c < s.c1; c++) {
          if (m[rr * COLS + c]) { sctx.drawImage(im, c * CELL, rr * CELL, CELL, CELL, cx(v, p, c), cy(v, p, rr), cs, cs); }
        }
      }
      sctx.restore();
    }
  }
  /* overlays of the state after warp j: washes, noise and the hole outline; a scales all of them */
  function postOverlays(p, v, j, a, lineA) {
    if (j === 0) {
      noise(p, v, isH(0), 0.6 * a, 3);
    } else {
      fillCells(p, v, isCovered(j), RED, 0.24 * a);
      fillCells(p, v, isKept(j), CYAN, 0.44 * a);
      noise(p, v, isKept(j), 0.2 * a, 3 + j);
    }
    outline(p, v, isH(j), { color: HOLE, a: lineA == null ? a : lineA });
  }

  /* ------------------------------------------------------------------ gutter glyphs */
  function gutterArrow(t, text, colr, tcol, frac) {
    var L = lay.L, R = lay.R, x1, x2, y, x;
    if (!lay.stacked) {
      x1 = L.x + L.w + 12; x2 = R.x - 12; y = Math.round(L.y + L.h * (frac == null ? 0.5 : frac));
      arrow(sctx, x1, y, x2, y, colr, t, 2.4);
      label(text, (x1 + x2) / 2, y - 11, tcol, seg(t, 0.2, 0.8));
    } else {
      x = Math.round(L.x + L.w * (frac == null ? 0.5 : frac)); y = L.y + L.h + 7;
      arrow(sctx, x, y, x, y + 24, colr, t, 2.4);
      label(text, x + 11, y + 17, tcol, seg(t, 0.2, 0.8), "left");
    }
  }
  function gutterLoop(t, text, tcol) {
    var L = lay.L, R = lay.R, x, y;
    if (!lay.stacked) {
      x = R.x - 12 - 11; y = Math.round(L.y + L.h * 0.66);
      loop(sctx, x, y, 11, CYAN, t, 2.4);
      label(text, x, y + 30, tcol, seg(t, 0.2, 0.8));
    } else {
      x = Math.round(L.x + L.w * 0.7); y = L.y + L.h + 20;
      loop(sctx, x, y, 9, CYAN, t, 2.2);
      label(text, x + 17, y + 4, tcol, seg(t, 0.2, 0.8), "left");
    }
  }

  function faded(a, fn) { if (a <= 0) { return; } sctx.save(); sctx.globalAlpha = a; fn(); sctx.restore(); }
  function graftGlyphs(a) {
    faded(a, function () { gutterArrow(1, "copy", RED, col.leftText, 0.36); gutterLoop(1, "keep", col.rightText); });
  }

  /* ------------------------------------------------------------------ the phases */
  var DRAW = {
    sample: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(0), f = seg(lu, 150, PH.sample - 250) * 5;
      inPane(L, function () { drawSeq(L, ["L_00", "L_01", "L_02", "L_03", "L_04", "L_05"], f, v); });
      emptyPane(R, 1, "not started");
    },
    depth: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(0);
      inPane(L, function () { drawImg(L, "L_05", v, 1); drawImg(L, "z_05", v, ez(lu, 100, 850)); });
      emptyPane(R, 1, "not started");
    },
    shift: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(ez(lu, 0, 800)), t = ez(lu, 700, 1200);
      inPane(L, function () {
        drawImg(L, "L_05", v, 1); drawImg(L, "z_05", v, 1 - t);
        shiftTint(L, v, WP[0], 0.8 * t, ez(lu, 1100, 1600));
      });
      emptyPane(R, 1, "not started");
    },
    branch: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(1), fly = ez(lu, 250, 900), slide = ez(lu, 1050, 1900), fade = 1 - seg(lu, 1800, 2150);
      var tint = SG.lerp(0.8, 0.3, ez(lu, 0, 400));
      inPane(L, function () { drawImg(L, "L_05", v, 1); shiftTint(L, v, WP[0], tint, 1); });
      emptyPane(R, 1 - seg(lu, 250, 600), "not started");
      gutterArrow(seg(lu, 100, 650), "shift", RED, col.leftText);
      if (lu > 250) {
        var g = { x: SG.lerp(L.x, R.x, lay.stacked ? 1 : fly), y: SG.lerp(L.y, R.y, lay.stacked ? fly : 1), w: R.w, h: R.h };
        sctx.save(); sctx.globalAlpha = seg(lu, 250, 480);
        inPane(g, function () { drawTiles(g, slide, 0.3 * fade, fade); grid(g, v, fade); }, HOLE);
        sctx.restore();
        if (slide >= 1) { inPane(R, function () { outline(R, v, isH(0), { color: CASE, a: seg(lu, 1900, 2150), cased: false, lw: 1.5 }); }, false); }
      }
    },
    fill: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(1), cs = lay.cell, wp = WP[0], g = ez(lu, 150, 900), real = ez(lu, 850, 1250);
      var tf = 1 - ez(lu, 0, 400);
      inPane(L, function () { drawImg(L, "L_05", v, 1); shiftTint(L, v, wp, 0.3 * tf, tf); grid(L, v, 1 - tf); });
      inPane(R, function () {
        drawTiles(R, 1, 0, 0);
        if (tiles() && real < 1) {
          /* the guess: each hole takes the nearest covered cell to its right */
          var r, c, q;
          for (r = WIN.r0; r < WIN.r0 + WIN.rows; r++) {
            for (c = WIN.c0; c < WIN.c0 + WIN.cols; c++) {
              if (!wp.H[r * COLS + c]) { continue; }
              q = wp.rho[r * COLS + c];
              if (q < 0) { continue; }
              sctx.globalAlpha = seg(g, 0, 0.25);
              tile(wp.src[r * COLS + q], r, R.x + (SG.lerp(q, c, g) - WIN.c0) * cs, R.y + (r - WIN.r0) * cs);
              sctx.globalAlpha = 1;
            }
          }
        }
        drawImg(R, "S_05", v, real);
        noise(R, v, isH(0), 0.6 * ez(lu, 1150, 1700), lu < 1850 ? Math.floor(lu / 80) : 3);
        outline(R, v, isH(0), { color: HOLE, a: 1 });
      }, HOLE);
      faded(1 - seg(lu, 0, 350), function () { gutterArrow(1, "shift", RED, col.leftText); });
    },
    denoise: function (lu, k) {
      var L = lay.L, R = lay.R, rA = WARPS[k - 1], rB = WARPS[k], v = viewAt(1 - ez(lu, 0, 700));
      var f = seg(lu, 700, PH.denoise - 200) * (rB - rA), fl = [], fr = [null], s;
      for (s = rA; s <= rB; s++) { fl.push("L_" + SG.pad2(s)); if (s > rA) { fr.push("R_" + SG.pad2(s)); } }
      var ov = 1 - seg(lu, 0, 450), line = 1;
      inPane(L, function () { drawSeq(L, fl, f, v); grid(L, v, 1 - seg(lu, 0, 500)); });
      inPane(R, function () {
        drawSeq(R, fr, f, v, function (a) { drawPost(R, v, k - 1, a); });
        postOverlays(R, v, k - 1, ov, line);
      });
      if (k > 1) { graftGlyphs(ov); }
    },
    redepth: function (lu, k) {
      var L = lay.L, R = lay.R, r = WARPS[k], v = viewAt(ez(lu, 0, 700));
      var dep = ez(lu, 550, 900) * (1 - ez(lu, 1250, 1600)), t = ez(lu, 1250, 1600);
      var oldA = 1 - ez(lu, 1150, 1500), newA = ez(lu, 1250, 1600), padA = ez(lu, 1650, 2000);
      inPane(L, function () {
        drawImg(L, "L_" + r, v, 1); drawImg(L, "z_" + r, v, dep);
        shiftTint(L, v, WP[k], 0.8 * t, ez(lu, 1450, 1850));
      });
      inPane(R, function () {
        drawImg(R, "R_" + r, v, 1);
        outline(R, v, isH(k - 1), { color: HOLE, a: oldA });
        outline(R, v, isP(k), { color: CYAN, a: padA, dash: [2.5, 3.5], lw: 2.4 });
        outline(R, v, isH(k), { color: HOLE, a: newA });
      });
    },
    graft: function (lu, k) {
      var L = lay.L, R = lay.R, r = WARPS[k], v = viewAt(1), tf = 1 - ez(lu, 0, 400);
      var comp = ez(lu, 300, 850), red = 0.5 * ez(lu, 250, 650) - 0.26 * ez(lu, 950, 1500);
      var cyan = 0.66 * ez(lu, 900, 1250) - 0.22 * ez(lu, 1450, 1850);
      inPane(L, function () { drawImg(L, "L_" + r, v, 1); shiftTint(L, v, WP[k], 0.8 * tf, tf); grid(L, v, 1 - tf); });
      inPane(R, function () {
        drawImg(R, "R_" + r, v, 1);
        drawPost(R, v, k, comp);
        fillCells(R, v, isCovered(k), RED, red);
        fillCells(R, v, isKept(k), CYAN, cyan);
        noise(R, v, isKept(k), 0.2 * ez(lu, 1250, 1700), lu < 1800 ? Math.floor(lu / 80) : 3 + k);
        outline(R, v, isP(k), { color: CYAN, a: 1 - seg(lu, 900, 1250), dash: [2.5, 3.5], lw: 2.4 });
        outline(R, v, isH(k), { color: HOLE, a: 1 });
      });
      gutterArrow(seg(lu, 100, 600), "copy", RED, col.leftText, 0.36);
      gutterLoop(seg(lu, 900, 1350), "keep", col.rightText);
    },
    finish: function (lu) {
      var L = lay.L, R = lay.R, v = viewAt(1 - ez(lu, 0, 700)), n = D.finish.length + 1, f = seg(lu, 700, PH.finish - 150) * n;
      var fl = ["L_20"], fr = [null], ov = 1 - seg(lu, 0, 450);
      D.finish.forEach(function (s) { fl.push("L_" + s); fr.push("R_" + s); });
      fl.push("L_fin"); fr.push("R_fin");
      if (lu >= PH.finish && ana > 0) { drawAnaglyph(); return; }
      inPane(L, function () { drawSeq(L, fl, f, v); grid(L, v, ov); });
      inPane(R, function () {
        drawSeq(R, fr, f, v, function (a) { drawPost(R, v, 3, a); });
        postOverlays(R, v, 3, ov, ov);
      });
      graftGlyphs(ov);
    }
  };
  /* final frames merging into a red-cyan anaglyph (red = left view, green and blue = right view) */
  function anaLayers() {
    var a = img("L_fin"), b = img("R_fin");
    if (!a || !b || !lay) { return null; }
    var key = lay.L.w + "x" + lay.L.h + "@" + lay.dpr;
    if (anaKey !== key) {
      anaCv = [a, b].map(function (im, i) {
        var c = document.createElement("canvas"); c.width = Math.round(lay.L.w * lay.dpr); c.height = Math.round(lay.L.h * lay.dpr);
        var x = c.getContext("2d"); x.imageSmoothingQuality = "high";
        x.drawImage(im, 0, 0, c.width, c.height);
        x.globalCompositeOperation = "multiply"; x.fillStyle = i ? "#00ffff" : "#ff0000"; x.fillRect(0, 0, c.width, c.height);
        return c;
      });
      anaKey = key;
    }
    return anaCv;
  }
  function drawAnaglyph() {
    var L = lay.L, R = lay.R, C = lay.C, v = viewAt(0), ly = anaLayers(), a1 = seg(ana, 0, 0.35), s = SG.ease(seg(ana, 0.35, 1));
    if (!ly) { inPane(L, function () { drawImg(L, "L_fin", v, 1); }); inPane(R, function () { drawImg(R, "R_fin", v, 1); }); return; }
    var pl = { x: SG.lerp(L.x, C.x, s), y: SG.lerp(L.y, C.y, s), w: L.w, h: L.h }, pr = { x: SG.lerp(R.x, C.x, s), y: SG.lerp(R.y, C.y, s), w: R.w, h: R.h };
    if (s <= 0) {
      inPane(pl, function () { drawImg(pl, "L_fin", v, 1); sctx.globalAlpha = a1; sctx.drawImage(ly[0], pl.x, pl.y, pl.w, pl.h); sctx.globalAlpha = 1; });
      inPane(pr, function () { drawImg(pr, "R_fin", v, 1); sctx.globalAlpha = a1; sctx.drawImage(ly[1], pr.x, pr.y, pr.w, pr.h); sctx.globalAlpha = 1; });
      return;
    }
    sctx.save();
    sctx.beginPath();
    [pl, pr].forEach(function (p) { sctx.roundRect ? sctx.roundRect(p.x, p.y, p.w, p.h, 8) : sctx.rect(p.x, p.y, p.w, p.h); });
    sctx.clip();
    sctx.fillStyle = "#000"; sctx.fillRect(0, 0, lay.W, lay.H);
    sctx.globalCompositeOperation = "lighter";
    sctx.drawImage(ly[0], pl.x, pl.y, pl.w, pl.h);
    sctx.drawImage(ly[1], pr.x, pr.y, pr.w, pr.h);
    sctx.restore();
  }

  /* ------------------------------------------------------------------ timeline */
  function timeState(i, loc) {
    var k = loc.k, lu = loc.lu, s = { head: 0, fork: 0, g: [0, 0, 0], l: [0, 0, 0], mark: -1, right: false }, j;
    var done = function (n) { for (j = 0; j < n; j++) { s.g[j] = 1; s.l[j] = 1; } };
    switch (loc.name) {
      case "sample": s.head = 5 * seg(lu, 150, PH.sample - 250); break;
      case "depth": case "shift": s.head = 5; s.mark = 0; break;
      case "branch": s.head = 5; s.mark = 0; s.fork = seg(lu, 500, 1500); break;
      case "fill": s.head = 5; s.mark = 0; s.fork = 1; s.right = true; break;
      case "denoise": s.fork = 1; s.right = true; done(k - 1); s.head = WARPS[k - 1] + (WARPS[k] - WARPS[k - 1]) * seg(lu, 700, PH.denoise - 200); break;
      case "redepth": s.fork = 1; s.right = true; done(k - 1); s.head = WARPS[k]; s.mark = k; break;
      case "graft": s.fork = 1; s.right = true; done(k - 1); s.head = WARPS[k]; s.mark = k; s.g[k - 1] = seg(lu, 100, 650); s.l[k - 1] = seg(lu, 900, 1400); break;
      default: s.fork = 1; s.right = true; done(3); s.head = 20 + 29 * seg(lu, 700, PH.finish - 150);
    }
    return s;
  }
  function drawTime(st) {
    timeCv.fit();
    var ctx = timeCv.ctx, w = timeCv.w, c = col, small = w < 560 || timeCv.h < 118;
    ctx.clearRect(0, 0, w, timeCv.h);
    var x0 = small ? 26 : 62, x1 = w - (small ? 10 : 18), yL = small ? 38 : 46, yR = yL + (small ? 32 : 40), fw = small ? 9 : 22;
    var X = function (s) { return x0 + (x1 - x0) * s / 49; };
    var pale = function (hex) { return SG.mix(hex, c.card || c.bg, c.dark ? 0.6 : 0.76); };
    var lane = function (xa, xb, y, color, lw) { if (xb <= xa) { return; } ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.stroke(); };
    var fork = function (t, color, lw) {
      var xa = X(5), n = 24, i, q, xx, yy;
      ctx.beginPath();
      for (i = 0; i <= Math.round(n * t); i++) {
        q = i / n; xx = xa + fw * q; yy = yL + (yR - yL) * SG.ease(q);
        if (i) { ctx.lineTo(xx, yy); } else { ctx.moveTo(xx, yy); }
      }
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    };
    /* the plan, pale */
    lane(X(0), X(49), yL, pale(RED), 3);
    fork(1, pale(CYAN), 3); lane(X(5) + fw, X(49), yR, pale(CYAN), 3);
    [1, 2, 3].forEach(function (k) {
      arrow(ctx, X(WARPS[k]), yL + 7, X(WARPS[k]), yR - 6, pale(RED), 1, small ? 1.6 : 2);
      loop(ctx, X(WARPS[k]), yR + (small ? 8 : 10), small ? 5.5 : 7.5, pale(CYAN), 1, small ? 1.5 : 1.8);
    });
    /* what has happened so far, in colour */
    lane(X(0), X(st.head), yL, RED, 3.6);
    if (st.fork > 0) { fork(st.fork, CYAN, 3.6); }
    if (st.right) { lane(X(5) + fw, Math.max(X(5) + fw, X(st.head)), yR, CYAN, 3.6); }
    [1, 2, 3].forEach(function (k) {
      arrow(ctx, X(WARPS[k]), yL + 7, X(WARPS[k]), yR - 6, RED, st.g[k - 1], small ? 2 : 2.4);
      loop(ctx, X(WARPS[k]), yR + (small ? 8 : 10), small ? 5.5 : 7.5, CYAN, st.l[k - 1], small ? 1.8 : 2.2);
    });
    /* warp steps */
    WARPS.forEach(function (r, k) {
      var x = X(r), on = st.mark === k;
      SG.triangle(ctx, x, yL - 7, on ? 11 : 8.5, c.warpMark);
      ctx.fillStyle = on ? c.ink : c.muted;
      SG.drawSub(ctx, "r", k === 3 ? "m" : String(k), x, yL - (on ? 27 : 24), on ? 17 : 15, { align: "center", subMath: k === 3 });
    });
    /* playhead */
    var dot = function (x, y, color) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = c.card || c.bg; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
    dot(X(st.head), yL, RED);
    if (st.right) { dot(Math.max(X(5) + fw, X(st.head)), yR, CYAN); }
    /* lane names, end caps, step numbers */
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = SG.mathFont(small ? 16 : 18);
    ctx.fillStyle = c.leftText; ctx.fillText("L", small ? 4 : 8, yL);
    ctx.fillStyle = c.rightText; ctx.fillText("R", small ? 4 : 8, yR);
    if (!small) {
      ctx.font = SG.font(12, 500); ctx.fillStyle = c.muted;
      ctx.fillText("left", 24, yL + 1); ctx.fillText("right", 24, yR + 1);
    }
    ctx.textBaseline = "alphabetic"; ctx.font = SG.font(12, 500); ctx.fillStyle = c.muted;
    var yT = timeCv.h - 5;
    (small ? [0, 5, 10, 15, 20, 49] : [0, 5, 10, 15, 20, 30, 40, 49]).forEach(function (s) {
      ctx.textAlign = s === 49 ? "right" : "center";
      ctx.fillText(String(s), s === 49 ? x1 + 4 : X(s), yT);
    });
    if (!small) { ctx.textAlign = "left"; ctx.fillText("step", 8, yT); }
    /* what the two transfers mean, in the empty stretch between the lanes */
    if (w >= 900) {
      var lx = X(25), ym = (yL + yR) / 2;
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = SG.font(12.5, 500);
      arrow(ctx, lx, ym - 15, lx, ym - 2, RED, 1, 1.8);
      ctx.fillStyle = c.muted; ctx.fillText("shared surfaces are copied again from the left view", lx + 14, ym - 8);
      loop(ctx, lx, ym + 9, 5.5, CYAN, 1, 1.6);
      ctx.fillStyle = c.muted; ctx.fillText("holes keep the right view's own prediction", lx + 14, ym + 10);
    }
  }

  /* ------------------------------------------------------------------ frame */
  function draw() {
    if (!D || !lay) { return; }
    col = SG.colors();
    var loc = locate(cur, u), dpr = lay.dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, lay.W, lay.H);
    DRAW[loc.name](loc.lu, loc.k);
    drawTime(timeState(cur, loc));
    var id = loc.name + loc.k;
    if (id !== shownPhase) {
      shownPhase = id;
      var t = phaseText(loc.name, loc.k);
      noteL.innerHTML = t.l; noteR.innerHTML = t.r;
      setKey(t.key);
    }
    var merged = loc.name === "finish" && u >= stopDur(cur) ? ana : 0;
    ptL.style.opacity = ptR.style.opacity = String(1 - seg(merged, 0.15, 0.45));
    ptA.hidden = merged < 0.75; ptA.style.opacity = String(seg(merged, 0.75, 1));
  }
  function setKey(html) {
    var key = html + "|" + P;
    if (key === shownKey) { return; }
    shownKey = key;
    if (html !== "__switch__") { keyEl.innerHTML = html; return; }
    keyEl.innerHTML = "<div class=\"seg\" role=\"group\" aria-label=\"Show the stereo pair\"><button type=\"button\" data-mode=\"sbs\">Side by side</button><button type=\"button\" data-mode=\"ana\">Anaglyph</button></div>";
    paintSwitch();
  }
  function paintSwitch() {
    Array.prototype.forEach.call(keyEl.querySelectorAll("[data-mode]"), function (b) {
      b.setAttribute("aria-pressed", (b.getAttribute("data-mode") === "ana") === (anaTarget === 1) ? "true" : "false");
    });
  }
  keyEl.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-mode]") : null;
    if (!b) { return; }
    anaTarget = b.getAttribute("data-mode") === "ana" ? 1 : 0;
    if (SG.reduced) { ana = anaTarget; }
    paintSwitch(); hold(); kick();
  });

  function tick(ts) {
    raf = null;
    if (lastTs == null) { lastTs = ts; }
    var dt = Math.min(64, ts - lastTs), dur = stopDur(cur), active = false, u0 = u, a0 = ana, c0 = cur;
    lastTs = ts;
    if (u < dur) {
      if (ready(stopImgs(cur))) { u = Math.min(dur, u + dt); }
      active = true;
    } else if (playing) {
      dwell -= dt;
      if (dwell <= 0) { if (cur < STOPS.length - 1) { go(cur + 1); } else { setPlaying(false); } }
      active = playing;
    }
    if (ana !== anaTarget) { ana = SG.clamp(ana + (anaTarget > ana ? 1 : -1) * dt / 650, 0, 1); active = true; }
    if (dirty || u !== u0 || ana !== a0 || cur !== c0) { dirty = false; draw(); }
    if (active && visible) { raf = requestAnimationFrame(tick); } else { lastTs = null; }
  }
  function kick() { dirty = true; if (raf == null) { raf = requestAnimationFrame(tick); } }

  /* ------------------------------------------------------------------ state */
  function dwellFor(i) { return SG.clamp(900 + 17 * capEl.textContent.length, 3200, 5600) * (STOPS[i].item === 9 ? 0.8 : 1); }
  function paintDom() {
    var s = STOPS[cur], k;
    items.forEach(function (li) {
      var st = +li.getAttribute("data-stop"), it = STOPS[st].item;
      li.classList.toggle("is-on", it === s.item);
      li.classList.toggle("is-done", it < s.item);
      li.querySelector("button").setAttribute("aria-current", it === s.item ? "step" : "false");
    });
    /* refresh 1 of 3 is steps 6 to 8; 2 and 3 are the two stops of step 9 */
    k = s.item >= 6 && s.item <= 9 ? s.k : 0;
    pips.forEach(function (p, j) {
      p.classList.toggle("is-on", j + 1 === k);
      p.classList.toggle("is-done", s.item === 10 || (k > 0 && j + 1 < k));
    });
    pipsT.textContent = k ? "refresh " + k + " of 3" : s.item === 10 ? "3 refreshes done" : "3 refreshes";
    countEl.textContent = s.item + " / 10";
    nowPill.textContent = "Step " + s.item + " / 10";
    nowT.textContent = TITLES[s.item - 1] + (s.item === 9 ? ", " + s.k + " of 3" : "");
    capEl.innerHTML = caption(cur);
    bPrev.disabled = cur === 0; bNext.disabled = cur === STOPS.length - 1;
    stageEl.setAttribute("aria-label", "Step " + s.item + " of 10: " + TITLES[s.item - 1] + ". " + capEl.textContent);
  }
  function go(i) {
    cur = SG.clamp(i, 0, STOPS.length - 1);
    u = SG.reduced ? stopDur(cur) : 0;
    if (STOPS[cur].item !== 10) { ana = anaTarget = 0; }
    paintDom();
    dwell = dwellFor(cur);
    stopImgs(cur).forEach(img);
    if (cur + 1 < STOPS.length) { stopImgs(cur + 1).forEach(img); }
    kick();
  }
  function setPlaying(on) {
    playing = on;
    bPlay.setAttribute("data-state", on ? "playing" : "paused");
    bPlay.setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) { kick(); }
  }
  function hold() { started = true; setPlaying(false); }
  function next() { hold(); go(cur + 1); }
  function prev() { hold(); go(cur - 1); }

  bNext.addEventListener("click", next);
  bPrev.addEventListener("click", prev);
  bPlay.addEventListener("click", function () {
    started = true;
    if (playing) { setPlaying(false); return; }
    if (cur === STOPS.length - 1 && u >= stopDur(cur)) { go(0); } else { dwell = Math.min(dwell, 900); }
    setPlaying(true);
  });
  bReplay.addEventListener("click", function () { started = true; go(0); setPlaying(!SG.reduced); });
  items.forEach(function (li) {
    li.querySelector("button").addEventListener("click", function () {
      var st = +li.getAttribute("data-stop");
      hold();
      /* step 9 holds two refreshes: a second click moves on to the last one */
      go(st === 8 && cur === 8 ? 9 : st);
    });
  });
  padBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      P = +b.getAttribute("data-p");
      padBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      shownPhase = "";
      capEl.innerHTML = caption(cur);
      kick();
    });
  });
  fig.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) { return; }
    var onButton = e.target && e.target.tagName === "BUTTON";
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); hold(); go(0); }
    else if (e.key === "End") { e.preventDefault(); hold(); go(STOPS.length - 1); }
    else if ((e.key === " " || e.key === "Spacebar") && !onButton) { e.preventDefault(); bPlay.click(); }
  });
  fig.addEventListener("pointerdown", function (e) { if (!(e.target.closest && e.target.closest("button"))) { fig.focus({ preventScroll: true }); } });

  function relayout() { if (!D) { return; } if (layout()) { tileKey = ""; anaKey = ""; draw(); } }
  SG.onResize(relayout);
  SG.onTheme(function () { if (D) { draw(); } });
  if ("ResizeObserver" in window) { new ResizeObserver(function () { if (D && lay && Math.floor(stageBox.clientWidth) !== lay.W) { relayout(); } }).observe(stageBox); }

  SG.json("static/data/method.json").then(function (d) {
    D = d;
    parse(); buildNoise(); layout();
    items.forEach(function (li) { if (li.classList.contains("in-loop")) { var s = +li.getAttribute("data-stop"); li.classList.toggle("is-first", s === 5); li.classList.toggle("is-last", s === 7); } });
    paintDom();
    u = SG.reduced ? stopDur(0) : 0;
    stopImgs(0).forEach(img);
    draw();
    SG.watchVisible(fig, function (on) { visible = on; if (on) { stopImgs(cur).forEach(img); kick(); } }, { rootMargin: "200px 0px" });
    /* autoplay once, when most of the figure is on screen */
    SG.onceVisible(fig, function () { if (!started && !SG.reduced) { started = true; go(0); setPlaying(true); } }, 0.5);
  }).catch(function () { capEl.textContent = "The interactive figure could not be loaded."; });

  /* for the page's own checks: jump to a stop at a fraction of its animation, and compare the masks with the run */
  window.SGMethod = {
    stops: STOPS.length,
    seek: function (i, frac, p, a) {
      hold();
      if (p != null && p !== P) { padBtns[p].click(); }
      cur = SG.clamp(i, 0, STOPS.length - 1);
      paintDom(); stopImgs(cur).forEach(img);
      u = stopDur(cur) * (frac == null ? 1 : frac);
      ana = anaTarget = a ? 1 : 0; shownPhase = ""; shownKey = "";
      draw(); paintSwitch();
      return ready(stopImgs(cur));
    },
    state: function () { return { stop: cur, item: STOPS[cur].item, u: u, dur: stopDur(cur), playing: playing, P: P, ana: ana, layout: lay }; },
    check: function () {
      return WP.map(function (wp, k) {
        var holes = 0, pad = 0, bad = 0, i;
        for (i = 0; i < ROWS * COLS; i++) { holes += wp.H[i]; pad += wp.P[i]; if ((wp.src[i] < 0) !== (wp.H[i] === 1)) { bad++; } }
        return { step: wp.step, holes: holes, pad: pad, warp_mismatch: bad, json_holes: D.warps[k].holes, json_pad: D.warps[k].pad };
      });
    }
  };
})();
