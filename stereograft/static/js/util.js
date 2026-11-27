/* Shared helpers for the StereoGraft page widgets (plain JS, no dependencies). */
(function () {
  "use strict";
  var SG = (window.SG = window.SG || {});
  var root = document.documentElement;

  SG.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  SG.css = function (name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  };
  SG.colors = function () {
    var c = {};
    ["ink", "muted", "line", "hair", "bg", "panel", "hover", "left", "left-text", "right", "right-text", "left-tint",
      "right-tint", "donor-band", "hole", "hole-case", "warp-mark", "arrow", "cell-near", "cell-wall", "cell-floor"].forEach(function (k) {
      c[k.replace(/-([a-z])/g, function (m, x) { return x.toUpperCase(); })] = SG.css("--" + k);
    });
    c.dark = root.getAttribute("data-theme") === "dark";
    return c;
  };
  SG.font = function (size, weight) {
    return (weight || 600) + " " + size + "px Inter, -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Arial, sans-serif";
  };
  SG.mathFont = function (size) {
    return "italic " + size + "px \"Times New Roman\", \"STIX Two Text\", Times, serif";
  };

  /* Theme changes re-render canvases. */
  var themeCbs = [];
  SG.onTheme = function (cb) { themeCbs.push(cb); };
  SG.themeChanged = function () { themeCbs.forEach(function (cb) { try { cb(); } catch (e) { /* keep going */ } }); };

  /* A canvas with a fixed logical size (its width/height attributes) drawn crisply at its CSS size. */
  SG.fixedCanvas = function (canvas) {
    var lw = canvas.width, lh = canvas.height;
    var obj = { canvas: canvas, w: lw, h: lh, ctx: canvas.getContext("2d") };
    obj.fit = function () {
      var r = canvas.getBoundingClientRect();
      var k = Math.max(1, (r.width || lw) / lw) * (window.devicePixelRatio || 1);
      k = Math.min(k, 3);
      var W = Math.round(lw * k), H = Math.round(lh * k);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      obj.ctx.setTransform(W / lw, 0, 0, H / lh, 0, 0);
      return obj;
    };
    obj.fit();
    return obj;
  };

  /* A canvas whose logical size follows its CSS box (width from layout, height from CSS). */
  SG.fluidCanvas = function (canvas) {
    var obj = { canvas: canvas, ctx: canvas.getContext("2d"), w: 0, h: 0 };
    obj.fit = function () {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      obj.w = Math.max(10, r.width); obj.h = Math.max(10, r.height);
      var W = Math.round(obj.w * dpr), H = Math.round(obj.h * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      obj.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return obj;
    };
    obj.fit();
    return obj;
  };

  var resizeCbs = [];
  SG.onResize = function (cb) { resizeCbs.push(cb); };
  var rT = null;
  window.addEventListener("resize", function () {
    if (rT) { cancelAnimationFrame(rT); }
    rT = requestAnimationFrame(function () { resizeCbs.forEach(function (cb) { try { cb(); } catch (e) { /* ignore */ } }); });
  });

  /* Run cb once when el first enters the viewport (APEX: threshold .28). */
  SG.onceVisible = function (el, cb, threshold) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); cb(); } });
    }, { threshold: threshold == null ? 0.28 : threshold });
    io.observe(el);
  };
  /* Call cb(true/false) as el enters / leaves the viewport. */
  SG.watchVisible = function (el, cb, opts) {
    if (!("IntersectionObserver" in window)) { cb(true); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { cb(e.isIntersecting); }); }, opts || { threshold: 0.05 });
    io.observe(el);
  };

  SG.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  SG.lerp = function (a, b, t) { return a + (b - a) * t; };
  SG.ease = function (t) { t = SG.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  SG.easeOut = function (t) { t = SG.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };

  SG.hexToRgb = function (h) {
    h = (h || "#000").replace("#", "").trim();
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  SG.mix = function (a, b, t) {
    var x = SG.hexToRgb(a), y = SG.hexToRgb(b);
    return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(",") + ")";
  };
  SG.alpha = function (hex, a) {
    var x = SG.hexToRgb(hex);
    return "rgba(" + x[0] + "," + x[1] + "," + x[2] + "," + a + ")";
  };

  /* Inferno capped at orange (yellow is reserved for holes); x in [0, 1], bright = near. */
  var RAMP = ["#2c0b57", "#6a176e", "#a72d5f", "#dc5039", "#f98e08"];
  SG.ramp = function (x) {
    x = SG.clamp(x, 0, 1) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(x));
    return SG.mix(RAMP[i], RAMP[i + 1], x - i);
  };

  /* Text with a subscript, e.g. ("r", "0"); returns the advance. math = italic serif base. */
  SG.drawSub = function (ctx, base, sub, x, y, size, opts) {
    opts = opts || {};
    var align = opts.align || "left";
    ctx.save();
    ctx.textAlign = "left";
    var bf = opts.math === false ? SG.font(size, opts.weight) : SG.mathFont(size);
    var sf = opts.subMath ? SG.mathFont(size * 0.72) : SG.font(size * 0.68, 600);
    ctx.font = bf; var bw = ctx.measureText(base).width;
    ctx.font = sf; var sw = sub ? ctx.measureText(sub).width : 0;
    var total = bw + (sub ? sw + 1 : 0);
    var x0 = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    ctx.font = bf; ctx.fillText(base, x0, y);
    if (sub) { ctx.font = sf; ctx.fillText(sub, x0 + bw + 1, y + size * 0.28); }
    ctx.restore();
    return total;
  };
  /* A letter with a hat (L-hat, R-hat). */
  SG.drawHat = function (ctx, ch, x, y, size, align) {
    ctx.save();
    ctx.font = SG.mathFont(size);
    ctx.textAlign = "left";
    var w = ctx.measureText(ch).width;
    var x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.fillText(ch, x0, y);
    var cx = x0 + w * 0.58, top = y - size * 0.86;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.24, top + size * 0.02);
    ctx.lineTo(cx, top - size * 0.14);
    ctx.lineTo(cx + size * 0.24, top + size * 0.02);
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    ctx.restore();
    return w;
  };

  /* Diagonal hatching inside a rectangle. */
  SG.hatch = function (ctx, x, y, w, h, color, gap, lw) {
    gap = gap || 6;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1.2;
    ctx.beginPath();
    for (var k = -h; k < w + h; k += gap) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke();
    ctx.restore();
  };

  SG.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  SG.triangle = function (ctx, x, y, s, color) {   // pointing down, tip at (x, y)
    ctx.beginPath(); ctx.moveTo(x - s * 0.62, y - s); ctx.lineTo(x + s * 0.62, y - s); ctx.lineTo(x, y); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  };

  SG.arrow = function (ctx, x1, y1, x2, y2, color, lw, head) {
    head = head || 7;
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw || 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
    ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  SG.json = function (url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) { if (!r.ok) { throw new Error(url); } return r.json(); });
  };

  /* Preload an ordered list of image URLs; onEach(i, img) as each arrives. */
  SG.preload = function (urls, onEach) {
    return urls.map(function (u, i) {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () { if (onEach) { onEach(i, im); } };
      im.src = u;
      return im;
    });
  };

  SG.pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  SG.fmt = function (n) { return n.toLocaleString("en-US"); };
})();
