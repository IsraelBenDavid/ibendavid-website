/* LatentStereo talk deck. No build step, no framework. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const deck = $('#deck');
const slides = $$('.slide');

/* ------------------------------------------------------------ math */
if (window.renderMathInElement) {
  renderMathInElement(document.body, {
    delimiters: [{left: '$$', right: '$$', display: true}, {left: '\\(', right: '\\)', display: false}],
    throwOnError: false,
  });
}

/* ------------------------------------------------------------ stereo viewers */
let globalMode = 'anaglyph';
const viewers = [];
function buildViewer(fig) {
  const isVideo = fig.hasAttribute('data-video');
  const L = fig.dataset.l, R = fig.dataset.r, A = fig.dataset.a;
  const view = document.createElement('div'); view.className = 'view';
  const mk = (cls, src) => {
    let el;
    if (isVideo) {
      el = document.createElement('video');
      el.src = src; el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'metadata';
      if (fig.dataset.poster) el.poster = fig.dataset.poster;
    } else { el = document.createElement('img'); el.src = src; el.alt = ''; el.loading = 'lazy'; }
    el.className = cls; return el;
  };
  const eL = mk('L', L), eR = mk('R', R), eA = mk('A', A);
  view.append(eA, eL, eR);
  fig.append(view);
  if (fig.dataset.lab) { const t = document.createElement('div'); t.className = 'lab'; t.textContent = fig.dataset.lab; fig.append(t); }
  const sl = document.createElement('div'); sl.className = 'sbslab l'; sl.textContent = 'LEFT';
  const sr = document.createElement('div'); sr.className = 'sbslab r'; sr.textContent = 'RIGHT';
  fig.append(sl, sr);
  const modes = document.createElement('div'); modes.className = 'modes';
  const MODES = [['anaglyph', 'anaglyph'], ['wiggle', 'wiggle'], ['sbs', 'L | R'], ['left', 'L'], ['right', 'R']];
  for (const [m, lab] of MODES) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.mode = m;
    b.addEventListener('click', e => { e.stopPropagation(); setMode(fig, m); fig.classList.add('pinned'); });
    modes.append(b);
  }
  fig.append(modes);
  const v = {fig, isVideo, els: [eA, eL, eR]};
  viewers.push(v);
  setMode(fig, globalMode);
  return v;
}
function setMode(fig, m) {
  fig.dataset.mode = m;
  $$('.modes button', fig).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
}
$$('.stereo[data-l]').forEach(buildViewer);
// wiggle ticker (only viewers on screen)
setInterval(() => { $$('.stereo[data-mode="wiggle"]').forEach(f => f.classList.toggle('tick')); }, 140);
function setGlobalMode(m) {
  globalMode = m;
  $$('#globalmode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $$('.stereo').forEach(f => { f.classList.remove('pinned'); setMode(f, m); });
}
$$('#globalmode button').forEach(b => b.addEventListener('click', () => setGlobalMode(b.dataset.mode)));

// video viewers: play when their slide is on screen, keep the three copies in sync
function syncVideos(v) {
  const vids = v.els.filter(e => e.tagName === 'VIDEO');
  if (!vids.length) return;
  vids.forEach(e => { e.currentTime = 0; e.play().catch(() => {}); });
}

/* ------------------------------------------------------------ gallery */
const galleryEl = $('#gallery');
let galleryData = [];
if (galleryEl) {
  fetch('assets/gallery/gallery.json').then(r => r.json()).then(items => {
    galleryData = items;
    for (const it of items) {
      const f = document.createElement('figure'); f.className = 'stereo';
      f.dataset.l = `assets/gallery/${it.name}_left.jpg`; f.dataset.r = `assets/gallery/${it.name}_right.jpg`;
      f.dataset.a = `assets/gallery/${it.name}_anaglyph.jpg`; f.dataset.lab = it.name;
      galleryEl.append(f); buildViewer(f);
      f.addEventListener('click', () => openStereo(it));
    }
  }).catch(() => { galleryEl.innerHTML = '<p class="muted">gallery.json not found — run build_assets.py</p>'; });
}

/* ------------------------------------------------------------ overlay / lightbox */
const overlay = $('#overlay'), obox = $('.box', overlay);
function openOverlay(node, caption) {
  obox.innerHTML = ''; obox.append(node);
  if (caption) { const c = document.createElement('div'); c.className = 'cap'; c.innerHTML = caption; obox.append(c); }
  overlay.classList.add('on');
}
function closeOverlay() { overlay.classList.remove('on'); obox.innerHTML = ''; }
$('.x', overlay).addEventListener('click', closeOverlay);
overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
$$('.zoomable img').forEach(img => img.parentElement.addEventListener('click', () => {
  const big = document.createElement('img'); big.src = img.src; big.alt = img.alt;
  openOverlay(big, img.alt);
}));
function openStereo(it) {
  const f = document.createElement('figure'); f.className = 'stereo pinned';
  f.dataset.l = `assets/gallery/${it.name}_left.jpg`; f.dataset.r = `assets/gallery/${it.name}_right.jpg`; f.dataset.a = `assets/gallery/${it.name}_anaglyph.jpg`;
  const cap = `<b>“${it.prompt}”</b><br><span class="muted">${it.model.replace('black-forest-labs/', '')} · 1024² · t<sub>w</sub>=${it.warp_step} · d<sub>max</sub>=${it.max_disparity} px · seed 42 · A / W / S switch modes</span>`;
  openOverlay(f, cap); buildViewer(f);
}

/* ------------------------------------------------------------ stage scaling */
// Every slide is laid out on a fixed 1920x1080 stage (the geometry it was checked at) and
// scaled uniformly to the viewport, so no screen size or browser chrome can make it overflow.
function fitStage() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty('--s', s.toFixed(4));
}
fitStage();
window.addEventListener('resize', fitStage);
document.addEventListener('fullscreenchange', fitStage);

