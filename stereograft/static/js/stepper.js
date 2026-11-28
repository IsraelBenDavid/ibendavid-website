/* The guided stepper behind the page's two method figures: a timeline, the algorithm as a numbered list, a stage
   with a left and a right pane, and one caption. A figure supplies its walkthrough (stops, phases, texts, the
   phase drawings and its timeline) through def.define(api); everything else lives here. Every picture is a pure
   function of (stop, time into the stop, P, layout), so any step can be shown directly and reduced motion gets
   the end states. */
(function () {
  "use strict";
  var SG = window.SG;
  if (!SG) { return; }

  SG.Stepper = function (fig, def) {
  if (!fig) { return null; }
  function $(name) { return fig.querySelector("[data-hw=\"" + name + "\"]"); }

  var IMG = def.img, MEDIA = def.media || "";
  var COLS = def.cols, ROWS = def.rows, CELL = def.cell || 8, FW = COLS * CELL, FH = ROWS * CELL, CTX = 8;
  var HOLE = "#ffd32a", CASE = "#262b31", RED = "#f0353a", CYAN = "#19c6e0";
  var RAMP = ["#2c0b57", "#6a176e", "#a72d5f", "#dc5039", "#f98e08"];

  var timeCv = SG.fluidCanvas($("time"));
  var stageEl = $("stage"), stageBox = $("stage-box"), sctx = stageEl.getContext("2d");
  var ptL = $("pt-l"), ptR = $("pt-r"), ptA = $("pt-a");
  var noteL = $("note-l"), noteR = $("note-r"), keyEl = $("key"), capEl = $("cap");
  var countEl = $("count"), nowPill = $("now-pill"), nowT = $("now-t"), pipsT = $("pips-t");
  var bPrev = $("prev"), bNext = $("next"), bPlay = $("play"), bReplay = $("replay");
  var items = Array.prototype.slice.call(fig.querySelectorAll(".hw-list li"));
  var pips = Array.prototype.slice.call(fig.querySelectorAll(".hw-pips i"));
  var padBtns = Array.prototype.slice.call(fig.querySelectorAll(".hw-pad button"));

  var D = null, WARPS = [], WP = [], WIN = null, WINV = null, FULLV = null;
  var P = 1, cur = 0, u = 0, playing = false, started = false, visible = false, raf = null, lastTs = null, dwell = 0;
  var ana = 0, anaTarget = 0;
  var lay = null, col = null, tileCv = null, tileKey = "", TD = 0, anaCv = null, anaKey = "", noiseCv = null, noisePat = null;
  var shownPhase = "", shownKey = "", dirty = true;
  var PH = null, STOPS = null, TITLES = null, W = null;     /* the figure's walkthrough, from def.define */
  var vids = {}, vidUsed = {}, wantLive = false;
  var want = null, wantT = 0;                               /* a stop whose pictures are still loading */
  var anaLive = [];
  var SWITCH = "<div class=\"seg\" role=\"group\" aria-label=\"Show the stereo pair\"><button type=\"button\" data-mode=\"sbs\">Side by side</button><button type=\"button\" data-mode=\"ana\">Anaglyph</button></div>";

  /* ------------------------------------------------------------------ the walkthrough */
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
    STOPS[i].ph.forEach(function (p) { W.phaseImgs(p[0], STOPS[i].k).forEach(function (n) { if (out.indexOf(n) < 0) { out.push(n); } }); });
    return out;
  }

  /* ------------------------------------------------------------------ images (loaded per step, next step preloaded) */
  var cache = {};
  function img(name) {
    var e = cache[name];
    if (!e) {
      e = cache[name] = { im: new Image(), ok: false, done: false, tries: 0 };
      e.im.decoding = "async";
      e.im.onload = function () { e.ok = e.done = true; loaded(); };
      /* a picture that fails is asked for once more; after that its step is shown without it rather than never */
      e.im.onerror = function () {
        if (e.tries++ < 1) { setTimeout(function () { e.im.src = IMG + name + ".webp?retry=1"; }, 600); }
        else { e.done = true; loaded(); }
      };
      e.im.src = IMG + name + ".webp";
    }
    return e.ok ? e.im : null;
  }
  function ready(names) { var ok = true; names.forEach(function (n) { img(n); if (!cache[n].done) { ok = false; } }); return ok; }
  function loaded() {
    if (want != null && ready(stopImgs(want))) { var w = want; want = null; busy(false); commit(w); }
    kick();
  }
  /* while a step's pictures load, the figure says so: the counter waits and the step that was asked for is marked */
  function busy(on) {
    fig.classList.toggle("is-loading", on);
    stageEl.setAttribute("aria-busy", on ? "true" : "false");
    items.forEach(function (li) { li.classList.toggle("is-wait", on && want != null && STOPS[+li.getAttribute("data-stop")].item === STOPS[want].item); });
  }
  /* A muted looping clip for the phases that play one. It runs only while a frame draws it, and it is handed out
     only while it really plays, so the still it replaces stays up until then. from = the clip time of that still:
     a stop that has just been entered starts the clip there, and the still turns into the clip without a jump. */
  function video(name, from) {
    /* stills only with reduced motion, and nothing is fetched before the figure is near the viewport */
    if (SG.reduced || !visible) { return null; }
    var e = vids[name];
    if (!e) {
      e = vids[name] = { v: document.createElement("video"), fresh: true, starting: false, blocked: false };
      e.v.muted = true; e.v.loop = true; e.v.playsInline = true; e.v.preload = "auto";
      e.v.setAttribute("muted", ""); e.v.setAttribute("playsinline", "");
      ["loadeddata", "seeked", "playing"].forEach(function (t) { e.v.addEventListener(t, function () { kick(); }); });
      e.v.src = MEDIA + name;
    }
    vidUsed[name] = true;
    var v = e.v;
    if (e.blocked || v.readyState < 2) { return null; }
    wantLive = true;
    if (v.paused && !e.starting) {
      e.starting = true;
      /* only where the clip can be sought (a server without byte ranges would send it back to its start) */
      if (e.fresh && from != null && v.seekable && v.seekable.length && v.seekable.end(v.seekable.length - 1) >= from) {
        try { v.currentTime = from; } catch (x) { /* stays where it is */ }
      }
      e.fresh = false;
      var p = v.play(), end = function (err) {
        e.starting = false;
        if (err && err.name === "NotAllowedError") { e.blocked = true; }     /* no autoplay here: the still stays */
        kick();
      };
      if (p && p.then) { p.then(function () { end(null); }, end); } else { e.starting = false; }
    }
    return v.paused || v.seeking || e.starting ? null : v;
  }
  /* the frame a clip is holding (it may be paused); nothing is started */
  function videoFrame(name) { var e = vids[name]; return e && e.v.readyState >= 2 && !e.v.seeking ? e.v : null; }
  function pauseVideos(all) { Object.keys(vids).forEach(function (n) { if ((all || !vidUsed[n]) && !vids[n].v.paused) { vids[n].v.pause(); } }); }

  /* ------------------------------------------------------------------ helpers */
  var seg = function (x, a, b) { return SG.clamp((x - a) / (b - a), 0, 1); };
  var ez = function (x, a, b) { return SG.ease(seg(x, a, b)); };
  function viewAt(z) {
    var w = FULLV.w * Math.pow(WINV.w / FULLV.w, z), f = (FULLV.w - w) / (FULLV.w - WINV.w);
    return { x: FULLV.x + (WINV.x - FULLV.x) * f, y: FULLV.y + (WINV.y - FULLV.y) * f, w: w, h: w * WINV.h / WINV.w };
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
  /* any drawable (image, canvas or video) through the same view; k = its pixels per frame pixel, ox / oy = offsets */
  function drawSrc(p, el, v, a, k, ox, oy) {
    if (!el || a <= 0) { return; }
    k = k || 1;
    sctx.save();
    sctx.globalAlpha = Math.min(1, a);
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(el, (ox || 0) + v.x * k, (oy || 0) + v.y * k, v.w * k, v.h * k, p.x, p.y, p.w, p.h);
    sctx.restore();
  }

  /* ------------------------------------------------------------------ warp data */
  function parse() {
    WIN = D.window;
    WINV = { x: WIN.c0 * CELL, y: WIN.r0 * CELL, w: WIN.cols * CELL, h: WIN.rows * CELL };
    /* the zoomed-out view: the whole frame, or the crop of it that the data names (same aspect as the window) */
    FULLV = D.full ? { x: D.full.x, y: D.full.y, w: D.full.w, h: D.full.w * WINV.h / WINV.w } : { x: 0, y: 0, w: FW, h: FW * WINV.h / WINV.w };
    WARPS = D.warps.map(function (x) { return x.step; });
    WP = [];
    D.warps.forEach(function (x) {
      /* a warp without masks of its own (video-to-stereo: one depth, one hole set) shares the previous warp's */
      if (!x.w) { var pv = WP[WP.length - 1]; WP.push({ step: x.step, w: pv.w, H: pv.H, P: pv.P, src: pv.src, rho: pv.rho }); return; }
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
      WP.push({ step: x.step, w: w, H: H, P: Pd, src: src, rho: rho });
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
  /* the zoom window of the left picture at the branch (plus a margin on the right), resampled once so that cells can be copied 1:1 */
  function tiles() {
    var im = img(def.tileImg);
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
  /* final frames merging into a red-cyan anaglyph (red = left view, green and blue = right view). live, when given,
     is a playing side-by-side clip: { el, x: [left, right], y, w, h } in its own pixels; the two layers are then
     re-made from its current frame, so both eyes always show the same moment. */
  function anaLayers(live) {
    var a = img(def.fin[0]), b = img(def.fin[1]);
    if (!lay || (!live && (!a || !b))) { return null; }
    var key = live ? "" : lay.L.w + "x" + lay.L.h + "@" + lay.dpr;
    if (live || anaKey !== key) {
      anaCv = [a, b].map(function (im, i) {
        /* the layers of a clip are drawn again for every frame, on the same two canvases */
        var c = (live && anaLive[i]) || document.createElement("canvas"), cw = Math.round(lay.L.w * lay.dpr), ch = Math.round(lay.L.h * lay.dpr);
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        if (live) { anaLive[i] = c; }
        var x = c.getContext("2d"); x.globalCompositeOperation = "source-over"; x.imageSmoothingQuality = "high";
        if (live) { x.drawImage(live.el, live.x[i], live.y, live.w, live.h, 0, 0, c.width, c.height); }
        else { x.drawImage(im, FULLV.x, FULLV.y, FULLV.w, FULLV.h, 0, 0, c.width, c.height); }
        x.globalCompositeOperation = "multiply"; x.fillStyle = i ? "#00ffff" : "#ff0000"; x.fillRect(0, 0, c.width, c.height);
        return c;
      });
      anaKey = key;
    }
    return anaCv;
  }
  function drawAnaglyph(live) {
    var L = lay.L, R = lay.R, C = lay.C, v = viewAt(0), ly = anaLayers(live), a1 = seg(ana, 0, 0.35), s = SG.ease(seg(ana, 0.35, 1));
    var base = function (p, i) {
      if (live) { sctx.imageSmoothingQuality = "high"; sctx.drawImage(live.el, live.x[i], live.y, live.w, live.h, p.x, p.y, p.w, p.h); }
      else { drawImg(p, def.fin[i], v, 1); }
    };
    if (!ly) { inPane(L, function () { base(L, 0); }); inPane(R, function () { base(R, 1); }); return; }
    var pl = { x: SG.lerp(L.x, C.x, s), y: SG.lerp(L.y, C.y, s), w: L.w, h: L.h }, pr = { x: SG.lerp(R.x, C.x, s), y: SG.lerp(R.y, C.y, s), w: R.w, h: R.h };
    if (s <= 0) {
      inPane(pl, function () { base(pl, 0); sctx.globalAlpha = a1; sctx.drawImage(ly[0], pl.x, pl.y, pl.w, pl.h); sctx.globalAlpha = 1; });
      inPane(pr, function () { base(pr, 1); sctx.globalAlpha = a1; sctx.drawImage(ly[1], pr.x, pr.y, pr.w, pr.h); sctx.globalAlpha = 1; });
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
  /* ------------------------------------------------------------------ frame */
  function draw() {
    if (!D || !lay) { return; }
    col = SG.colors();
    var loc = locate(cur, u), dpr = lay.dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, lay.W, lay.H);
    vidUsed = {}; wantLive = false;
    W.DRAW[loc.name](loc.lu, loc.k);
    pauseVideos(false);
    W.drawTime(W.timeState(cur, loc));
    var id = loc.name + loc.k;
    if (id !== shownPhase) {
      shownPhase = id;
      var t = W.phaseText(loc.name, loc.k);
      setNotes(t);
      setKey(t.key);
    }
    var merged = cur === STOPS.length - 1 && u >= stopDur(cur) ? ana : 0;
    ptL.style.opacity = ptR.style.opacity = String(1 - seg(merged, 0.15, 0.45));
    var hid = merged < 0.75;
    if (ptA.hidden !== hid) { ptA.hidden = hid; if (!hid) { fitAna(); } }
    ptA.style.opacity = String(seg(merged, 0.75, 1));
  }
  /* the note of the anaglyph title, like the pane notes: its short form (data-short) where the full one would be cut off */
  function fitAna() {
    var n = ptA.querySelector(".nt"), sh = n && n.getAttribute("data-short");
    if (!sh) { return; }
    if (!n.hasAttribute("data-full")) { n.setAttribute("data-full", n.textContent); }
    n.textContent = n.getAttribute("data-full");
    if (ptA.scrollWidth > ptA.clientWidth + 1) { n.textContent = sh; }
  }
  /* the note after each pane title; where the full text would be cut off, the phase's short form (ls / rs) is used */
  function setNotes(t) {
    [[noteL, ptL, t.l, t.ls], [noteR, ptR, t.r, t.rs]].forEach(function (a) {
      a[0].innerHTML = a[2];
      if (a[3] != null && a[1].scrollWidth > a[1].clientWidth + 1) { a[0].innerHTML = a[3]; }
    });
  }
  function setKey(html) {
    var key = html + "|" + P;
    if (key === shownKey) { return; }
    shownKey = key;
    if (html !== "__switch__") { keyEl.innerHTML = html; return; }
    keyEl.innerHTML = SWITCH;
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
    if (!W) { return; }                                      /* nothing to draw before the data is here */
    if (lastTs == null) { lastTs = ts; }
    var dt = Math.min(64, ts - lastTs), dur = stopDur(cur), active = false, u0 = u, a0 = ana, c0 = cur;
    lastTs = ts;
    if (u < dur) {
      if (ready(stopImgs(cur))) { u = Math.min(dur, u + dt); }
      active = true;
    } else if (playing && want == null) {
      dwell -= dt;
      if (dwell <= 0) { if (cur < STOPS.length - 1) { go(cur + 1); } else { setPlaying(false); } }
      active = playing;
    }
    /* pictures that take too long: show the stop with what has arrived */
    if (want != null) { if (ts - wantT > 8000) { var w8 = want; want = null; busy(false); commit(w8); } active = true; }
    if (ana !== anaTarget) { ana = SG.clamp(ana + (anaTarget > ana ? 1 : -1) * dt / 650, 0, 1); active = true; }
    if (dirty || wantLive || u !== u0 || ana !== a0 || cur !== c0) { dirty = false; draw(); }
    if ((active || wantLive) && visible) { raf = requestAnimationFrame(tick); } else { lastTs = null; }
  }
  function kick() { dirty = true; if (raf == null) { raf = requestAnimationFrame(tick); } }

  /* what a figure's definition draws with; lay, col, P and ana change, so they are read through the object */
  var api = {
    SG: SG, fig: fig, def: def, sctx: sctx, timeCv: timeCv, COLS: COLS, ROWS: ROWS, CELL: CELL, CTX: CTX,
    HOLE: HOLE, CASE: CASE, RED: RED, CYAN: CYAN, RAMP: RAMP,
    seg: seg, ez: ez, viewAt: viewAt, cellPx: cellPx, cx: cx, cy: cy, span: span, inPane: inPane, img: img, video: video, videoFrame: videoFrame,
    drawImg: drawImg, drawSrc: drawSrc, drawSeq: drawSeq, grid: grid, fillCells: fillCells, outline: outline, shiftTint: shiftTint,
    noise: noise, emptyPane: emptyPane, label: label, arrow: arrow, loop: loop, isH: isH, isP: isP, isKept: isKept,
    isCovered: isCovered, tiles: tiles, tile: tile, drawTiles: drawTiles, gutterArrow: gutterArrow, gutterLoop: gutterLoop,
    faded: faded, graftGlyphs: graftGlyphs, drawAnaglyph: drawAnaglyph
  };
  Object.defineProperties(api, {
    lay: { get: function () { return lay; } }, col: { get: function () { return col; } },
    P: { get: function () { return P; } }, ana: { get: function () { return ana; } }
  });

  /* ------------------------------------------------------------------ state */
  function dwellFor(i) { return SG.clamp(900 + 17 * capEl.textContent.length, 3200, 5600) * (i > 0 && STOPS[i].item === STOPS[i - 1].item ? 0.8 : 1); }
  function paintDom() {
    var s = STOPS[cur], n = TITLES.length, pp = W.pips(s);
    items.forEach(function (li) {
      var st = +li.getAttribute("data-stop"), it = STOPS[st].item;
      li.classList.toggle("is-on", it === s.item);
      li.classList.toggle("is-done", it < s.item);
      li.querySelector("button").setAttribute("aria-current", it === s.item ? "step" : "false");
    });
    /* pp.k = the refresh being shown (0 = none yet), pp.done = all of them are behind us */
    pips.forEach(function (p, j) {
      p.classList.toggle("is-on", j + 1 === pp.k);
      p.classList.toggle("is-done", pp.done || (pp.k > 0 && j + 1 < pp.k));
    });
    pipsT.textContent = pp.k ? "refresh " + pp.k + " of " + pips.length : pips.length + " refreshes" + (pp.done ? " done" : "");
    countEl.textContent = s.item + " / " + n;
    nowPill.textContent = "Step " + s.item + " / " + n;
    nowT.textContent = TITLES[s.item - 1] + (pp.title || "");
    capEl.innerHTML = W.caption(cur);
    bPrev.disabled = cur === 0; bNext.disabled = cur === STOPS.length - 1;
    stageEl.setAttribute("aria-label", "Step " + s.item + " of " + n + ": " + TITLES[s.item - 1] + ". " + capEl.textContent);
  }
  /* Go to a stop. Its pictures are asked for first; until they are here the figure stays as it is (and says that it is
     loading), so a step is never drawn with an empty pane. With the pictures cached this is immediate. */
  function go(i) {
    if (!W) { return; }                                      /* a control pressed before the data is here */
    i = SG.clamp(i, 0, STOPS.length - 1);
    if (ready(stopImgs(i))) { want = null; busy(false); commit(i); return; }
    want = i; wantT = performance.now(); busy(true); kick();
  }
  function commit(i) {
    cur = i;
    u = SG.reduced ? stopDur(cur) : 0;
    /* every stop starts side by side, also the last one when it is started again */
    ana = anaTarget = 0; paintSwitch();
    Object.keys(vids).forEach(function (n) { vids[n].fresh = true; vids[n].blocked = false; });
    paintDom();
    dwell = dwellFor(cur);
    if (cur + 1 < STOPS.length) { stopImgs(cur + 1).forEach(img); }
    kick();
  }
  function target() { return want != null ? want : cur; }
  function setPlaying(on) {
    playing = on;
    bPlay.setAttribute("data-state", on ? "playing" : "paused");
    bPlay.setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) { kick(); }
  }
  function hold() { started = true; setPlaying(false); }
  function next() { hold(); go(target() + 1); }
  function prev() { hold(); go(target() - 1); }

  bNext.addEventListener("click", next);
  bPrev.addEventListener("click", prev);
  bPlay.addEventListener("click", function () {
    if (!W) { return; }
    started = true;
    if (playing) { setPlaying(false); return; }
    if (cur === STOPS.length - 1 && u >= stopDur(cur)) { go(0); } else { dwell = Math.min(dwell, 900); }
    setPlaying(true);
  });
  bReplay.addEventListener("click", function () { if (!W) { return; } started = true; go(0); setPlaying(!SG.reduced); });
  items.forEach(function (li) {
    li.querySelector("button").addEventListener("click", function () {
      if (!W) { return; }
      var st = +li.getAttribute("data-stop");
      hold();
      /* an item that holds several stops: a click on it while it is shown moves on to its next stop */
      go(cur >= st && cur + 1 < STOPS.length && STOPS[cur].item === STOPS[st].item && STOPS[cur + 1].item === STOPS[st].item ? cur + 1 : st);
    });
  });
  padBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      P = +b.getAttribute("data-p");
      padBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      if (!W) { return; }
      shownPhase = "";
      capEl.innerHTML = W.caption(cur);
      kick();
    });
  });
  fig.addEventListener("keydown", function (e) {
    if (!W || e.altKey || e.ctrlKey || e.metaKey) { return; }
    var onButton = e.target && e.target.tagName === "BUTTON";
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); hold(); go(0); }
    else if (e.key === "End") { e.preventDefault(); hold(); go(STOPS.length - 1); }
    else if ((e.key === " " || e.key === "Spacebar") && !onButton) { e.preventDefault(); bPlay.click(); }
  });
  fig.addEventListener("pointerdown", function (e) { if (!(e.target.closest && e.target.closest("button"))) { fig.focus({ preventScroll: true }); } });

  /* The caption, the key line and (narrow layout) the step title change with every step. A figure that asks for it
     (def.reserve) gets the height of the tallest one of each at the current width, so nothing moves between steps.
     The texts are measured in hidden copies of the three elements; the shown ones are not touched. */
  function tallest(el, htmls) {
    var w = el.getBoundingClientRect().width, h = 0, c;
    if (!w) { return 0; }                                    /* not shown in this layout */
    c = el.cloneNode(false);
    ["data-hw", "aria-live", "id"].forEach(function (n) { c.removeAttribute(n); });
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:" + w + "px;";
    el.parentNode.appendChild(c);
    htmls.forEach(function (t) { c.innerHTML = t; h = Math.max(h, c.getBoundingClientRect().height); });
    el.parentNode.removeChild(c);
    return h;
  }
  function reserve() {
    if (!def.reserve || !W) { return; }
    var p0 = P, caps = [], keys = [], titles = [];
    [capEl, keyEl, nowT].forEach(function (e) { e.style.minHeight = ""; });
    [1, 0].forEach(function (p) {
      P = p;                                                 /* the texts of both padding settings */
      STOPS.forEach(function (s, i) {
        caps.push(W.caption(i));
        s.ph.forEach(function (ph) { var k = W.phaseText(ph[0], s.k).key; keys.push(k === "__switch__" ? SWITCH : k); });
        titles.push(TITLES[s.item - 1] + (W.pips(s).title || ""));
      });
    });
    P = p0;
    [[capEl, caps], [keyEl, keys], [nowT, titles]].forEach(function (a) {
      var h = tallest(a[0], a[1]);
      if (h > 0) { a[0].style.minHeight = (Math.round(h * 100) / 100) + "px"; }
    });
  }
  /* A figure whose last step plays a stereo video (def.followView) answers the page-wide Anaglyph / Side by side
     switch there, like every other video on the page. It still starts side by side, as its two panes promise. */
  if (def.followView && SG.onView) {
    SG.onView(function (m) {
      if (!W || cur !== STOPS.length - 1 || u < stopDur(cur)) { return; }
      anaTarget = m === "ana" ? 1 : 0;
      if (SG.reduced) { ana = anaTarget; }
      paintSwitch(); kick();
    });
  }
  function relayout() { if (!W) { return; } reserve(); if (layout()) { tileKey = ""; anaKey = ""; shownPhase = ""; draw(); if (!ptA.hidden) { fitAna(); } } }
  SG.onResize(relayout);
  SG.onTheme(function () { if (W) { draw(); } });
  if ("ResizeObserver" in window) { new ResizeObserver(function () { if (W && lay && Math.floor(stageBox.clientWidth) !== lay.W) { relayout(); } }).observe(stageBox); }

  SG.json(def.data).then(function (d) {
    D = d;
    parse(); buildNoise(); layout();
    api.D = D; api.WP = WP; api.WARPS = WARPS; api.WIN = WIN; api.WINV = WINV; api.FULLV = FULLV;
    W = def.define(api);
    PH = W.PH; STOPS = W.STOPS; TITLES = W.TITLES;
    paintDom();
    reserve();
    if (def.reserve && document.fonts && document.fonts.ready) { document.fonts.ready.then(relayout); }     /* the web font changes the line breaks */
    u = SG.reduced ? stopDur(0) : 0;
    stopImgs(0).forEach(img);
    draw();
    SG.watchVisible(fig, function (on) { visible = on; if (on) { stopImgs(cur).forEach(img); kick(); } else { pauseVideos(true); } }, { rootMargin: "200px 0px" });
    /* a clip does not run in a tab that is not shown */
    document.addEventListener("visibilitychange", function () { if (document.hidden) { pauseVideos(true); } else if (visible) { kick(); } });
    /* autoplay once, when most of the figure is on screen */
    SG.onceVisible(fig, function () { if (!started && !SG.reduced) { started = true; go(0); setPlaying(true); } }, 0.5);
  }).catch(function () { capEl.textContent = "The interactive figure could not be loaded."; });

  /* for the page's own checks: jump to a stop at a fraction of its animation, and compare the masks with the run */
  return {
    stops: function () { return STOPS ? STOPS.length : 0; },
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
  };
})();
