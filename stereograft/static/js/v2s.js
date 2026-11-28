/* Video-to-stereo: the walkthrough of converting an existing video, over one real Wan 2.1 run on a Stereo4D clip
   (the stepper is stepper.js). Timeline: 100 steps; the input is inverted from the video end back to the first warp
   step, the states at the warp steps are kept, and only the right view is sampled forward.
   Data: static/data/v2s.json, frames: static/images/v2s/, clips: media/method/. */
(function () {
  "use strict";
  var SG = window.SG;
  if (!SG || !SG.Stepper) { return; }

  window.SGV2S = SG.Stepper(document.getElementById("hw2"), {
    data: "static/data/v2s.json", img: "static/images/v2s/", media: "media/method/", cols: 64, rows: 37, cell: 8,
    tileImg: "V", fin: ["V", "R_fin"], reserve: true, followView: true,
    define: function (A) {
  var D = A.D, WP = A.WP, WARPS = A.WARPS, WIN = A.WIN, sctx = A.sctx, timeCv = A.timeCv, COLS = A.COLS, CELL = A.CELL;
  var HOLE = A.HOLE, CASE = A.CASE, RED = A.RED, CYAN = A.CYAN, RAMP = A.RAMP;
  var seg = A.seg, ez = A.ez, viewAt = A.viewAt, cellPx = A.cellPx, cx = A.cx, cy = A.cy, span = A.span, inPane = A.inPane, img = A.img;
  var drawImg = A.drawImg, drawSrc = A.drawSrc, drawSeq = A.drawSeq, grid = A.grid, fillCells = A.fillCells, outline = A.outline, shiftTint = A.shiftTint;
  var noise = A.noise, emptyPane = A.emptyPane, arrow = A.arrow, loop = A.loop, isH = A.isH, isP = A.isP, isKept = A.isKept;
  var isCovered = A.isCovered, tiles = A.tiles, tile = A.tile, drawTiles = A.drawTiles, gutterArrow = A.gutterArrow, gutterLoop = A.gutterLoop;
  var faded = A.faded, graftGlyphs = A.graftGlyphs;

  var N = D.steps - 1, R0 = WARPS[0], NW = WARPS.length - 1;          /* last step index, first warp, number of refreshes */
  var PH = { encode: 1500, invert: 3600, depth: 1100, shift: 2100, branch: 2200, fill: 2000, denoise: 2100, graft: 2500, finish: 2300 };
  var STOPS = [
    { item: 1, k: 0, ph: [["encode", 1]] },
    { item: 2, k: 0, ph: [["invert", 1]] },
    { item: 3, k: 0, ph: [["depth", 1]] },
    { item: 3, k: 0, ph: [["shift", 1]] },
    { item: 4, k: 0, ph: [["branch", 1]] },
    { item: 4, k: 0, ph: [["fill", 1]] },
    { item: 5, k: 1, ph: [["denoise", 1]] },
    { item: 6, k: 1, ph: [["graft", 1]] }
  ];
  for (var q = 2; q <= NW; q++) { STOPS.push({ item: 6, k: q, ph: [["denoise", 1.5], ["graft", 1.35]] }); }
  STOPS.push({ item: 7, k: NW, ph: [["finish", 1]] });
  var TITLES = ["The input is the left view", "Invert the input", "Depth, shift and holes, once", "First warp: branch the right view",
    "Denoise the right view", "Refresh from the kept states", "Finish and decode"];
  var M = function (s) { return "<i class=\"m\">" + s + "</i>"; };
  var RH = M("R&#770;"), V = M("V");
  function rk(k) { return M("r") + (k === NW ? "<sub>" + M("m") + "</sub>" : "<sub>" + k + "</sub>"); }
  function tOf(k) { return D.warps[k].t.toFixed(2); }
  var DMAX = Math.round(D.d_max_px);

  function caption(i) {
    var s = STOPS[i], k = s.k, name = s.ph[s.ph.length - 1][0];
    switch (name) {
      case "encode": return "To convert an existing video, the video itself is the <b>left view</b>; it is never generated again. But branching needs the left view's sampling trajectory, and a video that already exists has none.";
      case "invert": return "So the trajectory is recovered by <b>inversion</b>: starting from the encoded video, the sampler runs backward, toward noise, with two fixed-point iterations per step on Wan 2.1 and three on LTX-2.3. It stops at the first warp step " + rk(0) + " = " + R0 + " of " + D.steps + " and keeps the states it passes at the later warp steps.";
      case "depth": return "Depth is estimated once, directly from the input video. The left view is given and does not change, so there is nothing to estimate again later.";
      case "shift": return "As in text-to-stereo, depth becomes a whole-cell shift (" + M("d") + "<sub>max</sub> = " + DMAX + " px here), and the shift decides the holes " + M("H") + ": here the pole moves 2 cells and the houses behind it none. Both stay fixed for the whole run" +
        (A.P ? "; for the refreshes the holes are extended by " + M("P") + " = 1 cell to the right." : ". With " + M("P") + " = 0 the holes are used as they are.");
      case "branch": return "At " + rk(0) + " the kept state is shifted cell by cell and starts the right view " + M("R") + ", so shared surfaces carry the content and the noise of the inverted input. The cells that nothing lands on are exactly the holes computed before.";
      case "fill": return "The holes take a background guess, read from the clean latent of the input, under fresh noise at the current level (" + M("t") + " = " + tOf(0) + "). The model repaints them in the steps that follow.";
      case "denoise": return "Only the right view is sampled from here: the left view is the input and needs no steps. The frozen model denoises the right view to the next refresh step and grows its own content in the holes.";
      case "graft":
        if (k === 1) { return "At the refresh step " + rk(1) + " = " + WARPS[1] + ", the kept state of that step is shifted and copied outside the holes" + (A.P ? " and their padding" : "") + ", which ties shared surfaces to the input again. Inside them, the right view keeps its own prediction " + RH + ", re-noised to " + M("t") + " = " + tOf(1) + "."; }
        if (k === NW) { return "Once more, for the last refresh at " + rk(k) + " = " + WARPS[k] + " (" + M("t") + " = " + tOf(k) + "). Every refresh used a state kept during the inversion, and the holes never moved, because the depth of the input never changes."; }
        return "The same again: the right view is denoised to " + rk(k) + " = " + WARPS[k] + " and refreshed there (" + M("t") + " = " + tOf(k) + "), with the kept state of step " + WARPS[k] + " outside the holes" + (A.P ? " and their padding" : "") + " and its own content inside them.";
      default: return "After the last refresh the right view finishes sampling and is decoded. The left view is the input video itself, untouched; together they are the stereo pair.";
    }
  }
  var K = function (cls, text) { return "<span><i class=\"k " + cls + "\"></i><span>" + text + "</span></span>"; };
  function phaseText(name, k) {
    var r = WARPS[k], wk;
    switch (name) {
      case "encode": return { l: "the input video " + V, r: "", key: "<span><span>" + D.credit + "</span></span>" };
      case "invert": return { l: "inverted state, decoded", r: "", key: "<span><span>Each picture is a state of the backward run, decoded: more noise at every step back.</span></span>" };
      case "depth": return { l: "depth of " + V, r: "", key: K("k-ramp", "far to near") };
      case "shift":
        wk = [0, 1, 2, 3, 4].map(function (v) { return "<i class=\"k k-w\" style=\"background:" + RAMP[v] + (v === 4 ? ";color:#1d1d1f" : "") + "\">" + v + "</i>"; }).join("");
        return { l: "shift per latent cell &middot; zoom &times;" + (COLS / WIN.cols).toFixed(1), ls: "shift per cell &middot; zoom &times;" + (COLS / WIN.cols).toFixed(1),
          r: "holes, fixed for the whole run", rs: "holes, fixed for the run",
          key: "<span>" + wk + "<span>cells moved to the left</span></span>" + K("k-hole", "holes " + M("H")) + (A.P ? K("k-pad", "padding, " + M("P") + " = 1") : "") };
      case "branch": return { l: "kept state at step " + R0 + ", shown clean", ls: "kept state at step " + R0 + ", clean", r: "the shifted state", key: K("k-hole", "hole " + M("H") + ": no cell landed here") };
      case "fill": return { l: "kept state at step " + R0 + ", shown clean", ls: "kept state at step " + R0 + ", clean", r: "holes filled", key: K("k-holeline", "hole " + M("H")) + K("k-noise", "background guess under fresh noise") };
      case "denoise": return { l: "the input video " + V, r: "clean prediction " + RH + " at step " + r, rs: "prediction " + RH + " at step " + r, key: K("k-holeline", "holes " + M("H")) };
      case "graft": return { l: "kept state at step " + r + ", shown clean", ls: "kept state at step " + r + ", clean", r: "what the refresh writes",
        key: K("k-left", "copied from the shifted kept state") + K("k-right", "kept from its own prediction " + RH + ", re-noised") };
      default: return { l: "the input video " + V, r: "the generated right view", key: "__switch__" };
    }
  }
  var Rn = function (s) { return "R_" + SG.pad2(s); }, Cn = function (s) { return "C_" + SG.pad2(s); };
  /* the right view's clean predictions that exist between two warps (the run reads them out at a few steps) */
  function between(a, b) { return D.rx.filter(function (s) { return s > a && s <= b; }).map(Rn); }
  function phaseImgs(name, k) {
    var r = WARPS[k], a = ["V"], r0;
    switch (name) {
      case "encode": break;
      case "invert": D.inv.forEach(function (s) { a.push("I_" + SG.pad2(s)); }); break;
      case "depth": a.push("I_" + SG.pad2(R0), "z"); break;
      case "shift": a.push("z"); break;
      case "branch": break;
      case "fill": a.push("S"); break;
      case "denoise": r0 = WARPS[k - 1]; a.push("S"); if (k > 1) { a.push(Cn(r0)); } a = a.concat(between(r0, r)); break;
      case "graft": a.push(Rn(r), Cn(r), "S"); break;
      default: a.push(Cn(WARPS[NW]), "S", "R_fin"); a = a.concat(between(WARPS[NW], N));
    }
    return a;
  }

  /* what warp j left in the right view, shown clean: the shifted input with the guess (j = 0) or the refresh's composite */
  function drawPost(p, v, j, a) {
    if (j === 0) { drawImg(p, "S", v, a); return; }
    drawImg(p, Cn(WARPS[j]), v, a);
    if (A.P === 0) {
      var im = img("S"), m = WP[j].P, s = span(v), cs = cellPx(v, p), rr, c;
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
  function postOverlays(p, v, j, a, lineA) {
    if (j === 0) {
      noise(p, v, isH(0), 0.6 * a, 3);
    } else {
      fillCells(p, v, isCovered(j), RED, 0.12 * a);
      fillCells(p, v, isKept(j), CYAN, 0.44 * a);
      noise(p, v, isKept(j), 0.2 * a, 3 + j);
    }
    outline(p, v, isH(j), { color: HOLE, a: lineA == null ? a : lineA });
  }
  /* the right pane before the branch: nothing but the hole map */
  function holeMap(p, v, a, padA) {
    if (a <= 0) { return; }
    var s = span(v), cs = cellPx(v, p), c, r, x, y;
    sctx.save(); sctx.globalAlpha = a;
    sctx.fillStyle = A.col.panel; sctx.fillRect(p.x, p.y, p.w, p.h);
    if (cs >= 9) {
      sctx.strokeStyle = A.col.line; sctx.globalAlpha = a * 0.55; sctx.lineWidth = 1; sctx.beginPath();
      for (c = s.c0; c <= s.c1; c++) { x = Math.round(cx(v, p, c)) + 0.5; sctx.moveTo(x, p.y); sctx.lineTo(x, p.y + p.h); }
      for (r = s.r0; r <= s.r1; r++) { y = Math.round(cy(v, p, r)) + 0.5; sctx.moveTo(p.x, y); sctx.lineTo(p.x + p.w, y); }
      sctx.stroke();
    }
    sctx.restore();
    fillCells(p, v, isH(0), HOLE, a);
    outline(p, v, isH(0), { color: CASE, a: a, cased: false, lw: 1.5 });
    outline(p, v, isP(1), { color: CYAN, a: a * padA, dash: [2.5, 3.5], lw: 2.4 });
  }
  /* The clip itself: one side-by-side file, the input in its left half and the generated view in its right half, so
     the two panes (and the anaglyph made from them) always show the same moment. It is cropped like the stills and
     starts at the frame the stills show (D.media.t0), so a still turns into the clip without a jump. */
  function clipSrc() {
    var el = A.video(D.media.sbs, D.media.t0);
    return el ? half(el) : null;
  }
  function half(el) {
    var k = el.videoWidth / 2 / (COLS * CELL), F = A.FULLV;
    return { el: el, k: k, x: [F.x * k, el.videoWidth / 2 + F.x * k], y: (D.crop_y + F.y) * k, w: F.w * k, h: F.h * k };
  }
  function drawHalf(p, v, src, i, a) {
    drawSrc(p, src.el, v, a, src.k, i ? src.el.videoWidth / 2 : 0, D.crop_y * src.k);
  }

  var INV = ["V"].concat(D.inv.map(function (s) { return "I_" + SG.pad2(s); }));
  var DRAW = {
    encode: function () {
      var L = A.lay.L, R = A.lay.R, v = viewAt(0), src = clipSrc();
      inPane(L, function () { drawImg(L, "V", v, 1); if (src) { drawHalf(L, v, src, 0, 1); } });
      emptyPane(R, 1, "not started");
    },
    invert: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(0), f = seg(lu, 200, PH.invert - 300) * (INV.length - 1);
      /* the inversion starts from the frame the clip stopped on, so leaving the first step does not jump */
      var held = A.videoFrame(D.media.sbs);
      inPane(L, function () {
        drawSeq(L, INV, f, v, function (a) { drawImg(L, "V", v, a); if (held) { drawHalf(L, v, half(held), 0, a); } });
      });
      emptyPane(R, 1, "not started");
    },
    depth: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(0);
      inPane(L, function () { drawImg(L, INV[INV.length - 1], v, 1); drawImg(L, "V", v, ez(lu, 0, 350)); drawImg(L, "z", v, ez(lu, 300, 950)); });
      emptyPane(R, 1, "not started");
    },
    shift: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(ez(lu, 0, 800)), t = ez(lu, 700, 1200), m = ez(lu, 1300, 1800);
      inPane(L, function () {
        drawImg(L, "V", v, 1); drawImg(L, "z", v, 1 - t);
        shiftTint(L, v, WP[0], 0.8 * t, ez(lu, 1100, 1600));
      });
      emptyPane(R, 1 - m, "not started");
      sctx.save(); sctx.globalAlpha = m;
      inPane(R, function () { holeMap(R, v, 1, ez(lu, 1700, 2050)); }, false);
      sctx.restore();
    },
    branch: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(1), fly = ez(lu, 250, 900), slide = ez(lu, 1050, 1900), fade = 1 - seg(lu, 1800, 2150);
      var tint = SG.lerp(0.8, 0.3, ez(lu, 0, 400));
      inPane(L, function () { drawImg(L, "V", v, 1); shiftTint(L, v, WP[0], tint, 1); });
      inPane(R, function () { holeMap(R, v, 1, 1 - seg(lu, 0, 300)); }, false);
      gutterArrow(seg(lu, 100, 650), "shift", RED, A.col.leftText);
      if (lu > 250) {
        var g = { x: SG.lerp(L.x, R.x, A.lay.stacked ? 1 : fly), y: SG.lerp(L.y, R.y, A.lay.stacked ? fly : 1), w: R.w, h: R.h };
        sctx.save(); sctx.globalAlpha = seg(lu, 250, 480);
        inPane(g, function () { drawTiles(g, slide, 0.3 * fade, fade); grid(g, v, fade); }, HOLE);
        sctx.restore();
        if (slide >= 1) { inPane(R, function () { outline(R, v, isH(0), { color: CASE, a: seg(lu, 1900, 2150), cased: false, lw: 1.5 }); }, false); }
      }
    },
    fill: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(1), cs = A.lay.cell, wp = WP[0], g = ez(lu, 150, 900), real = ez(lu, 850, 1250);
      var tf = 1 - ez(lu, 0, 400);
      inPane(L, function () { drawImg(L, "V", v, 1); shiftTint(L, v, wp, 0.3 * tf, tf); grid(L, v, 1 - tf); });
      inPane(R, function () {
        drawTiles(R, 1, 0, 0);
        if (tiles() && real < 1) {
          var r, c, q2;
          for (r = WIN.r0; r < WIN.r0 + WIN.rows; r++) {
            for (c = WIN.c0; c < WIN.c0 + WIN.cols; c++) {
              if (!wp.H[r * COLS + c]) { continue; }
              q2 = wp.rho[r * COLS + c];
              if (q2 < 0) { continue; }
              sctx.globalAlpha = seg(g, 0, 0.25);
              tile(wp.src[r * COLS + q2], r, R.x + (SG.lerp(q2, c, g) - WIN.c0) * cs, R.y + (r - WIN.r0) * cs);
              sctx.globalAlpha = 1;
            }
          }
        }
        drawImg(R, "S", v, real);
        noise(R, v, isH(0), 0.6 * ez(lu, 1150, 1700), lu < 1850 ? Math.floor(lu / 80) : 3);
        outline(R, v, isH(0), { color: HOLE, a: 1 });
      }, HOLE);
      faded(1 - seg(lu, 0, 350), function () { gutterArrow(1, "shift", RED, A.col.leftText); });
    },
    denoise: function (lu, k) {
      var L = A.lay.L, R = A.lay.R, rA = WARPS[k - 1], rB = WARPS[k], v = viewAt(1 - ez(lu, 0, 700));
      var fr = [null].concat(between(rA, rB)), f = seg(lu, 700, PH.denoise - 200) * (fr.length - 1), ov = 1 - seg(lu, 0, 450);
      inPane(L, function () { drawImg(L, "V", v, 1); grid(L, v, 1 - seg(lu, 0, 500)); });
      inPane(R, function () {
        drawSeq(R, fr, f, v, function (a) { drawPost(R, v, k - 1, a); });
        postOverlays(R, v, k - 1, ov, 1);
      });
      if (k > 1) { graftGlyphs(ov); }
    },
    graft: function (lu, k) {
      var L = A.lay.L, R = A.lay.R, r = WARPS[k], zin = ez(lu, 0, 700), v = viewAt(zin), u = lu - 600;
      var comp = ez(u, 300, 850), red = 0.42 * ez(u, 250, 650) - 0.3 * ez(u, 950, 1500);
      var cyan = 0.66 * ez(u, 900, 1250) - 0.22 * ez(u, 1450, 1850);
      inPane(L, function () { drawImg(L, "V", v, 1); grid(L, v, zin); });
      inPane(R, function () {
        drawImg(R, Rn(r), v, 1);
        drawPost(R, v, k, comp);
        fillCells(R, v, isCovered(k), RED, red);
        fillCells(R, v, isKept(k), CYAN, cyan);
        noise(R, v, isKept(k), 0.2 * ez(u, 1250, 1700), u < 1800 ? Math.floor(lu / 80) : 3 + k);
        outline(R, v, isP(k), { color: CYAN, a: seg(lu, 300, 650) * (1 - seg(u, 900, 1250)), dash: [2.5, 3.5], lw: 2.4 });
        outline(R, v, isH(k), { color: HOLE, a: 1 });
      });
      gutterArrow(seg(u, 100, 600), "copy", RED, A.col.leftText, 0.36);
      gutterLoop(seg(u, 900, 1350), "keep", A.col.rightText);
    },
    finish: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(1 - ez(lu, 0, 700)), last = WARPS[NW];
      var fr = [null].concat(between(last, N)).concat(["R_fin"]), f = seg(lu, 700, PH.finish - 150) * (fr.length - 1), ov = 1 - seg(lu, 0, 450);
      var src = lu >= PH.finish ? clipSrc() : null;            /* at rest the two panes play the pair */
      /* the pair merges into a red-cyan anaglyph exactly as in the text-to-stereo figure, here from the playing clip */
      if (lu >= PH.finish && A.ana > 0) { A.drawAnaglyph(src ? { el: src.el, x: src.x, y: src.y, w: src.w, h: src.h } : null); return; }
      inPane(L, function () { drawImg(L, "V", v, 1); if (src) { drawHalf(L, v, src, 0, 1); } grid(L, v, ov); });
      inPane(R, function () {
        drawSeq(R, fr, f, v, function (al) { drawPost(R, v, NW, al); });
        if (src) { drawHalf(R, v, src, 1, 1); }
        postOverlays(R, v, NW, ov, ov);
      });
      graftGlyphs(ov);
    }
  };

  /* ------------------------------------------------------------------ timeline */
  function timeState(i, loc) {
    var k = loc.k, lu = loc.lu, s = { inv: N, fork: 0, g: [], l: [], mark: -1, right: false, rhead: R0 }, j;
    for (j = 0; j < NW; j++) { s.g.push(0); s.l.push(0); }
    var done = function (n) { for (j = 0; j < n; j++) { s.g[j] = 1; s.l[j] = 1; } };
    switch (loc.name) {
      case "encode": break;
      case "invert": s.inv = N - (N - R0) * seg(lu, 200, PH.invert - 300); break;
      case "depth": case "shift": s.inv = R0; break;
      case "branch": s.inv = R0; s.mark = 0; s.fork = seg(lu, 500, 1500); break;
      case "fill": s.inv = R0; s.mark = 0; s.fork = 1; s.right = true; break;
      case "denoise": s.inv = R0; s.fork = 1; s.right = true; done(k - 1); s.rhead = WARPS[k - 1] + (WARPS[k] - WARPS[k - 1]) * seg(lu, 700, PH.denoise - 200); break;
      case "graft": s.inv = R0; s.fork = 1; s.right = true; done(k - 1); s.rhead = WARPS[k]; s.mark = k; s.g[k - 1] = seg(lu, 700, 1250); s.l[k - 1] = seg(lu, 1500, 2000); break;
      default: s.inv = R0; s.fork = 1; s.right = true; done(NW); s.rhead = WARPS[NW] + (N - WARPS[NW]) * seg(lu, 700, PH.finish - 150);
    }
    return s;
  }
  function drawTime(st) {
    timeCv.fit();
    var ctx = timeCv.ctx, w = timeCv.w, c = A.col, small = w < 560 || timeCv.h < 118;
    ctx.clearRect(0, 0, w, timeCv.h);
    var x0 = small ? 26 : 62, x1 = w - (small ? 10 : 18), yL = small ? 38 : 46, yR = yL + (small ? 32 : 40), fw = small ? 9 : 22;
    var X = function (s) { return x0 + (x1 - x0) * s / N; };
    var pale = function (hex) { return SG.mix(hex, c.card || c.bg, c.dark ? 0.6 : 0.76); };
    var lane = function (xa, xb, y, color, lw, dash) { if (xb <= xa) { return; } ctx.save(); if (dash) { ctx.setLineDash(dash); } ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = dash ? "butt" : "round"; ctx.stroke(); ctx.restore(); };
    var fork = function (t, color, lw) {
      var xa = X(R0), n = 24, i, q3, xx, yy;
      ctx.beginPath();
      for (i = 0; i <= Math.round(n * t); i++) {
        q3 = i / n; xx = xa + fw * q3; yy = yL + (yR - yL) * SG.ease(q3);
        if (i) { ctx.lineTo(xx, yy); } else { ctx.moveTo(xx, yy); }
      }
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    };
    var head = function (x, y, dir, color) {            /* a small arrowhead on a lane: which way it is travelled */
      ctx.beginPath(); ctx.moveTo(x + dir * 7, y); ctx.lineTo(x - dir * 2, y - 5.5); ctx.lineTo(x - dir * 2, y + 5.5); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    /* the plan, pale: the steps the inversion never visits are dotted */
    lane(X(0), X(R0) - 22, yL, pale(RED), 2, [2, 5]);
    lane(X(R0), X(N), yL, pale(RED), 3);
    fork(1, pale(CYAN), 3); lane(X(R0) + fw, X(N), yR, pale(CYAN), 3);
    WARPS.slice(1).forEach(function (r) {
      arrow(ctx, X(r), yL + 7, X(r), yR - 6, pale(RED), 1, small ? 1.6 : 2);
      loop(ctx, X(r), yR + (small ? 8 : 10), small ? 5.5 : 7.5, pale(CYAN), 1, small ? 1.5 : 1.8);
    });
    /* what has happened so far, in colour: the inversion runs from the video (right) toward noise (left) */
    lane(X(st.inv), X(N), yL, RED, 3.6);
    if (st.inv < N - 0.5) { head(X(st.inv) - 11, yL, -1, RED); }
    if (st.fork > 0) { fork(st.fork, CYAN, 3.6); }
    if (st.right) { lane(X(R0) + fw, Math.max(X(R0) + fw, X(st.rhead)), yR, CYAN, 3.6); }
    WARPS.slice(1).forEach(function (r, j) {
      arrow(ctx, X(r), yL + 7, X(r), yR - 6, RED, st.g[j], small ? 2 : 2.4);
      loop(ctx, X(r), yR + (small ? 8 : 10), small ? 5.5 : 7.5, CYAN, st.l[j], small ? 1.8 : 2.2);
    });
    /* warp steps; the state at each is kept once the inversion has passed it */
    WARPS.forEach(function (r, k) {
      var x = X(r), on = st.mark === k, kept = st.inv <= r + 0.01, lab = k === NW ? "m" : String(k);
      SG.triangle(ctx, x, yL - 8, on ? 11 : 8.5, c.warpMark);
      if (!small || k === 0 || k === NW || on) {
        ctx.fillStyle = on ? c.ink : c.muted;
        SG.drawSub(ctx, "r", lab, x, yL - (on ? 28 : 25), on ? 17 : 15, { align: "center", subMath: k === NW });
      }
      ctx.beginPath(); ctx.rect(x - 4.5, yL - 4.5, 9, 9);
      ctx.fillStyle = kept ? RED : (c.card || c.bg); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = kept ? (c.card || c.bg) : pale(RED); ctx.stroke();
    });
    /* playheads */
    var dot = function (x, y, color) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = c.card || c.bg; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
    if (st.inv > R0 + 0.01) { dot(X(st.inv), yL, RED); }
    if (st.right) { dot(Math.max(X(R0) + fw, X(st.rhead)), yR, CYAN); }
    /* lane names, step numbers */
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
    (small ? [0, R0, WARPS[NW], N] : [0].concat(WARPS).concat([N])).forEach(function (s) {
      ctx.textAlign = s === N ? "right" : "center";
      ctx.fillText(String(s), s === N ? x1 + 4 : X(s), yT);
    });
    if (!small) { ctx.textAlign = "left"; ctx.fillText("step", 8, yT); }
    /* which way each lane runs, in the stretch of steps that is never visited */
    if (!small) {
      var lx = X(R0) - 20, t1 = "inversion runs backward, from the video", t2 = "only the right view is sampled forward";
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = SG.font(12.5, 500); ctx.fillStyle = c.muted;
      /* they sit left of the first warp step; they are left out where they would touch the lane names (which end at 52) */
      if (lx - Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) >= 58) {
        ctx.fillText(t1, lx, yL - 16);
        ctx.fillText(t2, lx, yR + 1);
      }
      ctx.fillText("input video", x1 + 4, yL - 16);
    }
  }

  return {
    PH: PH, STOPS: STOPS, TITLES: TITLES, caption: caption, phaseText: phaseText, phaseImgs: phaseImgs, DRAW: DRAW,
    timeState: timeState, drawTime: drawTime,
    /* refresh 1 is step 6's first stop (and the denoising of step 5 before it); the others are its later stops */
    pips: function (s) {
      var k = s.item === 5 || s.item === 6 ? s.k : 0;
      return { k: k, done: s.item === 7, title: s.item === 6 ? ", " + s.k + " of " + NW : "" };
    }
  };
    }
  });
})();
