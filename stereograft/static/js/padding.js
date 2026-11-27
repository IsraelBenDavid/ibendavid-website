/* Boundary padding: drag the divider between the right view with P = 0 (left side) and P = 1 (right side). */
(function () {
  "use strict";
  var SG = window.SG;
  var wipe = document.getElementById("wipe");
  if (!wipe) { return; }
  var cut = 50, raf = null;
  function set(v, user) {
    cut = SG.clamp(v, 0, 100);
    if (user && raf) { cancelAnimationFrame(raf); raf = null; }
    wipe.style.setProperty("--cut", cut + "%");
    wipe.setAttribute("aria-valuenow", String(Math.round(cut)));
  }
  function fromPointer(e) { var r = wipe.getBoundingClientRect(); return 100 * (e.clientX - r.left) / r.width; }
  var dragging = false;
  wipe.addEventListener("pointerdown", function (e) { dragging = true; wipe.setPointerCapture(e.pointerId); set(fromPointer(e), true); });
  wipe.addEventListener("pointermove", function (e) { if (dragging) { set(fromPointer(e), true); } });
  wipe.addEventListener("pointerup", function () { dragging = false; });
  wipe.addEventListener("pointercancel", function () { dragging = false; });
  wipe.addEventListener("keydown", function (e) {
    var d = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : e.key === "Home" ? -100 : e.key === "End" ? 100 : 0;
    if (d) { e.preventDefault(); set(cut + d, true); }
  });
  set(50);
  // one gentle sweep on first view: reveal P = 1 over the rope, then settle in the middle
  if (!SG.reduced) {
    SG.onceVisible(wipe, function () {
      var keys = [[0, 50], [900, 78], [2100, 30], [3000, 50]], t0 = null;
      function f(ts) {
        if (t0 == null) { t0 = ts; }
        var t = ts - t0, i = 0;
        while (i < keys.length - 2 && t > keys[i + 1][0]) { i++; }
        var a = keys[i], b = keys[i + 1], p = SG.ease((t - a[0]) / (b[0] - a[0]));
        set(SG.lerp(a[1], b[1], p));
        raf = t < keys[keys.length - 1][0] ? requestAnimationFrame(f) : null;
      }
      raf = requestAnimationFrame(f);
    }, 0.5);
  }
})();
