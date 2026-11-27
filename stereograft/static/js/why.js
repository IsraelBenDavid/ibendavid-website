/* Why a chain: right-view crops of two prompts under four warp schedules (the supplementary's fig:branch, frame 40),
   and the supplementary's MEt3R means by last refresh (tab:t2s_branch). Numbers come from donor.json `why`,
   hard-coded there from the paper; nothing is recomputed. */
(function () {
  "use strict";
  var SG = window.SG;
  var fig = document.getElementById("why-fig");
  if (!fig || !SG) { return; }
  var $ = function (id) { return document.getElementById(id); };
  var W = null, scene = "potter", arm = "default", started = false;
  var ARMS = ["default", "m05", "a20", "m40"];
  var ARM_LABEL = { "default": "5→10→15→20", m05: "no refresh", a20: "single warp at 20", m40: "refresh through 40" };
  var ARM_ALT = { "default": "the default schedule, refreshes after steps 10, 15 and 20", m05: "a single warp at step 5 and no refresh",
    a20: "a single warp at step 20, with no donor", m40: "refreshes every five steps through step 40" };
  var SCENE_ALT = { potter: "a potter's wheel with bowls on a shelf behind the pot", well: "the rim of a stone well against ivy" };
  var IMG = "static/images/donor/why/";
  var status = $("why-status"), grid = $("why-grid");

  function setSrc(id, u) { var e = $(id); if (e.getAttribute("src") !== u) { e.src = u; } }
  function src(sc, a, kind) { return IMG + sc + "-" + a + "-" + kind + ".webp"; }
  function update() {
    if (!W) { return; }
    var sc = W.scenes[scene];
    setSrc("why-L", src(scene, "left", "crop")); setSrc("why-LZ", src(scene, "left", "zoom"));
    setSrc("why-R", src(scene, arm, "crop")); setSrc("why-RZ", src(scene, arm, "zoom"));
    $("why-L").alt = "Left view crop: " + SCENE_ALT[scene] + ".";
    $("why-LZ").alt = "Left view close-up of the boxed region.";
    $("why-R").alt = "Right view crop with " + ARM_ALT[arm] + ".";
    $("why-RZ").alt = "Right view close-up of the boxed region with " + ARM_ALT[arm] + ".";
    $("why-arm-label").textContent = ARM_LABEL[arm];
    var b = sc.zoom_box;
    fig.querySelectorAll(".why-box").forEach(function (el) {
      el.style.left = (100 * b[0]) + "%"; el.style.top = (100 * b[1]) + "%";
      el.style.width = (100 * b[2]) + "%"; el.style.height = (100 * b[3]) + "%";
    });
    status.textContent = sc.status[arm];
    fig.querySelectorAll("[data-why-scene]").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-why-scene") === scene ? "true" : "false"); });
    fig.querySelectorAll("[data-arm]").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-arm") === arm ? "true" : "false"); });
  }
  fig.querySelectorAll("[data-why-scene]").forEach(function (b) {
    b.addEventListener("click", function () { scene = b.getAttribute("data-why-scene"); update(); });
  });
  fig.querySelectorAll("[data-arm]").forEach(function (b) {
    b.addEventListener("click", function () { arm = b.getAttribute("data-arm"); update(); });
  });
  fig.addEventListener("keydown", function (e) {
    var k = "1234".indexOf(e.key);
    if (k < 0 || e.altKey || e.ctrlKey || e.metaKey) { return; }
    arm = ARMS[k]; update(); e.preventDefault();
  });
  var showLeft = $("why-showleft");
  showLeft.addEventListener("click", function () {
    var on = showLeft.getAttribute("aria-pressed") !== "true";
    showLeft.setAttribute("aria-pressed", on ? "true" : "false");
    showLeft.textContent = on ? "Hide left view" : "Show left view";
    grid.classList.toggle("show-left", on);
  });

  /* ---------------------------------------------------------------- chart: MEt3R x 100 by last refresh */
  var svg = $("why-svg"), tip = $("why-tip"), NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function chart() {
    if (!W) { return; }
    while (svg.lastChild && svg.lastChild.tagName !== "title") { svg.removeChild(svg.lastChild); }
    var c = SG.colors();
    var keys = ["5", "10", "15", "20", "30", "40"], vals = keys.map(function (k) { return W.met3r_last_refresh[k]; });
    var x0 = 44, x1 = 470, y0 = 158, yTop = 18, ymax = 16;
    var sy = function (v) { return y0 - (y0 - yTop) * v / ymax; };
    var slot = (x1 - x0) / keys.length, bw = 24;
    // gridlines and y ticks
    [0, 5, 10, 15].forEach(function (v) {
      el("line", { x1: x0, x2: 616, y1: sy(v), y2: sy(v), stroke: v ? c.hair : c.line, "stroke-width": 1 }, svg);
      var t = el("text", { x: x0 - 8, y: sy(v) + 4, "text-anchor": "end", "font-size": 11, fill: c.muted }, svg);
      t.textContent = String(v);
    });
    keys.forEach(function (k, i) {
      var v = vals[i], cx = x0 + slot * (i + 0.5), def = k === "20";
      var g = el("g", { "class": "bar", tabindex: 0, role: "img",
        "aria-label": "Last refresh after step " + k + (k === "5" ? ", no refresh" : "") + (def ? ", the default" : "") + ": MEt3R times 100 = " + v.toFixed(3) }, svg);
      var top = sy(v), h = y0 - top, r = 4;
      // column with a 4-px rounded data end, square at the baseline
      el("path", { d: "M" + (cx - bw / 2) + " " + y0 + "V" + (top + r) + "Q" + (cx - bw / 2) + " " + top + " " + (cx - bw / 2 + r) + " " + top +
        "H" + (cx + bw / 2 - r) + "Q" + (cx + bw / 2) + " " + top + " " + (cx + bw / 2) + " " + (top + r) + "V" + y0 + "Z",
        fill: def ? c.ink : c.cellWall }, g);
      el("rect", { "class": "hit", x: cx - slot / 2 + 4, y: yTop - 6, width: slot - 8, height: y0 - yTop + 6, fill: "transparent", rx: 6 }, g);
      var lab = el("text", { x: cx, y: y0 + 16, "text-anchor": "middle", "font-size": 11.5, fill: def ? c.ink : c.muted, "font-weight": def ? 600 : 500 }, svg);
      lab.textContent = k === "5" ? "5 (none)" : def ? "20 (default)" : k;
      if (k === "5" || def || k === "40") {
        var vt = el("text", { x: cx, y: top - 6, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: c.ink }, svg);
        vt.textContent = v.toFixed(3);
      }
      var show = function () {
        tip.hidden = false;
        tip.innerHTML = "<b>" + v.toFixed(3) + "</b><br>last refresh after step " + k + (k === "5" ? " (no refresh)" : "") + (def ? " (default)" : "");
        var pr = svg.parentNode.getBoundingClientRect(), br = g.getBoundingClientRect();
        tip.style.left = Math.max(0, br.left - pr.left + br.width / 2 - tip.offsetWidth / 2) + "px";
        tip.style.top = (br.top - pr.top - tip.offsetHeight - 6) + "px";
      };
      var hide = function () { tip.hidden = true; };
      g.addEventListener("pointerenter", show); g.addEventListener("pointerleave", hide);
      g.addEventListener("focus", show); g.addEventListener("blur", hide);
    });
    var ax = el("text", { x: (x0 + x1) / 2, y: y0 + 32, "text-anchor": "middle", "font-size": 11, fill: c.muted }, svg);
    ax.textContent = "last refresh after step";
    // the single warp at 20 (no donor): open circle beside the bars
    var sx = 520, sv = W.single20, sg = el("g", { "class": "bar", tabindex: 0, role: "img",
      "aria-label": "Single warp at step 20, no donor: MEt3R times 100 = " + sv.toFixed(3) }, svg);
    el("line", { x1: 496, x2: 496, y1: yTop, y2: y0, stroke: c.line, "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    el("circle", { cx: sx, cy: sy(sv), r: 5.5, fill: c.bg, stroke: c.ink, "stroke-width": 2 }, sg);
    el("rect", { "class": "hit", x: sx - 16, y: sy(sv) - 16, width: 32, height: 32, fill: "transparent", rx: 6 }, sg);
    var t1 = el("text", { x: sx + 12, y: sy(sv) - 4, "font-size": 11.5, fill: c.ink, "font-weight": 600 }, svg); t1.textContent = sv.toFixed(3);
    var t2 = el("text", { x: sx + 12, y: sy(sv) + 11, "font-size": 11, fill: c.muted }, svg); t2.textContent = "single warp at 20,";
    var t3 = el("text", { x: sx + 12, y: sy(sv) + 25, "font-size": 11, fill: c.muted }, svg); t3.textContent = "no donor";
    var showS = function () {
      tip.hidden = false; tip.innerHTML = "<b>" + sv.toFixed(3) + "</b><br>single warp at step 20, no donor";
      var pr = svg.parentNode.getBoundingClientRect(), br = sg.getBoundingClientRect();
      tip.style.left = Math.max(0, br.left - pr.left + br.width / 2 - tip.offsetWidth / 2) + "px";
      tip.style.top = (br.top - pr.top - tip.offsetHeight - 6) + "px";
    };
    sg.addEventListener("pointerenter", showS); sg.addEventListener("pointerleave", function () { tip.hidden = true; });
    sg.addEventListener("focus", showS); sg.addEventListener("blur", function () { tip.hidden = true; });
  }

  function start() {
    if (started) { return; }
    started = true;
    SG.json("static/data/donor.json").then(function (d) { W = d.why; update(); chart(); })
      .catch(function () { status.textContent = "The comparison images could not be loaded."; });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "600px 0px" });
    io.observe(fig);
  } else { start(); }
  SG.onTheme(chart);
})();
