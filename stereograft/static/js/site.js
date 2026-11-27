/* StereoGraft page: config rendering, theme, the anaglyph / side-by-side switch, stereo video slots, galleries,
   comparisons, lightbox, top bar, scroll reveal, BibTeX copy, runtime chart. */
(function () {
  "use strict";
  var SG = window.SG;
  var C = window.SG_CONFIG || {};
  var root = document.documentElement;
  var draft = C.draft !== false;
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  var BACKBONE = { wan21: "Wan 2.1", ltx23: "LTX-2.3" };
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function placeholder(text) { var s = h("span", "is-placeholder", text); return s; }

  /* ------------------------------------------------------------------ header from config */
  (function header() {
    var A = $("#authors"), F = $("#affiliations");
    (C.authors || []).forEach(function (a, i) {
      var span = h("span", "author");
      var name = a.name || "";
      var el;
      if (!name) { el = draft ? placeholder("Author " + (i + 1)) : null; }
      else if (a.url) { el = h("a", null, name); el.href = a.url; el.target = "_blank"; el.rel = "noopener"; }
      else { el = h("span", null, name); }
      if (!el) { return; }
      span.appendChild(el);
      var sup = (a.affil || []).join(",") + (a.mark || "");
      if (sup) { span.appendChild(h("sup", null, sup)); }
      if (A.childNodes.length) { A.appendChild(document.createTextNode(", ")); }
      A.appendChild(span);
    });
    (C.affiliations || []).forEach(function (f, i) {
      if (!f && !draft) { return; }
      var s = h("span");
      s.appendChild(h("sup", null, String(i + 1)));
      s.appendChild(f ? document.createTextNode(f) : placeholder("Affiliation " + (i + 1)));
      F.appendChild(s);
    });
    if (C.authorNotes) { var n = $("#author-notes"); n.textContent = C.authorNotes; n.hidden = false; }
    var V = $("#venue");
    if (C.venue) { V.textContent = C.venue; V.hidden = false; }
    else if (draft) { V.appendChild(placeholder("Venue and date")); V.hidden = false; }
    $$("#links [data-link]").forEach(function (a) {
      var url = (C.links || {})[a.getAttribute("data-link")];
      if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
      else { a.classList.add("is-disabled"); a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); a.title = "Coming soon"; }
    });
    $("#bib-code").textContent = C.bibtex || "";
    var ack = $("#ack-text");
    if (C.acknowledgements) { ack.textContent = C.acknowledgements; }
    else if (draft) { ack.appendChild(placeholder("Acknowledgements go here.")); }
    else { $("#acknowledgements").hidden = true; }
  })();

  /* ------------------------------------------------------------------ theme */
  function themeUI() {
    var dark = root.getAttribute("data-theme") === "dark";
    $$(".theme-btn").forEach(function (b) { b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode"); });
  }
  $$(".theme-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", t);
      store.set("sg-theme", t);
      themeUI();
      SG.themeChanged();
    });
  });
  themeUI();

  /* ------------------------------------------------------------------ stereo video slots */
  var view = root.getAttribute("data-view") === "sbs" ? "sbs" : "ana";
  var slots = [];
  function sectionOf(el) { return el.closest("[data-view-scope]"); }
  function modeFor(el) {
    var s = sectionOf(el);
    var o = s ? s.getAttribute("data-view") : null;
    return o === "sbs" || o === "ana" ? o : view;
  }
  function playV(v) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } }
  function seek(v, t) { try { v.currentTime = t; } catch (e) { /* not ready */ } }

  var ICON_VIDEO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>';

  function Slot(o) {
    // o: { base: "media/t2s/wan21_720p_1", ar, label, meta, text, quote, files: {a,s,pa,ps} (optional), ours }
    var self = this;
    this.o = o;
    var ext = C.posterExt || "jpg";
    var f = o.files || {};
    this.url = {
      ana: f.a || o.base + "_anaglyph.mp4",
      sbs: f.s || o.base + "_sbs.mp4",
      pana: f.pa || o.base + "_anaglyph." + ext,
      psbs: f.ps || o.base + "_sbs." + ext
    };
    this.el = h("figure", "sv" + (o.ours ? " is-ours" : "") + (o.hero ? " sv-hero" : ""));
    var box = (this.box = h("div", "sv-box"));
    box.tabIndex = 0;
    box.setAttribute("role", "button");
    box.setAttribute("aria-label", "Enlarge: " + (o.label || "video"));
    this.setAr(o.ar || 16 / 9);
    var v = (this.v = document.createElement("video"));
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("disablepictureinpicture", "");
    box.appendChild(v);
    var ph = (this.ph = h("div", "sv-ph"));
    ph.innerHTML = ICON_VIDEO;
    if (draft) {
      ph.appendChild(h("span", "ph-title", o.phTitle || o.label || "Video"));
      this.phFile = h("span", "ph-file", "");
      ph.appendChild(this.phFile);
    }
    box.appendChild(ph);
    this.el.appendChild(box);
    if (o.meta || o.text != null) {
      var cap = h("figcaption");
      if (o.meta) { cap.appendChild(h("span", "sv-meta", o.meta)); }
      if (o.text) { cap.appendChild(h("span", "sv-text", o.quote ? "“" + o.text + "”" : o.text)); }
      else if (draft && o.textPlaceholder) { var t = h("span", "sv-text"); t.appendChild(placeholder(o.textPlaceholder)); cap.appendChild(t); }
      this.el.appendChild(cap);
    }
    this.loaded = false; this.missing = {}; this.playing = false; this.wantPlay = false;
    v.addEventListener("loadedmetadata", function () {
      if (v.videoWidth && v.videoHeight) {
        var r = v.videoWidth / v.videoHeight;
        self.setAr(self.mode === "sbs" ? r / 2 : r);
      }
    });
    v.addEventListener("loadeddata", function () { self.el.classList.add("is-ready"); });
    v.addEventListener("error", function () {
      self.missing[self.mode] = true;
      self.el.classList.remove("is-ready");
      self.el.classList.add("is-missing");
    });
    box.addEventListener("click", function () { if (self.el.classList.contains("is-ready") || self.el.classList.contains("has-poster")) { Lightbox.open(self); } });
    box.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); Lightbox.open(self); } });
    this.mode = null;
    slots.push(this);
  }
  Slot.prototype.setAr = function (r) {
    this.ar = r;
    this.box.style.setProperty("--ar", String(r));
    this.box.style.setProperty("--ar2", String(2 * r));
  };
  Slot.prototype.src = function () { return this.mode === "sbs" ? this.url.sbs : this.url.ana; };
  Slot.prototype.poster = function () { return this.mode === "sbs" ? this.url.psbs : this.url.pana; };
  Slot.prototype.refreshMode = function () {
    var m = modeFor(this.el);
    if (m === this.mode) { return false; }
    this.mode = m;
    this.el.setAttribute("data-mode", m);
    if (this.phFile) { this.phFile.textContent = this.src(); }
    return true;
  };
  Slot.prototype.setPoster = function () {
    var self = this, p = this.poster();
    if (this.postered === p) { return; }
    this.postered = p;
    var im = new Image();
    im.onload = function () { if (self.poster() === p) { self.v.poster = p; self.el.classList.add("has-poster"); } };
    im.onerror = function () { if (self.poster() === p) { self.v.removeAttribute("poster"); self.el.classList.remove("has-poster"); } };
    im.src = p;
  };
  Slot.prototype.load = function () {
    this.refreshMode();
    this.setPoster();
    if (this.loaded || this.missing[this.mode]) { return; }
    this.loaded = true;
    this.v.preload = "auto";
    this.v.src = this.src();
  };
  Slot.prototype.unload = function () {
    if (!this.loaded) { return; }
    this.loaded = false; this.playing = false;
    this.v.pause(); this.v.removeAttribute("src"); this.v.preload = "none";
    try { this.v.load(); } catch (e) { /* ignore */ }
    this.el.classList.remove("is-ready");
  };
  Slot.prototype.play = function () {
    this.load();
    if (this.missing[this.mode]) { return; }
    this.playing = true; playV(this.v);
  };
  Slot.prototype.pause = function () { this.playing = false; this.v.pause(); };
  Slot.prototype.viewChanged = function () {
    if (!this.refreshMode()) { return; }
    this.setPoster();
    this.el.classList.remove("is-missing");
    if (!this.loaded) { return; }
    if (this.missing[this.mode]) { this.v.removeAttribute("src"); this.el.classList.remove("is-ready"); return; }
    var t = this.v.currentTime || 0, was = !this.v.paused || this.playing;
    this.el.classList.remove("is-ready");
    this.v.src = this.src();
    var v = this.v;
    v.addEventListener("loadedmetadata", function () { seek(v, Math.min(t, (v.duration || t + 1) - 0.05)); if (was) { playV(v); } }, { once: true });
  };
  Slot.prototype.destroy = function () {
    this.unload();
    var i = slots.indexOf(this);
    if (i >= 0) { slots.splice(i, 1); }
    if (nearObs) { nearObs.unobserve(this.el); actObs.unobserve(this.el); }
  };

  var nearObs = null, actObs = null, byEl = new Map();
  if ("IntersectionObserver" in window) {
    nearObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var s = byEl.get(e.target); if (!s) { return; }
        if (e.isIntersecting) { s.load(); } else { s.unload(); }
      });
    }, { rootMargin: "600px 0px 600px 0px" });
    actObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var s = byEl.get(e.target); if (!s || s.group) { return; }
        if (e.isIntersecting) { if (!s.held) { s.play(); } } else { s.pause(); }
      });
    }, { threshold: 0.45 });
  }
  function watch(slot) {
    byEl.set(slot.el, slot);
    slot.refreshMode();
    if (nearObs) { nearObs.observe(slot.el); actObs.observe(slot.el); } else { slot.load(); }
  }

  /* ------------------------------------------------------------------ teaser */
  (function teaser() {
    var t = C.teaser || { id: "teaser" };
    var host = $("#teaser-slot");
    host.setAttribute("data-view-scope", "");
    var s = new Slot({ base: "media/teaser/" + t.id, ar: t.ar || 16 / 9, label: "Teaser", phTitle: "Teaser video", hero: true });
    host.appendChild(s.el);
    var meta = h("div", "hero-meta");
    var cap = h("p", "hero-caption");
    if (t.caption) { cap.textContent = t.caption; } else if (draft) { cap.appendChild(placeholder("Teaser caption")); }
    meta.appendChild(cap);
    var seg = h("div", "seg");
    seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "View of the teaser");
    seg.innerHTML = '<span class="seg-label">View</span><button type="button" data-view="ana">Anaglyph</button><button type="button" data-view="sbs">Side by side</button>';
    meta.appendChild(seg);
    host.appendChild(meta);
    host.style.setProperty("--hero-ar", String(t.ar || 16 / 9));
    s.v.addEventListener("loadedmetadata", function () { host.style.setProperty("--hero-ar", String(s.ar)); });
    watch(s);
  })();

  /* ------------------------------------------------------------------ galleries */
  function pickerButtons(el, values, labels, current, onPick) {
    el.innerHTML = "";
    if (values.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    values.forEach(function (v) {
      var b = h("button", null, labels[v] || v);
      b.type = "button";
      b.setAttribute("aria-pressed", v === current ? "true" : "false");
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        onPick(v);
      });
      el.appendChild(b);
    });
  }
  function uniq(list, key) {
    var out = [];
    list.forEach(function (x) { if (x[key] && out.indexOf(x[key]) < 0) { out.push(x[key]); } });
    return out;
  }

  function Gallery(section, items, kind) {
    var self = this;
    this.section = section; this.items = items || []; this.kind = kind;
    section.setAttribute("data-view-scope", "");
    this.grid = $("[data-grid]", section);
    this.filters = {};
    this.slots = [];
    $$("[data-filter]", section).forEach(function (el) {
      var key = el.getAttribute("data-filter");
      var vals = uniq(self.items, key);
      if (key === "res") { vals.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }); }
      self.filters[key] = vals[0];
      pickerButtons(el, vals, BACKBONE, vals[0], function (v) { self.filters[key] = v; self.render(); });
    });
    this.render();
  }
  Gallery.prototype.render = function () {
    var self = this;
    this.slots.forEach(function (s) { s.destroy(); });
    this.slots = [];
    this.grid.innerHTML = "";
    var shown = this.items.filter(function (it) {
      return Object.keys(self.filters).every(function (k) { return !self.filters[k] || it[k] === self.filters[k]; });
    });
    if (!shown.length) { this.grid.appendChild(h("p", "gal-empty", "No examples yet.")); return; }
    shown.forEach(function (it) {
      var bb = BACKBONE[it.backbone] || it.backbone || "";
      var meta = [bb, it.res].filter(Boolean).join(" · ");
      var o = self.kind === "t2s"
        ? { base: "media/t2s/" + it.id, ar: it.ar, label: "Text-to-stereo, " + meta, phTitle: "Text-to-stereo · " + meta,
            meta: meta, text: it.prompt || "", quote: true, textPlaceholder: "Prompt of this example", files: it.files }
        : { base: "media/v2s/" + it.id, ar: it.ar, label: "Video-to-stereo, " + meta, phTitle: "Video-to-stereo · " + meta,
            meta: meta, text: it.source || "", textPlaceholder: "Source of the input video", files: it.files };
      var s = new Slot(o);
      self.grid.appendChild(s.el);
      self.slots.push(s);
      watch(s);
    });
  };

  var galleries = [];
  $$("[data-gallery]").forEach(function (sec) {
    var k = sec.getAttribute("data-gallery");
    if (k === "t2s") { galleries.push(new Gallery(sec, C.t2s, "t2s")); }
    else if (k === "v2s") { galleries.push(new Gallery(sec, C.v2s, "v2s")); }
    else if (k === "compare") { buildComparisons(sec); }
  });

  /* ------------------------------------------------------------------ comparisons */
  function buildComparisons(sec) {
    sec.setAttribute("data-view-scope", "");
    var host = $("[data-grid]", sec);
    var methods = C.comparisonMethods || [];
    (C.comparisons || []).forEach(function (cmp, ci) {
      var wrap = h("article", "cmp");
      var head = h("div", "cmp-head");
      var p = h("p", "cmp-prompt");
      var bb = BACKBONE[cmp.backbone] || cmp.backbone || "";
      p.appendChild(h("span", "sv-meta", [cmp.task, bb].filter(Boolean).join(" · ")));
      if (cmp.text) { p.appendChild(document.createTextNode(cmp.task === "Text-to-stereo" ? "“" + cmp.text + "”" : cmp.text)); }
      else if (draft) { p.appendChild(placeholder(cmp.task === "Text-to-stereo" ? "Prompt of this comparison" : "Source of the input video")); }
      head.appendChild(p);
      var tools = h("div", "cmp-tools");
      var pick = h("div", "picker");
      pick.setAttribute("role", "group"); pick.setAttribute("aria-label", "Baseline shown on the left");
      tools.appendChild(pick);
      var tr = h("div", "transport");
      tr.innerHTML = '<button type="button" class="c-play" aria-label="Pause" data-state="playing"><svg class="i-play" viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 4.5 9 5.5-9 5.5z"/></svg><svg class="i-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 4.5v11M13.5 4.5v11"/></svg></button><button type="button" class="c-restart" aria-label="Restart"><svg viewBox="0 0 20 20" aria-hidden="true" style="fill:none"><path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4.5 4v3.5H8"/></svg></button>';
      tools.appendChild(tr);
      head.appendChild(tools);
      wrap.appendChild(head);
      var pair = h("div", "cmp-pair");
      var base = "media/compare/" + cmp.id + "/";
      var colL = h("div"), colR = h("div");
      var labL = h("p", "vis-label", methods.length ? methods[0].name : "Baseline");
      var labR = h("p", "vis-label", "StereoGraft (ours)");
      colL.appendChild(labL); colR.appendChild(labR);
      var mk = function (slug, name, ours) {
        return new Slot({ base: base + slug, ar: cmp.ar, label: name + ", comparison " + (ci + 1), phTitle: name, ours: ours });
      };
      var cur = methods.length ? methods[0] : { slug: "baseline", name: "Baseline" };
      var left = mk(cur.slug, cur.name, false), right = mk("stereograft", "StereoGraft", true);
      colL.appendChild(left.el); colR.appendChild(right.el);
      pair.appendChild(colL); pair.appendChild(colR);
      wrap.appendChild(pair);
      host.appendChild(wrap);
      var group = { slots: [left, right], playing: false, held: false };
      left.group = right.group = group;
      [left, right].forEach(watch);
      var bPlay = $(".c-play", tr);
      function ui() { bPlay.setAttribute("data-state", group.playing ? "playing" : "paused"); bPlay.setAttribute("aria-label", group.playing ? "Pause" : "Play"); }
      group.play = function () { group.playing = true; left.play(); right.play(); ui(); };
      group.pause = function () { group.playing = false; left.pause(); right.pause(); ui(); };
      bPlay.addEventListener("click", function () { if (group.playing) { group.held = true; group.pause(); } else { group.held = false; group.play(); } });
      $(".c-restart", tr).addEventListener("click", function () { [left, right].forEach(function (s) { s.load(); seek(s.v, 0); }); group.held = false; group.play(); });
      ui();
      SG.watchVisible(pair, function (on) { if (on && !group.held) { group.play(); } else if (!on) { group.pause(); } }, { threshold: 0.4 });
      // keep the baseline locked to ours
      setInterval(function () {
        var m = right.v, s = left.v;
        if (!group.playing || m.paused || m.readyState < 2 || s.readyState < 2) { return; }
        if (Math.abs(s.currentTime - m.currentTime) > 0.12 && Math.abs((s.duration || 0) - (m.duration || 0)) < 0.2) { seek(s, m.currentTime); }
        if (s.paused) { playV(s); }
      }, 400);
      pickerButtons(pick, methods.map(function (m) { return m.slug; }),
        methods.reduce(function (acc, m) { acc[m.slug] = m.name; return acc; }, {}), cur.slug, function (slug) {
          var m = methods.filter(function (x) { return x.slug === slug; })[0];
          labL.textContent = m.name;
          var t = right.v.currentTime || 0;
          left.url.ana = base + slug + "_anaglyph.mp4"; left.url.sbs = base + slug + "_sbs.mp4";
          var ext = C.posterExt || "jpg";
          left.url.pana = base + slug + "_anaglyph." + ext; left.url.psbs = base + slug + "_sbs." + ext;
          left.missing = {}; left.postered = null; left.el.classList.remove("is-ready", "has-poster", "is-missing");
          left.box.setAttribute("aria-label", "Enlarge: " + m.name);
          if (left.phFile) { left.phFile.textContent = left.src(); }
          var ph = $(".ph-title", left.el); if (ph) { ph.textContent = m.name; }
          if (left.loaded) {
            left.v.src = left.src();
            left.v.addEventListener("loadedmetadata", function () { seek(left.v, t); if (group.playing) { playV(left.v); } }, { once: true });
          }
          left.setPoster();
        });
    });
  }

  /* ------------------------------------------------------------------ view switch */
  var scopes = $$("[data-view-scope]");
  function paintViews() {
    $$(".topbar .seg button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === view ? "true" : "false"); });
    scopes.forEach(function (s) {
      var m = s.getAttribute("data-view") || view;
      if (s.classList.contains("samples")) { s.setAttribute("data-mode", m); }
      $$(".seg button", s).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === m ? "true" : "false"); });
    });
    Lightbox.paint();
  }
  function viewsChanged() { slots.forEach(function (s) { s.viewChanged(); }); Lightbox.viewChanged(); paintViews(); }
  function setView(m) {
    view = m;
    root.setAttribute("data-view", m);
    store.set("sg-view", m);
    scopes.forEach(function (s) { s.removeAttribute("data-view"); });
    viewsChanged();
  }
  function setScopeView(s, m) {
    if (m === view) { s.removeAttribute("data-view"); } else { s.setAttribute("data-view", m); }
    viewsChanged();
  }
  $$(".topbar .seg button").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view")); }); });
  scopes.forEach(function (s) {
    $$(".seg button", s).forEach(function (b) {
      if (b.closest(".lb")) { return; }
      b.addEventListener("click", function () { setScopeView(s, b.getAttribute("data-view")); });
    });
  });

  /* ------------------------------------------------------------------ lightbox */
  var Lightbox = (function () {
    var lb = $("#lb"), v = $("video", lb), t = $(".lb-t", lb), from = null, back = null, mode = "ana";
    function src() { return mode === "sbs" ? from.url.sbs : from.url.ana; }
    function fit() {
      var w = v.videoWidth, hh = v.videoHeight;
      if (!w || !hh) { return; }
      var small = window.innerWidth <= 860;
      var aw = window.innerWidth - (small ? 24 : 56), ah = window.innerHeight - (small ? 100 : 110);
      var k = Math.min(aw / w, ah / hh);
      v.style.width = Math.floor(w * k) + "px"; v.style.height = Math.floor(hh * k) + "px";
    }
    v.addEventListener("loadedmetadata", fit);
    window.addEventListener("resize", function () { if (!lb.hidden) { fit(); } });
    function fill(time, playing) {
      v.src = src();
      v.addEventListener("loadedmetadata", function () { seek(v, time); if (playing) { playV(v); } }, { once: true });
      t.textContent = (from.o.label || "Video") + (mode === "sbs" ? ", side by side" : ", anaglyph");
      paint();
    }
    function paint() {
      $$(".seg button", lb).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === mode ? "true" : "false"); });
    }
    $$(".seg button", lb).forEach(function (b) {
      b.addEventListener("click", function () { if (!from) { return; } mode = b.getAttribute("data-view"); fill(v.currentTime || 0, !v.paused); });
    });
    function open(slot) {
      from = slot; back = document.activeElement; mode = slot.mode || "ana";
      lb.hidden = false; document.body.classList.add("lb-open");
      v.style.width = ""; v.style.height = "";
      fill(slot.v.currentTime || 0, true);
      $(".lb-x", lb).focus();
    }
    function close() {
      if (lb.hidden) { return; }
      lb.hidden = true; v.pause(); v.removeAttribute("src");
      try { v.load(); } catch (e) { /* ignore */ }
      document.body.classList.remove("lb-open");
      from = null;
      if (back && back.focus) { back.focus(); }
    }
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-x")) { close(); } });
    return {
      open: open, close: close, paint: paint,
      isOpen: function () { return !lb.hidden; },
      setMode: function (m) { if (from) { mode = m; fill(v.currentTime || 0, !v.paused); } },
      viewChanged: function () { if (from && !lb.hidden && from.mode !== mode) { mode = from.mode; fill(v.currentTime || 0, !v.paused); } }
    };
  })();

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) { return; }
    var tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) { return; }
    if (e.key === "Escape") { Lightbox.close(); return; }
    if (e.key === "a" || e.key === "A") { if (Lightbox.isOpen()) { Lightbox.setMode("ana"); } setView("ana"); }
    else if (e.key === "s" || e.key === "S") { if (Lightbox.isOpen()) { Lightbox.setMode("sbs"); } setView("sbs"); }
  });
  paintViews();

  /* ------------------------------------------------------------------ top bar */
  (function topbar() {
    var bar = $("#topbar"), hdr = $(".site-header .links");
    if (!("IntersectionObserver" in window)) { bar.classList.add("is-shown"); return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { bar.classList.toggle("is-shown", !e.isIntersecting && e.boundingClientRect.top < 0); });
    }).observe(hdr);
    var links = {};
    $$(".topnav a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        var id = e.target.id === "observation" || e.target.id === "warp" || e.target.id === "donor" || e.target.id === "why" || e.target.id === "padding" ||
          e.target.id === "inversion" || e.target.id === "efficiency" ? "method" : e.target.id;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("is-on", k === id); });
      });
    }, { rootMargin: "-45% 0px -54% 0px" });
    $$("main > section[id]").forEach(function (s) { io.observe(s); });
  })();

  /* ------------------------------------------------------------------ scroll reveal (first entry only) */
  if ("IntersectionObserver" in window && !SG.reduced) {
    $$(".story").forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) { return; }
      s.classList.add("will-reveal");
      SG.onceVisible(s, function () { s.classList.add("is-in"); }, 0.12);
    });
  }

  /* ------------------------------------------------------------------ BibTeX copy */
  (function bib() {
    var b = $("#bib-copy"), code = $("#bib-code");
    b.addEventListener("click", function () {
      var txt = code.textContent;
      var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { fallback(); });
      } else { fallback(); }
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(code);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); done(); } catch (e) { /* selection left for manual copy */ }
      }
    });
  })();

  /* ------------------------------------------------------------------ runtime chart (paper Table 3) */
  (function bars() {
    var svg = $("#bars");
    if (!svg) { return; }
    var NS = "http://www.w3.org/2000/svg";
    var rows = [
      { name: "StereoGraft", left: 211.3, stereo: 234.8, total: "446.1", ours: true },
      { name: "StereoWorld", left: 211.3, stereo: 614.1, total: "825.4" },
      { name: "DissolveStereo\u2020", left: 211.3, stereo: 773.3, total: "984.5" }
    ];
    var compact = null;
    function render() {
      var c = svg.getBoundingClientRect().width < 600;
      if (c === compact) { return; }
      compact = c;
      Array.prototype.slice.call(svg.querySelectorAll(":scope > :not(title)")).forEach(function (n) { n.remove(); });
      var W = c ? 400 : 760, x0 = c ? 130 : 150, x1 = c ? 336 : 690, max = 1000, y0 = c ? 40 : 30, bh = c ? 30 : 34, gap = c ? 26 : 30;
      var fs = c ? 14 : 15, fsm = c ? 12.5 : 12;
      svg.setAttribute("viewBox", "0 0 " + W + " 250");
      function el(tag, attrs, text) {
        var e = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (text != null) { e.textContent = text; }
        svg.appendChild(e); return e;
      }
      var sx = function (v) { return x0 + (x1 - x0) * v / max; };
      var yEnd = y0 + rows.length * (bh + gap) - gap;
      (c ? [0, 500, 1000] : [0, 250, 500, 750, 1000]).forEach(function (v) {
        el("line", { x1: sx(v), x2: sx(v), y1: y0 - 10, y2: yEnd + 6, style: "stroke:var(--hair);stroke-width:1" });
        el("text", { x: sx(v), y: yEnd + 24, "text-anchor": "middle", style: "fill:var(--muted);font-size:" + fsm + "px;font-weight:500" }, v + (v === 1000 ? " s" : ""));
      });
      rows.forEach(function (r, i) {
        var y = y0 + i * (bh + gap);
        el("text", { x: x0 - 12, y: y + bh / 2 + 5, "text-anchor": "end", style: "fill:var(--ink);font-size:" + fs + "px;font-weight:" + (r.ours ? 650 : 500) }, r.name);
        el("rect", { x: sx(0), y: y, width: sx(r.left) - sx(0), height: bh, rx: 3, style: "fill:var(--line)" });
        el("rect", { x: sx(r.left), y: y, width: sx(r.left + r.stereo) - sx(r.left), height: bh, rx: 3, style: "fill:" + (r.ours ? "var(--ink)" : "var(--muted)") });
        el("text", { x: sx(r.left + r.stereo) + 7, y: y + bh / 2 + 5, style: "fill:var(--ink);font-size:" + fs + "px;font-weight:600;font-variant-numeric:tabular-nums" }, r.total + " s");
      });
      var ly = c ? 14 : 12;
      el("rect", { x: x0, y: ly - 9, width: 12, height: 10, rx: 2, style: "fill:var(--line)" });
      el("text", { x: x0 + 18, y: ly, style: "fill:var(--muted);font-size:" + fsm + "px;font-weight:500" }, "left view, 211.3 s");
      el("rect", { x: x0 + (c ? 132 : 150), y: ly - 9, width: 12, height: 10, rx: 2, style: "fill:var(--muted)" });
      el("text", { x: x0 + (c ? 150 : 168), y: ly, style: "fill:var(--muted);font-size:" + fsm + "px;font-weight:500" }, "stereo stage");
    }
    render();
    SG.onResize(render);
  })();

  window.SG.view = function () { return view; };
})();
