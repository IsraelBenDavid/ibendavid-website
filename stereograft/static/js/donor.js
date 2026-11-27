/* Donor chain on a real run: a 24 x 32-cell window of one Wan 2.1 text-to-stereo run (the penguin of the pipeline
   explorer, frame 40) and of a second prompt from the same study (a wicker basket, frame 80).
   A step rail (55 positions: steps 0-49, the four warps W0..Wm written after steps 5/10/15/20, and the final pair)
   drives an "equation lens": shifted left S[L-hat] on the covered cells + the right view's own R-hat on holes and
   padding = what the warp writes; Clean / Noisy swaps in the decoded noisy latents. A cell cursor links every view
   (rings, readout, history chips, cell strip). Data: static/data/donor.json + images/donor/<scene>/ (all real, built by
   build_donor_assets.py; every count is asserted against the run's own masks). */
(function () {
  "use strict";
  var SG = window.SG;
  var fig = document.getElementById("dn-fig");
  if (!fig || !SG) { return; }
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------- positions */
  var WARPS = [5, 10, 15, 20], STOPS = [6, 12, 18, 24, 54], REST = 12, FINAL = 54;
  var POS = [];
  (function () {
    var s, j;
    for (s = 0; s <= 5; s++) { POS.push({ k: "s", s: s }); }
    POS.push({ k: "w", j: 0, s: 5 });
    for (j = 1; j < 4; j++) {
      for (s = WARPS[j - 1] + 1; s <= WARPS[j]; s++) { POS.push({ k: "s", s: s }); }
      POS.push({ k: "w", j: j, s: WARPS[j] });
    }
    for (s = 21; s <= 49; s++) { POS.push({ k: "s", s: s }); }
    POS.push({ k: "f" });
  })();
  function latestJ(p) {
    if (p.k === "w") { return p.j; }
    if (p.k === "f") { return 3; }
    var j = -1;
    WARPS.forEach(function (r, k) { if (r < p.s) { j = k; } });
    return j;
  }
  function posOfStep(s) { for (var i = 0; i < POS.length; i++) { if (POS[i].k === "s" && POS[i].s === s) { return i; } } return REST; }
  function segKey(i) {
    var p = POS[i];
    if (p.k === "w") { return "W" + (p.j === 3 ? "m" : p.j); }
    if (p.k === "f") { return "FINAL"; }
    var j = latestJ(p);
    return j < 0 ? "pre" : j === 3 ? "tail" : "seg" + (j + 1);
  }
  var SEG_TEXT = {
    pre: "The left view is sampled alone.",
    seg1: "The right view starts drawing inside its holes.",
    seg2: "Between refreshes, the two views are sampled independently.",
    seg3: "Between refreshes, the two views are sampled independently.",
    tail: "No more warps: both views finish independently."
  };

  /* ---------------------------------------------------------------- elements */
  var railC = $("dn-rail"), rail = SG.fluidCanvas(railC);
  var thumbsBox = $("dn-thumbs"), lens = $("dn-lens"), big = $("dn-big"), info = $("dn-info");
  var statusEl = $("dn-status"), eqEl = $("dn-eq"), readEl = $("dn-readout"), chipsEl = $("dn-chips"), liveEl = $("dn-live");
  var cWin = $("dn-count-win"), cFrame = $("dn-count-frame"), countsEl = $("dn-counts");
  var more = $("dn-more"), moreT = $("dn-more-t"), rowEl = $("dn-row"), stripNote = $("dn-strip-note");
  var stripC = $("dn-strip"), strip = SG.fluidCanvas(stripC);
  var bPlay = $("dn-play"), bPrev = $("dn-prev"), bNext = $("dn-next"), bReplay = $("dn-replay"), bGrid = $("dn-grid");
  var scenePick = $("dn-scene"), head = $("dn-head"), loc = $("dn-loc"), locC = loc.querySelector("canvas"), locCv = SG.fluidCanvas(locC);
  var transport = fig.querySelector(".transport");
  var paneEls = Array.prototype.slice.call(lens.querySelectorAll(".dn-pane"));
  var glyphs = Array.prototype.slice.call(lens.querySelectorAll(".dn-glyph"));
  function mkView(el, term) {
    var box = el.querySelector(".dn-box");
    return {
      el: el, term: term, box: box, lab: el.querySelector(".dn-lab"),
      img: SG.fluidCanvas(box.querySelector(".dn-img")), ov: SG.fluidCanvas(box.querySelector(".dn-ov")),
      ph: box.querySelector(".dn-ph"), load: box.querySelector(".dn-load")
    };
  }
  var views = paneEls.map(function (el, i) { return mkView(el, i); });
  var bigView = mkView(big, 2);

  /* ---------------------------------------------------------------- state */
  var D = null, scene = "penguin", S = null, M = {};
  var pos = REST, prevPos = REST, mode = "clean", grid = true, sel = 2;
  var touched = false, adopted = false, toured = false, visible = false, started = false;
  var pinned = null, hover = null, leftHover = null;
  var playing = false, timer = null, tourTimer = null, touring = false;
  var layoutMode = "", lastStatus = "", liveT = null;
  var slide = null, slideBuf = document.createElement("canvas");
  var IMG = "static/images/donor/";

  /* ---------------------------------------------------------------- images */
  var cache = {};
  function url(name, sc) { return IMG + (sc || scene) + "/" + name + ".webp"; }
  function load(u) {
    if (cache[u]) { return cache[u]; }
    var e = cache[u] = { img: new Image(), ok: false };
    e.img.decoding = "async";
    e.img.onload = function () {
      var done = function () { e.ok = true; schedule(); };
      if (e.img.decode) { e.img.decode().then(done, done); } else { done(); }
    };
    e.img.src = u;
    return e;
  }
  function get(name, sc) { var e = load(url(name, sc)); return e.ok ? e.img : null; }
  function has(name, sc) { var e = cache[url(name, sc)]; return !!(e && e.ok); }
  function stepName(kind, s) { return kind + "-" + SG.pad2(s); }
  function wName(kind, r) { return kind + "-r" + SG.pad2(r); }
  /* nearest loaded step image (never a blank pane while the rest loads) */
  function nearest(kind, s, lo, hi) {
    var img = get(stepName(kind, s));
    if (img) { return { img: img, exact: true }; }
    for (var d = 1; d < 50; d++) {
      if (s - d >= lo && has(stepName(kind, s - d))) { return { img: get(stepName(kind, s - d)), exact: false }; }
      if (s + d <= hi && has(stepName(kind, s + d))) { return { img: get(stepName(kind, s + d)), exact: false }; }
    }
    return { img: null, exact: false };
  }
  function restingSet(sc) {
    return ["L-10", "S-r10", "R-10", "W-r10", "S-r05", "W-r15", "W-r20", "FR", "L-05", "L-15", "L-20"].map(function (n) { return url(n, sc); });
  }
  function fullSet(sc) {
    var l = [], s;
    WARPS.forEach(function (r) { l.push(url(wName("S", r), sc), url(wName("N", r), sc), url(stepName("L", r), sc)); });
    WARPS.slice(1).forEach(function (r) { l.push(url(wName("W", r), sc), url(wName("M", r), sc), url(stepName("R", r), sc)); });
    l.push(url("FL", sc), url("FR", sc));
    for (s = 0; s < 50; s++) { l.push(url(stepName("L", s), sc)); }
    for (s = 6; s < 50; s++) { l.push(url(stepName("R", s), sc)); }
    return l;
  }
  function locUrl(sc) { return sc === "penguin" ? "static/images/pipeline/R_49.webp" : url("loc", sc); }
  function queue(list) {
    var i = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 30); };
    (function next() {
      for (var k = 0; k < 6 && i < list.length; k++, i++) { load(list[i]); }
      if (i < list.length) { idle(next); }
    })();
  }

  /* dimmed copy (desaturated, 55 % toward the panel), anaglyph and cell means, computed once per image */
  var derived = {};
  function dimOf(img, key) {
    var panel = SG.css("--panel"), k = key + "|dim|" + panel;
    if (derived[k]) { return derived[k]; }
    var c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    var x = c.getContext("2d"); x.drawImage(img, 0, 0);
    try {
      var d = x.getImageData(0, 0, c.width, c.height), a = d.data, p = SG.hexToRgb(panel);
      for (var i = 0; i < a.length; i += 4) {
        var g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        a[i] = g * 0.45 + p[0] * 0.55; a[i + 1] = g * 0.45 + p[1] * 0.55; a[i + 2] = g * 0.45 + p[2] * 0.55;
      }
      x.putImageData(d, 0, 0);
    } catch (e) { x.fillStyle = SG.alpha(panel, 0.55); x.fillRect(0, 0, c.width, c.height); }
    derived[k] = c;
    return c;
  }
  function anaglyph() {
    var k = scene + "|ana";
    if (derived[k]) { return derived[k]; }
    var L = get("FL"), R = get("FR");
    if (!L || !R) { return null; }
    var c = document.createElement("canvas"); c.width = R.naturalWidth; c.height = R.naturalHeight;
    var x = c.getContext("2d");
    try {
      x.drawImage(L, 0, 0); var a = x.getImageData(0, 0, c.width, c.height);
      x.drawImage(R, 0, 0); var b = x.getImageData(0, 0, c.width, c.height);
      for (var i = 0; i < a.data.length; i += 4) { b.data[i] = a.data[i]; }    // red = left, green + blue = right
      x.putImageData(b, 0, 0);
    } catch (e) { x.drawImage(R, 0, 0); }
    derived[k] = c;
    return c;
  }
  function meansOf(img, key, cols) {
    var k = key + "|means";
    if (derived[k]) { return derived[k]; }
    var bs = img.naturalHeight / 32, c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var x = c.getContext("2d"); x.drawImage(img, 0, 0);
    var out = [];
    try {
      var a = x.getImageData(0, 0, c.width, c.height).data, W = c.width;
      for (var r = 0; r < 32; r++) {
        var row = [];
        for (var q = 0; q < cols; q++) {
          var s0 = 0, s1 = 0, s2 = 0, n = 0;
          for (var yy = Math.floor(r * bs); yy < Math.floor((r + 1) * bs); yy++) {
            for (var xx = Math.floor(q * bs); xx < Math.min(W, Math.floor((q + 1) * bs)); xx++) {
              var o = (yy * W + xx) * 4; s0 += a[o]; s1 += a[o + 1]; s2 += a[o + 2]; n++;
            }
          }
          row.push(n ? [s0 / n, s1 / n, s2 / n] : [128, 128, 128]);
        }
        out.push(row);
      }
    } catch (e) { return null; }
    derived[k] = out;
    return out;
  }

  /* ---------------------------------------------------------------- per-scene masks */
  function prep(sc) {
    var m = { H: [], P: [], Dm: [] };
    sc.warps.forEach(function (e) {
      var H = e.H.map(function (row) { return row.split("").map(function (ch) { return ch === "1"; }); });
      var P = e.P.map(function (row) { return row.split("").map(function (ch) { return ch === "1"; }); });
      m.H.push(H); m.P.push(P);
      m.Dm.push(H.map(function (row, r) { return row.map(function (v, c) { return v || P[r][c]; }); }));
    });
    m.notes = {};
    (sc.notes || []).forEach(function (n) { m.notes[n.warp + ":" + n.rc[0] + ":" + n.rc[1]] = n; });
    return m;
  }
  function inD(j, wr, wc) { return j === 0 ? M.H[0][wr][wc] : M.Dm[j][wr][wc]; }
  function defaultCell() { return S.default_cell.slice(); }
  function curCell() { return hover || pinned || defaultCell(); }

  /* ---------------------------------------------------------------- text helpers */
  var LH = "<i class=\"m\">L&#770;</i>", RH = "<i class=\"m\">R&#770;</i>", SS = "<i class=\"m\">S</i>";
  function rj(j) { return j === 3 ? "<i class=\"m\">r<sub>m</sub></i>" : "<i class=\"m\">r</i><sub>" + j + "</sub>"; }
  function mathify(s) { return s.replace(/R̂/g, RH).replace(/L̂/g, LH); }
  function f3(x) { return x.toFixed(3); }
  function pct(t) { var k = Math.round(100 * (1 - t)); return [k, 100 - k]; }
  function fmt(n) { return SG.fmt(n); }
  function wbar(t) { return "<span class=\"wbar\" aria-hidden=\"true\"><i style=\"width:" + (100 * (1 - t)).toFixed(1) + "%\"></i></span>"; }

  /* ---------------------------------------------------------------- pane specs */
  function paneSpec(term) {
    var p = POS[pos], j = latestJ(p), sp = { img: null, ctx: false, pixel: false, alpha: 1, keep: null, blank: null,
      outline: null, olAlpha: 1, ph: "", loading: false, lab: "", nt: "", aria: "", coords: "right" };
    if (p.k === "s" && j < 0) {
      if (term === 0) {
        var n = nearest("L", p.s, 0, 49); sp.img = n.img; sp.loading = !n.exact; sp.ctx = true; sp.coords = "left";
        sp.lab = "Left view D(" + LH + ")"; sp.nt = "step " + p.s + ", t = " + f3(D.t[p.s]);
        sp.aria = "Left view: the decoded clean prediction at step " + p.s + ".";
      } else if (term === 1) {
        sp.ph = "The right view branches after step 5."; sp.lab = "Right view"; sp.nt = "not branched yet";
        sp.aria = "The right view does not exist yet; it branches after step 5.";
      } else {
        sp.ph = "Each warp's write appears here."; sp.lab = "Written"; sp.nt = "at each warp";
        sp.aria = "Empty until the first warp.";
      }
      return sp;
    }
    if (p.k === "w") {
      var e = S.warps[p.j], r = p.s, noisy = mode === "noisy", H = M.H[p.j], Dm = p.j === 0 ? M.H[0] : M.Dm[p.j];
      var nD = e.win.H + e.win.P;
      sp.outline = p.j;
      if (term === 0) {
        sp.img = noisy ? get(p.j === 0 ? wName("N", r) : wName("M", r)) : get(wName("S", r));
        sp.pixel = noisy; sp.blank = Dm;
        sp.lab = "Shifted left " + SS + "[" + (noisy ? "<i class=\"m\">L</i>" : LH) + "]";
        sp.nt = noisy ? "noisy latent, covered cells" : "covered cells";
        sp.aria = (noisy ? "Noisy shifted left latent" : "Shifted left prediction") + " on the covered cells; " + nD +
          (p.j === 0 ? " holes are blank." : " hole and padding cells are blank.");
      } else if (term === 1) {
        sp.img = noisy ? get(wName("N", r)) : p.j === 0 ? get(wName("S", r)) : get(stepName("R", r));
        sp.pixel = noisy; sp.keep = Dm;
        if (p.j === 0) {
          sp.lab = noisy ? "Re-noised guess" : "Guess <i class=\"m\">b</i>(<i class=\"m\">p</i>) = " + SS + "[" + LH + "](<i class=\"m\">&rho;</i>(<i class=\"m\">p</i>))";
          sp.nt = noisy ? f3(1 - e.t) + " <i class=\"m\">b</i> + " + f3(e.t) + " <i class=\"m\">&epsilon;</i> on holes <i class=\"m\">H</i>" : "holes <i class=\"m\">H</i>";
          sp.aria = "The background guess in the " + e.win.H + " holes, taken from the nearest covered cell to the right; other cells dimmed.";
        } else {
          sp.lab = noisy ? "Re-noised " + RH : "Right view's own " + RH;
          sp.nt = noisy ? f3(1 - e.t) + " " + RH + " + " + f3(e.t) + " <i class=\"m\">&epsilon;</i> on <i class=\"m\">H</i> and padding" : "kept on <i class=\"m\">H</i> and padding";
          sp.aria = "The right view's own clean prediction at step " + r + ", kept on " + e.win.H + " holes and " + e.win.P + " padding cells; covered cells dimmed.";
        }
      } else {
        sp.img = noisy ? get(wName("N", r)) : p.j === 0 ? get(wName("S", r)) : get(wName("W", r));
        sp.pixel = noisy;
        sp.lab = "Written at " + rj(p.j); sp.nt = "<i class=\"m\">t</i> = " + f3(e.t) + (noisy ? " &middot; noisy latent <i class=\"m\">R</i>" : " &middot; shown clean");
        sp.aria = (p.j === 0 ? "Branch r0" : "Refresh r" + (p.j === 3 ? "m" : p.j)) + ": the window as written, " +
          (noisy ? "as the decoded noisy latent." : "shown as a clean image.");
      }
      if (!sp.img) { sp.loading = true; }
      return sp;
    }
    if (p.k === "f") {
      sp.outline = term === 1 ? 3 : null;
      if (term === 0) {
        sp.img = get("FL"); sp.coords = "left"; sp.lab = "Left view"; sp.nt = "final";
        sp.aria = "The finished left view in the same window.";
      } else if (term === 1) {
        sp.img = get("FR"); sp.lab = "Right view"; sp.nt = "final";
        sp.aria = "The finished right view; the last refresh's holes and padding are outlined.";
      } else {
        sp.img = anaglyph(); sp.lab = "Anaglyph"; sp.nt = "red = left, cyan = right";
        sp.aria = "Red-cyan anaglyph of the finished views.";
      }
      if (!sp.img) { sp.loading = true; }
      return sp;
    }
    // between warps (steps 6..49)
    var rr = WARPS[j];
    if (term === 0) {
      var nl = nearest("L", p.s, 0, 49); sp.img = nl.img; sp.loading = !nl.exact; sp.ctx = true; sp.coords = "left";
      sp.lab = "Left view D(" + LH + ")"; sp.nt = "step " + p.s + ", t = " + f3(D.t[p.s]);
      sp.aria = "Left view: the decoded clean prediction at step " + p.s + "; the red ring marks the left cell that fed the cell under the cursor.";
    } else if (term === 1) {
      var nr = nearest("R", p.s, 6, 49); sp.img = nr.img; sp.loading = !nr.exact;
      sp.outline = j; sp.olAlpha = 0.7;
      sp.lab = "Right view D(" + RH + ")"; sp.nt = "step " + p.s + ", t = " + f3(D.t[p.s]);
      sp.aria = "Right view: its own decoded clean prediction at step " + p.s + ", with the holes and padding of the last warp outlined.";
    } else {
      sp.img = j === 0 ? get(wName("S", 5)) : get(wName("W", rr)); sp.alpha = 0.5; sp.outline = j; sp.olAlpha = 0.5;
      sp.lab = "Last write &middot; " + rj(j); sp.nt = "after step " + rr;
      sp.aria = "What the last warp wrote, after step " + rr + ", faded.";
      if (!sp.img) { sp.loading = true; }
    }
    return sp;
  }

  /* ---------------------------------------------------------------- drawing: panes */
  function maskPath(mask, k) {
    var path = new Path2D();
    for (var r = 0; r < 32; r++) { for (var c = 0; c < 24; c++) { if (mask[r][c]) { path.rect(c * k, r * k, k, k); } } }
    return path;
  }
  function boundary(mask, k) {
    var path = new Path2D();
    var at = function (r, c) { return r >= 0 && r < 32 && c >= 0 && c < 24 && mask[r][c]; };
    for (var r = 0; r < 32; r++) {
      for (var c = 0; c < 24; c++) {
        if (!mask[r][c]) { continue; }
        var x = c * k, y = r * k;
        if (!at(r - 1, c)) { path.moveTo(x, y); path.lineTo(x + k, y); }
        if (!at(r + 1, c)) { path.moveTo(x, y + k); path.lineTo(x + k, y + k); }
        if (!at(r, c - 1)) { path.moveTo(x, y); path.lineTo(x, y + k); }
        if (!at(r, c + 1)) { path.moveTo(x + k, y); path.lineTo(x + k, y + k); }
      }
    }
    return path;
  }
  function drawSrc(ctx, img, sp, W, H) {
    var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    if (sp.ctx) { sw = Math.round(sh * 24 / 32); }
    ctx.drawImage(img, 0, 0, sw, sh, 0, 0, W, H);
  }
  function drawPaneImage(v, sp) {
    var cv = v.img.fit(), ctx = cv.ctx, W = cv.w, H = cv.h, k = W / 24, c = SG.colors();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = c.panel; ctx.fillRect(0, 0, W, H);
    if (slide && v.term === 0 && slideBuf.width) {
      var tt = (performance.now() - slide.t0) / 500;
      if (tt < 1) { ctx.drawImage(slideBuf, 0, 0, W, H); return; }
    }
    if (sp.img) {
      ctx.save();
      ctx.imageSmoothingEnabled = !sp.pixel;
      ctx.globalAlpha = sp.alpha;
      if (sp.keep) {
        var key = sp.img.currentSrc || sp.img.src || "x";
        drawSrc(ctx, dimOf(sp.img, key), sp, W, H);
        ctx.save(); ctx.clip(maskPath(sp.keep, k)); drawSrc(ctx, sp.img, sp, W, H); ctx.restore();
      } else {
        drawSrc(ctx, sp.img, sp, W, H);
      }
      ctx.restore();
      if (sp.blank) {
        ctx.fillStyle = SG.alpha(c.panel, 0.88);
        ctx.fill(maskPath(sp.blank, k));
      }
    }
    if (slide && v.term === 0 && slideBuf.width) {
      var f = SG.clamp(((performance.now() - slide.t0) - 500) / 200, 0, 1);
      if (f < 1) { ctx.globalAlpha = 1 - f; ctx.drawImage(slideBuf, 0, 0, W, H); ctx.globalAlpha = 1; }
    }
  }
  function ring(ctx, k, wr, wc, color, lw) {
    var x = wc * k, y = wr * k;
    ctx.lineWidth = lw + 2; ctx.strokeStyle = "#262b31"; ctx.strokeRect(x - 1, y - 1, k + 2, k + 2);
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.strokeRect(x - 1, y - 1, k + 2, k + 2);
  }
  function drawOutlines(ctx, j, k, thin) {
    var lw = thin ? 1.25 : 2, cw = thin ? 2.75 : 4;
    ctx.save(); ctx.lineCap = "butt";
    if (j > 0) {
      var pb = boundary(M.P[j], k);
      ctx.setLineDash([]); ctx.lineWidth = cw; ctx.strokeStyle = "#262b31"; ctx.stroke(pb);
      ctx.setLineDash([4, 3]); ctx.lineWidth = lw; ctx.strokeStyle = "#19c6e0"; ctx.stroke(pb);
    }
    var hb = boundary(M.H[j], k);
    ctx.setLineDash([]); ctx.lineWidth = cw; ctx.strokeStyle = "#262b31"; ctx.stroke(hb);
    ctx.lineWidth = lw; ctx.strokeStyle = "#ffd32a"; ctx.stroke(hb);
    ctx.restore();
  }
  function cursorSource() {
    // the left cell that feeds the cursor cell at the latest warp (window col index), or -1
    var j = latestJ(POS[pos]);
    if (j < 0) { return -1; }
    var cell = curCell(), wr = cell[0] - S.win.r0, wc = cell[1] - S.win.c0;
    if (inD(j, wr, wc)) { return -1; }
    var x = S.warps[j].src[wr][wc];
    return x >= 0 ? x - S.win.c0 : -1;
  }
  function drawPaneOverlay(v, sp) {
    var cv = v.ov.fit(), ctx = cv.ctx, W = cv.w, H = cv.h, k = W / 24;
    ctx.clearRect(0, 0, W, H);
    if (!sp.img) { return; }
    var mini = layoutMode === "phone" && v !== bigView;
    if (grid && mini) {
      if (sp.outline != null) { drawOutlines(ctx, sp.outline, k, true); }
    } else if (grid) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var c = 1; c < 24; c++) { ctx.moveTo(Math.round(c * k) + 0.5, 0); ctx.lineTo(Math.round(c * k) + 0.5, H); }
      for (var r = 1; r < 32; r++) { ctx.moveTo(0, Math.round(r * k) + 0.5); ctx.lineTo(W, Math.round(r * k) + 0.5); }
      ctx.stroke();
      if (sp.outline != null) { drawOutlines(ctx, sp.outline, k, sp.olAlpha < 1); }
    }
    var cell = curCell(), wr = cell[0] - S.win.r0, wc = cell[1] - S.win.c0;
    var p = POS[pos];
    if (sp.coords === "left" && latestJ(p) >= 0) {
      if (leftHover) {
        ring(ctx, k, leftHover.r - S.win.r0, leftHover.x - S.win.c0, "#f0353a", 2);
      } else {
        var sx = cursorSource();
        if (sx >= 0 && sx < 24) { ring(ctx, k, wr, sx, "#f0353a", 2); }
      }
    } else if (wr >= 0 && wr < 32 && wc >= 0 && wc < 24) {
      ring(ctx, k, wr, wc, "#ffffff", mini ? 1.5 : 2.5);
    }
  }
  function renderViews() {
    var list = layoutMode === "phone" ? views.concat([bigView]) : views;
    list.forEach(function (v) {
      var term = v === bigView ? sel : v.term, sp = paneSpec(term);
      v.sp = sp; v.curTerm = term;
      drawPaneImage(v, sp);
      drawPaneOverlay(v, sp);
      v.ph.textContent = sp.ph; v.ph.classList.toggle("on", !!sp.ph);
      v.load.classList.toggle("on", !!sp.loading && !sp.ph);
      if (v.lab) { v.lab.innerHTML = sp.lab + (sp.nt ? "<span class=\"nt\">" + sp.nt + "</span>" : ""); }
      v.box.querySelector(".dn-img").setAttribute("aria-label", sp.aria || sp.ph || "");
    });
  }
  function renderOverlays() {
    var list = layoutMode === "phone" ? views.concat([bigView]) : views;
    list.forEach(function (v) { if (v.sp) { drawPaneOverlay(v, v.sp); } });
  }

  /* slide: the 8-px blocks of the left prediction move w(p) cells left (largest shift painted last, so it wins) */
  function startSlide(j) {
    if (SG.reduced || mode !== "clean") { slide = null; return; }
    var L = get(stepName("L", WARPS[j]));
    if (!L) { slide = null; return; }
    slide = { j: j, t0: performance.now() };
    (function frame() {
      if (!slide) { return; }
      var t = (performance.now() - slide.t0);
      paintSlide(SG.ease(Math.min(1, t / 500)));
      var list = layoutMode === "phone" ? [views[0]].concat(sel === 0 ? [bigView] : []) : [views[0]];
      list.forEach(function (v) { if (v.sp) { drawPaneImage(v, v.sp); } });
      if (t < 700) { requestAnimationFrame(frame); } else { slide = null; list.forEach(function (v) { if (v.sp) { drawPaneImage(v, v.sp); } }); }
    })();
  }
  function paintSlide(e) {
    var L = get(stepName("L", WARPS[slide.j]));
    if (!L) { return; }
    var Wd = 384, Hd = 512, k = Wd / 24, bs = L.naturalHeight / 32;
    if (slideBuf.width !== Wd) { slideBuf.width = Wd; slideBuf.height = Hd; }
    var ctx = slideBuf.getContext("2d"), ew = S.warps[slide.j].w;
    ctx.fillStyle = SG.css("--panel"); ctx.fillRect(0, 0, Wd, Hd);
    for (var w = 0; w <= 4; w++) {
      for (var r = 0; r < 32; r++) {
        var row = ew[r];
        for (var x = 0; x < row.length; x++) {
          if (+row[x] !== w) { continue; }
          var dx = (x - w * e) * k;
          if (dx >= Wd || dx + k <= 0) { continue; }
          ctx.drawImage(L, x * bs, r * bs, bs, bs, dx, r * k, k + 0.6, k + 0.6);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- rail */
  function axisF(sv) {
    if (sv === "f") { return 1; }
    if (sv <= 5) { return 0.08 * sv / 5; }
    if (sv <= 21) { return 0.08 + 0.70 * (sv - 5) / 16; }
    return 0.78 + 0.15 * (sv - 21) / 28;
  }
  function posVal(i) { var p = POS[i]; return p.k === "f" ? "f" : p.k === "w" ? p.s + 0.5 : p.s; }
  function railGeom() {
    var w = rail.w, phone = w < 560, tablet = !phone && w < 900;
    return {
      w: w, h: rail.h, phone: phone, tablet: tablet,
      x0: phone ? 22 : 30, x1: w - (phone ? 24 : 42),
      yRead: 13, yL: phone ? 34 : 38, yR: phone ? 64 : 74,
      wTop: phone ? 74 : 86, wH: phone ? 14 : 18, yTick: 122
    };
  }
  function X(g, sv) { return g.x0 + (g.x1 - g.x0) * axisF(sv); }
  function drawRail() {
    if (!D) { return; }
    rail.fit();
    var ctx = rail.ctx, g = railGeom(), c = SG.colors(), p = POS[pos];
    ctx.clearRect(0, 0, g.w, g.h);
    var hx = X(g, posVal(pos)), onR = pos >= STOPS[0];
    var faint = function (col) { return SG.alpha(col, c.dark ? 0.3 : 0.24); };
    // noise wedge: filled height = t(s)
    ctx.beginPath(); ctx.moveTo(X(g, 0), g.wTop + g.wH);
    for (var s = 0; s < 50; s++) { ctx.lineTo(X(g, s), g.wTop + (1 - D.t[s]) * g.wH); }
    ctx.lineTo(X(g, 49), g.wTop + g.wH); ctx.closePath();
    ctx.fillStyle = c.hair; ctx.fill();
    ctx.beginPath();
    for (s = 0; s < 50; s++) { var yy = g.wTop + (1 - D.t[s]) * g.wH; if (s) { ctx.lineTo(X(g, s), yy); } else { ctx.moveTo(X(g, s), yy); } }
    ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = c.line; ctx.beginPath(); ctx.moveTo(X(g, 0), g.wTop + g.wH + 0.5); ctx.lineTo(X(g, 49), g.wTop + g.wH + 0.5); ctx.stroke();
    if (!g.phone) {
      ctx.font = SG.font(11, 500); ctx.fillStyle = c.muted; ctx.textAlign = "left";
      ctx.fillText("noise level", X(g, 0) + 5, g.wTop + g.wH - 5);
      var nlw = ctx.measureText("noise level ").width;
      ctx.font = SG.mathFont(13); ctx.fillText("t", X(g, 0) + 5 + nlw, g.wTop + g.wH - 5);
    }
    // lanes, solid up to the handle
    function lane(xa, xb, y, col) {
      if (xb <= xa) { return; }
      var xm = SG.clamp(hx, xa, xb);
      ctx.lineCap = "round"; ctx.lineWidth = 4;
      ctx.strokeStyle = faint(col); ctx.beginPath(); ctx.moveTo(xm, y); ctx.lineTo(xb, y); ctx.stroke();
      if (xm > xa) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xm, y); ctx.stroke(); }
    }
    var xb0 = X(g, 5.5), xf = X(g, "f"), x49 = X(g, 49);
    lane(g.x0, x49, g.yL, c.left);
    var fe = xb0 + 14;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.strokeStyle = onR ? c.right : faint(c.right);
    ctx.beginPath(); ctx.moveTo(xb0, g.yL); ctx.bezierCurveTo(xb0 + 6, g.yL, fe - 8, g.yR, fe, g.yR); ctx.stroke();
    lane(fe, x49, g.yR, c.right);
    // final marker
    ctx.lineWidth = 2; ctx.strokeStyle = pos === FINAL ? c.ink : c.muted; ctx.fillStyle = c.bg;
    [g.yL, g.yR].forEach(function (y) { ctx.beginPath(); ctx.arc(xf, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.setLineDash([2, 3]); ctx.strokeStyle = c.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x49 + 4, g.yL); ctx.lineTo(xf - 6, g.yL); ctx.moveTo(x49 + 4, g.yR); ctx.lineTo(xf - 6, g.yR); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = SG.font(11, 600); ctx.textAlign = "center"; ctx.fillStyle = pos === FINAL ? c.ink : c.muted;
    ctx.fillText("final", xf, (g.yL + g.yR) / 2 + 4);
    // refresh connectors (the left latent copied onto the right one), warp marks and labels
    WARPS.forEach(function (r, k) {
      var x = X(g, r + 0.5), on = pos >= STOPS[k];
      if (k > 0) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = on ? c.arrow : SG.alpha(c.arrow, 0.4); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x, g.yL + 5); ctx.lineTo(x, g.yR - 15); ctx.stroke(); ctx.setLineDash([]);
      }
      SG.triangle(ctx, x, g.yR - 5, 9, c.warpMark);
      ctx.fillStyle = on ? c.ink : c.muted;
      var sub = k === 3 ? "m" : String(k);
      // 16.5-px base: the subscript (x 0.68) stays at 11 px or more
      if (k === 0) { SG.drawSub(ctx, "r", sub, x - 7, g.yR - 7, 16.5, { align: "right" }); }
      else { SG.drawSub(ctx, "r", sub, x + 7, g.yR - 7, 16.5, { subMath: sub === "m" }); }
      // fill level notch on the wedge
      var ty = g.wTop + (1 - D.t_fill[k]) * g.wH;
      ctx.strokeStyle = c.warpMark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 4, ty); ctx.lineTo(x + 4, ty); ctx.stroke();
      if (!g.phone) {
        ctx.font = SG.font(11, 500); ctx.textAlign = "center"; ctx.fillStyle = on ? c.ink : c.muted;
        var lbl = g.tablet ? String(r) : r + " · fill ";
        if (g.tablet) { ctx.fillText(lbl, x, g.yTick); }
        else {
          var tl = "." + String(Math.round(D.t_fill[k] * 1000)).padStart(3, "0");
          ctx.font = SG.font(11, 500); var w1 = ctx.measureText(lbl).width;
          ctx.font = SG.mathFont(13); var w2 = ctx.measureText("t ").width;
          ctx.font = SG.font(11, 500); var w3 = ctx.measureText(tl).width;
          var xs = x - (w1 + w2 + w3) / 2;
          ctx.textAlign = "left"; ctx.fillText(lbl, xs, g.yTick);
          ctx.font = SG.mathFont(13); ctx.fillText("t", xs + w1, g.yTick);
          ctx.font = SG.font(11, 500); ctx.fillText(tl, xs + w1 + w2, g.yTick);
        }
      }
    });
    if (!g.phone) {
      ctx.font = SG.font(11, 500); ctx.fillStyle = c.muted; ctx.textAlign = "center";
      ctx.fillText("0", X(g, 0), g.yTick); ctx.fillText("49", x49, g.yTick);
      var fx0 = X(g, 21.6) + 22, fx1 = x49 - 4;
      if (fx1 - fx0 >= 140) {
        ctx.textAlign = "center"; ctx.fillStyle = c.muted; ctx.font = SG.font(11, 500);
        ctx.fillText("finish independently", (fx0 + fx1) / 2, g.yR - 8);
      }
    }
    // lane names
    ctx.textAlign = "left";
    ctx.fillStyle = c.leftText; SG.drawSub(ctx, "L", "", 6, g.yL + 5, 15);
    ctx.fillStyle = c.rightText; SG.drawSub(ctx, "R", "", 6, g.yR + 5, 15);
    // handle
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx + 0.5, g.yL - 9); ctx.lineTo(hx + 0.5, g.wTop + g.wH); ctx.stroke();
    var hy = onR ? g.yR : g.yL;
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fillStyle = c.bg; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fillStyle = c.ink; ctx.fill();
    // readout above the handle
    var txt;
    if (p.k === "w") { txt = "after step " + p.s + " · written at t = " + f3(S.warps[p.j].t); }
    else if (p.k === "f") { txt = "final pair"; }
    else { txt = "step " + p.s + " · t = " + f3(D.t[p.s]); }
    ctx.font = SG.font(12, 600); var tw = ctx.measureText(txt).width;
    var tx = SG.clamp(hx - tw / 2, 2, g.w - tw - 2);
    ctx.fillStyle = c.ink; ctx.textAlign = "left"; ctx.fillText(txt, tx, g.yRead);
    positionThumbs(g);
  }

  /* ---------------------------------------------------------------- stop thumbnails */
  var thumbs = [];
  var STOP_WORD = ["branch", "refresh", "refresh", "last refresh", "final"];
  var STOP_PILL = ["r<sub>0</sub>", "r<sub>1</sub>", "r<sub>2</sub>", "r<sub>m</sub>", "final"];
  function buildThumbs() {
    STOPS.forEach(function (sp, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "dn-thumb";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", i < 4 ? (i === 0 ? "Branch, after step 5" : "Refresh r" + (i === 3 ? "m" : i) + ", after step " + WARPS[i]) : "Final pair");
      var cvs = document.createElement("canvas"); cvs.setAttribute("aria-hidden", "true");
      var t = document.createElement("span"); t.className = "pill-t";
      b.appendChild(cvs); b.appendChild(t);
      b.addEventListener("click", function () { userAct(); setPos(sp, { from: pos }); });
      thumbsBox.appendChild(b);
      thumbs.push({ b: b, cv: SG.fluidCanvas(cvs), t: t, pos: sp, i: i });
    });
  }
  function positionThumbs(g) {
    var phone = layoutMode === "phone";
    thumbs.forEach(function (th) {
      th.b.setAttribute("aria-pressed", th.pos === pos ? "true" : "false");
      th.t.innerHTML = phone ? (th.i < 4 ? "<i class=\"m\">" + STOP_PILL[th.i].replace("<sub>", "</i><sub>") : STOP_PILL[th.i]) : STOP_WORD[th.i];
      if (phone) { th.b.style.left = ""; return; }
      var tw = th.b.offsetWidth || 72, x = X(g, posVal(th.pos)) - tw / 2;
      th.b.style.left = SG.clamp(x, 0, g.w - tw) + "px";
    });
  }
  function drawThumbs() {
    if (layoutMode === "phone" || !S) { return; }
    thumbs.forEach(function (th) {
      var cv = th.cv.fit(), ctx = cv.ctx, W = cv.w, H = cv.h, c = SG.colors();
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = c.panel; ctx.fillRect(0, 0, W, H);
      var img = th.i === 4 ? get("FR") : th.i === 0 ? get(wName("S", 5)) : get(wName("W", WARPS[th.i]));
      if (!img) { return; }
      ctx.drawImage(img, 0, 0, W, H);
      if (th.i < 4) {
        var k = W / 24, j = th.i;
        ctx.save(); ctx.lineWidth = 1;
        if (j > 0) { ctx.setLineDash([2, 1.5]); ctx.strokeStyle = "#19c6e0"; ctx.stroke(boundary(M.P[j], k)); ctx.setLineDash([]); }
        ctx.strokeStyle = "#ffd32a"; ctx.stroke(boundary(M.H[j], k));
        ctx.restore();
      }
    });
  }

  /* ---------------------------------------------------------------- locator */
  function drawLoc() {
    if (!S) { return; }
    var cv = locCv.fit(), ctx = cv.ctx, W = cv.w, H = cv.h;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = SG.css("--panel"); ctx.fillRect(0, 0, W, H);
    var e = load(locUrl(scene));
    if (e.ok) { ctx.drawImage(e.img, 0, 0, W, H); }
    var b = S.loc_box;
    ctx.lineWidth = 3; ctx.strokeStyle = "#262b31"; ctx.strokeRect(b[0] * W, b[1] * H, b[2] * W, b[3] * H);
    ctx.setLineDash([3, 2]); ctx.lineWidth = 1.5; ctx.strokeStyle = "#ffffff"; ctx.strokeRect(b[0] * W, b[1] * H, b[2] * W, b[3] * H);
    ctx.setLineDash([]);
  }

  /* ---------------------------------------------------------------- readout, chips, counts, equation */
  function seamNote(j, r, c) {
    var n = M.notes[WARPS[j] + ":" + r + ":" + c];
    if (!n) { return ""; }
    var what = scene === "penguin" ? "penguin" : "basket";
    return " A hole inside the " + (scene === "penguin" ? "body" : "basket") + ": shifts drop from " + n.from + " to " + n.to +
      " cells here, so nothing lands. " + RH + " is " + what + ", so it stays " + what + ".";
  }
  function coveredText(j, wr, wc, r, c) {
    var e = S.warps[j], x = e.src[wr][wc], w = x - c;
    var s = "Cell (" + r + ", " + c + ") &middot; copied from left cell (" + r + ", " + x + "), <i class=\"m\">w</i> = " + w +
      ": content and noise from <i class=\"m\">L</i>.";
    if (j > 0) {
      var pe = S.warps[j - 1];
      if (inD(j - 1, wr, wc)) {
        s += " <span class=\"mut\">At " + rj(j - 1) + " it " + (j - 1 === 0 ? "was a hole" : "took " + RH) + "; now it returns to " + SS + "[<i class=\"m\">L</i>].</span>";
      } else if (pe.src[wr][wc] !== x) {
        var x2 = pe.src[wr][wc];
        s += " <span class=\"mut\">Before at " + rj(j - 1) + ": from (" + r + ", " + x2 + "), <i class=\"m\">w</i> = " + (x2 - c) + ".</span>";
      }
    }
    return s;
  }
  function cellText(cell) {
    var r = cell[0], c = cell[1], wr = r - S.win.r0, wc = c - S.win.c0, p = POS[pos], j = latestJ(p);
    if (wr < 0 || wr >= 32 || wc < 0 || wc >= 24) { return ""; }
    if (j < 0) { return "Cell (" + r + ", " + c + ") &middot; no warp yet: the right view branches after step 5."; }
    var pre = p.k === "w" ? "" : p.k === "f" ? "After " + rj(3) + ": " : "At " + rj(j) + ": ";
    var e = S.warps[j], isH = M.H[j][wr][wc], isP = M.P[j][wr][wc], pc = pct(e.t);
    if (j === 0) {
      if (isH) {
        var rho = e.rho[wr][wc];
        return pre + "Cell (" + r + ", " + c + ") &middot; hole: guess <i class=\"m\">b</i>(<i class=\"m\">p</i>) " +
          (rho >= 0 ? "from (" + r + ", " + rho + ")" : "= " + LH + "(<i class=\"m\">p</i>), nothing covered to its right") +
          ", re-noised: " + pc[0] + "&nbsp;% guess, " + pc[1] + "&nbsp;% fresh noise.";
      }
      return pre + coveredText(0, wr, wc, r, c);
    }
    if (isH || isP) {
      var s = pre + "Cell (" + r + ", " + c + ") &middot; " + (isH ? "hole" : "padding") + " at " + rj(j) + ": keeps " + RH +
        ", re-noised: " + pc[0] + "&nbsp;% " + RH + ", " + pc[1] + "&nbsp;% fresh noise.";
      if (!inD(j - 1, wr, wc)) { s += " <span class=\"mut\">New at this refresh: takes " + RH + " at the same position.</span>"; }
      else {
        var all = true;
        for (var q = 0; q <= j; q++) { if (!inD(q, wr, wc)) { all = false; } }
        if (all) { s += " <span class=\"mut\">The right view's own since step 5.</span>"; }
      }
      if (isH) { s += "<span class=\"mut\">" + seamNote(j, r, c) + "</span>"; }
      return s;
    }
    return pre + coveredText(j, wr, wc, r, c);
  }
  function readoutHTML() {
    if (!S) { return ""; }
    if (leftHover) {
      var j = latestJ(POS[pos]), lh = leftHover;
      if (lh.hid === 1) { return "At " + rj(j) + ": left cell (" + lh.r + ", " + lh.x + ") is hidden: a nearer cell lands on the same spot."; }
      if (lh.hid === 2) { return "At " + rj(j) + ": left cell (" + lh.r + ", " + lh.x + ") moves off the frame."; }
      if (lh.out) { return "At " + rj(j) + ": left cell (" + lh.r + ", " + lh.x + ") moves " + lh.w + " cells left, out of this window."; }
    }
    return cellText(curCell());
  }
  function lowerAfterPrefix(s) { return s.replace(/^(At .*?: |After .*?: )Cell/, "$1cell"); }
  function chipsHTML() {
    var cell = curCell(), wr = cell[0] - S.win.r0, wc = cell[1] - S.win.c0, j = latestJ(POS[pos]);
    if (wr < 0 || wr >= 32 || wc < 0 || wc >= 24) { return ""; }
    var h = "";
    for (var k = 0; k < 4; k++) {
      var e = S.warps[k], cls = "dn-chip", txt;
      if (M.H[k][wr][wc]) { cls += " is-h"; txt = "<i class=\"m\">H</i>"; }
      else if (M.P[k][wr][wc]) { cls += " is-p"; txt = "<i class=\"m\">P</i>"; }
      else { txt = "<i class=\"m\">w</i> " + (e.src[wr][wc] - cell[1]); }
      if (k === j) { cls += " is-now"; } else if (k > j) { cls += " is-off"; }
      if (k > 0) {
        var kept = inD(k - 1, wr, wc) && inD(k, wr, wc);
        h += "<span class=\"dn-link" + (kept ? " on" : "") + (k > j ? " is-off" : "") + "\"></span>";
      }
      h += "<span class=\"" + cls + "\"><span class=\"rr\">" + rj(k) + "</span>" + txt + "</span>";
    }
    var own = [0, 1, 2, 3].every(function (k) { return inD(k, wr, wc); });
    h += "<span class=\"dn-chips-t\">" + (own ? "the right view's own at every warp" : "this cell at each warp") + "</span>";
    return h;
  }
  function countsHTML() {
    var p = POS[pos], j = latestJ(p);
    if (j < 0) { return ["No warp yet.", "The first warp comes after step 5."]; }
    if (p.k === "f") {
      return ["<b>This window:</b> " + S.own_since_r0.win + " cells were the right view's own from step 5 to the end.",
        "Whole frame: " + fmt(S.own_since_r0.frame) + " such cells; " + fmt(S.holes_all_four_frame) + " were holes at all four warps."];
    }
    var e = S.warps[j], w = e.win, f = e.frame, pre = p.k === "w" ? "" : "Last write, " + rj(j) + ": ";
    if (j === 0) {
      return [pre + "<b>This window:</b> " + w.H + " of 768 cells are holes; each starts from a guess.",
        "Whole frame: " + fmt(f.H) + " holes of " + fmt(f.cells) + " cells, no padding at the first warp."];
    }
    return [pre + "<b>This window:</b> " + (w.H + w.P) + " of 768 cells take " + RH + " (" + w.H + " holes + " + w.P + " padding): " +
      w.kept + " kept from " + rj(j - 1) + ", " + w["new"] + " new; " + w.returned + " return to " + SS + "[<i class=\"m\">L</i>]; " +
      w.shift_changed + " changed shift.",
      "Whole frame: " + fmt(f.H) + " holes + " + fmt(f.P) + " padding; " + fmt(f.kept) + " kept, " + fmt(f["new"]) + " new, " +
      fmt(f.returned) + " returned; depth re-estimated, " + fmt(f.shift_changed) + " of " + fmt(f.cells) + " cells changed shift."];
  }
  function eqHTML() {
    var p = POS[pos], j = latestJ(p);
    if (p.k === "f") { return ""; }
    if (j < 0) { return "No warp yet. The branch comes after step 5."; }
    if (p.k === "s") {
      return j < 3 ? "No warp at this step. Next refresh after step " + WARPS[j + 1] + "." : "No more warps.";
    }
    var t = S.warps[j].t;
    var cov = "<span class=\"lab\">Covered</span><i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " + SS + "[<i class=\"m\">L</i>](<i class=\"m\">p</i>)";
    if (j === 0) {
      return cov + ": content and noise from <i class=\"m\">L</i>.<span class=\"sep\">&middot;</span><span class=\"lab\">Holes</span>" +
        "<i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " + f3(1 - t) + " <i class=\"m\">b</i>(<i class=\"m\">p</i>) + " + f3(t) +
        " <i class=\"m\">&epsilon;</i>(<i class=\"m\">p</i>)" + wbar(t);
    }
    return cov + ".<span class=\"sep\">&middot;</span><span class=\"lab\"><i class=\"m\">H</i> and padding</span>" +
      "<i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " + f3(1 - t) + " " + RH + "(<i class=\"m\">p</i>) + " + f3(t) +
      " <i class=\"m\">&epsilon;</i>(<i class=\"m\">p</i>)<span class=\"fresh\">, fresh noise</span>" + wbar(t);
  }
  function statusHTML() {
    var key = segKey(pos), p = POS[pos];
    if (p.k === "w" && mode === "noisy") {
      return "This is <i class=\"m\">R</i> itself at <i class=\"m\">t</i> = " + f3(S.warps[p.j].t) + ": mostly noise.";
    }
    if (S.status[key]) { return mathify(S.status[key]); }
    return SEG_TEXT[key] || "";
  }
  function renderInfo() {
    readEl.innerHTML = lowerAfterPrefix(readoutHTML());
    chipsEl.innerHTML = chipsHTML();
    drawStrip();
  }

  /* ---------------------------------------------------------------- cell strip */
  function hash3(a, b, c) {
    var h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663) ^ Math.imul(c + 3, 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function noiseGlyph(ctx, x, y, cw, seed, alpha, light) {
    var bits = seed & 0xff;
    var cnt = 0; for (var q = 0; q < 8; q++) { if (bits & (1 << q)) { cnt++; } }
    if (cnt < 3) { bits |= 0x25; }
    var spots = [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.2, 0.5], [0.8, 0.5], [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]];
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = light ? "#ffffff" : "#1d1d1f";
    var rad = Math.max(1, cw * 0.055);
    spots.forEach(function (s, i) {
      if (bits & (1 << i)) { ctx.beginPath(); ctx.arc(x + s[0] * cw, y + s[1] * cw, rad, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.restore();
  }
  function lum(rgb) { return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; }
  function rgbStr(rgb) { return "rgb(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]) + ")"; }
  function textRun(ctx, parts, x, y, size) {
    // parts: strings (Inter) or {m: "L", hat: bool} (italic serif)
    parts.forEach(function (pt) {
      if (typeof pt === "string") { ctx.font = SG.font(size, 500); ctx.fillText(pt, x, y); x += ctx.measureText(pt).width; }
      else if (pt.hat) { x += SG.drawHat(ctx, pt.m, x, y, size + 2) + 1; }
      else { ctx.font = SG.mathFont(size + 2); ctx.fillText(pt.m, x, y); x += ctx.measureText(pt.m).width + 1; }
    });
    return x;
  }
  function drawStrip() {
    if (!S || !more.open) { return; }
    var p = POS[pos], j = latestJ(p), cell = curCell(), row = SG.clamp(cell[0], S.win.r0, S.win.r0 + 31), wr = row - S.win.r0;
    var cursorWc = cell[1] - S.win.c0;
    rowEl.textContent = "row " + row; rowEl.setAttribute("aria-valuenow", String(row));
    rowEl.setAttribute("aria-valuemin", String(S.win.r0)); rowEl.setAttribute("aria-valuemax", String(S.win.r0 + 31));
    var W = stripC.getBoundingClientRect().width || 600;
    var n = 28, cw = Math.max(12, Math.min(34, Math.floor((W - 16) / n)));
    var ox = Math.round((W - n * cw) / 2), yL = 24, yR = yL + cw + 64, Hh = yR + cw + 30;
    stripC.style.height = Hh + "px";
    strip.fit();
    var ctx = strip.ctx, c = SG.colors();
    ctx.clearRect(0, 0, strip.w, strip.h);
    var showText = cw >= 20;
    // which images feed the rows
    var Lname = j < 0 ? stepName("L", p.s) : stepName("L", WARPS[j]);
    var Rname = p.k === "f" ? "FR" : j <= 0 ? wName("S", 5) : wName("W", WARPS[j]);
    var Limg = get(Lname), Rimg = j >= 0 ? get(Rname) : null;
    var Lm = Limg ? meansOf(Limg, url(Lname), 28) : null, Rm = Rimg ? meansOf(Rimg, url(Rname), 24) : null;
    ctx.textAlign = "left"; ctx.fillStyle = c.muted;
    if (j < 0) {
      textRun(ctx, ["left cells, D(", { m: "L", hat: true }, ") at step " + p.s], ox, yL - 9, 12);
    } else {
      textRun(ctx, ["left cells, D(", { m: "L", hat: true }, ") at step " + WARPS[j] + "; digit = shift ", { m: "w" }], ox, yL - 9, 12);
    }
    // L row
    for (var x = 0; x < n; x++) {
      var px = ox + x * cw, m = Lm ? Lm[wr][x] : [180, 180, 180];
      ctx.globalAlpha = x >= 24 ? 0.4 : 1;
      ctx.fillStyle = rgbStr(m); ctx.fillRect(px + 1, yL, cw - 2, cw - 2);
      if (j >= 0) {
        var light = lum(m) < 128, wv = +S.warps[j].w[wr][x];
        noiseGlyph(ctx, px + 1, yL, cw - 2, hash3(row, S.win.c0 + x, WARPS[j]), 0.25 + 0.5 * S.warps[j].t, light);
        ctx.fillStyle = light ? "#ffffff" : "#1d1d1f"; ctx.font = SG.font(12, 700); ctx.textAlign = "center";
        ctx.fillText(String(wv), px + cw / 2, yL + cw / 2 + 4);
        ctx.textAlign = "left";
      }
      ctx.globalAlpha = 1;
    }
    if (j < 0) {
      ctx.fillStyle = c.muted; ctx.font = SG.font(13, 500);
      ctx.fillText("No warp yet: the right view branches after step 5.", ox, yR + cw / 2);
      return;
    }
    var e = S.warps[j], isW = p.k === "w";
    // arrows x -> x - w(x)
    var srcOfCursor = (!inD(j, wr, cursorWc) && cursorWc >= 0 && cursorWc < 24 && cell[0] === row) ? e.src[wr][cursorWc] - S.win.c0 : -9;
    for (x = 0; x < n; x++) {
      var w = +e.w[wr][x], hid = e.hid[wr][x], t = x - w;
      var x1 = ox + (x + 0.5) * cw, y1 = yL + cw, x2 = ox + (t + 0.5) * cw, y2 = yR - 3;
      var mine = x === srcOfCursor || (leftHover && leftHover.r === row && leftHover.x - S.win.c0 === x);
      var col = mine ? c.ink : SG.alpha(c.arrow, x >= 24 ? 0.35 : 0.75), lw = mine ? 2 : 1;
      if (t < 0) { x2 = ox - 4; y2 = y1 + (y2 - y1) * (x1 - x2) / Math.max(1, x1 - (ox + (t + 0.5) * cw)); col = SG.alpha(c.arrow, 0.3); }
      if (hid === 0) {
        SG.arrow(ctx, x1, y1 + 2, x2, y2, col, lw, mine ? 7 : 5);
      } else {
        var ex = x1 + (x2 - x1) * 0.62, ey = y1 + 2 + (y2 - y1 - 2) * 0.62;
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x1, y1 + 2); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; var s5 = 4;
        ctx.beginPath(); ctx.moveTo(ex - s5, ey - s5); ctx.lineTo(ex + s5, ey + s5); ctx.moveTo(ex + s5, ey - s5); ctx.lineTo(ex - s5, ey + s5); ctx.stroke();
      }
    }
    // R row
    var Dj = j === 0 ? M.H[0] : M.Dm[j];
    for (var q = 0; q < 24; q++) {
      var qx = ox + q * cw, rm = Rm ? Rm[wr][q] : [180, 180, 180], inDj = Dj[wr][q];
      ctx.fillStyle = rgbStr(rm); ctx.fillRect(qx + 1, yR, cw - 2, cw - 2);
      var lt = lum(rm) < 128;
      if (inDj) {
        noiseGlyph(ctx, qx + 1, yR, cw - 2, hash3(row, S.win.c0 + q, WARPS[j] + 999), 0.25 + 0.5 * e.t, lt);
        if (showText) { ctx.fillStyle = lt ? "#ffffff" : "#1d1d1f"; ctx.font = SG.mathFont(12); ctx.textAlign = "center"; ctx.fillText("ε", qx + cw / 2, yR + cw / 2 + 4); ctx.textAlign = "left"; }
      } else {
        var sx = e.src[wr][q];
        if (sx >= 0) { noiseGlyph(ctx, qx + 1, yR, cw - 2, hash3(row, sx, WARPS[j]), 0.25 + 0.5 * e.t, lt); }
      }
    }
    // outlines on R cells
    for (q = 0; q < 24; q++) {
      var ox2 = ox + q * cw + 1;
      if (M.P[j][wr][q]) {
        ctx.setLineDash([3, 2]); ctx.strokeStyle = "#19c6e0"; ctx.lineWidth = 2; ctx.strokeRect(ox2 + 1, yR + 1, cw - 4, cw - 4); ctx.setLineDash([]);
      }
      if (M.H[j][wr][q]) {
        ctx.strokeStyle = "#262b31"; ctx.lineWidth = 3.5; ctx.strokeRect(ox2 + 1, yR + 1, cw - 4, cw - 4);
        ctx.strokeStyle = "#ffd32a"; ctx.lineWidth = 2; ctx.strokeRect(ox2 + 1, yR + 1, cw - 4, cw - 4);
      }
    }
    // W0: background guesses b(p) from rho(p); refreshes: H and padding keep R-hat
    var yB = yR + cw + 4, labelled = false;
    if (j === 0) {
      q = 0;
      while (q < 24) {
        if (!M.H[0][wr][q]) { q++; continue; }
        var a = q; while (q < 24 && M.H[0][wr][q]) { q++; }
        var rho = e.rho[wr][a], ax = ox + ((a + q - 1) / 2 + 0.5) * cw;
        if (rho >= 0 && rho - S.win.c0 < 24) {
          var bx = ox + (rho - S.win.c0 + 0.5) * cw;
          ctx.save(); ctx.setLineDash([3, 2]); ctx.strokeStyle = "#d9a800"; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(bx, yB); ctx.quadraticCurveTo((ax + bx) / 2, yB + 16, ax + 3, yB + 2); ctx.stroke(); ctx.restore();
          SG.arrow(ctx, ax + 8, yB + 6, ax + 2, yB + 1, "#d9a800", 1.6, 5);
          if (!labelled && showText) {
            ctx.fillStyle = c.ink; textRun(ctx, [{ m: "b" }, "(", { m: "p" }, ")"], Math.max(ax, bx) + 6, yB + 16, 12); labelled = true;
          }
        } else if (rho === -2 && showText && !labelled) {
          ctx.fillStyle = c.ink; textRun(ctx, [{ m: "L", hat: true }, "(", { m: "p" }, ")"], ax + 4, yB + 16, 12); labelled = true;
        }
      }
    } else if (showText) {
      var lastQ = -1;
      for (q = 0; q < 24; q++) {
        if (!Dj[wr][q]) { continue; }
        var gx = ox + (q + 0.5) * cw;
        ctx.font = SG.font(13, 700); ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = c.bg; ctx.strokeText("↻", gx, yB + 13);
        ctx.fillStyle = c.rightText; ctx.fillText("↻", gx, yB + 13);
        lastQ = q;
      }
      ctx.textAlign = "left";
      if (lastQ >= 0) {
        ctx.fillStyle = c.ink;
        textRun(ctx, ["keeps ", { m: "R", hat: true }, ", re-noised"], Math.min(ox + (lastQ + 1) * cw + 6, strip.w - 130), yB + 13, 12);
      }
    }
    // cursor ring
    if (cell[0] === row && cursorWc >= 0 && cursorWc < 24) {
      var rx = ox + cursorWc * cw;
      ctx.strokeStyle = "#262b31"; ctx.lineWidth = 4.5; ctx.strokeRect(rx - 1, yR - 1, cw, cw);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.strokeRect(rx - 1, yR - 1, cw, cw);
      if (srcOfCursor >= 0 && srcOfCursor < n) {
        var lx2 = ox + srcOfCursor * cw;
        ctx.strokeStyle = "#262b31"; ctx.lineWidth = 4; ctx.strokeRect(lx2 - 1, yL - 1, cw, cw);
        ctx.strokeStyle = "#f0353a"; ctx.lineWidth = 2; ctx.strokeRect(lx2 - 1, yL - 1, cw, cw);
      }
    }
    // caption of the R row
    ctx.fillStyle = c.muted; ctx.textAlign = "left";
    var cap = p.k === "f" ? ["right cells of the finished view; arrows and shifts of the last refresh"] :
      isW ? ["right cells as written; dots = noise pattern, same dots = shared noise"] :
        ["right cells at the last write; dots = noise pattern"];
    if (W >= 520) { textRun(ctx, cap, ox, yR + cw + 26, 12); }
    stripNote.innerHTML = isW ? "" : (p.k === "f" ? "shifts of the last refresh" : "at the last warp, " + rj(j));
  }

  /* ---------------------------------------------------------------- text alternative */
  function buildText() {
    var box = $("dn-text"), h = "";
    ["penguin", "basket"].forEach(function (k) {
      var sc = D.scenes[k];
      h += "<h4>" + sc.label + (k === "basket" ? " (a second prompt from the same study)" : "") + ", frame " + sc.frame + "</h4><ol>";
      h += "<li><b>Steps 0 to 5.</b> The left view is sampled alone.</li>";
      sc.warps.forEach(function (e, j) {
        var t = e.t, key = j === 3 ? "Wm" : "W" + j;
        h += "<li><b>After step " + e.step + ", " + rj(j) + " (" + (j ? "refresh" : "branch") + "), written at <i class=\"m\">t</i> = " + f3(t) + ".</b> " +
          mathify(sc.status[key]) + " ";
        if (j === 0) {
          h += "Covered cells: <i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " + SS + "[<i class=\"m\">L</i>](<i class=\"m\">p</i>), content and noise from <i class=\"m\">L</i>. Holes: <i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " +
            f3(1 - t) + " <i class=\"m\">b</i>(<i class=\"m\">p</i>) + " + f3(t) + " <i class=\"m\">&epsilon;</i>(<i class=\"m\">p</i>). The window has " + e.win.H +
            " holes; the frame " + fmt(e.frame.H) + ".";
        } else {
          h += "Covered cells: <i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " + SS + "[<i class=\"m\">L</i>](<i class=\"m\">p</i>). Holes and padding: <i class=\"m\">R</i>(<i class=\"m\">p</i>) &larr; " +
            f3(1 - t) + " " + RH + "(<i class=\"m\">p</i>) + " + f3(t) + " <i class=\"m\">&epsilon;</i>(<i class=\"m\">p</i>), with fresh noise. In the window " + (e.win.H + e.win.P) +
            " of 768 cells take " + RH + " (" + e.win.H + " holes, " + e.win.P + " padding): " + e.win.kept + " kept, " + e.win["new"] + " new, " + e.win.returned +
            " returned to " + SS + "[<i class=\"m\">L</i>]. In the frame, " + fmt(e.frame.H) + " holes and " + fmt(e.frame.P) + " padding cells; " +
            fmt(e.frame.shift_changed) + " of " + fmt(e.frame.cells) + " cells changed shift.";
        }
        h += "</li>";
        if (j < 3) { h += "<li><b>Steps " + (e.step + 1) + " to " + WARPS[j + 1] + ".</b> " + (j === 0 ? SEG_TEXT.seg1 : SEG_TEXT.seg2) + "</li>"; }
      });
      h += "<li><b>Steps 21 to 49.</b> " + SEG_TEXT.tail + "</li>";
      h += "<li><b>Final pair.</b> " + mathify(sc.status.FINAL) + " " + sc.own_since_r0.win + " window cells (" + fmt(sc.own_since_r0.frame) +
        " in the frame) were the right view's own from step 5 to the end.</li></ol>";
      h += "<div class=\"tbl-wrap\"><table><thead><tr><th>Warp</th><th><i class=\"m\">t</i></th><th>Window <i class=\"m\">H</i></th><th>Window <i class=\"m\">P</i></th><th>kept</th><th>new</th><th>returned</th>" +
        "<th>Frame <i class=\"m\">H</i></th><th>Frame <i class=\"m\">P</i></th><th>changed shift</th></tr></thead><tbody>";
      sc.warps.forEach(function (e, j) {
        h += "<tr><td>" + rj(j) + ", after step " + e.step + "</td><td>" + f3(e.t) + "</td><td>" + e.win.H + "</td><td>" + e.win.P + "</td><td>" +
          (j ? e.win.kept : "&ndash;") + "</td><td>" + (j ? e.win["new"] : "&ndash;") + "</td><td>" + (j ? e.win.returned : "&ndash;") + "</td><td>" +
          fmt(e.frame.H) + "</td><td>" + fmt(e.frame.P) + "</td><td>" + (j ? fmt(e.frame.shift_changed) : "&ndash;") + "</td></tr>";
      });
      h += "</tbody></table></div>";
    });
    box.innerHTML = h;
  }

  /* ---------------------------------------------------------------- render */
  var rq = null;
  function schedule() { if (rq) { return; } rq = requestAnimationFrame(function () { rq = null; render(); }); }
  function render() {
    if (!S) { return; }
    var p = POS[pos], j = latestJ(p);
    drawRail();
    drawThumbs();
    renderViews();
    glyphs.forEach(function (g, i) {
      g.textContent = p.k === "w" ? (i ? "=" : "+") : "·";
      g.classList.toggle("on", p.k === "w");
      g.classList.toggle("dot", p.k !== "w");
      g.style.visibility = (j < 0 || p.k === "f") ? "hidden" : "visible";
    });
    eqEl.innerHTML = eqHTML(); eqEl.hidden = p.k === "f";
    var cs = countsHTML(); cWin.innerHTML = cs[0]; cFrame.innerHTML = cs[1];
    countsEl.classList.toggle("is-muted", p.k === "s");
    var st = statusHTML();
    if (st !== lastStatus) { statusEl.innerHTML = st; lastStatus = st; }
    // Clean / Noisy
    var nb = fig.querySelector("[data-mode=noisy]"), cb = fig.querySelector("[data-mode=clean]");
    var canNoisy = p.k === "w";
    nb.disabled = !canNoisy; cb.disabled = !canNoisy;
    nb.title = canNoisy ? "" : "Noisy latents were saved at the warps only";
    fig.querySelector(".dn-tools [role=group]").style.visibility = p.k === "f" ? "hidden" : "visible";
    nb.setAttribute("aria-pressed", mode === "noisy" ? "true" : "false");
    cb.setAttribute("aria-pressed", mode === "clean" ? "true" : "false");
    // rail a11y
    railC.setAttribute("aria-valuenow", String(pos));
    railC.setAttribute("aria-valuetext", p.k === "w" ? (p.j === 0 ? "Branch r0" : "Refresh r" + (p.j === 3 ? "m" : p.j)) + ", written at t = " + f3(S.warps[p.j].t) :
      p.k === "f" ? "Final pair" : "Step " + p.s + " of 50" + (j >= 0 ? ", after " + (j === 0 ? "branch r0" : "refresh r" + (j === 3 ? "m" : j)) : "") + ", t = " + f3(D.t[p.s]));
    bPrev.disabled = pos <= 0; bNext.disabled = pos >= FINAL;
    lens.setAttribute("aria-label", "Cell window, " + (p.k === "w" ? "warp " + (p.j === 3 ? "r m" : "r " + p.j) : p.k === "f" ? "final pair" : "step " + p.s) +
      ". Arrow keys move the cell under the cursor, Enter pins it, Escape resets it, brackets go to the previous or next warp.");
    renderInfo();
    drawLoc();
    uiPlay();
  }

  /* ---------------------------------------------------------------- position changes, playback, tour */
  function setPos(i, opt) {
    opt = opt || {};
    i = SG.clamp(i, 0, FINAL);
    var from = pos;
    prevPos = pos; pos = i;
    leftHover = null;
    if (POS[i].k === "w" && from === i - 1 && !opt.noSlide) { render(); startSlide(POS[i].j); return; }
    slide = null;
    render();
  }
  function userAct() { touched = true; stopTour(); }
  function uiPlay() {
    bPlay.setAttribute("data-state", playing ? "playing" : "paused");
    bPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function stopPlay() { playing = false; if (timer) { clearTimeout(timer); timer = null; } uiPlay(); }
  function stopTour() { touring = false; if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; } }
  function holdFor(i) {
    if (SG.reduced) { return 600; }
    return STOPS.indexOf(i) >= 0 ? 1600 : 120;
  }
  function tick() {
    if (!playing) { return; }
    if (pos >= FINAL) { stopPlay(); return; }
    setPos(pos + 1);
    if (pos >= FINAL) { stopPlay(); return; }
    timer = setTimeout(tick, holdFor(pos));
  }
  function play() {
    stopTour();
    if (pos >= FINAL) { setPos(0); }
    playing = true; uiPlay();
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(tick, holdFor(pos));
  }
  function tour() {
    if (SG.reduced || !S) { return; }
    stopPlay(); stopTour();
    touring = true; toured = true;
    var seq = [], i;
    for (i = 0; i <= 5; i++) { seq.push([i, 150]); }
    seq.push([6, 1800]);
    for (i = 7; i <= 11; i++) { seq.push([i, 200]); }
    seq.push([12, 0]);
    var k = 0;
    (function step() {
      if (!touring) { return; }
      var s = seq[k++];
      setPos(s[0]);
      if (k < seq.length) { tourTimer = setTimeout(step, s[1]); } else { touring = false; }
    })();
  }

  /* ---------------------------------------------------------------- input: rail */
  function railPos(e) {
    var r = railC.getBoundingClientRect(), g = railGeom(), x = e.clientX - r.left, best = 0, bd = 1e9;
    for (var i = 0; i < POS.length; i++) { var d = Math.abs(X(g, posVal(i)) - x); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  var dragging = false;
  railC.addEventListener("pointerdown", function (e) { userAct(); stopPlay(); dragging = true; railC.setPointerCapture(e.pointerId); setPos(railPos(e), { noSlide: true }); });
  railC.addEventListener("pointermove", function (e) { if (dragging) { var i = railPos(e); if (i !== pos) { setPos(i, { noSlide: true }); } } });
  railC.addEventListener("pointerup", function () { dragging = false; });
  railC.addEventListener("pointercancel", function () { dragging = false; });
  function nextStop(i) { for (var k = 0; k < STOPS.length; k++) { if (STOPS[k] > i) { return STOPS[k]; } } return FINAL; }
  function prevStop(i) { for (var k = STOPS.length - 1; k >= 0; k--) { if (STOPS[k] < i) { return STOPS[k]; } } return 0; }
  railC.addEventListener("keydown", function (e) {
    var k = e.key, i = pos;
    if (k === "ArrowRight" || k === "ArrowUp") { i++; }
    else if (k === "ArrowLeft" || k === "ArrowDown") { i--; }
    else if (k === "PageDown") { i = nextStop(pos); }
    else if (k === "PageUp") { i = prevStop(pos); }
    else if (k === "Home") { i = 0; }
    else if (k === "End") { i = FINAL; }
    else if (k === " ") { e.preventDefault(); userAct(); if (playing) { stopPlay(); } else { play(); } return; }
    else { return; }
    e.preventDefault(); userAct(); stopPlay(); setPos(i);
  });

  /* ---------------------------------------------------------------- input: panes */
  function cellAt(v, e) {
    var r = v.ov.canvas.getBoundingClientRect(), k = r.width / 24;
    var wc = Math.floor((e.clientX - r.left) / k), wr = Math.floor((e.clientY - r.top) / k);
    if (wc < 0 || wc >= 24 || wr < 0 || wr >= 32) { return null; }
    return [wr, wc];
  }
  function hoverFrom(v, e) {
    var rc = cellAt(v, e);
    if (!rc || !S) { return false; }
    var r = S.win.r0 + rc[0], c = S.win.c0 + rc[1], p = POS[pos], j = latestJ(p), term = v.curTerm;
    leftHover = null;
    if (term === 0 && (p.k === "s" || p.k === "f") && j >= 0) {
      var ew = S.warps[j], w = +ew.w[rc[0]][rc[1]], hid = ew.hid[rc[0]][rc[1]], t = c - w;
      leftHover = { r: r, x: c, hid: hid, w: w, out: hid === 0 && t < S.win.c0 };
      hover = (hid === 0 && t >= S.win.c0) ? [r, t] : null;
    } else {
      hover = [r, c];
    }
    return true;
  }
  function bindPane(v) {
    var ov = v.ov.canvas;
    ov.addEventListener("pointermove", function (e) {
      if (layoutMode === "phone" && v !== bigView) { return; }
      if (hoverFrom(v, e)) { renderOverlays(); renderInfo(); }
    });
    ov.addEventListener("pointerleave", function () {
      if (hover || leftHover) { hover = null; leftHover = null; renderOverlays(); renderInfo(); }
    });
    ov.addEventListener("click", function (e) {
      if (layoutMode === "phone" && v !== bigView) { selectTerm(v.term); return; }
      userAct();
      if (hoverFrom(v, e) && hover) { pinned = hover.slice(); }
      hover = null; leftHover = null;
      renderOverlays(); renderInfo();
    });
  }
  views.forEach(bindPane); bindPane(bigView);
  function selectTerm(i) {
    sel = i; userAct();
    paneEls.forEach(function (el, k) { el.setAttribute("aria-pressed", k === sel ? "true" : "false"); });
    render();
  }
  paneEls.forEach(function (el, i) {
    el.addEventListener("keydown", function (e) {
      if (layoutMode !== "phone") { return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTerm(i); }
    });
  });
  function announce() {
    if (liveT) { clearTimeout(liveT); }
    liveT = setTimeout(function () { liveEl.textContent = readEl.textContent; }, 300);
  }
  lens.addEventListener("keydown", function (e) {
    if (!S || e.target !== lens) { return; }
    var k = e.key, cell = (pinned || defaultCell()).slice();
    if (k === "ArrowLeft") { cell[1]--; } else if (k === "ArrowRight") { cell[1]++; }
    else if (k === "ArrowUp") { cell[0]--; } else if (k === "ArrowDown") { cell[0]++; }
    else if (k === "Enter") { e.preventDefault(); userAct(); pinned = cell; renderOverlays(); renderInfo(); announce(); return; }
    else if (k === "Escape") { e.preventDefault(); pinned = null; hover = null; leftHover = null; renderOverlays(); renderInfo(); announce(); return; }
    else if (k === "[") { e.preventDefault(); userAct(); stopPlay(); setPos(prevStop(pos), { noSlide: true }); return; }
    else if (k === "]") { e.preventDefault(); userAct(); stopPlay(); setPos(nextStop(pos)); return; }
    else { return; }
    e.preventDefault(); userAct();
    cell[0] = SG.clamp(cell[0], S.win.r0, S.win.r0 + 31); cell[1] = SG.clamp(cell[1], S.win.c0, S.win.c0 + 23);
    pinned = cell; hover = null; leftHover = null;
    renderOverlays(); renderInfo(); announce();
  });

  /* ---------------------------------------------------------------- input: controls */
  bPlay.addEventListener("click", function () { userAct(); if (playing) { stopPlay(); } else { play(); } });
  bPrev.addEventListener("click", function () { userAct(); stopPlay(); setPos(prevStop(pos), { noSlide: true }); });
  bNext.addEventListener("click", function () { userAct(); stopPlay(); setPos(nextStop(pos)); });
  bReplay.addEventListener("click", function () { touched = false; tour(); });
  bGrid.addEventListener("click", function () {
    grid = !grid; bGrid.setAttribute("aria-pressed", grid ? "true" : "false"); renderOverlays(); drawThumbs();
  });
  fig.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () { userAct(); mode = b.getAttribute("data-mode"); slide = null; render(); });
  });
  fig.querySelectorAll("[data-scene]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.getAttribute("data-scene");
      if (k === scene || !D) { return; }
      userAct();
      fig.querySelectorAll("[data-scene]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      useScene(k);
    });
  });
  function rowStep(d) {
    if (!S) { return; }
    userAct();
    var cell = (pinned || defaultCell()).slice();
    cell[0] = SG.clamp(cell[0] + d, S.win.r0, S.win.r0 + 31);
    pinned = cell; hover = null; leftHover = null;
    renderOverlays(); renderInfo(); announce();
  }
  fig.querySelectorAll(".dn-rowbtn").forEach(function (b) { b.addEventListener("click", function () { rowStep(+b.getAttribute("data-d")); }); });
  rowEl.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp") { e.preventDefault(); rowStep(-1); } else if (e.key === "ArrowDown") { e.preventDefault(); rowStep(1); }
  });
  more.addEventListener("toggle", function () { if (more.open) { drawStrip(); } });

  /* the pipeline explorer above reports reader-driven steps; adopt them while this figure is off screen and untouched */
  var pendingStep = null;
  document.addEventListener("sg:step", function (ev) {
    var d = ev.detail || {};
    if (!d.user || touched || visible) { return; }
    var s = d.step, k = WARPS.indexOf(s), i = k >= 0 ? STOPS[k] : posOfStep(s);
    adopted = true;
    if (!S) { pendingStep = i; return; }
    setPos(i, { noSlide: true });
  });

  /* ---------------------------------------------------------------- layout */
  function layout() {
    var w = fig.clientWidth, m = w < 700 ? "phone" : w < 900 ? "tab" : "desk";
    var wide = w >= 1200;
    if (wide && loc.parentNode !== lens) { lens.appendChild(loc); }
    else if (!wide && loc.parentNode !== info) { info.insertBefore(loc, info.firstChild); }
    if (m !== layoutMode) {
      if (m === "phone") {
        more.insertBefore(countsEl, more.querySelector(".dn-strip-head"));
        transport.parentNode.insertBefore(scenePick, transport.nextSibling);
        more.open = false; moreT.textContent = "Counts and cell by cell";
        paneEls.forEach(function (el, k) {
          el.setAttribute("role", "button"); el.setAttribute("tabindex", "0");
          el.setAttribute("aria-pressed", k === sel ? "true" : "false");
          el.setAttribute("aria-label", ["Show the shifted left term large", "Show the right view's own term large", "Show what the warp writes large"][k]);
        });
      } else {
        info.appendChild(countsEl);
        head.insertBefore(scenePick, bReplay);
        if (layoutMode === "phone" || !layoutMode) { more.open = true; }
        moreT.textContent = "Cell by cell";
        paneEls.forEach(function (el) { el.removeAttribute("role"); el.removeAttribute("tabindex"); el.removeAttribute("aria-pressed"); el.removeAttribute("aria-label"); });
      }
      layoutMode = m;
    }
  }

  /* ---------------------------------------------------------------- scenes + init */
  function useScene(k) {
    scene = k; S = D.scenes[k]; M = prep(S);
    pinned = null; hover = null; leftHover = null;
    restingSet(k).forEach(load);
    load(locUrl(k));
    queue(fullSet(k));
    render();
  }
  function init(d) {
    D = d;
    buildThumbs();
    buildText();
    layout();
    useScene("penguin");
    if (pendingStep != null) { setPos(pendingStep, { noSlide: true }); }
    if (SG.reduced) { bReplay.hidden = true; }
    // leaving mid-tour lands on the resting frame (W1), never on a half-told step with empty panes
    SG.watchVisible(fig, function (on) {
      visible = on;
      if (!on) { stopPlay(); if (touring) { stopTour(); setPos(REST, { noSlide: true }); } }
    }, { threshold: 0.2 });
    SG.onceVisible(lens, function () { if (!touched && !adopted && !toured) { tour(); } }, 0.5);
  }
  function start() {
    if (started) { return; }
    started = true;
    SG.json("static/data/donor.json").then(init).catch(function () { statusEl.textContent = "Interactive data could not be loaded."; });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "1200px 0px" });
    io.observe(fig);
  } else { start(); }

  SG.onResize(function () { if (!D) { return; } layout(); render(); });
  SG.onTheme(function () { if (D) { render(); } });
})();