/* ------------------------------------------------------------ slide engine */
let current = 0;
const rail = $('#rail'), counter = $('#counter'), progress = $('#progress');
slides.forEach((s, i) => {
  const a = document.createElement('a'); a.href = `#s${i + 1}`; a.title = s.dataset.title || `slide ${i + 1}`;
  a.addEventListener('click', e => { e.preventDefault(); go(i); });
  rail.append(a);
});
const tocGrid = $('#toc .grid');
slides.forEach((s, i) => {
  const a = document.createElement('a'); a.href = `#s${i + 1}`;
  a.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>${s.dataset.title || ''}`;
  a.addEventListener('click', e => { e.preventDefault(); $('#toc').classList.remove('on'); go(i); });
  tocGrid.append(a);
});
function go(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  slides[i].scrollIntoView({behavior: 'auto', block: 'start'});
  setCurrent(i); // do not depend on the observer: keyboard navigation marks the slide itself
}
function setCurrent(i) {
  if (i === current && slides[i].classList.contains('on')) return;
  current = i;
  slides.forEach((s, k) => s.classList.toggle('on', k === i));
  $$('#rail a').forEach((a, k) => a.classList.toggle('on', k === i));
  counter.textContent = `${i + 1} / ${slides.length}`;
  progress.style.width = `${((i + 1) / slides.length) * 100}%`;
  history.replaceState(null, '', `#s${i + 1}`);
  const notes = $('.notes', slides[i]);
  $('#notes-body').innerHTML = notes ? notes.innerHTML : '<p class="muted">no notes for this slide</p>';
  // media: play what is on screen, pause the rest
  $$('video').forEach(v => { if (slides[i].contains(v)) v.play().catch(() => {}); else v.pause(); });
  viewers.forEach(v => { if (slides[i].contains(v.fig)) syncVideos(v); });
  if (slides[i].contains($('#gw-bil'))) gwReplay();
}
const io = new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting && en.intersectionRatio > 0.55) setCurrent(slides.indexOf(en.target)); });
}, {root: deck, threshold: [0.55]});
slides.forEach(s => io.observe(s));

