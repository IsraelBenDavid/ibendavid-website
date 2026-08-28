/* Stereo generation user study.
 *
 * Blind pairwise (2AFC) comparisons: each trial shows the same sample produced by two
 * methods (ours vs. one baseline), anonymized as A and B with randomized sides. Every
 * stimulus is stored as ONE side-by-side file (left eye | right eye), and the viewer
 * derives all display modes from it on a canvas, so the two eyes can never drift out
 * of sync:
 *   sbs      – the file as-is, both eyes side by side
 *   anaglyph – red channel from the left eye, green/blue from the right (red-cyan glasses)
 *   wiggle   – alternate the two eyes at ~7 Hz; depth reads as parallax without glasses
 *   right    – the synthesized right eye alone
 *
 * Responses autosave to localStorage after every trial and are POSTed to /submit at the
 * end (serve_study.py); when the page is hosted statically the participant downloads the
 * JSON instead.
 */

"use strict";

/* ================================ utilities ================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const STORAGE_KEY = "stereo_user_study_v1";

function saveState() {
  if (!state) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode etc. */ }
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

/* ============================== stereo viewer ============================== */

const WIGGLE_HZ = 7;

class StereoViewer {
  /**
   * @param {HTMLElement} cellEl  .stereo-cell container (already in the DOM)
   * @param {{kind: "image"|"video", url: string}} src  side-by-side stimulus
   * @param {(info: string) => void} onModeUse  called when the viewer actually renders a mode
   */
  constructor(cellEl, src, onModeUse) {
    this.cell = cellEl;
    this.src = src;
    this.onModeUse = onModeUse || (() => {});
    this.mode = "sbs";
    this.dead = false;
    this.ready = false;
    this.playing = true;

    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.tmpL = document.createElement("canvas");
    this.tmpR = document.createElement("canvas");

    this.wrap = $(".canvas-wrap", cellEl);
    this.wrap.appendChild(this.canvas);
    this.status = $(".cell-status", cellEl);
    if (this.status) this.status.textContent = "loading…";

    this.canvas.addEventListener("click", () => this.togglePlay());

    if (src.kind === "video") {
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = src.url;
      v.addEventListener("loadeddata", () => this._onReady());
      v.addEventListener("error", () => this._onError());
      v.play().catch(() => {}); // autoplay of muted video; a click also resumes it
      this.media = v;
    } else {
      const img = new Image();
      img.src = src.url;
      img.addEventListener("load", () => this._onReady());
      img.addEventListener("error", () => this._onError());
      this.media = img;
    }

    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  get mediaSize() {
    const m = this.media;
    if (this.src.kind === "video") return [m.videoWidth, m.videoHeight];
    return [m.naturalWidth, m.naturalHeight];
  }

  _onReady() {
    if (this.dead) return;
    this.ready = true;
    if (this.status) this.status.textContent = this.src.kind === "video" ? "click to pause" : "";
    this._resize();
    this._drawnStatic = false;
  }

  _onError() {
    if (this.status) {
      this.status.textContent = "failed to load: " + this.src.url;
      this.status.style.color = "#f76f6f";
    }
  }

  _resize() {
    const [W, H] = this.mediaSize;
    if (!W || !H) return;
    const w = Math.floor(W / 2);
    const wantW = this.mode === "sbs" ? W : w;
    if (this.canvas.width !== wantW || this.canvas.height !== H) {
      this.canvas.width = wantW;
      this.canvas.height = H;
      this.tmpL.width = this.tmpR.width = w;
      this.tmpL.height = this.tmpR.height = H;
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this._drawnStatic = false;
    this._resize();
    this.onModeUse(mode);
  }

  togglePlay() {
    if (this.src.kind !== "video") return;
    if (this.media.paused) { this.media.play().catch(() => {}); this.playing = true; }
    else { this.media.pause(); this.playing = false; }
    if (this.status) this.status.textContent = this.media.paused ? "paused – click to play" : "click to pause";
  }

  restart() {
    if (this.src.kind !== "video") return;
    this.media.currentTime = 0;
    this.media.play().catch(() => {});
    this.playing = true;
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this._raf);
    if (this.src.kind === "video") {
      this.media.pause();
      this.media.removeAttribute("src");
      this.media.load();
    }
    this.canvas.remove();
  }

  _tick(t) {
    if (this.dead) return;
    this._raf = requestAnimationFrame((tt) => this._tick(tt));
    if (!this.ready) return;

    const isVideo = this.src.kind === "video";
    const wiggleLeft = Math.floor((t / 1000) * WIGGLE_HZ * 2) % 2 === 0;

    // Static image, static mode, already drawn: nothing to do.
    if (!isVideo && this.mode !== "wiggle" && this._drawnStatic) return;
    // Paused video in a non-wiggle mode: keep the last frame.
    if (isVideo && this.media.paused && this.mode !== "wiggle" && this._drawnStatic) return;
    if (this.mode === "wiggle" && this._lastWiggleLeft === wiggleLeft && ((isVideo && this.media.paused) || !isVideo) && this._drawnStatic) return;

    this._draw(wiggleLeft);
    this._drawnStatic = true;
    this._lastWiggleLeft = wiggleLeft;
  }

  _draw(wiggleLeft) {
    const [W, H] = this.mediaSize;
    if (!W || !H) return;
    const w = Math.floor(W / 2);
    const ctx = this.ctx;
    const m = this.media;

    switch (this.mode) {
      case "sbs":
        ctx.drawImage(m, 0, 0, W, H, 0, 0, this.canvas.width, this.canvas.height);
        // thin divider between the eyes
        ctx.fillStyle = "#00000080";
        ctx.fillRect(this.canvas.width / 2 - 1, 0, 2, this.canvas.height);
        break;

      case "right":
        ctx.drawImage(m, w, 0, w, H, 0, 0, this.canvas.width, this.canvas.height);
        break;

      case "wiggle":
        ctx.drawImage(m, wiggleLeft ? 0 : w, 0, w, H, 0, 0, this.canvas.width, this.canvas.height);
        break;

      case "anaglyph": {
        // Channel split without per-pixel loops: multiplying by a solid color zeroes the
        // other channels on the GPU, and "lighter" adds the two halves back together.
        const lc = this.tmpL.getContext("2d");
        lc.globalCompositeOperation = "source-over";
        lc.drawImage(m, 0, 0, w, H, 0, 0, w, H);
        lc.globalCompositeOperation = "multiply";
        lc.fillStyle = "#ff0000";
        lc.fillRect(0, 0, w, H);

        const rc = this.tmpR.getContext("2d");
        rc.globalCompositeOperation = "source-over";
        rc.drawImage(m, w, 0, w, H, 0, 0, w, H);
        rc.globalCompositeOperation = "multiply";
        rc.fillStyle = "#00ffff";
        rc.fillRect(0, 0, w, H);

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(this.tmpL, 0, 0);
        ctx.drawImage(this.tmpR, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        break;
      }
    }
  }
}

/* ============================= trial construction ============================= */

/**
 * Build this participant's randomized trial list from the manifest.
 * For each task: all (sample x baseline) pairs, balanced-subsampled down to the task's
 * quota (round-robin across baselines so every baseline keeps equal coverage), then
 * shuffled within the task. Task sections run in manifest order.
 */
function buildTrials(manifest) {
  const trials = [];
  for (const task of manifest.tasks) {
    if (!task.samples || task.samples.length === 0) continue;
    const perBaseline = new Map();
    for (const baseline of task.baselines) {
      const pool = task.samples
        .filter((s) => s.cells[task.ours] && s.cells[baseline])
        .map((s) => ({ sample: s, baseline }));
      shuffle(pool);
      perBaseline.set(baseline, pool);
    }
    const quota = task.trials === "all" || task.trials == null
      ? Infinity
      : task.trials;
    const chosen = [];
    let exhausted = false;
    while (chosen.length < quota && !exhausted) {
      exhausted = true;
      for (const pool of perBaseline.values()) {
        if (pool.length > 0 && chosen.length < quota) {
          chosen.push(pool.pop());
          exhausted = false;
        }
      }
    }
    const sectionTrials = chosen.map(({ sample, baseline }) => {
      const oursIsA = Math.random() < 0.5;
      return {
        task: task.id,
        kind: task.kind,
        mock: !!task.mock,
        sample: sample.id,
        context: sample.context || "",
        input: sample.input || null,
        methodA: oursIsA ? task.ours : baseline,
        methodB: oursIsA ? baseline : task.ours,
        urlA: sample.cells[oursIsA ? task.ours : baseline],
        urlB: sample.cells[oursIsA ? baseline : task.ours],
      };
    });
    shuffle(sectionTrials);
    trials.push(...sectionTrials);
  }
  return trials;
}

/* ================================ app state ================================ */

let manifest = null;
let state = null;          // { participant, trials, idx, responses, started, finished, submitted }
let viewerA = null;
let viewerB = null;
let trialT0 = 0;
let trialModesUsed = null; // Set
let trialFullscreenUsed = false;
let practiceViewer = null;

const MODES = [
  { id: "sbs", label: "Side-by-side", key: "1" },
  { id: "anaglyph", label: "Anaglyph 3D", key: "2" },
  { id: "wiggle", label: "Wiggle", key: "3" },
  { id: "right", label: "Right eye only", key: "4" },
];

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  window.scrollTo(0, 0);
}

/* ------------------------------- intro ------------------------------- */

async function init() {
  try {
    const resp = await fetch("manifest.json", { cache: "no-store" });
    manifest = await resp.json();
  } catch (e) {
    $("#intro-error").textContent =
      "Could not load manifest.json - run prepare_study_assets.py first, and serve this folder over HTTP (python serve_study.py).";
    $("#intro-error").style.display = "block";
    showScreen("screen-intro");
    return;
  }

  $("#study-title").textContent = manifest.title || "Stereo generation user study";
  const nTasks = manifest.tasks.filter((t) => t.samples.length > 0).length;
  $("#intro-task-summary").textContent =
    `${nTasks} short sections (images and videos), about ${manifest.est_minutes || 15} minutes in total.`;

  const saved = loadState();
  if (saved && !saved.finished && saved.trials && saved.idx < saved.trials.length) {
    $("#resume-banner").style.display = "block";
    $("#resume-info").textContent =
      `Found an unfinished session (${saved.idx}/${saved.trials.length} comparisons done).`;
    $("#btn-resume").onclick = () => {
      state = saved;
      startTrial();
    };
    $("#btn-discard").onclick = () => {
      clearState();
      $("#resume-banner").style.display = "none";
    };
  }

  $("#btn-start").onclick = onStart;
  showScreen("screen-intro");
}

function onStart() {
  const glasses = $("#f-glasses").value;
  const participant = {
    id: uid(),
    name: $("#f-name").value.trim(),
    glasses: glasses === "yes",
    display: $("#f-display").value,
    screen: `${window.screen.width}x${window.screen.height}`,
    ua: navigator.userAgent,
  };
  state = {
    participant,
    trials: buildTrials(manifest),
    idx: 0,
    responses: [],
    started: new Date().toISOString(),
    finished: null,
    submitted: false,
    manifest_version: manifest.version || null,
  };
  saveState();
  startPractice();
}

/* ------------------------------ practice ------------------------------ */

function startPractice() {
  showScreen("screen-practice");
  const p = manifest.practice;
  const cell = $("#practice-cell");
  if (practiceViewer) practiceViewer.destroy();
  practiceViewer = new StereoViewer(cell, { kind: p.kind, url: p.url }, () => {});
  practiceViewer.setMode(defaultMode());

  buildModeSwitch($("#practice-mode-switch"), (mode) => practiceViewer.setMode(mode));
  setModeSwitchActive($("#practice-mode-switch"), defaultMode());
  $("#practice-fullscreen").onclick = () => requestFs(cell);
  $("#btn-begin").onclick = () => {
    practiceViewer.destroy();
    practiceViewer = null;
    startTrial();
  };
  updateGlassesNote();
}

function defaultMode() {
  return state && state.participant.glasses ? "anaglyph" : "wiggle";
}

function updateGlassesNote() {
  const has = state && state.participant.glasses;
  $$(".glasses-note").forEach((el) => {
    el.textContent = has
      ? "You have red-cyan glasses: Anaglyph 3D is the best way to judge depth. Use the other modes to inspect image quality."
      : "Without red-cyan glasses, Wiggle is the best way to perceive the depth; Side-by-side and Right eye show the raw views.";
  });
}

/* ------------------------------- trials ------------------------------- */

function buildModeSwitch(container, onPick) {
  container.innerHTML = "";
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.mode = m.id;
    b.innerHTML = `${m.label}<span class="key-hint">${m.key}</span>`;
    b.onclick = () => {
      onPick(m.id);
      setModeSwitchActive(container, m.id);
    };
    container.appendChild(b);
  }
}

