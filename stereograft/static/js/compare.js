/* Comparison with prior methods: one baseline (chosen by a pill row) beside StereoGraft, the same example at the same
   disparity setting, played together. Media: media/compare/<example>/<method>_d<setting>_{anaglyph,sbs}.mp4 with
   .webp posters; texts: static/data/compare.json. Nothing loads until the section is near the viewport, and only
   the selected pair's two files are ever requested. */
(function () {
  "use strict";
  var SG = window.SG;
  var root = document.getElementById("cmp");
  if (!root || !SG) { return; }
  function $(name) { return root.querySelector("[data-cmp=\"" + name + "\"]"); }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }
  var BASE = "media/compare/";
  var TASK = { t2s: "Text-to-stereo", v2s: "Video-to-stereo" };

  var exEl = $("examples"), methEl = $("methods"), setEl = $("settings"), viewEl = $("view"), pair = $("pair");
  var labB = $("label-b"), vB = $("video-b"), vO = $("video-o"), boxB = $("box-b"), boxO = $("box-o");
  var lookEl = $("look"), textEl = $("text"), noteEl = $("note"), bPlay = $("play");
  var D = null, ex = 0, meth = 1, set = 0, near = false, onScreen = false, held = !!SG.reduced, loaded = "", lastT = 0;      /* reduced motion: nothing plays until asked */

  function mode() {
    var o = root.getAttribute("data-view");
    return o === "ana" || o === "sbs" || o === "right" ? o : (SG.view ? SG.view() : "ana");
  }
  function file(slug, ext) {
    var m = mode();
    return BASE + D.examples[ex].key + "/" + slug + "_d" + D.settings[set] + "_" + (m === "ana" ? "anaglyph" : "sbs") + "." + ext;
  }
  function pills(el, labels, cur, on) {
    el.textContent = "";
    labels.forEach(function (t, i) {
      var b = h("button", "", t);
      b.type = "button"; b.setAttribute("aria-pressed", i === cur ? "true" : "false");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        on(i);
      });
      el.appendChild(b);
    });
  }
  function playV(v) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } }
  function ui() {
    var on = !held;
    bPlay.setAttribute("data-state", on ? "playing" : "paused");
    bPlay.setAttribute("aria-label", on ? "Pause both videos" : "Play both videos");
  }
  /* the baseline follows StereoGraft: a clip of the same length is kept on its clock; a 16-frame clip plays once
     from each restart of the longer one and then holds its last frame */
  function same() { return vB.duration && vO.duration && Math.abs(vB.duration - vO.duration) < 0.25; }
  function sync() {
    if (!onScreen || held || vO.readyState < 2) { return; }
    if (vO.paused) { playV(vO); }
    if (vB.readyState < 2) { return; }
    var wrapped = vO.currentTime + 0.05 < lastT;
    lastT = vO.currentTime;
    if (same()) {
      if (Math.abs(vB.currentTime - vO.currentTime) > 0.09) { try { vB.currentTime = vO.currentTime; } catch (e) { /* not seekable yet */ } }
      if (vB.paused) { playV(vB); }
    } else if (wrapped || (vB.paused && !vB.ended && vB.currentTime < 0.05)) {
      try { vB.currentTime = 0; } catch (e2) { /* not seekable yet */ }
      playV(vB);
    }
  }
  function pauseAll() { vB.pause(); vO.pause(); }

  function text() {
    var e = D.examples[ex], m = D.methods[meth], n = (D.notes[e.task] || {})[m.slug] || "";
    labB.textContent = m.name;
    lookEl.textContent = e.look[m.slug] || "";
    textEl.textContent = e.task === "t2s" ? "Prompt: “" + e.text + "”" : e.text;
    noteEl.textContent = n;
    noteEl.hidden = !n;
    var d = D.settings[set] + "% disparity";
    vB.setAttribute("aria-label", m.name + ", " + e.name + ", " + d);
    vO.setAttribute("aria-label", "StereoGraft, " + e.name + ", " + d);
  }
  function load() {
    if (!D) { return; }
    var e = D.examples[ex], m = mode();
    root.setAttribute("data-mode", m);
    pair.style.setProperty("--ar", String(m === "sbs" ? 2 * e.ar : e.ar));
    pair.setAttribute("data-shape", e.ar > 1.2 ? "wide" : "square");
    text();
    if (!near) { return; }
    var key = ex + "|" + meth + "|" + set + "|" + (m === "ana" ? "a" : "s");
    if (key === loaded) { return; }
    var prev = loaded.split("|"), keepO = prev.length === 4 && +prev[0] === ex && +prev[2] === set && prev[3] === (m === "ana" ? "a" : "s");
    var t = keepO ? vO.currentTime : 0;
    loaded = key; lastT = 0;
    [[vB, D.methods[meth].slug, boxB], [vO, "stereograft", boxO]].forEach(function (a) {
      if (a[0] === vO && keepO) { return; }                 /* only the baseline changed: ours keeps playing */
      a[2].classList.remove("is-ready");
      a[0].poster = file(a[1], "webp");
      a[0].src = file(a[1], "mp4");
      a[0].load();
    });
    if (keepO) { vB.addEventListener("loadeddata", function () { if (same()) { try { vB.currentTime = t; } catch (e3) { /* later */ } } }, { once: true }); }
    sync();
  }
  [[vB, boxB], [vO, boxO]].forEach(function (a) {
    a[0].addEventListener("loadeddata", function () { a[1].classList.add("is-ready"); vB.loop = same(); sync(); });
  });

  function build() {
    D.examples.forEach(function (e, i) {
      var b = h("button", "cmp-ex");
      b.type = "button"; b.setAttribute("aria-pressed", i === ex ? "true" : "false");
      var im = h("img"); im.alt = ""; im.width = 320; im.height = Math.round(320 / e.ar); im.loading = "lazy"; im.decoding = "async";
      im.setAttribute("data-src", BASE + e.key + "/thumb.webp");
      var cap = h("span", "cmp-ex-cap");
      cap.appendChild(h("span", "cmp-ex-task", TASK[e.task]));
      cap.appendChild(h("span", "cmp-ex-name", e.name));
      b.appendChild(im); b.appendChild(cap);
      b.addEventListener("click", function () {
        ex = i;
        Array.prototype.forEach.call(exEl.children, function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); });
        load();
      });
      exEl.appendChild(b);
    });
    pills(methEl, D.methods.map(function (m) { return m.name; }), meth, function (i) { meth = i; load(); });
    pills(setEl, D.settings.map(function (s) { return s + "%"; }), set, function (i) { set = i; load(); });
    Array.prototype.forEach.call(viewEl.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-view"), g = SG.view ? SG.view() : "ana";
        if (v === g) { root.removeAttribute("data-view"); } else { root.setAttribute("data-view", v); }
        paintView(); load();
      });
    });
    bPlay.addEventListener("click", function () {
      held = !held;
      if (held) { pauseAll(); } else { sync(); }
      ui();
    });
    ui(); paintView(); load();
  }
  function paintView() {
    var m = mode();
    Array.prototype.forEach.call(viewEl.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === m ? "true" : "false"); });
  }
  /* the page's global Anaglyph / Side by side switch clears the section's own choice */
  if (SG.onView) { SG.onView(function () { root.removeAttribute("data-view"); paintView(); load(); }); }

  var timer = null;
  function start() {
    if (near) { return; }
    near = true;
    Array.prototype.forEach.call(exEl.querySelectorAll("img[data-src]"), function (im) { im.src = im.getAttribute("data-src"); im.removeAttribute("data-src"); });
    load();
    timer = setInterval(sync, 200);
  }
  SG.json("static/data/compare.json").then(function (d) {
    D = d;
    build();
    SG.watchVisible(root, function (on) { if (on) { start(); } }, { rootMargin: "700px 0px" });
    SG.watchVisible(pair, function (on) { onScreen = on; if (on) { sync(); } else { pauseAll(); } }, { threshold: 0.25 });
  }).catch(function () { lookEl.textContent = "The comparison could not be loaded."; });

  /* for the page's own checks */
  window.SGCompare = {
    pick: function (e, m, s, v) {
      if (e != null) { exEl.children[e].click(); }
      if (m != null) { methEl.children[m].click(); }
      if (s != null) { setEl.children[s].click(); }
      if (v) { viewEl.querySelector("[data-view=\"" + v + "\"]").click(); }
    },
    state: function () {
      return { ex: D.examples[ex].key, method: D.methods[meth].slug, setting: D.settings[set], mode: mode(), held: held,
        b: { t: vB.currentTime, d: vB.duration, paused: vB.paused, ready: vB.readyState, src: vB.currentSrc.split("/").slice(-2).join("/") },
        o: { t: vO.currentTime, d: vO.duration, paused: vO.paused, ready: vO.readyState, src: vO.currentSrc.split("/").slice(-2).join("/") } };
    }
  };
})();