const helpEl = $('#help'), tocEl = $('#toc'), notesEl = $('#notes');
function anyOverlay() { return overlay.classList.contains('on') || helpEl.classList.contains('on') || tocEl.classList.contains('on'); }
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const k = e.key;
  if (k === 'Escape') { closeOverlay(); helpEl.classList.remove('on'); tocEl.classList.remove('on'); return; }
  if (anyOverlay() && !['a', 'w', 's', 'A', 'W', 'S'].includes(k)) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(k)) { e.preventDefault(); go(current + 1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); go(current - 1); }
  else if (k === 'Home') go(0); else if (k === 'End') go(slides.length - 1);
  else if (k === 'f' || k === 'F') toggleFs();
  else if (k === 'n' || k === 'N') notesEl.classList.toggle('on');
  else if (k === 'g' || k === 'G') tocEl.classList.toggle('on');
  else if (k === '?') helpEl.classList.toggle('on');
  else if (k === 'a' || k === 'A') setGlobalMode('anaglyph');
  else if (k === 'w' || k === 'W') setGlobalMode('wiggle');
  else if (k === 's' || k === 'S') setGlobalMode('sbs');
});
function toggleFs() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
$('#btn-fs').addEventListener('click', toggleFs);
$('#btn-notes').addEventListener('click', () => notesEl.classList.toggle('on'));
$('#btn-toc').addEventListener('click', () => tocEl.classList.toggle('on'));
$('#btn-help').addEventListener('click', () => helpEl.classList.toggle('on'));
helpEl.addEventListener('click', e => { if (e.target === helpEl) helpEl.classList.remove('on'); });
tocEl.addEventListener('click', e => { if (e.target === tocEl) tocEl.classList.remove('on'); });
// deep link
const m = location.hash.match(/^#s(\d+)$/);
if (m) setTimeout(() => go(parseInt(m[1], 10) - 1), 50); else setCurrent(0);
// belt and braces: whatever happens with observers, never leave the visible slide faded out
setTimeout(() => { if (!slides.some(s => s.classList.contains('on'))) setCurrent(current); }, 1500);

/* ------------------------------------------------------------ trajectory scrubber */
const STEPS = ['05', '10', '15', '20', '25', '30', '35', '40', '45'];
const tjS = $('#tj-slider');
if (tjS) {
  const upd = () => {
    const s = STEPS[+tjS.value];
    $('#tj-lat').src = `assets/method/traj/lat_${s}.jpg`;
    $('#tj-x0').src = `assets/method/traj/x0_${s}.jpg`;
    $('#tj-depth').src = `assets/method/traj/depth_${s}.jpg`;
    $('#tj-val').textContent = s + (s === '25' ? ' ← t_w' : '');
  };
  tjS.addEventListener('input', upd); upd();
  STEPS.forEach(s => ['lat', 'x0', 'depth'].forEach(k => { const im = new Image(); im.src = `assets/method/traj/${k}_${s}.jpg`; }));
}

/* ------------------------------------------------------------ disparity dial */
const dialS = $('#dial-slider');
if (dialS) {
  const D = ['00', '16', '32', '48'];
  const upd = () => { $('#dial-img').src = `assets/teaser/dial_d${D[+dialS.value]}.jpg`; $('#dial-val').textContent = `${+D[+dialS.value]} px`; };
  dialS.addEventListener('input', upd); upd();
  D.forEach(d => { const im = new Image(); im.src = `assets/teaser/dial_d${d}.jpg`; });
}

/* ------------------------------------------------------------ gwtf animation */
// Two canvases, one noise field, one fractional displacement. Left: bilinear resampling.
// Right: the distribution-preserving warp (round to whole cells, route, merge with 1/sqrt(k),
// refill vacated cells with fresh draws). Live std of the warped field under each.
const GW = {cols: 20, rows: 14, shift: 1.5, phase: 0, t: 0, raf: 0, seed: 7};
function rnd() { // deterministic gaussian (Box–Muller on a tiny LCG) so replay is reproducible
  GW.seed = (GW.seed * 1664525 + 1013904223) >>> 0; const u1 = (GW.seed >>> 8) / 16777216 || 1e-6;
  GW.seed = (GW.seed * 1664525 + 1013904223) >>> 0; const u2 = (GW.seed >>> 8) / 16777216;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function gwSetup() {
  GW.seed = 7;
  const {cols, rows} = GW;
  GW.src = Array.from({length: rows}, () => Array.from({length: cols}, rnd));
  // "near object": an ellipse on the left-centre with displacement +1.5 cells; background 0
  GW.obj = Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => {
    const dx = (c - 7) / 4.2, dy = (r - 7) / 4.6; return dx * dx + dy * dy < 1;
  }));
  // ---- distribution-preserving result
  const w = Math.round(GW.shift);
  const dst = Array.from({length: rows}, () => Array.from({length: cols}, () => ({sum: 0, k: 0, fresh: false})));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cc = c + (GW.obj[r][c] ? w : 0); if (cc < cols) { dst[r][cc].sum += GW.src[r][c]; dst[r][cc].k++; }
  }
  GW.dp = dst.map(row => row.map(cell => cell.k ? {v: cell.sum / Math.sqrt(cell.k), k: cell.k, fresh: false} : {v: rnd(), k: 0, fresh: true}));
  // ---- bilinear result: destination samples the source at fractional offset (backward warp)
  GW.bil = Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => {
    // is this destination inside the moved object? (object mask shifted by +1.5)
    const inObj = GW.obj[r][Math.max(0, Math.round(c - GW.shift))] && c - GW.shift >= 0;
    if (!inObj) return {v: GW.src[r][c], blend: false};
    const x = c - GW.shift, x0 = Math.floor(x), f = x - x0;
    const a = GW.src[r][Math.max(0, x0)], b = GW.src[r][Math.min(cols - 1, x0 + 1)];
    return {v: (1 - f) * a + f * b, blend: true};
  }));
}
function std(vals) { const n = vals.length, mu = vals.reduce((a, b) => a + b, 0) / n; return Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / n); }
function gray(v) { const g = Math.max(0, Math.min(255, Math.round(128 + 52 * v))); return `rgb(${g},${g},${g})`; }
function gwDraw(canvas, kind, t) {
  const ctx = canvas.getContext('2d'); const {cols, rows} = GW;
  const W = canvas.width, H = canvas.height, cw = W / cols, ch = H / rows;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0b111c'; ctx.fillRect(0, 0, W, H);
  const p = GW.phase; // 0 source, 1 moving, 2 resolved
  const ease = t < 0 ? 0 : t > 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2;
  if (p === 0 || (p === 1 && kind === 'bil')) {
    // static source; bilinear shows the source until it "resamples"
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { ctx.fillStyle = gray(GW.src[r][c]); ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1); }
    if (kind === 'bil' && p === 1) { // fade toward the blended result
      ctx.globalAlpha = ease;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (GW.bil[r][c].blend) { ctx.fillStyle = gray(GW.bil[r][c].v); ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1); }
      ctx.globalAlpha = 1;
    }
  } else if (p === 1) {
    // dp: background stays, object cells slide by the integer shift
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!GW.obj[r][c]) { ctx.fillStyle = gray(GW.src[r][c]); ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1); }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (GW.obj[r][c]) {
      const x = (c + ease * Math.round(GW.shift)) * cw; ctx.fillStyle = gray(GW.src[r][c]); ctx.fillRect(x, r * ch, cw - 1, ch - 1);
      ctx.strokeStyle = 'rgba(39,184,216,.9)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, r * ch + .5, cw - 2, ch - 2);
    }
    // vacated cells flash red as the object leaves
    ctx.fillStyle = `rgba(255,69,83,${0.55 * ease})`;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (GW.dp[r][c].fresh) ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1);
  } else {
    const F = kind === 'bil' ? GW.bil : GW.dp;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = F[r][c]; ctx.fillStyle = gray(cell.v); ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1);
      if (kind === 'dp' && cell.fresh) { ctx.strokeStyle = 'rgba(255,69,83,.95)'; ctx.lineWidth = 2; ctx.strokeRect(c * cw + 1, r * ch + 1, cw - 3, ch - 3); }
      if (kind === 'dp' && cell.k > 1) { ctx.fillStyle = 'rgba(39,184,216,.95)'; ctx.font = `bold ${Math.round(ch * .45)}px JetBrains Mono, monospace`; ctx.fillText(String(cell.k), c * cw + 3, r * ch + ch * .55); }
      if (kind === 'bil' && cell.blend) { ctx.strokeStyle = 'rgba(255,69,83,.55)'; ctx.lineWidth = 1; ctx.strokeRect(c * cw + .5, r * ch + .5, cw - 2, ch - 2); }
    }
  }
  // object outline on the source
  if (p === 0) { ctx.strokeStyle = 'rgba(234,166,70,.9)'; ctx.lineWidth = 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (GW.obj[r][c]) {
      if (!GW.obj[r][c - 1]) { ctx.beginPath(); ctx.moveTo(c * cw, r * ch); ctx.lineTo(c * cw, (r + 1) * ch); ctx.stroke(); }
      if (!GW.obj[r][c + 1]) { ctx.beginPath(); ctx.moveTo((c + 1) * cw - 1, r * ch); ctx.lineTo((c + 1) * cw - 1, (r + 1) * ch); ctx.stroke(); }
      if (!(GW.obj[r - 1] || [])[c]) { ctx.beginPath(); ctx.moveTo(c * cw, r * ch); ctx.lineTo((c + 1) * cw, r * ch); ctx.stroke(); }
      if (!(GW.obj[r + 1] || [])[c]) { ctx.beginPath(); ctx.moveTo(c * cw, (r + 1) * ch - 1); ctx.lineTo((c + 1) * cw, (r + 1) * ch - 1); ctx.stroke(); }
    }
  }
}
const gwBil = $('#gw-bil'), gwDp = $('#gw-dp');
const PHASES = ['a white-noise field; the near object (outlined) must move 1.5 cells to the right',
  'moving: bilinear blends neighbours inside the object · the routing operator slides whole cells (rounded to 2) and vacates a strip',
  'resolved: bilinear cells inside the object are blends (std drops) · routed cells keep their values, collisions merge with 1/√k (teal count), vacated cells get fresh draws (red)'];
