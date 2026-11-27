/* Depth-guided warp, live: the branch step (r0 = 5) of the penguin run. The disparity of every latent cell is
   delta = d_max * z_norm at the cell centre; the cell moves w = round(delta / s) cells to the left; when cells
   collide the largest shift wins; uncovered cells are holes. Recomputed here from the run's depth
   (static/data/warp.json); with s = 8 px and d_max = 32 px it reproduces the run's shifts. */
(function () {
  "use strict";
  var SG = window.SG;
  var canvas = document.getElementById("warp-canvas");
  if (!canvas) { return; }
  canvas.width = 832; canvas.height = 480;
  var cv = SG.fixedCanvas(canvas);
  var slider = document.getElementById("warp-dmax"), out = document.getElementById("warp-dmax-out");
  var statusEl = document.getElementById("warp-status");
  var pills = Array.prototype.slice.call(document.querySelectorAll("#warp-pills button"));
  var cellBtns = Array.prototype.slice.call(document.querySelectorAll("#warp-cells button"));
  var D = null, imgs = {}, show = "S", cell = 8, dmax = 32, ready = false;
  var W = 832, H = 480;

  function load(name, src) {
    return new Promise(function (res) { var im = new Image(); im.onload = function () { imgs[name] = im; res(); }; im.onerror = function () { res(); }; im.src = src; });
  }

  function rint(x) {   // round half to even, as torch.round in the run
    var f = Math.floor(x), d = x - f;
    if (Math.abs(d - 0.5) < 1e-9) { return f % 2 === 0 ? f : f + 1; }
    return Math.round(x);
  }
  function compute() {
    var g = D.grids[String(cell)], R = g.rows, Cn = g.cols, z = g.z;
    var w = new Int16Array(R * Cn), src = new Int16Array(R * Cn).fill(-1), best = new Int16Array(R * Cn).fill(-1);
    var maxw = 0;
    for (var i = 0; i < R * Cn; i++) { w[i] = rint(dmax * z[i] / cell); if (w[i] > maxw) { maxw = w[i]; } }
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < Cn; c++) {
        var k = r * Cn + c, dc = c - w[k];
        if (dc < 0) { continue; }
        var j = r * Cn + dc;
        if (w[k] > best[j]) { best[j] = w[k]; src[j] = c; }
      }
    }
    var holes = 0;
    for (i = 0; i < R * Cn; i++) { if (src[i] < 0) { holes++; } }
    return { R: R, C: Cn, w: w, src: src, holes: holes, maxw: maxw };
  }

  function caseEdges(ctx, M, R, Cn, s, color) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s / 8);
    ctx.beginPath();
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < Cn; c++) {
        if (!M[r * Cn + c]) { continue; }
        var x = c * s, y = r * s;
        if (r === 0 || !M[(r - 1) * Cn + c]) { ctx.moveTo(x, y + 0.5); ctx.lineTo(x + s, y + 0.5); }
        if (r === R - 1 || !M[(r + 1) * Cn + c]) { ctx.moveTo(x, y + s - 0.5); ctx.lineTo(x + s, y + s - 0.5); }
        if (c === 0 || !M[r * Cn + c - 1]) { ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + s); }
        if (c === Cn - 1 || !M[r * Cn + c + 1]) { ctx.moveTo(x + s - 0.5, y); ctx.lineTo(x + s - 0.5, y + s); }
      }
    }
    ctx.stroke();
  }

  function draw() {
    if (!ready) { return; }
    cv.fit();
    var ctx = cv.ctx, c = SG.colors(), res = compute(), s = cell, k = imgs.x0.width / W;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    if (show === "x0") { ctx.drawImage(imgs.x0, 0, 0, W, H); }
    else if (show === "z") { ctx.drawImage(imgs.z, 0, 0, W, H); }
    else if (show === "w") {
      var top = Math.max(1, res.maxw);
      for (var r = 0; r < res.R; r++) {
        for (var cc = 0; cc < res.C; cc++) {
          var wv = res.w[r * res.C + cc];
          ctx.fillStyle = SG.ramp(wv / top);
          ctx.fillRect(cc * s, r * s, s + 0.5, s + 0.5);
        }
      }
      if (s >= 32) {
        ctx.font = SG.font(13, 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (r = 0; r < res.R; r++) {
          for (cc = 0; cc < res.C; cc++) {
            wv = res.w[r * res.C + cc];
            ctx.fillStyle = wv / top > 0.6 ? "#1d1d1f" : "rgba(255,255,255,.9)";
            ctx.fillText(String(wv), cc * s + s / 2, r * s + s / 2 + 1);
          }
        }
        ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
        ctx.beginPath();
        for (cc = 1; cc < res.C; cc++) { ctx.moveTo(cc * s + 0.5, 0); ctx.lineTo(cc * s + 0.5, H); }
        for (r = 1; r < res.R; r++) { ctx.moveTo(0, r * s + 0.5); ctx.lineTo(W, r * s + 0.5); }
        ctx.stroke();
      }
    } else {
      var M = new Uint8Array(res.R * res.C);
      ctx.fillStyle = c.holeCase; ctx.fillRect(0, 0, W, H);
      for (r = 0; r < res.R; r++) {
        for (cc = 0; cc < res.C; cc++) {
          var j = r * res.C + cc, sc = res.src[j];
          if (sc < 0) { M[j] = 1; continue; }
          ctx.drawImage(imgs.x0, sc * s * k, r * s * k, s * k, s * k, cc * s, r * s, s, s);
        }
      }
      ctx.fillStyle = c.hole;
      for (j = 0; j < M.length; j++) { if (M[j]) { ctx.fillRect((j % res.C) * s, Math.floor(j / res.C) * s, s, s); } }
      caseEdges(ctx, M, res.R, res.C, s, c.holeCase);
    }
    var pct = (100 * res.holes / (res.R * res.C));
    var txt;
    if (res.maxw === 0) { txt = "Every shift rounds to zero: the right view would be a copy of the left."; }
    else {
      txt = "Shifts of 0 to " + res.maxw + " cell" + (res.maxw > 1 ? "s" : "") + " · " + SG.fmt(res.holes) + " hole" + (res.holes === 1 ? "" : "s") +
        " (" + (pct < 1 ? pct.toFixed(2) : pct.toFixed(1)) + "% of the " + SG.fmt(res.R * res.C) + " cells)";
    }
    statusEl.textContent = txt;
  }

  function setShow(v) {
    show = v;
    pills.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-show") === v ? "true" : "false"); });
    draw();
  }
  pills.forEach(function (b) { b.addEventListener("click", function () { setShow(b.getAttribute("data-show")); }); });
  cellBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      cell = parseInt(b.getAttribute("data-s"), 10);
      cellBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      draw();
    });
  });
  slider.addEventListener("input", function () {
    dmax = parseInt(slider.value, 10);
    out.textContent = dmax + " px";
    draw();
  });

  function init() {
    Promise.all([
      SG.json("static/data/warp.json").then(function (d) { D = d; }),
      load("x0", "static/images/warp/x0_r05.webp"),
      load("z", "static/images/warp/z_r05.webp")
    ]).then(function () {
      if (!D || !imgs.x0) { statusEl.textContent = "Interactive data could not be loaded."; return; }
      ready = true; setShow(show);
    });
  }
  SG.onceVisible(canvas, init, 0);
  SG.onResize(draw);
  SG.onTheme(draw);
})();
