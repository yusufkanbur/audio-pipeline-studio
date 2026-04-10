const els = {
  ffmpegStatus: document.getElementById("ffmpegStatus"),
  inputDir: document.getElementById("inputDir"),
  outputDir: document.getElementById("outputDir"),
  preset: document.getElementById("preset"),
  sampleRate: document.getElementById("sampleRate"),
  bitDepth: document.getElementById("bitDepth"),
  fadeInMs: document.getElementById("fadeInMs"),
  fadeOutMs: document.getElementById("fadeOutMs"),
  peakDb: document.getElementById("peakDb"),
  lufsMusic: document.getElementById("lufsMusic"),
  lufsSfx: document.getElementById("lufsSfx"),
  highpassHz: document.getElementById("highpassHz"),
  trimSilence: document.getElementById("trimSilence"),
  trimDb: document.getElementById("trimDb"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  scanBtn: document.getElementById("scanBtn"),
  processApprovedBtn: document.getElementById("processApprovedBtn"),
  processAllBtn: document.getElementById("processAllBtn"),
  runQuickQcBtn: document.getElementById("runQuickQcBtn"),
  fileSort: document.getElementById("fileSort"),
  searchInput: document.getElementById("searchInput"),
  fileList: document.getElementById("fileList"),
  fileCount: document.getElementById("fileCount"),
  approvedCount: document.getElementById("approvedCount"),
  selectedName: document.getElementById("selectedName"),
  selectedInfo: document.getElementById("selectedInfo"),
  waveformCanvas: document.getElementById("waveformCanvas"),
  trimStartLabel: document.getElementById("trimStartLabel"),
  trimEndLabel: document.getElementById("trimEndLabel"),
  trimCutLeftLabel: document.getElementById("trimCutLeftLabel"),
  trimCutRightLabel: document.getElementById("trimCutRightLabel"),
  trimKeepLabel: document.getElementById("trimKeepLabel"),
  trimRemovedLabel: document.getElementById("trimRemovedLabel"),
  playheadLabel: document.getElementById("playheadLabel"),
  resetTrimBtn: document.getElementById("resetTrimBtn"),
  fileFadeMode: document.getElementById("fileFadeMode"),
  fileFadeSeconds: document.getElementById("fileFadeSeconds"),
  applyFileFadeBtn: document.getElementById("applyFileFadeBtn"),
  fileFadeEffectiveLabel: document.getElementById("fileFadeEffectiveLabel"),
  qcDurationLabel: document.getElementById("qcDurationLabel"),
  qcFormatLabel: document.getElementById("qcFormatLabel"),
  qcMaxLabel: document.getElementById("qcMaxLabel"),
  qcMeanLabel: document.getElementById("qcMeanLabel"),
  qcClipLabel: document.getElementById("qcClipLabel"),
  qcFadeLabel: document.getElementById("qcFadeLabel"),
  qcStatusLabel: document.getElementById("qcStatusLabel"),
  audioPlayer: document.getElementById("audioPlayer"),
  previewPlayer: document.getElementById("previewPlayer"),
  previewWaveformCanvas: document.getElementById("previewWaveformCanvas"),
  approveBtn: document.getElementById("approveBtn"),
  unapproveBtn: document.getElementById("unapproveBtn"),
  previewBtn: document.getElementById("previewBtn"),
  loopSelectionBtn: document.getElementById("loopSelectionBtn"),
  jobProgressBar: document.getElementById("jobProgressBar"),
  jobStatus: document.getElementById("jobStatus"),
  jobErrors: document.getElementById("jobErrors"),
};

const MIN_TRIM_GAP_SECONDS = 0.01;

let appState = {
  config: null,
  files: [],
  selectedPath: null,
  jobId: null,
  audioContext: null,
  waveformData: null,
  waveformDurationSec: 0,
  trimStartSec: 0,
  trimEndSec: 0,
  playheadSec: 0,
  dragHandle: null,
  selectionLoopActive: false,
  loopRafId: null,
  previewWaveformData: null,
};

function fmtBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getGlobalFadeSeconds() {
  if (!appState.config) return 0;
  const ms = clampNumber(appState.config.fade_in_ms, 0, 600000, 0);
  return ms / 1000.0;
}

function normalizeFileFadeMode(mode) {
  const v = String(mode || "inherit").toLowerCase();
  if (v === "off" || v === "custom" || v === "inherit") return v;
  return "inherit";
}

function fileFadeFromFile(file) {
  const mode = normalizeFileFadeMode(file?.fade_in_mode);
  const seconds = clampNumber(file?.fade_in_seconds, 0, 600, 0);
  return { mode, seconds };
}

function effectiveFadeSeconds(mode, customSeconds) {
  if (mode === "off") return 0;
  if (mode === "custom") return clampNumber(customSeconds, 0, 600, 0);
  return getGlobalFadeSeconds();
}

function setFileFadeControlsDisabled(disabled) {
  if (els.fileFadeMode) els.fileFadeMode.disabled = disabled;
  if (els.fileFadeSeconds) els.fileFadeSeconds.disabled = disabled;
  if (els.applyFileFadeBtn) els.applyFileFadeBtn.disabled = disabled;
}

function updateFileFadeUiState() {
  if (!els.fileFadeMode || !els.fileFadeSeconds) return;
  const mode = normalizeFileFadeMode(els.fileFadeMode.value);
  els.fileFadeSeconds.disabled = mode !== "custom" || !appState.selectedPath;
}

function updateFileFadeEffectiveLabel(mode, seconds) {
  if (!els.fileFadeEffectiveLabel) return;
  const m = normalizeFileFadeMode(mode);
  const eff = effectiveFadeSeconds(m, seconds);
  const suffix = m === "inherit" ? " (inherit)" : m === "off" ? " (off)" : " (custom)";
  els.fileFadeEffectiveLabel.textContent = `Effective Fade In: ${eff.toFixed(2)}s${suffix}`;
}

function populateFileFadeControls(file) {
  if (!els.fileFadeMode || !els.fileFadeSeconds) return;
  if (!file) {
    if (els.fileFadeMode) els.fileFadeMode.value = "inherit";
    if (els.fileFadeSeconds) els.fileFadeSeconds.value = "0.0";
    updateFileFadeUiState();
    updateFileFadeEffectiveLabel("inherit", 0);
    setFileFadeControlsDisabled(true);
    return;
  }

  const { mode, seconds } = fileFadeFromFile(file);
  els.fileFadeMode.value = mode;
  els.fileFadeSeconds.value = seconds.toFixed(1);
  setFileFadeControlsDisabled(false);
  updateFileFadeUiState();
  updateFileFadeEffectiveLabel(mode, seconds);
}

function clearPreviewWaveformCanvas(message = "Render preview to view processed waveform") {
  const canvas = els.previewWaveformCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0f131a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2d3748";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.fillStyle = "#9ca3af";
  ctx.font = `${12 * dpr}px sans-serif`;
  ctx.fillText(message, 12 * dpr, 20 * dpr);
}

function resetQcPanel() {
  if (els.qcDurationLabel) els.qcDurationLabel.textContent = "Duration: --";
  if (els.qcFormatLabel) els.qcFormatLabel.textContent = "Format: --";
  if (els.qcMaxLabel) els.qcMaxLabel.textContent = "Max Volume: --";
  if (els.qcMeanLabel) els.qcMeanLabel.textContent = "Mean Volume: --";
  if (els.qcClipLabel) els.qcClipLabel.textContent = "Clipping Risk: --";
  if (els.qcStatusLabel) els.qcStatusLabel.textContent = "QC status: idle";
  updateQcFadeLabelFromSelection();
}

function updateQcFadeLabelFromSelection() {
  if (!els.qcFadeLabel) return;
  const file = selectedFile();
  if (!file) {
    els.qcFadeLabel.textContent = "Effective Fade In: --";
    return;
  }
  const { mode, seconds } = fileFadeFromFile(file);
  const eff = effectiveFadeSeconds(mode, seconds);
  els.qcFadeLabel.textContent = `Effective Fade In: ${eff.toFixed(2)}s`;
}

function formatDb(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
  return `${Number(value).toFixed(2)} dB`;
}

async function runQuickQcForSelectedFile() {
  const file = selectedFile();
  if (!file) return;
  if (els.qcStatusLabel) els.qcStatusLabel.textContent = "QC status: running...";

  const data = await api("/api/qc", "POST", { path: file.path });
  const qc = data.qc || {};

  if (els.qcDurationLabel) {
    els.qcDurationLabel.textContent = `Duration: ${qc.duration_label || "--"}`;
  }
  if (els.qcFormatLabel) {
    const sr = qc.sample_rate ? `${qc.sample_rate} Hz` : "--";
    const ch = qc.channels ?? "--";
    const bits = qc.bits_per_sample ?? "--";
    els.qcFormatLabel.textContent = `Format: ${sr}, Ch ${ch}, ${bits}-bit`;
  }
  if (els.qcMaxLabel) {
    els.qcMaxLabel.textContent = `Max Volume: ${formatDb(qc.max_volume_db)}`;
  }
  if (els.qcMeanLabel) {
    els.qcMeanLabel.textContent = `Mean Volume: ${formatDb(qc.mean_volume_db)}`;
  }
  if (els.qcClipLabel) {
    els.qcClipLabel.textContent = `Clipping Risk: ${qc.clipping_risk ? "Yes" : "No"}`;
  }
  if (els.qcStatusLabel) {
    const notes = Array.isArray(qc.notes) && qc.notes.length > 0 ? ` | ${qc.notes.join(" ")}` : "";
    els.qcStatusLabel.textContent = `QC status: done${notes}`;
  }
  updateQcFadeLabelFromSelection();
}

async function api(path, method = "GET", body = null) {
  const options = { method, headers: {} };
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function setStatus(text, kind = "warn") {
  els.ffmpegStatus.className = `status-pill status-${kind}`;
  els.ffmpegStatus.textContent = text;
}

function readConfigFromForm() {
  return {
    input_dir: els.inputDir.value.trim(),
    output_dir: els.outputDir.value.trim(),
    preset: els.preset.value,
    sample_rate: Number(els.sampleRate.value || 48000),
    bit_depth: Number(els.bitDepth.value || 24),
    fade_in_ms: Number(els.fadeInMs.value || 0),
    fade_out_ms: Number(els.fadeOutMs.value || 0),
    peak_db: Number(els.peakDb.value || -1),
    lufs_music: Number(els.lufsMusic.value || -16),
    lufs_sfx: Number(els.lufsSfx.value || -18),
    highpass_hz: Number(els.highpassHz.value || 30),
    trim_silence: els.trimSilence.checked,
    trim_db: Number(els.trimDb.value || -50),
  };
}

function writeConfigToForm(config) {
  els.inputDir.value = config.input_dir || "";
  els.outputDir.value = config.output_dir || "";
  els.preset.value = config.preset || "music";
  els.sampleRate.value = config.sample_rate ?? 48000;
  els.bitDepth.value = config.bit_depth ?? 24;
  els.fadeInMs.value = config.fade_in_ms ?? 10;
  els.fadeOutMs.value = config.fade_out_ms ?? 120;
  els.peakDb.value = config.peak_db ?? -1;
  els.lufsMusic.value = config.lufs_music ?? -16;
  els.lufsSfx.value = config.lufs_sfx ?? -18;
  els.highpassHz.value = config.highpass_hz ?? 30;
  els.trimSilence.checked = Boolean(config.trim_silence);
  els.trimDb.value = config.trim_db ?? -50;
}

function filteredFiles() {
  const q = els.searchInput.value.trim().toLowerCase();
  const base = q
    ? appState.files.filter((f) => f.relative_path.toLowerCase().includes(q))
    : [...appState.files];

  const mode = els.fileSort?.value || "name_asc";
  const getDuration = (f) =>
    typeof f.duration_seconds === "number" && Number.isFinite(f.duration_seconds)
      ? f.duration_seconds
      : null;

  base.sort((a, b) => {
    if (mode === "duration_asc" || mode === "duration_desc") {
      const da = getDuration(a);
      const db = getDuration(b);
      if (da === null && db === null) return a.relative_path.localeCompare(b.relative_path);
      if (da === null) return 1;
      if (db === null) return -1;
      return mode === "duration_asc" ? da - db : db - da;
    }
    return a.relative_path.localeCompare(b.relative_path);
  });

  return base;
}

function renderFileList() {
  const list = filteredFiles();
  els.fileList.innerHTML = "";
  let approvedCount = 0;
  appState.files.forEach((f) => {
    if (f.approved) approvedCount += 1;
  });

  for (const file of list) {
    const item = document.createElement("div");
    item.className = "file-item";
    if (file.path === appState.selectedPath) item.classList.add("active");
    item.onclick = () => selectFile(file.path);

    const dot = document.createElement("div");
    dot.className = `approval-dot ${file.approved ? "approved" : ""}`;

    const nameWrap = document.createElement("div");
    nameWrap.innerHTML = `<div class="name">${file.name}</div><div class="sub">${file.relative_path}</div>`;

    const dur = document.createElement("div");
    dur.className = "dur";
    dur.textContent = file.duration_label;

    const size = document.createElement("div");
    size.className = "size";
    size.textContent = fmtBytes(file.size_bytes);

    item.append(dot, nameWrap, dur, size);
    els.fileList.appendChild(item);
  }

  els.fileCount.textContent = `${appState.files.length} file`;
  els.approvedCount.textContent = `${approvedCount} approved`;
}

function selectedFile() {
  return appState.files.find((f) => f.path === appState.selectedPath) || null;
}

async function selectFile(path) {
  appState.selectedPath = path;
  const file = selectedFile();
  renderFileList();
  if (!file) return;

  els.selectedName.textContent = file.name;
  els.selectedInfo.textContent = `${file.duration_label} | ${fmtBytes(file.size_bytes)} | ${file.relative_path}`;
  els.approveBtn.disabled = false;
  els.unapproveBtn.disabled = false;
  els.previewBtn.disabled = false;
  if (els.runQuickQcBtn) els.runQuickQcBtn.disabled = false;
  appState.selectionLoopActive = false;
  stopLoopRaf();
  updateLoopSelectionButton();
  els.audioPlayer.src = `/api/audio?path=${encodeURIComponent(file.path)}`;
  els.previewPlayer.src = "";
  clearPreviewWaveformCanvas();
  populateFileFadeControls(file);
  resetQcPanel();
  await loadWaveform(file.path);
}

function syncTrimLabels() {
  const total = appState.waveformDurationSec || 0;
  const start = Math.max(0, Math.min(appState.trimStartSec || 0, total));
  const end = Math.max(start, Math.min(appState.trimEndSec || total, total));
  const cutLeft = Math.max(0, start);
  const cutRight = Math.max(0, total - end);
  const keep = Math.max(0, end - start);
  const removed = Math.max(0, cutLeft + cutRight);
  const playhead = Math.max(0, Math.min(appState.playheadSec || 0, total));

  els.trimStartLabel.textContent = `Start: ${fmtTime(start)}`;
  els.trimEndLabel.textContent = `End: ${fmtTime(end)}`;
  if (els.trimCutLeftLabel) {
    els.trimCutLeftLabel.textContent = `Cut Left: ${fmtTime(cutLeft)}`;
  }
  if (els.trimCutRightLabel) {
    els.trimCutRightLabel.textContent = `Cut Right: ${fmtTime(cutRight)}`;
  }
  els.trimKeepLabel.textContent = `Keep: ${fmtTime(keep)}`;
  els.trimRemovedLabel.textContent = `Removed: ${fmtTime(removed)}`;
  if (els.playheadLabel) {
    els.playheadLabel.textContent = `Now: ${fmtTime(playhead)}`;
  }
}

function getCanvasGeometry() {
  const canvas = els.waveformCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  return { canvas, rect, dpr, width: canvas.width, height: canvas.height };
}

function secondsToCanvasX(seconds, durationSec, width) {
  if (durationSec <= 0) return 0;
  const clamped = Math.max(0, Math.min(seconds, durationSec));
  return (clamped / durationSec) * width;
}

function pointerEventToSeconds(event) {
  const canvas = els.waveformCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(0, Math.min((event.clientX - rect.left) * dpr, canvas.width));
  const duration = appState.waveformDurationSec || 0;
  if (duration <= 0 || canvas.width <= 0) return 0;
  return (px / canvas.width) * duration;
}

function applyTrimStart(newStart) {
  const duration = appState.waveformDurationSec || 0;
  const gap = Math.max(MIN_TRIM_GAP_SECONDS, duration * 0.001);
  appState.trimStartSec = Math.max(0, Math.min(newStart, appState.trimEndSec - gap));
}

function applyTrimEnd(newEnd) {
  const duration = appState.waveformDurationSec || 0;
  const gap = Math.max(MIN_TRIM_GAP_SECONDS, duration * 0.001);
  appState.trimEndSec = Math.min(duration, Math.max(newEnd, appState.trimStartSec + gap));
}

function renderWaveform() {
  const { canvas, dpr, width, height } = getCanvasGeometry();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0f131a";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#2d3748";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const data = appState.waveformData;
  const duration = appState.waveformDurationSec || 0;
  if (!data || data.length === 0 || duration <= 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `${14 * dpr}px sans-serif`;
    ctx.fillText("Waveform preview unavailable", 20 * dpr, 30 * dpr);
    syncTrimLabels();
    return;
  }

  const step = Math.ceil(data.length / width);
  const amp = height / 2;
  ctx.beginPath();
  ctx.strokeStyle = "#d4a84f";
  ctx.lineWidth = Math.max(1, dpr);
  for (let x = 0; x < width; x += 1) {
    let min = 1.0;
    let max = -1.0;
    const start = x * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i += 1) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, (1 + min) * amp);
    ctx.lineTo(x, (1 + max) * amp);
  }
  ctx.stroke();

  const startX = secondsToCanvasX(appState.trimStartSec, duration, width);
  const endX = secondsToCanvasX(appState.trimEndSec, duration, width);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, startX, height);
  ctx.fillRect(endX, 0, width - endX, height);

  ctx.strokeStyle = "rgba(212, 168, 79, 0.9)";
  ctx.lineWidth = Math.max(1.5, dpr);
  ctx.strokeRect(startX, 0, Math.max(0, endX - startX), height);

  const drawHandle = (x, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, dpr);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = color;
    const r = 5 * dpr;
    ctx.beginPath();
    ctx.arc(x, 10 * dpr, r, 0, Math.PI * 2);
    ctx.fill();
  };

  drawHandle(startX, "#34d399");
  drawHandle(endX, "#f87171");

  const playheadX = secondsToCanvasX(appState.playheadSec || 0, duration, width);
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = Math.max(1.5, dpr);
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();

  const markerText = fmtTime(appState.playheadSec || 0);
  ctx.font = `${Math.max(11, 11 * dpr)}px sans-serif`;
  const textWidth = ctx.measureText(markerText).width;
  const padding = 4 * dpr;
  const boxHeight = 16 * dpr;
  let textX = playheadX + 6 * dpr;
  if (textX + textWidth + padding * 2 > width - 2 * dpr) {
    textX = playheadX - textWidth - padding * 2 - 6 * dpr;
  }
  textX = Math.max(2 * dpr, textX);
  const textY = 4 * dpr;
  ctx.fillStyle = "rgba(10, 14, 22, 0.85)";
  ctx.fillRect(textX, textY, textWidth + padding * 2, boxHeight);
  ctx.strokeStyle = "rgba(96, 165, 250, 0.85)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeRect(textX, textY, textWidth + padding * 2, boxHeight);
  ctx.fillStyle = "#bfdbfe";
  ctx.fillText(markerText, textX + padding, textY + boxHeight - 4 * dpr);

  syncTrimLabels();
}

