/* How StereoGraft works: the text-to-stereo walkthrough over one real Wan 2.1 sample (the stepper is stepper.js).
   Timeline: the 50 sampling steps, left and right lanes, the branch and the three refreshes.
   Data: static/data/method.json, frames: static/images/method/. */
(function () {
  "use strict";
  var SG = window.SG;
  if (!SG || !SG.Stepper) { return; }

  window.SGMethod = SG.Stepper(document.getElementById("hw"), {
    data: "static/data/method.json", img: "static/images/method/", cols: 104, rows: 60, cell: 8,
    tileImg: "L_05", fin: ["L_fin", "R_fin"],
    define: function (A) {
  var D = A.D, WP = A.WP, WARPS = A.WARPS, WIN = A.WIN, sctx = A.sctx, timeCv = A.timeCv, COLS = A.COLS, CELL = A.CELL;
  var HOLE = A.HOLE, CASE = A.CASE, RED = A.RED, CYAN = A.CYAN, RAMP = A.RAMP;
  var seg = A.seg, ez = A.ez, viewAt = A.viewAt, cellPx = A.cellPx, cx = A.cx, cy = A.cy, span = A.span, inPane = A.inPane, img = A.img;
  var drawImg = A.drawImg, drawSeq = A.drawSeq, grid = A.grid, fillCells = A.fillCells, outline = A.outline, shiftTint = A.shiftTint;
  var noise = A.noise, emptyPane = A.emptyPane, arrow = A.arrow, loop = A.loop, isH = A.isH, isP = A.isP, isKept = A.isKept;
  var isCovered = A.isCovered, tiles = A.tiles, tile = A.tile, drawTiles = A.drawTiles, gutterArrow = A.gutterArrow, gutterLoop = A.gutterLoop;
  var faded = A.faded, graftGlyphs = A.graftGlyphs;

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
        (A.P ? "Each hole also grows by " + M("P") + " = 1 cell to the right, which removes slivers of foreground left at its border."
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
        key: K("k-holeline", "holes " + M("H") + ", recomputed") + (A.P ? K("k-pad", "padding: " + M("P") + " = 1 cell to the right of each hole") : "") };
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
  /* what warp j left in the right view, shown clean: S[L-hat] with the guess (j = 0) or the refresh's composite */
  function drawPost(p, v, j, a) {
    if (j === 0) { drawImg(p, "S_05", v, a); return; }
    var r = WARPS[j];
    drawImg(p, "C_" + r, v, a);
    if (A.P === 0) {
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

  /* ------------------------------------------------------------------ the phases */
  var DRAW = {
    sample: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(0), f = seg(lu, 150, PH.sample - 250) * 5;
      inPane(L, function () { drawSeq(L, ["L_00", "L_01", "L_02", "L_03", "L_04", "L_05"], f, v); });
      emptyPane(R, 1, "not started");
    },
    depth: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(0);
      inPane(L, function () { drawImg(L, "L_05", v, 1); drawImg(L, "z_05", v, ez(lu, 100, 850)); });
      emptyPane(R, 1, "not started");
    },
    shift: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(ez(lu, 0, 800)), t = ez(lu, 700, 1200);
      inPane(L, function () {
        drawImg(L, "L_05", v, 1); drawImg(L, "z_05", v, 1 - t);
        shiftTint(L, v, WP[0], 0.8 * t, ez(lu, 1100, 1600));
      });
      emptyPane(R, 1, "not started");
    },
    branch: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(1), fly = ez(lu, 250, 900), slide = ez(lu, 1050, 1900), fade = 1 - seg(lu, 1800, 2150);
      var tint = SG.lerp(0.8, 0.3, ez(lu, 0, 400));
      inPane(L, function () { drawImg(L, "L_05", v, 1); shiftTint(L, v, WP[0], tint, 1); });
      emptyPane(R, 1 - seg(lu, 250, 600), "not started");
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
      faded(1 - seg(lu, 0, 350), function () { gutterArrow(1, "shift", RED, A.col.leftText); });
    },
    denoise: function (lu, k) {
      var L = A.lay.L, R = A.lay.R, rA = WARPS[k - 1], rB = WARPS[k], v = viewAt(1 - ez(lu, 0, 700));
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
      var L = A.lay.L, R = A.lay.R, r = WARPS[k], v = viewAt(ez(lu, 0, 700));
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
      var L = A.lay.L, R = A.lay.R, r = WARPS[k], v = viewAt(1), tf = 1 - ez(lu, 0, 400);
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
      gutterArrow(seg(lu, 100, 600), "copy", RED, A.col.leftText, 0.36);
      gutterLoop(seg(lu, 900, 1350), "keep", A.col.rightText);
    },
    finish: function (lu) {
      var L = A.lay.L, R = A.lay.R, v = viewAt(1 - ez(lu, 0, 700)), n = D.finish.length + 1, f = seg(lu, 700, PH.finish - 150) * n;
      var fl = ["L_20"], fr = [null], ov = 1 - seg(lu, 0, 450);
      D.finish.forEach(function (s) { fl.push("L_" + s); fr.push("R_" + s); });
      fl.push("L_fin"); fr.push("R_fin");
      if (lu >= PH.finish && A.ana > 0) { A.drawAnaglyph(); return; }
      inPane(L, function () { drawSeq(L, fl, f, v); grid(L, v, ov); });
      inPane(R, function () {
        drawSeq(R, fr, f, v, function (a) { drawPost(R, v, 3, a); });
        postOverlays(R, v, 3, ov, ov);
      });
      graftGlyphs(ov);
    }
  };

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
    var ctx = timeCv.ctx, w = timeCv.w, c = A.col, small = w < 560 || timeCv.h < 118;
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

  return {
    PH: PH, STOPS: STOPS, TITLES: TITLES, caption: caption, phaseText: phaseText, phaseImgs: phaseImgs, DRAW: DRAW,
    timeState: timeState, drawTime: drawTime,
    /* refresh 1 of 3 is steps 6 to 8; 2 and 3 are the two stops of step 9 */
    pips: function (s) {
      var k = s.item >= 6 && s.item <= 9 ? s.k : 0;
      return { k: k, done: s.item === 10, title: s.item === 9 ? ", " + s.k + " of 3" : "" };
    }
  };
    }
  });
})();