function setModeSwitchActive(container, mode) {
  $$("button", container).forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}

function requestFs(el) {
  trialFullscreenUsed = true;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) {
    const p = fn.call(el);
    if (p && p.catch) p.catch(() => {});
  }
}

function taskById(id) {
  return manifest.tasks.find((t) => t.id === id);
}

function startTrial() {
  if (state.idx >= state.trials.length) return finishStudy();
  const trial = state.trials[state.idx];
  const task = taskById(trial.task);

  showScreen("screen-trial");
  updateGlassesNote();

  // header
  $("#trial-task-badge").textContent = task.title + (task.mock ? " (placeholder)" : "");
  $("#trial-task-badge").classList.toggle("mock", !!task.mock);
  const inTask = state.trials.filter((t) => t.task === trial.task);
  const idxInTask = inTask.indexOf(trial) + 1;
  $("#trial-count").textContent =
    `Comparison ${idxInTask} of ${inTask.length} in this section · ${state.idx + 1}/${state.trials.length} overall`;
  $("#progress-fill").style.width = `${(100 * state.idx) / state.trials.length}%`;

  // context
  const ctxEl = $("#trial-context");
  if (trial.context) {
    ctxEl.innerHTML = `<em>${escapeHtml(task.context_label || "Prompt")}:</em> “${escapeHtml(trial.context)}”`;
  } else {
    ctxEl.innerHTML = `<em>${escapeHtml(task.context_label || "")}</em>`;
  }
  const thumb = $("#trial-input-thumb");
  if (trial.input) {
    thumb.src = trial.input;
    thumb.style.display = "";
    thumb.onclick = () => window.open(trial.input, "_blank");
  } else {
    thumb.style.display = "none";
  }

  // viewers
  if (viewerA) viewerA.destroy();
  if (viewerB) viewerB.destroy();
  trialModesUsed = new Set([defaultMode()]);
  trialFullscreenUsed = false;
  const onModeUse = (m) => trialModesUsed.add(m);
  viewerA = new StereoViewer($("#cell-a"), { kind: trial.kind, url: trial.urlA }, onModeUse);
  viewerB = new StereoViewer($("#cell-b"), { kind: trial.kind, url: trial.urlB }, onModeUse);
  const mode = defaultMode();
  viewerA.setMode(mode);
  viewerB.setMode(mode);
  setModeSwitchActive($("#trial-mode-switch"), mode);

  buildModeSwitch($("#trial-mode-switch"), (m) => {
    viewerA.setMode(m);
    viewerB.setMode(m);
  });
  setModeSwitchActive($("#trial-mode-switch"), mode);

  $("#btn-fs-pair").onclick = () => requestFs($("#compare-area"));
  $("#btn-replay").onclick = () => { viewerA.restart(); viewerB.restart(); };
  $("#btn-replay").style.display = trial.kind === "video" ? "" : "none";
  $("#fs-a").onclick = () => requestFs($("#cell-a"));
  $("#fs-b").onclick = () => requestFs($("#cell-b"));

  // questions
  $$(".choice-btn").forEach((b) => b.classList.remove("selected"));
  $("#q-comment").value = "";
  $("#btn-next").disabled = true;
  $("#btn-next").onclick = onNextTrial;
  trialT0 = performance.now();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function currentAnswers() {
  const a = {};
  for (const q of ["depth", "quality"]) {
    const sel = $(`.choice-btn.selected[data-q="${q}"]`);
    a[q] = sel ? sel.dataset.choice : null;
  }
  return a;
}

function onChoiceClick(ev) {
  const btn = ev.currentTarget;
  $$(`.choice-btn[data-q="${btn.dataset.q}"]`).forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  const a = currentAnswers();
  $("#btn-next").disabled = !(a.depth && a.quality);
}

function onNextTrial() {
  const trial = state.trials[state.idx];
  const a = currentAnswers();
  if (!a.depth || !a.quality) return;
  state.responses.push({
    task: trial.task,
    mock: trial.mock,
    sample: trial.sample,
    methodA: trial.methodA,
    methodB: trial.methodB,
    q_depth: a.depth,          // "A" | "B"
    q_quality: a.quality,      // "A" | "B"
    comment: $("#q-comment").value.trim() || null,
    modes_used: [...trialModesUsed],
    fullscreen_used: trialFullscreenUsed,
    seconds: Math.round((performance.now() - trialT0) / 100) / 10,
    at: new Date().toISOString(),
  });
  state.idx += 1;
  saveState();

  if (state.idx >= state.trials.length) return finishStudy();

  const next = state.trials[state.idx];
  if (next.task !== trial.task) return showBreak(next.task);
  startTrial();
}

function showBreak(nextTaskId) {
  if (viewerA) { viewerA.destroy(); viewerA = null; }
  if (viewerB) { viewerB.destroy(); viewerB = null; }
  const task = taskById(nextTaskId);
  showScreen("screen-break");
  $("#break-title").textContent = "Section complete";
  $("#break-next").innerHTML =
    `Next up: <strong>${escapeHtml(task.title)}</strong>` +
    (task.mock ? ` <span class="muted">(placeholder samples – answer anyway, it helps us test the flow)</span>` : "");
  $("#break-desc").textContent = task.description || "";
  $("#btn-continue").onclick = startTrial;
}

/* ------------------------------- finish ------------------------------- */

function resultPayload() {
  return {
    version: 1,
    participant: state.participant,
    manifest_version: state.manifest_version,
    started: state.started,
    finished: state.finished,
    n_trials: state.trials.length,
    responses: state.responses,
  };
}

async function finishStudy() {
  if (viewerA) { viewerA.destroy(); viewerA = null; }
  if (viewerB) { viewerB.destroy(); viewerB = null; }
  state.finished = state.finished || new Date().toISOString();
  saveState();
  showScreen("screen-finish");
  $("#progress-fill").style.width = "100%";

  const payload = resultPayload();
  $("#result-json").value = JSON.stringify(payload, null, 2);
  $("#btn-download").onclick = downloadResults;
  $("#btn-copy").onclick = () => {
    navigator.clipboard?.writeText($("#result-json").value);
    $("#btn-copy").textContent = "Copied!";
    setTimeout(() => ($("#btn-copy").textContent = "Copy to clipboard"), 1500);
  };
  $("#btn-restart").onclick = () => {
    clearState();
    location.reload();
  };

  const statusEl = $("#submit-status");
  if (state.submitted) {
    statusEl.textContent = "✓ Your answers were submitted. Thank you!";
    statusEl.className = "submit-status ok";
    return;
  }
  statusEl.textContent = "Submitting your answers…";
  statusEl.className = "submit-status";
  try {
    // manifest.submit_url lets a statically-hosted copy (e.g. GitHub Pages) post to an
    // external collector such as a Google Apps Script. text/plain keeps the request
    // "simple" (no CORS preflight), which such collectors require; serve_study.py
    // parses the body regardless of content type.
    const resp = await fetch(manifest.submit_url || "submit", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    state.submitted = true;
    saveState();
    statusEl.textContent = "✓ Your answers were submitted automatically. Thank you!";
    statusEl.className = "submit-status ok";
    $("#manual-submit").style.display = "none";
  } catch (e) {
    statusEl.textContent =
      "Automatic submission is not available on this server – please use the download button below and send us the file.";
    statusEl.className = "submit-status fail";
    $("#manual-submit").style.display = "";
  }
}

function downloadResults() {
  const blob = new Blob([$("#result-json").value], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stereo_study_${state.participant.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------ keyboard ------------------------------ */

document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA") return;
  const onTrial = $("#screen-trial").classList.contains("active");
  const onPractice = $("#screen-practice").classList.contains("active");
  if (!onTrial && !onPractice) return;

  const modeByKey = { 1: "sbs", 2: "anaglyph", 3: "wiggle", 4: "right" };
  if (modeByKey[ev.key]) {
    const m = modeByKey[ev.key];
    if (onPractice && practiceViewer) {
      practiceViewer.setMode(m);
      setModeSwitchActive($("#practice-mode-switch"), m);
    }
    if (onTrial && viewerA && viewerB) {
      viewerA.setMode(m);
      viewerB.setMode(m);
      setModeSwitchActive($("#trial-mode-switch"), m);
    }
  } else if (ev.key === "f" && onTrial) {
    requestFs($("#compare-area"));
  } else if (ev.key === " " && onTrial && viewerA) {
    ev.preventDefault();
    viewerA.togglePlay();
    viewerB.togglePlay();
  }
});

/* -------------------------------- boot -------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  $$(".choice-btn").forEach((b) => b.addEventListener("click", onChoiceClick));
  init();
});
