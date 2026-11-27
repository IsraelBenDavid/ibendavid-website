/* Donor chain, cell by cell (schematic, on a small 2D grid; not from a run).
   L: left latent, digits = shifts w(p). R: right latent. R-hat: the right view's clean prediction (the donor).
   Branch at r0: each cell moves w(p) cells left, the largest shift wins collisions, off-frame and occluded cells
   are dropped; holes H start from b(p) = warped prediction of the nearest covered cell to the right (rho(p)), or
   L-hat(p) at the right edge, re-noised. Refresh at r_j: depth is re-estimated, covered cells copy S[L] again,
   H (plus P padding cells to the right) take R-hat re-noised with fresh noise. */
(function () {
  "use strict";
  var SG = window.SG;
  var canvas = document.getElementById("donor-canvas");
  if (!canvas) { return; }
  var LW = 860, LH = 612, FS = 1, COMPACT = false;
  canvas.width = LW; canvas.height = LH;
  var cv = SG.fixedCanvas(canvas);
  var statusEl = document.getElementById("donor-status");
  var bPlay = document.getElementById("donor-play"), bPrev = document.getElementById("donor-prev");
  var bNext = document.getElementById("donor-next"), bReplay = document.getElementById("donor-replay");
  var ladderBtns = Array.prototype.slice.call(document.querySelectorAll("#donor-fig [data-ladder]"));
  var padBtns = Array.prototype.slice.call(document.querySelectorAll("#donor-fig [data-pad]"));

  var ROWS = 4, COLS = 14, CW = 48, CH = 34, GX = 94;
  var GY = { L: 96, R: 276, D: 470 };
  var TX0 = 40, TX1 = 820, TY = 44, NSTEPS = 50;
  /* phones: a narrower logical canvas (bigger on screen) with symbol-only grid labels and larger type */
  function setLayout() {
    var compact = canvas.getBoundingClientRect().width < 600;
    if (compact === COMPACT && cv) { return false; }
    COMPACT = compact;
    if (compact) { LW = 640; LH = 600; CW = 40; CH = 34; GX = 40; GY = { L: 100, R: 272, D: 458 }; TX0 = 22; TX1 = 618; TY = 48; FS = 1.3; }
    else { LW = 860; LH = 612; CW = 48; CH = 34; GX = 94; GY = { L: 96, R: 276, D: 470 }; TX0 = 40; TX1 = 820; TY = 44; FS = 1; }
    canvas.width = LW; canvas.height = LH;
    cv = SG.fixedCanvas(canvas);
    return true;
  }
  function F(n) { return n * FS; }
  var LADDERS = { wan: [5, 10, 15, 20], ltx: [10, 15, 20, 25, 30, 35] };
  var ladder = LADDERS.wan, P = 1;

  /* ---------------------------------------------------------------- scene */
  var OBJ = [[4, 5], [3, 6], [3, 7], [3, 7]];       // object (near) columns per row at the branch
  function cls(r, c, j) {
    var lo = OBJ[r][0], hi = OBJ[r][1];
    if (j >= 1 && r === 3) { hi = 8; }                 // re-estimated depth: the object now reaches column 8 in the bottom row
    if (c >= lo && c <= hi) { return "obj"; }
    return r === 3 ? "floor" : "wall";
  }
  function shiftOf(k) { return k === "obj" ? 2 : k === "floor" ? 1 : 0; }
  function hash(r, c) { var x = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453; return x - Math.floor(x); }
  function ltone(r, c, j, col) {
    var k = cls(r, c, j);
    if (k === "obj") { return SG.mix(col.cellNear, "#000000", 0.08 + 0.18 * hash(r, c)); }
    if (k === "floor") { return SG.mix(col.cellFloor, "#ffffff", 0.1 + 0.25 * hash(r, c + 3)); }
    return SG.mix(col.cellWall, c % 2 ? "#ffffff" : "#000000", 0.08 + 0.12 * hash(r + 7, c));
  }

  function warp(j) {
    var o = { w: [], src: [], H: [], drop: [], rho: [], pad: [], dest: [] };
    for (var r = 0; r < ROWS; r++) {
      o.w[r] = []; o.src[r] = []; o.H[r] = []; o.drop[r] = []; o.rho[r] = []; o.pad[r] = []; o.dest[r] = [];
      var best = [];
      for (var c = 0; c < COLS; c++) { o.w[r][c] = shiftOf(cls(r, c, j)); o.src[r][c] = -1; best[c] = -1; o.drop[r][c] = false; }
      for (c = 0; c < COLS; c++) {
        var d = c - o.w[r][c];
        o.dest[r][c] = d;
        if (d < 0) { o.drop[r][c] = true; continue; }
        if (o.w[r][c] > best[d]) {
          if (o.src[r][d] >= 0) { o.drop[r][o.src[r][d]] = true; }
          best[d] = o.w[r][c]; o.src[r][d] = c;
        } else { o.drop[r][c] = true; }
      }
      for (c = 0; c < COLS; c++) { o.H[r][c] = o.src[r][c] < 0; }
      for (c = 0; c < COLS; c++) {
        if (!o.H[r][c]) { o.rho[r][c] = -1; continue; }
        var k = c + 1; while (k < COLS && o.H[r][k]) { k++; }
        o.rho[r][c] = k < COLS ? k : -1;
      }
      for (c = 0; c < COLS; c++) {
        var near = false;
        for (var q = 1; q <= P; q++) { if (c - q >= 0 && o.H[r][c - q]) { near = true; } }
        o.pad[r][c] = j >= 1 && !o.H[r][c] && near;
      }
    }
    return o;
  }

  /* ---------------------------------------------------------------- stages + R snapshots */
  var stages = [], snaps = [], W = [];
  function cloneR(R) { return R ? R.map(function (row) { return row.map(function (x) { return Object.assign({}, x); }); }) : null; }

  function build() {
    var col = SG.colors();
    W = ladder.map(function (_, j) { return warp(j); });
    stages = []; snaps = [];
    var R = null, m = ladder.length - 1;
    function push(st) { st.before = cloneR(R); stages.push(st); }
    function sub(j) { return j === m ? "m" : String(j); }
    function rr(j) { return "<i class=\"m\">r</i><sub>" + (j === m ? "<i>m</i>" : j) + "</sub>"; }

    push({ type: "sample", dur: 1500, t0: 0, t1: ladder[0], text: "The left latent <i class=\"m\">L</i> is sampled as an ordinary video." });
    push({ type: "depth", dur: 1400, at: ladder[0], j: 0,
      text: "After step " + ladder[0] + " (" + rr(0) + "), depth from D(<i class=\"m\">L&#770;</i>) gives every cell a shift <i class=\"m\">w</i>(<i class=\"m\">p</i>), in whole cells." });
    push({ type: "shift", dur: 2300, at: ladder[0], j: 0,
      text: "Each cell moves <i class=\"m\">w</i>(<i class=\"m\">p</i>) cells to the left. The largest shift wins a collision; the others are dropped." });
    R = [];
    for (var r = 0; r < ROWS; r++) {
      R[r] = [];
      for (var c = 0; c < COLS; c++) {
        var s0 = W[0].src[r][c];
        R[r][c] = s0 >= 0 ? { tone: ltone(r, s0, 0, col), cyan: 0, hatch: 0, kind: "copy", src: s0 }
          : { tone: null, cyan: 0, hatch: 0, kind: "hole", src: -1 };
      }
    }
    push({ type: "holes", dur: 1200, at: ladder[0], j: 0, text: "Cells that nothing lands on are the holes <i class=\"m\">H</i>." });
    stages[stages.length - 1].after = cloneR(R);
    push({ type: "guess", dur: 2000, at: ladder[0], j: 0,
      text: "Each hole starts from <i class=\"m\">b</i>(<i class=\"m\">p</i>), the warped prediction of the nearest covered cell to its right, mixed with fresh noise at the current level." });
    var R2 = cloneR(R);
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        if (!W[0].H[r][c]) { continue; }
        var rho = W[0].rho[r][c];
        R2[r][c] = { tone: rho >= 0 ? R[r][rho].tone : ltone(r, c, 0, col), cyan: 0, hatch: 1, kind: rho >= 0 ? "guess" : "edge", src: -1, rho: rho };
      }
    }
    R = R2;
    stages[stages.length - 1].after = cloneR(R);

    function develop(j, amount) {
      var Rn = cloneR(R);
      for (var r2 = 0; r2 < ROWS; r2++) {
        for (var c2 = 0; c2 < COLS; c2++) {
          var x = Rn[r2][c2];
          x.hatch = 0;
          if (x.kind !== "copy") { x.cyan = Math.min(0.62, x.cyan + amount); }
        }
      }
      return Rn;
    }
    for (var j = 1; j <= m; j++) {
      var Rd = develop(j, j === 1 ? 0.55 : 0.12);
      push({ type: "denoise", dur: j === 1 ? 1700 : 1000, t0: ladder[j - 1], t1: ladder[j], j: j - 1,
        text: j === 1 ? "Both views are sampled side by side. In the holes, the right view develops content of its own."
          : "Both views keep sampling side by side." });
      R = Rd; stages[stages.length - 1].after = cloneR(R);
      var Rhat = cloneR(R);
      var Rn = cloneR(R);
      for (r = 0; r < ROWS; r++) {
        for (c = 0; c < COLS; c++) {
          var take = W[j].H[r][c] || W[j].pad[r][c];
          if (take) { Rn[r][c] = { tone: Rhat[r][c].tone, cyan: Rhat[r][c].cyan, hatch: 1, kind: W[j].pad[r][c] ? "pad" : "donor", src: -1 }; }
          else { Rn[r][c] = { tone: ltone(r, W[j].src[r][c], j, col), cyan: 0, hatch: 0, kind: "copy", src: W[j].src[r][c] }; }
        }
      }
      var padTxt = P ? " Padding <i class=\"m\">P</i> = 1 also hands the cell right of each hole to the donor." : "";
      if (j === 1) {
        push({ type: "redepth", dur: 1700, at: ladder[j], j: j,
          text: "After step " + ladder[j] + " (" + rr(j) + "), depth is re-estimated. One shift changes, so the holes move: dashed, the old <i class=\"m\">H</i>; solid, the new one." });
        push({ type: "donor", dur: 1500, at: ladder[j], j: j, rhat: Rhat,
          text: "The right view's own clean prediction <i class=\"m\">R&#770;</i> is the donor." });
        push({ type: "copy", dur: 2200, at: ladder[j], j: j, rhat: Rhat,
          text: "Covered cells copy the warped left latent again. Holes keep <i class=\"m\">R&#770;</i>, re-noised with fresh noise." + padTxt });
      } else {
        push({ type: "refresh", dur: 2300, at: ladder[j], j: j, rhat: Rhat,
          text: "After step " + ladder[j] + " (" + rr(j) + "), the same refresh: shared cells from <i class=\"m\">S</i>[<i class=\"m\">L</i>], holes" + (P ? " and padding" : "") + " from <i class=\"m\">R&#770;</i>." });
      }
      R = Rn; stages[stages.length - 1].after = cloneR(R);
    }
    var Rf = develop(m + 1, 0.1);
    push({ type: "finish", dur: 1800, t0: ladder[m], t1: NSTEPS, j: m,
      text: "After the last refresh, both views finish independently." });
    R = Rf; stages[stages.length - 1].after = cloneR(R);
    stages.forEach(function (st) { if (!st.after) { st.after = cloneR(st.before); } });
  }

  /* ---------------------------------------------------------------- drawing helpers */
  function lum(hex) {
    var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(hex);
    var v = m ? [+m[1], +m[2], +m[3]] : SG.hexToRgb(hex);
    return (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]) / 255;
  }
  function cellXY(g, r, c) { return [GX + c * CW, GY[g] + r * CH]; }
  function drawCellFill(ctx, x, y, cell, col, alpha) {
    if (!cell || !cell.tone) { return; }
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    var tone = cell.cyan > 0 ? SG.mix(toHex(cell.tone), col.right, 0.75 * cell.cyan) : cell.tone;
    ctx.fillStyle = tone;
    ctx.fillRect(x + 1, y + 1, CW - 2, CH - 2);
    if (cell.hatch > 0.02) {
      var dark = lum(tone) < 0.45;
      SG.hatch(ctx, x + 1, y + 1, CW - 2, CH - 2, dark ? "rgba(255,255,255," + (0.55 * cell.hatch) + ")" : "rgba(0,0,0," + (0.42 * cell.hatch) + ")", 6, 1.2);
    }
    ctx.restore();
  }
  function toHex(c) {
    if (c.charAt(0) === "#") { return c; }
    var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c);
    if (!m) { return "#888888"; }
    return "#" + [m[1], m[2], m[3]].map(function (v) { var s = (+v).toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  }
  function outline(ctx, x, y, color, col, lw, dashed, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (dashed) { ctx.setLineDash([4, 3]); }
    ctx.lineWidth = lw + 2; ctx.strokeStyle = col.holeCase;
    ctx.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5);
    ctx.lineWidth = lw; ctx.strokeStyle = color;
    ctx.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5);
    ctx.restore();
  }
  function frame(ctx, g, col, label, color, alpha, hat, lines) {
    ctx.save();
    ctx.globalAlpha = alpha;
    var x = GX, y = GY[g];
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, COLS * CW - 1, ROWS * CH - 1);
    var lx = COMPACT ? 6 : GX + COLS * CW + 14, ly = y + (COMPACT ? 26 : 22);
    ctx.fillStyle = color;
    if (hat) { SG.drawHat(ctx, label, lx, ly, F(22)); } else { SG.drawSub(ctx, label, "", lx, ly, F(22)); }
    if (!COMPACT) {
      ctx.font = SG.font(13, 600); ctx.fillStyle = col.muted; ctx.textAlign = "left";
      lines.forEach(function (t, i) { ctx.fillText(t, lx, ly + 20 + i * 16); });
    }
    ctx.restore();
  }
  function emptyGrid(ctx, g, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = col.hair; ctx.lineWidth = 1;
    for (var r = 0; r < ROWS; r++) { for (var c = 0; c < COLS; c++) { ctx.strokeRect(GX + c * CW + 1.5, GY[g] + r * CH + 1.5, CW - 3, CH - 3); } }
    ctx.restore();
  }
  function cross(ctx, x, y, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col.ink; ctx.lineWidth = 2;
    var cx = x + CW / 2, cy = y + CH / 2, s = 7;
    ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
    ctx.restore();
  }

  function drawL(ctx, col, j, digits, ring) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var xy = cellXY("L", r, c), tone = ltone(r, c, j, col);
        ctx.fillStyle = tone; ctx.fillRect(xy[0] + 1, xy[1] + 1, CW - 2, CH - 2);
        if (digits > 0) {
          ctx.save(); ctx.globalAlpha = digits;
          ctx.font = SG.font(F(15), 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = lum(tone) < 0.45 ? "#ffffff" : "#1d1d1f";
          ctx.fillText(String(shiftOf(cls(r, c, j))), xy[0] + CW / 2, xy[1] + CH / 2 + 1);
          ctx.restore();
        }
      }
    }
    if (ring > 0) {
      var xy2 = cellXY("L", 3, 8);
      ctx.save(); ctx.globalAlpha = ring; ctx.strokeStyle = col.ink; ctx.lineWidth = 2.5;
      ctx.strokeRect(xy2[0] - 1.5, xy2[1] - 1.5, CW + 3, CH + 3); ctx.restore();
    }
  }
  function drawRgrid(ctx, col, R, alpha) {
    if (!R) { return; }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) { var xy = cellXY("R", r, c); drawCellFill(ctx, xy[0], xy[1], R[r][c], col, alpha); }
    }
  }
  function drawMarks(ctx, col, R, opts) {
    // hole and padding outlines from the cells' kinds
    opts = opts || {};
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = R[r][c], xy = cellXY("R", r, c);
        if (x.kind === "hole" || x.kind === "guess" || x.kind === "edge" || x.kind === "donor") { outline(ctx, xy[0], xy[1], col.hole, col, 2.5, false, opts.alpha); }
        if (x.kind === "pad") { outline(ctx, xy[0], xy[1], col.right, col, 2.5, false, opts.alpha); }
      }
    }
  }

  function drawTimeline(ctx, col, t) {
    ctx.save();
    var sx = function (s) { return TX0 + (TX1 - TX0) * s / NSTEPS; };
    ctx.font = SG.font(F(13), 500); ctx.fillStyle = col.muted; ctx.textAlign = "left";
    ctx.fillText("noise", TX0, F(14)); ctx.textAlign = "right"; ctx.fillText("video", TX1, F(14));
    ctx.strokeStyle = col.line; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(TX0, TY); ctx.lineTo(TX1, TY); ctx.stroke();
    ctx.strokeStyle = col.ink; ctx.beginPath(); ctx.moveTo(TX0, TY); ctx.lineTo(sx(t), TY); ctx.stroke();
    ctx.font = SG.font(F(12.5), 500); ctx.fillStyle = col.muted; ctx.textAlign = "center";
    for (var s = 0; s <= NSTEPS; s += 10) { ctx.fillText(String(s), sx(s), TY + F(21)); }
    var m = ladder.length - 1;
    ladder.forEach(function (r, j) {
      SG.triangle(ctx, sx(r), TY - 7, 11, col.warpMark);
      ctx.fillStyle = t >= r - 0.01 ? col.ink : col.muted;
      SG.drawSub(ctx, "r", j === m ? "m" : String(j), sx(r) + 7, TY - 11, F(15), { subMath: j === m });
    });
    ctx.beginPath(); ctx.arc(sx(t), TY, 6.5, 0, Math.PI * 2); ctx.fillStyle = col.bg; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = col.ink; ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- render one moment */
  var cur = 0, prog = 0, playing = false, raf = null, last = 0, everPlayed = false;

  function render() {
    cv.fit();
    var ctx = cv.ctx, col = SG.colors();
    ctx.clearRect(0, 0, LW, LH);
    var st = stages[cur], p = prog;
    if (!st) { return; }
    var j = st.j || 0;
    var t = st.t0 != null ? SG.lerp(st.t0, st.t1, SG.ease(p)) : st.at;
    drawTimeline(ctx, col, t);

    // which depth the left grid shows
    var jL = st.type === "sample" ? 0 : (st.type === "redepth" ? (p > 0.35 ? j : j - 1) : j);
    if (st.type === "denoise" || st.type === "finish") { jL = j; }
    var digits = st.type === "sample" ? 0 : st.type === "depth" ? SG.easeOut(p / 0.6) : 1;
    var ring = (st.type === "redepth" && j === 1) ? SG.clamp((p - 0.3) / 0.3, 0, 1) : (st.type === "donor" || st.type === "copy") && j === 1 ? 1 : 0;
    frame(ctx, "L", col, "L", col.leftText, 1, false, ["left", "latent"]);
    drawL(ctx, col, Math.max(0, jL), digits, ring);

    var showR = !(st.type === "sample" || st.type === "depth");
    frame(ctx, "R", col, "R", col.rightText, showR ? 1 : 0.35, false, ["right", "latent"]);
    if (!showR) { emptyGrid(ctx, "R", col, 0.7); }

    var showD = st.type === "donor" || st.type === "copy" || st.type === "refresh";
    var dAlpha = st.type === "donor" ? SG.easeOut(p / 0.5) : showD ? 1 : 0;
    frame(ctx, "D", col, "R", col.rightText, Math.max(0.35, dAlpha), true, ["donor", "(right", "view's", "prediction)"]);
    if (!showD) { emptyGrid(ctx, "D", col, 0.7); }

    if (st.type === "shift") { drawShift(ctx, col, p); }
    else if (st.type === "holes") {
      drawRgrid(ctx, col, st.after);
      emptyHoles(ctx, col, st.after, 1);
      drawMarks(ctx, col, st.after, { alpha: SG.easeOut(p / 0.5) });
      drawDropped(ctx, col, 1 - SG.clamp(p / 0.5, 0, 1));
    } else if (st.type === "guess") {
      drawGuess(ctx, col, st, p);
    } else if (st.type === "denoise" || st.type === "finish") {
      drawRgrid(ctx, col, blend(st.before, st.after, SG.ease(p)));
      drawMarks(ctx, col, st.before, { alpha: st.type === "finish" ? 1 - SG.ease(p) * 0.6 : 1 });
    } else if (st.type === "redepth") {
      drawRgrid(ctx, col, st.before);
      var a = SG.clamp((p - 0.35) / 0.4, 0, 1);
      // old holes dashed, new holes solid
      var Wj = W[j];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var xy = cellXY("R", r, c), was = st.before[r][c].kind !== "copy" && st.before[r][c].kind !== "pad";
          if (was) { outline(ctx, xy[0], xy[1], col.hole, col, 2.2, a > 0, 1 - 0.35 * a); }
          if (Wj.H[r][c] && !was) { outline(ctx, xy[0], xy[1], col.hole, col, 2.5, false, a); }
        }
      }
      if (j === 1 && a > 0) { annotateHoles(ctx, col, a); }
    } else if (st.type === "donor") {
      drawRgrid(ctx, col, st.before);
      drawNewMarks(ctx, col, j, 1, true);
      drawDonor(ctx, col, st.rhat, j, dAlpha, 0);
      if (j === 1) { annotateHoles(ctx, col, 1); }
    } else if (st.type === "copy" || st.type === "refresh") {
      var pp = st.type === "refresh" ? p : p;
      var arrows = SG.clamp(pp / 0.35, 0, 1), swap = SG.clamp((pp - 0.35) / 0.4, 0, 1);
      drawRgrid(ctx, col, blend(st.before, st.after, swap, true));
      drawNewMarks(ctx, col, j, 1, true);
      drawDonor(ctx, col, st.rhat, j, 1, arrows);
      drawCopyArrows(ctx, col, j, arrows * (1 - 0.6 * swap));

      if (P) { annotatePad(ctx, col, j, SG.clamp((pp - 0.6) / 0.3, 0, 1)); }
    }
  }

  function blend(A, B, t, sharp) {
    if (!A) { return B; }
    if (!B) { return A; }
    return A.map(function (row, r) {
      return row.map(function (x, c) {
        var y = B[r][c];
        if (sharp && (x.tone !== y.tone || x.kind !== y.kind)) { return t < 0.5 ? x : y; }
        return { tone: y.tone || x.tone, cyan: SG.lerp(x.cyan, y.cyan, t), hatch: SG.lerp(x.hatch, y.hatch, t), kind: t < 0.5 ? x.kind : y.kind };
      });
    });
  }
  function emptyHoles(ctx, col, R) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (R[r][c].kind === "hole") { var xy = cellXY("R", r, c); ctx.fillStyle = col.holeCase; ctx.fillRect(xy[0] + 1, xy[1] + 1, CW - 2, CH - 2); }
      }
    }
  }
  function drawDropped(ctx, col, alpha) {
    if (alpha <= 0) { return; }
    var w0 = W[0];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!w0.drop[r][c]) { continue; }
        var d = w0.dest[r][c], x = GX + d * CW, y = GY.R + r * CH;
        if (d < 0) { cross(ctx, x, y, col, alpha); }
      }
    }
  }
  function drawShift(ctx, col, p) {
    var w0 = W[0];
    // empty target
    emptyGrid(ctx, "R", col, 0.7);
    // draw losers first, winners last (the nearest surface ends on top)
    var order = [];
    for (var r = 0; r < ROWS; r++) { for (var c = 0; c < COLS; c++) { order.push([r, c]); } }
    order.sort(function (a, b) { return (w0.drop[b[0]][b[1]] ? 1 : 0) - (w0.drop[a[0]][a[1]] ? 1 : 0) || w0.w[a[0]][a[1]] - w0.w[b[0]][b[1]]; });
    order.forEach(function (rc) {
      var r = rc[0], c = rc[1];
      var delay = 0.06 * r, q = SG.ease(SG.clamp((p - delay) / 0.7, 0, 1));
      var x0 = GX + c * CW, y0 = GY.L + r * CH, d = w0.dest[r][c];
      var x1 = GX + d * CW, y1 = GY.R + r * CH;
      var x = SG.lerp(x0, x1, q), y = SG.lerp(y0, y1, q);
      var dropped = w0.drop[r][c];
      var fade = dropped ? 1 - SG.clamp((p - 0.8) / 0.2, 0, 1) * 0.85 : 1;
      var cell = { tone: ltone(r, c, 0, col), cyan: 0, hatch: 0 };
      drawCellFill(ctx, x, y, cell, col, q > 0 ? fade : 0);
      if (q > 0 && q < 1) {
        ctx.save(); ctx.globalAlpha = 0.85; ctx.font = SG.font(F(13), 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = lum(cell.tone) < 0.45 ? "#ffffff" : "#1d1d1f";
        ctx.fillText(String(w0.w[r][c]), x + CW / 2, y + CH / 2 + 1); ctx.restore();
      }
    });
    var a = SG.clamp((p - 0.82) / 0.18, 0, 1);
    if (a > 0) {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var d = w0.dest[r][c];
          if (!w0.drop[r][c]) { continue; }
          if (d < 0) { cross(ctx, GX + d * CW, GY.R + r * CH, col, a); continue; }
          var xa = GX + c * CW + CW / 2, ya = GY.L + ROWS * CH + 4, xb = GX + d * CW + CW / 2, yb = GY.R - 4;
          ctx.save(); ctx.globalAlpha = a * 0.8; ctx.setLineDash([3, 3]); ctx.strokeStyle = col.arrow; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); ctx.setLineDash([]);
          var xm = (xa + xb) / 2, ym = (ya + yb) / 2, k = 4.5;
          ctx.lineWidth = 2; ctx.strokeStyle = col.ink;
          ctx.beginPath(); ctx.moveTo(xm - k, ym - k); ctx.lineTo(xm + k, ym + k); ctx.moveTo(xm + k, ym - k); ctx.lineTo(xm - k, ym + k); ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
  function drawGuess(ctx, col, st, p) {
    var A = st.before, B = st.after;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var xy = cellXY("R", r, c), b = B[r][c];
        if (A[r][c].kind === "hole") {
          var q = SG.clamp((p - 0.35) / 0.45, 0, 1);
          ctx.fillStyle = col.holeCase; ctx.fillRect(xy[0] + 1, xy[1] + 1, CW - 2, CH - 2);
          drawCellFill(ctx, xy[0], xy[1], b, col, q);
        } else { drawCellFill(ctx, xy[0], xy[1], b, col, 1); }
      }
    }
    drawMarks(ctx, col, B);
    // arrows from rho(p) to the hole run (one per run), and L-hat(p) for the right-edge hole
    var ar = SG.clamp(p / 0.35, 0, 1) * (1 - 0.5 * SG.clamp((p - 0.8) / 0.2, 0, 1));
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        b = B[r][c];
        if (b.kind === "guess" && (c + 1 >= COLS || B[r][c + 1].kind !== "guess")) {
          var xs = GX + b.rho * CW + CW / 2, ys = GY.R + r * CH + CH - 4;
          var xe = GX + c * CW + CW / 2;
          ctx.save(); ctx.globalAlpha = ar; ctx.strokeStyle = col.arrow; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(xs, ys); ctx.quadraticCurveTo((xs + xe) / 2, ys + 16, xe + 6, ys); ctx.stroke();
          SG.arrow(ctx, xe + 12, ys + 5, xe + 4, ys - 2, col.arrow, 1.6, 7);
          ctx.restore();
          if (r === 3 || (r === 1 && ROWS < 4)) { label(ctx, col, "ρ(p)", xs + 4, ys + 22, ar); }
        }
        if (b.kind === "edge") {
          ctx.save(); ctx.globalAlpha = ar;
          var xe2 = GX + c * CW + CW / 2;
          SG.arrow(ctx, xe2 + 30, GY.R + r * CH + CH / 2, GX + COLS * CW + 3, GY.R + r * CH + CH / 2, col.arrow, 1.6, 7);
          ctx.fillStyle = col.muted;
          var lxh = GX + COLS * CW + (COMPACT ? 4 : 34);
          SG.drawHat(ctx, "L", lxh, GY.R + r * CH + CH / 2 + 6, 15);
          ctx.font = SG.mathFont(15); ctx.fillText("(p)", lxh + 11, GY.R + r * CH + CH / 2 + 6);
          ctx.restore();
        }
      }
    }
  }
  function label(ctx, col, txt, x, y, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col.muted; ctx.font = SG.mathFont(F(15)); ctx.textAlign = "left";
    ctx.fillText(txt, x, y); ctx.restore();
  }
  function drawNewMarks(ctx, col, j, a, show) {
    if (!show) {
      return;
    }
    var Wj = W[j];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var xy = cellXY("R", r, c);
        if (Wj.H[r][c]) { outline(ctx, xy[0], xy[1], col.hole, col, 2.5, false, a); }
        else if (Wj.pad[r][c]) { outline(ctx, xy[0], xy[1], col.right, col, 2.5, false, a); }
      }
    }
  }
  function drawDonor(ctx, col, Rhat, j, alpha, arrows) {
    var Wj = W[j], colsUsed = {};
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var xy = cellXY("D", r, c), take = Wj.H[r][c] || Wj.pad[r][c];
        var x = Rhat[r][c];
        drawCellFill(ctx, xy[0], xy[1], { tone: x.tone, cyan: x.cyan, hatch: 0 }, col, alpha * (take ? 1 : 0.28));
        if (take) { outline(ctx, xy[0], xy[1], Wj.H[r][c] ? col.hole : col.right, col, 1.6, false, 0.75 * alpha); colsUsed[c] = true; }
      }
    }
    if (arrows > 0) {
      Object.keys(colsUsed).forEach(function (k) {
        var ax = GX + (+k) * CW + CW / 2;
        SG.arrow(ctx, ax, GY.D - 5, ax, GY.R + ROWS * CH + 6, SG.alpha(toHex(col.right), arrows), 2, 8);
      });
    }
  }
  function drawCopyArrows(ctx, col, j, a) {
    if (a <= 0) { return; }
    var Wj = W[j], prev = W[j - 1];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var s = Wj.src[r][c];
        if (s < 0 || Wj.pad[r][c]) { continue; }
        var changed = prev && prev.w[r][s] !== Wj.w[r][s];
        if (!changed) { continue; }   // unchanged cells copy straight down; only the changed one is drawn
        var x0 = GX + s * CW + CW / 2, y0 = GY.L + ROWS * CH + 2, x1 = GX + c * CW + CW / 2, y1 = GY.R - 2;
        ctx.save();
        ctx.globalAlpha = changed ? a : a * 0.45;
        ctx.strokeStyle = changed ? col.ink : col.arrow;
        ctx.lineWidth = changed ? 2 : 1.1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1 - 6); ctx.stroke();
        SG.arrow(ctx, x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8, x1, y1, changed ? col.ink : col.arrow, changed ? 2 : 1.1, changed ? 8 : 6);
        ctx.restore();
      }
    }
  }
  function tickLabel(ctx, col, txt, cx, a, color) {
    var y = GY.R + ROWS * CH;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color || col.muted; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, y + 3); ctx.lineTo(cx, y + 9); ctx.stroke();
    ctx.font = SG.font(F(12), 600); ctx.fillStyle = color || col.muted; ctx.textAlign = "center";
    ctx.fillText(txt, cx, y + 9 + F(13));
    ctx.restore();
  }
  function annotateHoles(ctx, col, a) {
    // bottom row: the re-estimated shift moved the hole one cell to the right
    var o = COMPACT ? 12 : 4;
    tickLabel(ctx, col, "was H", GX + 6.5 * CW - o, a);
    tickLabel(ctx, col, "new H", GX + 7.5 * CW + o, a);
  }
  function annotatePad(ctx, col, j, a) {
    if (a <= 0) { return; }
    var Wj = W[j];
    for (var c = 0; c < COLS; c++) {
      if (!Wj.pad[ROWS - 1][c]) { continue; }
      var x = GX + c * CW + CW / 2, y = GY.R + ROWS * CH;
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col.rightText; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 8, y + 15); ctx.lineTo(x + CW - 2, y + 15); ctx.stroke();
      ctx.font = SG.font(F(13), 600); ctx.fillStyle = col.rightText; ctx.textAlign = "left";
      ctx.fillText("padding, P = 1", x + CW + 2, y + 15 + F(5));
      ctx.restore();
      return;
    }
  }

  /* ---------------------------------------------------------------- playback */
  function setStatus() { statusEl.innerHTML = stages[cur] ? stages[cur].text : ""; }
  function uiPlay() {
    bPlay.setAttribute("data-state", playing ? "playing" : "paused");
    bPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
    bPrev.disabled = cur === 0 && prog === 0;
    bNext.disabled = cur >= stages.length - 1 && prog >= 1;
  }
  function frameLoop(ts) {
    if (!playing) { return; }
    var dt = last ? ts - last : 16; last = ts;
    prog += dt / stages[cur].dur;
    if (prog >= 1) {
      if (cur < stages.length - 1) { cur++; prog = 0; setStatus(); }
      else { prog = 1; playing = false; render(); uiPlay(); return; }
    }
    render();
    raf = requestAnimationFrame(frameLoop);
  }
  function play() {
    if (SG.reduced) { return; }
    if (cur >= stages.length - 1 && prog >= 1) { cur = 0; prog = 0; setStatus(); }
    playing = true; everPlayed = true; last = 0; uiPlay();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frameLoop);
  }
  function pause() { playing = false; cancelAnimationFrame(raf); uiPlay(); }
  function goto(i, p) { pause(); cur = SG.clamp(i, 0, stages.length - 1); prog = p == null ? 1 : p; setStatus(); render(); uiPlay(); }
  function staticFrame() {
    // reduced motion: the first refresh at the moment the donor fills the holes
    var i = 0; stages.forEach(function (s, k) { if (s.type === "copy" && !i) { i = k; } });
    goto(i || stages.length - 1, 1);
  }

  bPlay.addEventListener("click", function () { if (playing) { pause(); } else { play(); } });
  bPrev.addEventListener("click", function () { if (prog > 0.05 && prog < 1) { goto(cur, 0); } else { goto(cur - 1, 1); } });
  bNext.addEventListener("click", function () { goto(prog >= 1 ? cur + 1 : cur, 1); });
  bReplay.addEventListener("click", function () { cur = 0; prog = 0; setStatus(); render(); play(); });
  ladderBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      ladder = LADDERS[b.getAttribute("data-ladder")];
      ladderBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      build(); cur = 0; prog = 0; setStatus(); render();
      if (SG.reduced) { staticFrame(); } else { play(); }
    });
  });
  padBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      P = parseInt(b.getAttribute("data-pad"), 10);
      padBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var keep = cur, kp = prog, was = playing;
      build(); cur = Math.min(keep, stages.length - 1); prog = kp; setStatus(); render(); uiPlay();
      if (was) { play(); }
    });
  });

  setLayout();
  build();
  if (SG.reduced) { bReplay.hidden = true; staticFrame(); }
  else { cur = 0; prog = 0; setStatus(); render(); uiPlay(); SG.onceVisible(canvas, function () { if (!everPlayed) { play(); } }); }
  SG.onResize(function () { setLayout(); render(); });
  SG.onTheme(function () { build(); render(); });
})();