async function loadWaveform(path) {
  appState.waveformData = null;
  appState.waveformDurationSec = 0;
  appState.trimStartSec = 0;
  appState.trimEndSec = 0;
  appState.playheadSec = 0;
  updateLoopSelectionButton();
  renderWaveform();

  try {
    if (!appState.audioContext) {
      appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const res = await fetch(`/api/audio?path=${encodeURIComponent(path)}`);
    const buffer = await res.arrayBuffer();
    const audioBuf = await appState.audioContext.decodeAudioData(buffer.slice(0));
    appState.waveformData = audioBuf.getChannelData(0);
    appState.waveformDurationSec = audioBuf.duration || 0;
    appState.trimStartSec = 0;
    appState.trimEndSec = appState.waveformDurationSec;
    appState.playheadSec = 0;
    updateLoopSelectionButton();
    renderWaveform();
  } catch (_) {
    updateLoopSelectionButton();
    renderWaveform();
  }
}

async function drawProcessedWaveform(path) {
  const canvas = els.previewWaveformCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0f131a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2d3748";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  try {
    if (!appState.audioContext) {
      appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const res = await fetch(`/api/audio?path=${encodeURIComponent(path)}`);
    const buffer = await res.arrayBuffer();
    const audioBuf = await appState.audioContext.decodeAudioData(buffer.slice(0));
    appState.previewWaveformData = audioBuf.getChannelData(0);
    const data = appState.previewWaveformData;
    const width = canvas.width;
    const height = canvas.height;
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = Math.max(1, dpr);
    for (let x = 0; x < width; x += 1) {
      let min = 1.0;
      let max = -1.0;
      const start = x * step;
      const end = Math.min(start + step, data.length);
      for (let i = start; i < end; i += 1) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, (1 + min) * amp);
      ctx.lineTo(x, (1 + max) * amp);
    }
    ctx.stroke();
  } catch (_) {
    clearPreviewWaveformCanvas("Processed waveform unavailable");
  }
}

