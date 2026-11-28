/* StereoGraft page: the scroll-driven intro (styles in static/css/intro.css).

   On load the teaser video fills the window (cover crop) and the header sits centred on it, on a panel. Over the first
   screen of scrolling (one svh) everything moves back to its place in the page, continuously tied to the scroll position:
   the header to its place and size (its panel fading out as it lands), the video from the full window to its box, and
   the caption, view switch, TL;DR and abstract fading in below it. Scrolling up reverses it.

   How: .intro is wrapped in .intro-track, one screen taller, in which .intro is sticky; so the intro holds still for
   exactly that screen of scrolling and the page below is the plain page shifted by one screen. Within it, the start and
   end rectangles are measured once (on load, resize, font load, view or size change) and each frame only writes
   transforms, a clip-path and opacities (FLIP style), from requestAnimationFrame. The end state is "no inline styles", so
   the landed page is the plain layout. Under prefers-reduced-motion nothing of this runs. */
(function () {
  "use strict";
  var SG = window.SG || {};
  var root = document.documentElement;
  var intro = document.querySelector(".intro");
  var wrap = intro && intro.querySelector(".site-header > .wrap");
  var box = intro && intro.querySelector("#teaser-slot .sv-box");
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var supported = !!(intro && wrap && box && window.CSS && CSS.supports && CSS.supports("overflow", "clip") &&
    CSS.supports("clip-path", "inset(1px round 2px)") && CSS.supports("position", "sticky") && window.requestAnimationFrame);

  function done(on) {
    root.classList.remove("sg-intro-pre");
    root.classList.toggle("sg-intro-on", !!on);
  }
  if (!supported) { done(false); return; }

  var header = intro.querySelector(".site-header");
  var themeBtn = header.querySelector(".theme-btn");
  var host = intro.querySelector("#teaser-slot");
  var fades = Array.prototype.slice.call(intro.querySelectorAll(".hero-meta, .tldr, .hero-abstract"));
  var slot = SG.teaser || null;                       /* site.js exposes the teaser's Slot: playback and forced view */

  var track = null, panel = null, shadow = null, cue = null, probeS = null, probeL = null;
  var on = false, active = false, forced = false, raf = 0, lastP = -1, isNear = null;
  var M = null;                                         /* measurements */

  /* ------------------------------------------------------------------ helpers */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  /* gentle ease-in-out: the motion starts with the first scroll and settles into place */
  function ease(p) { return 0.5 - 0.5 * Math.cos(Math.PI * p); }
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; e.setAttribute("aria-hidden", "true"); return e; }
  function px(n) { return (Math.round(n * 100) / 100) + "px"; }
  function rel(r, o) { return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; }
  function union(a, b) {
    if (!a) { return b; }
    if (!b || !b.w || !b.h) { return a; }
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x: x, y: y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }
  function landMode() {                                 /* the view the teaser shows once landed (site.js modeFor) */
    var o = host.getAttribute("data-view");
    if (o === "sbs" || o === "ana") { return o; }
    return root.getAttribute("data-view") === "sbs" ? "sbs" : "ana";
  }

  /* ------------------------------------------------------------------ build / tear down */
  function build() {
    track = document.createElement("div");
    track.className = "intro-track";
    intro.parentNode.insertBefore(track, intro);
    track.appendChild(intro);
    /* "#top" (the top bar's wordmark) should go to the top of the page, i.e. the hero; scrolling to the sticky intro
       itself would stop part-way through the transition */
    if (intro.id === "top") { intro.removeAttribute("id"); track.id = "top"; track.setAttribute("data-sg-top", ""); }

    shadow = el("div", "intro-shadow");
    intro.insertBefore(shadow, intro.firstChild);
    panel = el("div", "intro-panel");
    header.insertBefore(panel, header.firstChild);
    cue = el("div", "intro-cue");
    cue.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>Scroll';
    intro.appendChild(cue);
    probeS = el("div", "intro-probe"); probeL = el("div", "intro-probe");
    probeS.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:100vh;height:100svh";
    probeL.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:100vh;height:100lvh";
    track.appendChild(probeS); track.appendChild(probeL);
    track.setAttribute("data-land", landMode());
  }
  function unbuild() {
    clearStyles();
    [shadow, panel, cue, probeS, probeL].forEach(function (e) { if (e && e.parentNode) { e.parentNode.removeChild(e); } });
    if (track) {
      if (track.hasAttribute("data-sg-top")) { track.removeAttribute("id"); intro.id = "top"; }
      track.parentNode.insertBefore(intro, track);
      track.parentNode.removeChild(track);
    }
    track = panel = shadow = cue = probeS = probeL = null;
  }

  /* ------------------------------------------------------------------ measure (natural layout, transforms off) */
  function clearStyles() {
    [wrap, panel, box, shadow, cue].forEach(function (e) { if (e) { e.style.transform = ""; e.style.opacity = ""; } });
    if (panel) { panel.style.removeProperty("--sg-ps"); }
    box.style.clipPath = ""; box.style.webkitClipPath = "";
    fades.forEach(function (e) { e.style.opacity = ""; });
    if (themeBtn) { themeBtn.style.removeProperty("--sg-tb"); }
  }
  function inkRect(e, o) {                              /* the box of an element's content (not its full-width block) */
    if (!e || e.hidden || !e.offsetParent) { return null; }
    var r = document.createRange();
    r.selectNodeContents(e);
    var b = r.getBoundingClientRect();
    if (!b.width || !b.height) { return null; }
    return rel(b, o);
  }
  function measure() {
    if (!on) { return; }
    clearStyles();
    var phone = window.innerWidth <= 860;
    var o = intro.getBoundingClientRect();
    var vw = root.clientWidth || window.innerWidth;
    var svh = probeS.offsetHeight || window.innerHeight, lvh = probeL.offsetHeight || window.innerHeight;

    /* header content: the title (incl. its cyan copy, offset by up to 0.06 em), authors, affiliations, notes, buttons */
    var H = null;
    var name = wrap.querySelector("h1 .name");
    if (name) {
      var nr = rel(name.getBoundingClientRect(), o), fs = parseFloat(getComputedStyle(name).fontSize) || 0;
      H = union(H, { x: nr.x - 0.06 * fs, y: nr.y, w: nr.w + 0.12 * fs, h: nr.h });
    }
    ["h1 .sub", "#authors", "#affiliations", "#author-notes", "#venue", "#links"].forEach(function (s) {
      H = union(H, inkRect(wrap.querySelector(s), o));
    });
    if (!H) { H = rel(wrap.getBoundingClientRect(), o); }

    /* hero size of the header: at most 0.84 of its size on a desktop, and its panel inside the window with room for
       the theme button above and the scroll cue below */
    var padX = phone ? 18 : 52, padY = phone ? 22 : 38;
    var gutter = phone ? 12 : 40, vRoom = phone ? 62 : 84;
    var s0 = Math.min(phone ? 1 : 0.84,
      (vw - 2 * gutter - 2 * padX) / H.w,
      (svh - 2 * vRoom - 2 * padY) / H.h);
    s0 = Math.max(0.45, s0);

    var wr = rel(wrap.getBoundingClientRect(), o);
    var hr = rel(header.getBoundingClientRect(), o);
    var B = rel(box.getBoundingClientRect(), o);

    /* panel: around the header content, padded in screen pixels at the hero scale */
    var lpx = padX / s0, lpy = padY / s0;
    var P = { x: H.x - lpx, y: H.y - lpy, w: H.w + 2 * lpx, h: H.h + 2 * lpy };
    panel.style.left = px(P.x - hr.x); panel.style.top = px(P.y - hr.y);
    panel.style.width = px(P.w); panel.style.height = px(P.h);
    panel.style.borderRadius = px(18 / s0);
    shadow.style.left = px(B.x); shadow.style.top = px(B.y);
    shadow.style.width = px(B.w); shadow.style.height = px(B.h);

    var tr = track.getBoundingClientRect();
    var D = track.offsetHeight - intro.offsetHeight;
    M = {
      vw: vw, svh: svh, lvh: lvh, phone: phone,
      top: tr.top + window.pageYOffset, D: D > 1 ? D : svh, introH: intro.offsetHeight,
      H: H, a: { x: H.x + H.w / 2, y: H.y + H.h / 2 }, s0: s0,
      A0: { x: vw / 2, y: svh / 2 },
      wrapO: { x: wr.x, y: wr.y }, P: P, padX: padX, padY: padY,
      B: B
    };
    lastP = -1;
    frame();
  }

  /* ------------------------------------------------------------------ teaser view and playback */
  function setForced(f) {
    if (forced === f) { return; }
    forced = f;
    if (!slot) { return; }
    slot.forceMode = f ? "ana" : null;
    if (slot.viewChanged) { slot.viewChanged(); }
  }
  function setManaged(m) {                              /* while not landed the intro keeps the teaser playing */
    if (!slot) { return; }
    slot.group = m ? true : undefined;
    if (m && !slot.playing && slot.play) { slot.play(); }
  }

  /* ------------------------------------------------------------------ per frame */
  function activate(a) {
    if (active === a) { return; }
    active = a;
    track.classList.toggle("is-active", a);
    setManaged(a);
    if (!a) { clearStyles(); }
  }
  function frame() {
    raf = 0;
    if (!on || !M) { return; }
    var y = window.pageYOffset;
    var near = y < M.top + M.D + M.introH;
    if (near !== isNear) { isNear = near; root.classList.toggle("sg-intro-near", near); }
    var p = clamp((y - M.top) / M.D, 0, 1);
    if (p === lastP) { return; }
    lastP = p;
    if (p >= 1) { setForced(false); activate(false); return; }
    if (p < 0.97) { setForced(true); }                  /* hysteresis: no back-and-forth swap at the landing point */
    activate(true);
    var e = ease(p);

    /* header: a similarity transform from the centre of the window (scale s0) to its place (scale 1) */
    var s = lerp(M.s0, 1, e);
    var Ax = lerp(M.A0.x, M.a.x, e), Ay = lerp(M.A0.y, M.a.y, e);
    function sim(O) { return "translate(" + px(Ax + s * (O.x - M.a.x) - O.x) + "," + px(Ay + s * (O.y - M.a.y) - O.y) + ") scale(" + s.toFixed(5) + ")"; }
    wrap.style.transform = sim(M.wrapO);
    /* the panel keeps the same on-screen padding around the header at every scale */
    var P = M.P, H = M.H;
    var Tx = Ax + s * (H.x - M.a.x) - M.padX, Ty = Ay + s * (H.y - M.a.y) - M.padY;
    panel.style.transform = "translate(" + px(Tx - P.x) + "," + px(Ty - P.y) + ") scale(" +
      ((s * H.w + 2 * M.padX) / P.w).toFixed(5) + "," + ((s * H.h + 2 * M.padY) / P.h).toFixed(5) + ")";
    panel.style.opacity = (1 - smooth(0.86, 1, e)).toFixed(4);
    panel.style.setProperty("--sg-ps", (1 - smooth(0.2, 0.62, e)).toFixed(3));
    if (themeBtn) { themeBtn.style.setProperty("--sg-tb", (1 - smooth(0, 0.15, e)).toFixed(3)); }
    cue.style.opacity = (1 - smooth(0, 0.1, p)).toFixed(3);

    /* video: the visible rectangle R goes from the full window to the box; the frame inside covers R (uniform scale k
       about R's centre), and a clip-path in the box's own coordinates cuts it to R with rounded corners */
    var B = M.B;
    var R = { x: lerp(0, B.x, e), y: lerp(0, B.y, e), w: lerp(M.vw, B.w, e), h: lerp(M.lvh, B.h, e) };
    var ar = (slot && slot.ar) || B.w / B.h;
    var ca = slot && slot.mode === "sbs" ? 2 * ar : ar;          /* aspect of the frame actually playing */
    var Cw = B.w, Ch = B.h;
    if (ca > B.w / B.h) { Ch = B.w / ca; } else { Cw = B.h * ca; }
    var k = Math.max(R.w / Cw, R.h / Ch);
    var tx = R.x + R.w / 2 - B.x - k * B.w / 2, ty = R.y + R.h / 2 - B.y - k * B.h / 2;
    var hw = R.w / (2 * k), hh = R.h / (2 * k);
    var r = lerp(0, 18, e) / k;
    box.style.transform = "translate(" + px(tx) + "," + px(ty) + ") scale(" + k.toFixed(5) + ")";
    var clip = "inset(" + px(B.h / 2 - hh) + " " + px(B.w / 2 - hw) + " " + px(B.h / 2 - hh) + " " + px(B.w / 2 - hw) + " round " + px(r) + ")";
    box.style.clipPath = clip; box.style.webkitClipPath = clip;
    /* its shadow follows R and comes in as it lands */
    shadow.style.transform = "translate(" + px(R.x - B.x) + "," + px(R.y - B.y) + ") scale(" + (R.w / B.w).toFixed(5) + "," + (R.h / B.h).toFixed(5) + ")";
    shadow.style.opacity = smooth(0.35, 1, e).toFixed(3);

    /* caption, view switch, TL;DR and abstract come in at the end */
    var f = smooth(0.85, 1, e).toFixed(3);
    fades.forEach(function (x) { x.style.opacity = f; });
  }
  function request() { if (!raf && on) { raf = window.requestAnimationFrame(frame); } }
  var mRaf = 0;
  function requestMeasure() {
    if (mRaf || !on) { return; }
    mRaf = window.requestAnimationFrame(function () { mRaf = 0; measure(); });
  }

  /* keyboard: tabbing into the teaser's controls, the TL;DR or the abstract while in the hero lands the intro first, then
     brings the element into view as the plain page would */
  function onFocus(ev) {
    if (!active || !M) { return; }
    var t = ev.target;
    if (!t || !t.closest || !t.closest(".hero-stage")) { return; }
    try { if (!t.matches(":focus-visible")) { return; } } catch (e) { /* old engines: always */ }
    var b = t === box ? M.B : rel(t.getBoundingClientRect(), intro.getBoundingClientRect());
    /* the browser's "nearest" alignment on the plain page: bottom edge to the window's bottom, or the top edge to the
       top if the element is taller than the window */
    var vh = window.innerHeight;
    var y = M.top + M.D + (b.h > vh ? b.y : Math.max(0, b.y + b.h - vh));
    /* after the browser's own focus scroll, which does not know the intro is pinned */
    window.requestAnimationFrame(function () { window.scrollTo({ top: y, behavior: "smooth" }); });
  }

  /* ------------------------------------------------------------------ on / off */
  var ro = null, mo = null;
  function enable() {
    if (on) { return; }
    on = true;
    build();
    forced = false; active = false; lastP = -1;
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", requestMeasure);
    window.addEventListener("orientationchange", requestMeasure);
    window.addEventListener("pageshow", requestMeasure);
    intro.addEventListener("focusin", onFocus);
    if (window.ResizeObserver) { ro = new ResizeObserver(requestMeasure); ro.observe(intro); ro.observe(wrap); }
    if (window.MutationObserver) {
      mo = new MutationObserver(function () {
        if (!track) { return; }
        var m = landMode();
        if (track.getAttribute("data-land") !== m) { track.setAttribute("data-land", m); requestMeasure(); }
      });
      mo.observe(root, { attributes: true, attributeFilter: ["data-view"] });
      mo.observe(host, { attributes: true, attributeFilter: ["data-view"] });
    }
    if (slot && slot.v) { slot.v.addEventListener("loadedmetadata", requestMeasure); }
    if (document.fonts) {
      if (document.fonts.ready) { document.fonts.ready.then(requestMeasure); }
      if (document.fonts.addEventListener) { document.fonts.addEventListener("loadingdone", requestMeasure); }
    }
    measure();
    done(true);
  }
  function disable() {
    if (!on) { return; }
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", requestMeasure);
    window.removeEventListener("orientationchange", requestMeasure);
    window.removeEventListener("pageshow", requestMeasure);
    intro.removeEventListener("focusin", onFocus);
    if (ro) { ro.disconnect(); ro = null; }
    if (mo) { mo.disconnect(); mo = null; }
    if (slot && slot.v) { slot.v.removeEventListener("loadedmetadata", requestMeasure); }
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    setForced(false);
    activate(false);
    on = false; M = null; isNear = null;
    root.classList.remove("sg-intro-near");
    unbuild();
    done(false);
  }

  if (mq && mq.matches) { done(false); }
  else { enable(); }
  if (mq) {
    var onPref = function () { if (mq.matches) { disable(); } else { enable(); } };
    if (mq.addEventListener) { mq.addEventListener("change", onPref); } else if (mq.addListener) { mq.addListener(onPref); }
  }

  SG.intro = {                                          /* for checks: progress and state */
    state: function () { return { on: on, active: active, forced: forced, p: lastP, M: M }; },
    measure: measure
  };
})();