function gwRender() {
  if (!gwBil) return;
  gwDraw(gwBil, 'bil', GW.t); gwDraw(gwDp, 'dp', GW.t);
  $('#gw-phase').textContent = PHASES[GW.phase];
  const done = GW.phase === 2, w = Math.round(GW.shift);
  const srcObj = [], bilObj = [], dpObj = [];
  for (let r = 0; r < GW.rows; r++) for (let c = 0; c < GW.cols; c++) {
    if (GW.obj[r][c]) srcObj.push(GW.src[r][c]);
    if (GW.bil[r][c].blend) bilObj.push(GW.bil[r][c].v);
    if (c - w >= 0 && GW.obj[r][c - w]) dpObj.push(GW.dp[r][c].v);
  }
  $('#gw-bil-std').textContent = (done ? std(bilObj) : std(srcObj)).toFixed(2);
  $('#gw-dp-std').textContent = (done ? std(dpObj) : std(srcObj)).toFixed(2);
  const bo = $('#gw-bil-std'); bo.classList.toggle('bad', done);
}
function gwAnimateMove(then) {
  cancelAnimationFrame(GW.raf); GW.phase = 1; GW.t = 0; const t0 = performance.now();
  const step = now => { GW.t = Math.min(1, (now - t0) / 1100); gwRender(); if (GW.t < 1) GW.raf = requestAnimationFrame(step); else then && then(); };
  GW.raf = requestAnimationFrame(step);
}
function gwReplay() {
  if (!gwBil) return;
  cancelAnimationFrame(GW.raf); gwSetup(); GW.phase = 0; GW.t = 0; gwRender();
  setTimeout(() => gwAnimateMove(() => setTimeout(() => { GW.phase = 2; gwRender(); }, 350)), 900);
}
if (gwBil) {
  gwSetup(); gwRender();
  $('#gw-replay').addEventListener('click', gwReplay);
  $('#gw-step').addEventListener('click', () => {
    if (GW.phase === 0) gwAnimateMove(); else if (GW.phase === 1) { cancelAnimationFrame(GW.raf); GW.phase = 2; gwRender(); } else { gwSetup(); GW.phase = 0; gwRender(); }
  });
}