function syncPlayheadFromAudio() {
  const duration = appState.waveformDurationSec || 0;
  if (duration <= 0) {
    appState.playheadSec = 0;
  } else {
    const current = Number(els.audioPlayer.currentTime);
    appState.playheadSec = Number.isFinite(current)
      ? Math.max(0, Math.min(current, duration))
      : 0;
  }
  renderWaveform();
}

function handleCanvasPointerDown(event) {
  if (!appState.waveformData || appState.waveformDurationSec <= 0) return;

  const canvas = els.waveformCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(0, Math.min((event.clientX - rect.left) * dpr, canvas.width));
  const width = canvas.width;
  const duration = appState.waveformDurationSec;
  const startX = secondsToCanvasX(appState.trimStartSec, duration, width);
  const endX = secondsToCanvasX(appState.trimEndSec, duration, width);
  const threshold = 10 * dpr;

  if (Math.abs(px - startX) <= threshold) {
    appState.dragHandle = "start";
  } else if (Math.abs(px - endX) <= threshold) {
    appState.dragHandle = "end";
  } else {
    appState.dragHandle = Math.abs(px - startX) <= Math.abs(px - endX) ? "start" : "end";
  }

  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleCanvasPointerMove(event) {
  if (!appState.dragHandle) return;
  const sec = pointerEventToSeconds(event);
  if (appState.dragHandle === "start") {
    applyTrimStart(sec);
  } else {
    applyTrimEnd(sec);
  }
  updateLoopSelectionButton();
  renderWaveform();
  event.preventDefault();
}

function handleCanvasPointerUp(event) {
  if (!appState.dragHandle) return;
  const canvas = els.waveformCanvas;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch (_) {
    // no-op
  }
  appState.dragHandle = null;
}

function resetTrimSelection() {
  if (!appState.waveformDurationSec) return;
  appState.trimStartSec = 0;
  appState.trimEndSec = appState.waveformDurationSec;
  if (appState.selectionLoopActive) {
    const start = appState.trimStartSec;
    if (Math.abs(els.audioPlayer.currentTime - start) > 0.02) {
      els.audioPlayer.currentTime = start;
    }
  }
  updateLoopSelectionButton();
  renderWaveform();
}

function stopLoopRaf() {
  if (appState.loopRafId !== null) {
    cancelAnimationFrame(appState.loopRafId);
    appState.loopRafId = null;
  }
}

function loopTick() {
  if (!appState.selectionLoopActive) {
    stopLoopRaf();
    return;
  }
  enforceSelectionLoop();
  appState.loopRafId = requestAnimationFrame(loopTick);
}

function selectionDurationSeconds() {
  return Math.max(0, (appState.trimEndSec || 0) - (appState.trimStartSec || 0));
}

function updateLoopSelectionButton() {
  if (!els.loopSelectionBtn) return;
  const hasSource = Boolean(appState.selectedPath) && appState.waveformDurationSec > 0;
  const hasRange = selectionDurationSeconds() > MIN_TRIM_GAP_SECONDS;
  if (appState.selectionLoopActive && (!hasSource || !hasRange)) {
    stopSelectionLoop(false);
  }
  els.loopSelectionBtn.disabled = !(hasSource && hasRange);
  els.loopSelectionBtn.textContent = appState.selectionLoopActive
    ? "Stop Selection Loop"
    : "Play Selection Loop";
}

function enforceSelectionLoop() {
  if (!appState.selectionLoopActive) return;
  const player = els.audioPlayer;
  const start = appState.trimStartSec || 0;
  const end = appState.trimEndSec || appState.waveformDurationSec || 0;
  if (end <= start + MIN_TRIM_GAP_SECONDS) return;
  if (player.paused) return;

  const t = Number(player.currentTime) || 0;
  if (t < start || t >= end - 0.005) {
    const overshoot = t > end ? t - end : 0;
    const target = Math.min(end - 0.002, Math.max(start, start + overshoot));
    player.currentTime = target;
  }
}

function startSelectionLoop() {
  if (!appState.selectedPath) return;
  if (selectionDurationSeconds() <= MIN_TRIM_GAP_SECONDS) return;
  appState.selectionLoopActive = true;
  const start = appState.trimStartSec || 0;
  const end = appState.trimEndSec || appState.waveformDurationSec || 0;
  if (els.audioPlayer.currentTime < start || els.audioPlayer.currentTime >= end - 0.005) {
    els.audioPlayer.currentTime = start;
  }
  els.audioPlayer.play().catch(() => {});
  updateLoopSelectionButton();
  stopLoopRaf();
  appState.loopRafId = requestAnimationFrame(loopTick);
}

function stopSelectionLoop(shouldPause = true) {
  if (!appState.selectionLoopActive) return;
  appState.selectionLoopActive = false;
  stopLoopRaf();
  if (shouldPause) {
    els.audioPlayer.pause();
  }
  updateLoopSelectionButton();
}

async function saveConfig() {
  const payload = readConfigFromForm();
  const data = await api("/api/config", "POST", payload);
  appState.config = data.config;
  writeConfigToForm(data.config);
}

async function scanFiles() {
  const data = await api("/api/scan", "POST", {});
  appState.files = data.files || [];
  if (appState.selectedPath && !appState.files.some((f) => f.path === appState.selectedPath)) {
    appState.selectedPath = null;
    els.selectedName.textContent = "No selection";
    els.selectedInfo.textContent = "--";
    els.audioPlayer.src = "";
    els.previewPlayer.src = "";
    appState.waveformData = null;
    appState.waveformDurationSec = 0;
    appState.trimStartSec = 0;
    appState.trimEndSec = 0;
    appState.playheadSec = 0;
    appState.selectionLoopActive = false;
    stopLoopRaf();
    renderWaveform();
    els.approveBtn.disabled = true;
    els.unapproveBtn.disabled = true;
    els.previewBtn.disabled = true;
    if (els.runQuickQcBtn) els.runQuickQcBtn.disabled = true;
    clearPreviewWaveformCanvas();
    populateFileFadeControls(null);
    resetQcPanel();
    updateLoopSelectionButton();
  }
  renderFileList();
  updateLoopSelectionButton();
}

async function setApproved(approved) {
  const file = selectedFile();
  if (!file) return;
  await api("/api/approve", "POST", { path: file.path, approved });
  file.approved = approved;
  renderFileList();
}

async function applySelectedFileFade() {
  const file = selectedFile();
  if (!file || !els.fileFadeMode || !els.fileFadeSeconds) return;
  const mode = normalizeFileFadeMode(els.fileFadeMode.value);
  const seconds = clampNumber(els.fileFadeSeconds.value, 0, 600, 0);

  const data = await api("/api/file/fadein", "POST", {
    path: file.path,
    mode,
    seconds,
  });

  file.fade_in_mode = data.fade_in_mode;
  file.fade_in_seconds = data.fade_in_seconds;
  populateFileFadeControls(file);
  updateQcFadeLabelFromSelection();
  els.jobStatus.textContent = `File fade saved (${data.fade_in_mode}, ${Number(data.effective_fade_in_ms || 0) / 1000}s).`;
}

async function renderPreview() {
  const file = selectedFile();
  if (!file) return;
  els.jobStatus.textContent = "Rendering preview...";
  const data = await api("/api/preview", "POST", { path: file.path });
  els.previewPlayer.src = `/api/audio?path=${encodeURIComponent(data.preview_path)}`;
  await drawProcessedWaveform(data.preview_path);
  els.jobStatus.textContent = "Preview ready.";
}

function setJobProgress(percent) {
  const p = Math.max(0, Math.min(percent, 100));
  els.jobProgressBar.style.width = `${p}%`;
}

async function startProcess(mode) {
  const data = await api("/api/process/start", "POST", { mode });
  appState.jobId = data.job_id;
  setJobProgress(0);
  els.jobErrors.innerHTML = "";
  pollJob();
}

async function pollJob() {
  if (!appState.jobId) return;
  try {
    const data = await api(`/api/process/status/${appState.jobId}`, "GET");
    const job = data.job;
    const pct = job.total > 0 ? (job.current_index / job.total) * 100 : 0;
    setJobProgress(job.status === "done" ? 100 : pct);

    if (job.status === "running") {
      const fileName = job.current_file ? job.current_file.split("\\").pop() : "";
      els.jobStatus.textContent = `Processing ${job.current_index}/${job.total}${fileName ? ` | ${fileName}` : ""}`;
      setTimeout(pollJob, 600);
      return;
    }

    const errorCount = (job.errors || []).length;
    els.jobStatus.textContent = `Done. Processed: ${job.processed}, Errors: ${errorCount}`;
    if (errorCount > 0) {
      els.jobErrors.innerHTML = job.errors
        .map((e) => `<div>* ${e.file.split("\\").pop()}: ${e.error}</div>`)
        .join("");
    }
    appState.jobId = null;
    await scanFiles();
  } catch (err) {
    els.jobStatus.textContent = `Job polling error: ${err.message}`;
    appState.jobId = null;
  }
}

async function boot() {
  try {
    const health = await api("/api/health");
    appState.config = health.state.config;
    writeConfigToForm(appState.config);

    if (health.ffmpeg_path) {
      setStatus("FFmpeg ready", "ok");
    } else {
      setStatus("FFmpeg missing (set FFMPEG_PATH or install imageio-ffmpeg)", "bad");
    }
    await scanFiles();
    renderWaveform();
    clearPreviewWaveformCanvas();
    populateFileFadeControls(null);
    resetQcPanel();
    if (els.runQuickQcBtn) els.runQuickQcBtn.disabled = true;
    updateLoopSelectionButton();
  } catch (err) {
    setStatus(`Startup error: ${err.message}`, "bad");
  }
}

els.saveConfigBtn.onclick = async () => {
  try {
    await saveConfig();
    els.jobStatus.textContent = "Config saved.";
  } catch (err) {
    els.jobStatus.textContent = `Save error: ${err.message}`;
  }
};

els.scanBtn.onclick = async () => {
  try {
    await saveConfig();
    await scanFiles();
    els.jobStatus.textContent = "Scan complete.";
  } catch (err) {
    els.jobStatus.textContent = `Scan error: ${err.message}`;
  }
};

els.searchInput.oninput = () => renderFileList();
if (els.fileSort) {
  els.fileSort.onchange = () => renderFileList();
}
if (els.fileFadeMode) {
  els.fileFadeMode.onchange = () => {
    updateFileFadeUiState();
    const mode = normalizeFileFadeMode(els.fileFadeMode.value);
    const seconds = clampNumber(els.fileFadeSeconds?.value, 0, 600, 0);
    updateFileFadeEffectiveLabel(mode, seconds);
  };
}
if (els.fileFadeSeconds) {
  els.fileFadeSeconds.oninput = () => {
    const mode = normalizeFileFadeMode(els.fileFadeMode?.value || "inherit");
    const seconds = clampNumber(els.fileFadeSeconds.value, 0, 600, 0);
    updateFileFadeEffectiveLabel(mode, seconds);
  };
}
if (els.applyFileFadeBtn) {
  els.applyFileFadeBtn.onclick = async () => {
    try {
      await applySelectedFileFade();
    } catch (err) {
      els.jobStatus.textContent = `File fade error: ${err.message}`;
    }
  };
}
if (els.runQuickQcBtn) {
  els.runQuickQcBtn.onclick = async () => {
    try {
      await runQuickQcForSelectedFile();
    } catch (err) {
      if (els.qcStatusLabel) els.qcStatusLabel.textContent = `QC status: error (${err.message})`;
    }
  };
}

els.approveBtn.onclick = async () => {
  try {
    await setApproved(true);
  } catch (err) {
    els.jobStatus.textContent = `Approve error: ${err.message}`;
  }
};

els.unapproveBtn.onclick = async () => {
  try {
    await setApproved(false);
  } catch (err) {
    els.jobStatus.textContent = `Unapprove error: ${err.message}`;
  }
};

els.previewBtn.onclick = async () => {
  try {
    await renderPreview();
  } catch (err) {
    els.jobStatus.textContent = `Preview error: ${err.message}`;
  }
};

els.processApprovedBtn.onclick = async () => {
  try {
    await saveConfig();
    await startProcess("approved");
  } catch (err) {
    els.jobStatus.textContent = `Process error: ${err.message}`;
  }
};

els.processAllBtn.onclick = async () => {
  try {
    await saveConfig();
    await startProcess("all");
  } catch (err) {
    els.jobStatus.textContent = `Process error: ${err.message}`;
  }
};

els.resetTrimBtn.onclick = () => resetTrimSelection();
if (els.loopSelectionBtn) {
  els.loopSelectionBtn.onclick = () => {
    if (appState.selectionLoopActive) {
      stopSelectionLoop(true);
    } else {
      startSelectionLoop();
    }
  };
}

els.audioPlayer.addEventListener("loadedmetadata", syncPlayheadFromAudio);
els.audioPlayer.addEventListener("timeupdate", () => {
  syncPlayheadFromAudio();
  enforceSelectionLoop();
});
els.audioPlayer.addEventListener("seeking", syncPlayheadFromAudio);
els.audioPlayer.addEventListener("seeked", syncPlayheadFromAudio);
els.audioPlayer.addEventListener("pause", () => {
  syncPlayheadFromAudio();
  if (appState.selectionLoopActive) {
    stopSelectionLoop(false);
  }
});
els.audioPlayer.addEventListener("ended", () => {
  syncPlayheadFromAudio();
  if (appState.selectionLoopActive) {
    const start = appState.trimStartSec || 0;
    els.audioPlayer.currentTime = start;
    els.audioPlayer.play().catch(() => {});
  }
});
els.audioPlayer.addEventListener("play", () => {
  if (appState.selectionLoopActive && appState.loopRafId === null) {
    appState.loopRafId = requestAnimationFrame(loopTick);
  }
});

els.waveformCanvas.addEventListener("pointerdown", handleCanvasPointerDown);
els.waveformCanvas.addEventListener("pointermove", handleCanvasPointerMove);
els.waveformCanvas.addEventListener("pointerup", handleCanvasPointerUp);
els.waveformCanvas.addEventListener("pointercancel", handleCanvasPointerUp);
els.waveformCanvas.addEventListener("lostpointercapture", () => {
  appState.dragHandle = null;
});

window.addEventListener("resize", () => {
  renderWaveform();
  const src = els.previewPlayer?.src || "";
  if (src.includes("/api/audio?path=")) {
    try {
      const parsed = new URL(src);
      const previewPath = parsed.searchParams.get("path");
      if (previewPath) {
        drawProcessedWaveform(previewPath);
      }
    } catch (_) {
      // no-op
    }
  }
});

boot();