/* ------------------------------------------------------------ ablation charts */
const chartsEl = $('#ablation-charts');
if (chartsEl) fetch('assets/ablation_curve.json').then(r => r.json()).then(data => {
  const specs = [['isqoe', 'iSQoE ↓', 3], ['met3r_x100', 'MEt3R ↓', 1], ['clip_f_x100', 'CLIP-F ↑', 1], ['topiq', 'TOPIQ ↑', 3]];
  const X = data.warp_step, TW = 20, WIN = [17, 33];
  for (const [key, title, dec] of specs) {
    const mu = data[key].mean, se = data[key].sem;
    const lo = mu.map((m, i) => m - se[i]), hi = mu.map((m, i) => m + se[i]);
    const ymin = Math.min(...lo), ymax = Math.max(...hi), pad = (ymax - ymin) * 0.12;
    const y0 = ymin - pad, y1 = ymax + pad;
    const W = 300, H = 190, mL = 44, mR = 10, mT = 24, mB = 26;
    const sx = x => mL + (x - 0) / 49 * (W - mL - mR), sy = y => mT + (1 - (y - y0) / (y1 - y0)) * (H - mT - mB);
    const path = (arr, rev) => (rev ? arr.map((v, i) => [X[i], v]).reverse() : arr.map((v, i) => [X[i], v])).map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
    const ticks = 4, yt = Array.from({length: ticks + 1}, (_, i) => y0 + (y1 - y0) * i / ticks);
    const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}">
      <text class="title" x="${mL}" y="14">${title}</text>
      <rect class="win" x="${sx(WIN[0])}" y="${mT}" width="${sx(WIN[1]) - sx(WIN[0])}" height="${H - mT - mB}"/>
      ${yt.map(y => `<line class="grid" x1="${mL}" x2="${W - mR}" y1="${sy(y)}" y2="${sy(y)}"/><text x="${mL - 4}" y="${sy(y) + 3}" text-anchor="end">${y.toFixed(dec)}</text>`).join('')}
      ${[10, 20, 30, 40].map(x => `<text x="${sx(x)}" y="${H - 8}" text-anchor="middle">${x}</text>`).join('')}
      <line class="axis" x1="${mL}" x2="${W - mR}" y1="${H - mB}" y2="${H - mB}"/><line class="axis" x1="${mL}" x2="${mL}" y1="${mT}" y2="${H - mB}"/>
      <path class="band" d="${path(hi)} ${path(lo, true).replace(/^M/, 'L')} Z"/>
      <path class="line" d="${path(mu)}"/>
      <line class="mark" x1="${sx(TW)}" x2="${sx(TW)}" y1="${mT}" y2="${H - mB}"/><text class="marklab" x="${sx(TW) + 3}" y="${mT + 10}">t_w=${TW}</text>
      <text x="${W - mR}" y="${H - 8}" text-anchor="end">step</text>
    </svg>`;
    const d = document.createElement('div'); d.innerHTML = svg; chartsEl.append(d.firstElementChild);
  }
}).catch(() => { chartsEl.innerHTML = '<p class="muted">ablation_curve.json not found — run build_assets.py</p>'; });

})();
