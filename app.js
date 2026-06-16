"use strict";

const STORAGE_KEY = "poster-player-settings";
const CUSTOM_VALUE = "__custom__";

const config = {
  slideSeconds: 8,
  posterDir: "poster",
  mp3Dir: "mp3",
  availablePosterDirs: ["poster", "poster1", "poster2"],
  availableMp3Dirs: ["mp3", "mp3_1", "mp3_2"],
  sourceMode: "auto",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  imageExtensions: ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"],
  videoExtensions: ["mp4", "webm", "mov", "m4v"],
  pdfExtensions: ["pdf"],
  audioExtensions: ["mp3"],
  shufflePosters: false,
  shuffleMusic: false,
  audioMode: "background",
  loopMusic: true,
  audioVolume: 0.75,
  startFullscreen: true,
  hdmiPortraitMode: "auto",
  transitionMs: 900,
  showStatusBar: true,
  ...(window.POSTER_PLAYER_CONFIG || {})
};

const initialSettings = {
  posterDir: config.posterDir,
  mp3Dir: config.mp3Dir,
  slideSeconds: config.slideSeconds,
  audioMode: config.audioMode,
  availablePosterDirs: [...config.availablePosterDirs],
  availableMp3Dirs: [...config.availableMp3Dirs]
};

const state = {
  availablePosters: [],
  availableTracks: [],
  voiceTracks: [],
  voiceByPoster: new Map(),
  posters: [],
  tracks: [],
  posterIndex: 0,
  trackIndex: 0,
  activePoster: 0,
  slideTimer: 0,
  paused: false,
  started: false,
  installPrompt: null,
  mediaPrefs: {},
  touchStartX: 0,
  touchStartY: 0,
  touchStartTime: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerStartTime: 0,
  tapTimer: 0,
  lastTapTime: 0
};

const els = {
  player: document.getElementById("player"),
  posterA: document.getElementById("posterA"),
  posterB: document.getElementById("posterB"),
  videoA: document.getElementById("videoA"),
  videoB: document.getElementById("videoB"),
  pdfA: document.getElementById("pdfA"),
  pdfB: document.getElementById("pdfB"),
  emptyState: document.getElementById("emptyState"),
  emptyMessage: document.getElementById("emptyMessage"),
  startPanel: document.getElementById("startPanel"),
  startButton: document.getElementById("startButton"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  settingsForm: document.getElementById("settingsForm"),
  posterDirSelect: document.getElementById("posterDirSelect"),
  posterDirCustom: document.getElementById("posterDirCustom"),
  mp3DirSelect: document.getElementById("mp3DirSelect"),
  mp3DirCustom: document.getElementById("mp3DirCustom"),
  slideSecondsInput: document.getElementById("slideSecondsInput"),
  audioModeSelect: document.getElementById("audioModeSelect"),
  settingsMessage: document.getElementById("settingsMessage"),
  resetSettingsButton: document.getElementById("resetSettingsButton"),
  posterOrderList: document.getElementById("posterOrderList"),
  trackOrderList: document.getElementById("trackOrderList"),
  posterOrderCount: document.getElementById("posterOrderCount"),
  trackOrderCount: document.getElementById("trackOrderCount"),
  statusBar: document.getElementById("statusBar"),
  posterStatus: document.getElementById("posterStatus"),
  audioStatus: document.getElementById("audioStatus"),
  mediaSummary: document.getElementById("mediaSummary"),
  audioPlayer: document.getElementById("audioPlayer")
};

applySavedSettings();
document.documentElement.style.setProperty("--transition-ms", `${config.transitionMs}ms`);
els.statusBar.hidden = !config.showStatusBar;
els.audioPlayer.volume = clamp(config.audioVolume, 0, 1);
setupSettingsForm();
setupPwaMode();
applyDisplayOrientationMode();

init();

async function init() {
  await loadSelectedMedia();
}

async function loadSelectedMedia() {
  window.clearTimeout(state.slideTimer);
  els.settingsMessage.textContent = "正在讀取所選目錄...";
  hideEmpty();

  try {
    const [posters, tracks, voiceTracks] = await Promise.all([
      loadMedia(config.posterDir, posterExtensions()),
      loadMedia(config.mp3Dir, config.audioExtensions),
      loadMedia(config.posterDir, config.audioExtensions)
    ]);

    state.availablePosters = applyMediaPreferences("poster", config.shufflePosters ? shuffle(posters) : posters);
    state.availableTracks = applyMediaPreferences("track", config.shuffleMusic ? shuffle(tracks) : tracks);
    state.voiceTracks = voiceTracks;
    state.voiceByPoster = buildVoiceMap(voiceTracks);
    state.posterIndex = 0;
    state.trackIndex = 0;
    state.activePoster = 0;
    els.audioPlayer.pause();
    els.audioPlayer.removeAttribute("src");
    els.audioPlayer.load();

    applyActiveMedia();
    renderMediaOrderLists();
    updateSummary();
    updateStatus();

    if (state.posters.length === 0) {
      showEmpty(`找不到可播放的海報。請確認 ${config.posterDir}/ 內有圖片，或至少勾選一張海報。`);
      els.settingsMessage.textContent = "目前沒有可播放的海報。";
      return;
    }

    showPoster(0, true);
    if (state.started && isPosterVoiceMode()) {
      await startPosterVoiceForCurrent();
    } else {
      scheduleNextSlide();
    }
    els.settingsMessage.textContent = `已載入 ${config.posterDir} 和 ${config.mp3Dir}`;

    if (state.started && !isPosterVoiceMode()) {
      await startAudio();
    }
  } catch (error) {
    console.error(error);
    showEmpty(`讀取媒體時發生錯誤：${error.message}`);
    els.settingsMessage.textContent = "讀取失敗，請檢查目錄名稱或 manifest.json。";
  }
}

els.startButton.addEventListener("click", async () => {
  state.started = true;
  els.startPanel.classList.add("is-hidden");

  if (config.startFullscreen) {
    await requestFullscreen();
  }

  await lockPortraitOrientation();
  if (isPosterVoiceMode()) {
    await startPosterVoiceForCurrent();
  } else {
    await startAudio();
  }
  startCurrentVideoIfNeeded();
});

els.fullscreenButton.addEventListener("click", requestFullscreen);

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  applySettingsFromForm();
  saveSettings();
  await loadSelectedMedia();
});

els.resetSettingsButton.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  config.posterDir = initialSettings.posterDir;
  config.mp3Dir = initialSettings.mp3Dir;
  config.slideSeconds = initialSettings.slideSeconds;
  config.audioMode = initialSettings.audioMode;
  config.availablePosterDirs = [...initialSettings.availablePosterDirs];
  config.availableMp3Dirs = [...initialSettings.availableMp3Dirs];
  state.mediaPrefs = {};
  setupSettingsForm();
  saveSettings();
  await loadSelectedMedia();
});

els.posterDirSelect.addEventListener("change", syncCustomDirectoryInputs);
els.mp3DirSelect.addEventListener("change", syncCustomDirectoryInputs);
els.posterOrderList.addEventListener("click", handleMediaOrderClick);
els.trackOrderList.addEventListener("click", handleMediaOrderClick);
els.posterOrderList.addEventListener("change", handleMediaOrderChange);
els.trackOrderList.addEventListener("change", handleMediaOrderChange);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  if (!isStandaloneDisplay()) {
    els.fullscreenButton.textContent = "安裝到桌面";
  }
});

window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  els.fullscreenButton.textContent = "全螢幕";
});

window.addEventListener("orientationchange", nudgeMobileAddressBar);
window.addEventListener("orientationchange", applyDisplayOrientationMode);
window.addEventListener("resize", applyDisplayOrientationMode);

window.addEventListener("load", () => {
  nudgeMobileAddressBar();
  applyDisplayOrientationMode();
  registerServiceWorker();
});

if (window.PointerEvent) {
  els.player.addEventListener("pointerdown", handlePointerStart);
  els.player.addEventListener("pointerup", handlePointerEnd);
} else {
  els.player.addEventListener("touchstart", handleTouchStart, { passive: true });
  els.player.addEventListener("touchend", handleTouchEnd, { passive: false });
}

els.audioPlayer.addEventListener("ended", () => {
  if (isPosterVoiceMode()) {
    nextPoster();
    return;
  }

  if (!config.loopMusic || state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：已停止";
    return;
  }

  state.trackIndex = (state.trackIndex + 1) % state.tracks.length;
  playTrack(state.trackIndex);
});

els.videoA.addEventListener("ended", handleVideoEnded);
els.videoB.addEventListener("ended", handleVideoEnded);

document.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (event.key === "PageDown" || event.key === "ArrowRight") {
    event.preventDefault();
    nextPoster();
    return;
  }

  if (event.key === "PageUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    previousPoster();
    return;
  }

  if (event.key.toLowerCase() === "f") {
    requestFullscreen();
    return;
  }

  if (event.key.toLowerCase() === "m") {
    event.preventDefault();
    toggleAudio();
  }
});

async function loadMedia(dir, extensions) {
  const mode = config.sourceMode.toLowerCase();
  const loaders = [];

  if (mode === "github" || mode === "auto") loaders.push(() => loadFromGithub(dir, extensions));
  if (mode === "directory" || mode === "auto") loaders.push(() => loadFromDirectoryIndex(dir, extensions));
  if (mode === "manifest" || mode === "auto") loaders.push(() => loadFromManifest(dir, extensions));

  const errors = [];
  for (const loader of loaders) {
    try {
      const files = await loader();
      if (files.length > 0) return files;
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (mode !== "auto" && errors.length > 0) {
    throw new Error(errors[errors.length - 1]);
  }

  return [];
}

async function loadFromGithub(dir, extensions) {
  const repo = resolveGithubRepo();
  if (!repo) throw new Error("尚未設定 GitHub repo，請在 config.js 設定 githubOwner 與 githubRepo。");

  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${encodeURIComponent(dir)}?ref=${encodeURIComponent(config.githubBranch)}`;
  const response = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub API 無法讀取 ${dir} (${response.status})`);

  const entries = await response.json();
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry) => entry.type === "file" && hasExtension(entry.name, extensions))
    .map((entry) => ({
      name: entry.name,
      url: entry.download_url || rawGithubUrl(repo, dir, entry.name)
    }))
    .sort(compareByName);
}

async function loadFromDirectoryIndex(dir, extensions) {
  const response = await fetch(withTrailingSlash(dir));
  if (!response.ok) throw new Error(`無法讀取目錄 ${dir} (${response.status})`);

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = [...doc.querySelectorAll("a[href]")];

  return links
    .map((link) => decodeURIComponent(link.getAttribute("href") || ""))
    .filter((href) => !href.startsWith("?") && !href.startsWith("/") && hasExtension(href, extensions))
    .map((href) => ({
      name: fileNameFromPath(href),
      url: new URL(href, new URL(withTrailingSlash(dir), window.location.href)).href
    }))
    .sort(compareByName);
}

async function loadFromManifest(dir, extensions) {
  const response = await fetch(`${trimSlashes(dir)}/manifest.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest 無法讀取 ${dir} (${response.status})`);

  const list = await response.json();
  const files = Array.isArray(list) ? list : list.files;
  if (!Array.isArray(files)) return [];

  return files
    .filter((file) => typeof file === "string" && hasExtension(file, extensions))
    .map((file) => ({
      name: fileNameFromPath(file),
      url: new URL(file, new URL(withTrailingSlash(dir), window.location.href)).href
    }))
    .sort(compareByName);
}

function resolveGithubRepo() {
  if (config.githubOwner && config.githubRepo) {
    return { owner: config.githubOwner, name: config.githubRepo };
  }

  const host = window.location.hostname;
  const path = window.location.pathname.split("/").filter(Boolean);
  if (host.endsWith(".github.io") && path.length > 0) {
    return { owner: host.replace(".github.io", ""), name: path[0] };
  }

  return null;
}

function rawGithubUrl(repo, dir, fileName) {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${config.githubBranch}/${trimSlashes(dir)}/${encodeURIComponent(fileName)}`;
}

function setupSettingsForm() {
  fillDirectorySelect(els.posterDirSelect, config.availablePosterDirs, config.posterDir);
  fillDirectorySelect(els.mp3DirSelect, config.availableMp3Dirs, config.mp3Dir);
  els.slideSecondsInput.value = Math.max(1, Number(config.slideSeconds) || 8);
  els.audioModeSelect.value = isPosterVoiceMode() ? "posterVoice" : "background";
  syncCustomDirectoryInputs();
}

function fillDirectorySelect(select, dirs, selectedDir) {
  const choices = uniqueDirs([selectedDir, ...dirs]);
  select.replaceChildren();

  for (const dir of choices) {
    const option = document.createElement("option");
    option.value = dir;
    option.textContent = dir;
    select.append(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_VALUE;
  customOption.textContent = "自訂目錄...";
  select.append(customOption);

  select.value = choices.includes(selectedDir) ? selectedDir : CUSTOM_VALUE;
}

function syncCustomDirectoryInputs() {
  syncCustomInput(els.posterDirSelect, els.posterDirCustom, config.posterDir);
  syncCustomInput(els.mp3DirSelect, els.mp3DirCustom, config.mp3Dir);
}

function syncCustomInput(select, input, currentDir) {
  const isCustom = select.value === CUSTOM_VALUE;
  input.hidden = !isCustom;
  input.required = isCustom;
  if (isCustom) input.value = currentDir;
}

function applySettingsFromForm() {
  config.posterDir = selectedDirectory(els.posterDirSelect, els.posterDirCustom);
  config.mp3Dir = selectedDirectory(els.mp3DirSelect, els.mp3DirCustom);
  config.slideSeconds = clamp(els.slideSecondsInput.value, 1, 3600);
  config.audioMode = els.audioModeSelect.value === "posterVoice" ? "posterVoice" : "background";
  config.availablePosterDirs = uniqueDirs([config.posterDir, ...config.availablePosterDirs]);
  config.availableMp3Dirs = uniqueDirs([config.mp3Dir, ...config.availableMp3Dirs]);
  setupSettingsForm();
}

function selectedDirectory(select, input) {
  const value = select.value === CUSTOM_VALUE ? input.value : select.value;
  return trimSlashes(value || "").trim();
}

function applySavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (saved.posterDir) config.posterDir = trimSlashes(saved.posterDir);
    if (saved.mp3Dir) config.mp3Dir = trimSlashes(saved.mp3Dir);
    if (saved.slideSeconds) config.slideSeconds = clamp(saved.slideSeconds, 1, 3600);
    if (saved.audioMode) config.audioMode = saved.audioMode === "posterVoice" ? "posterVoice" : "background";
    if (Array.isArray(saved.availablePosterDirs)) {
      config.availablePosterDirs = uniqueDirs([...saved.availablePosterDirs, ...config.availablePosterDirs]);
    }
    if (Array.isArray(saved.availableMp3Dirs)) {
      config.availableMp3Dirs = uniqueDirs([...saved.availableMp3Dirs, ...config.availableMp3Dirs]);
    }
    if (saved.mediaPrefs && typeof saved.mediaPrefs === "object") {
      state.mediaPrefs = saved.mediaPrefs;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    posterDir: config.posterDir,
    mp3Dir: config.mp3Dir,
    slideSeconds: config.slideSeconds,
    audioMode: config.audioMode,
    availablePosterDirs: config.availablePosterDirs,
    availableMp3Dirs: config.availableMp3Dirs,
    mediaPrefs: state.mediaPrefs
  }));
}

function applyMediaPreferences(kind, files) {
  const pref = getMediaPreference(kind);
  const order = Array.isArray(pref.order) ? pref.order : [];
  const disabled = new Set(Array.isArray(pref.disabled) ? pref.disabled : []);
  const durations = pref.durations && typeof pref.durations === "object" ? pref.durations : {};
  const byName = new Map(files.map((file) => [file.name, file]));
  const ordered = [];

  for (const name of order) {
    const file = byName.get(name);
    if (!file) continue;
    ordered.push(file);
    byName.delete(name);
  }

  ordered.push(...[...byName.values()].sort(compareByName));
  return ordered.map((file) => ({
    ...file,
    enabled: !disabled.has(file.name),
    durationSeconds: normalizeOptionalSeconds(durations[file.name])
  }));
}

function getMediaPreference(kind) {
  const key = mediaPreferenceKey(kind);
  if (!state.mediaPrefs[key]) {
    state.mediaPrefs[key] = { order: [], disabled: [] };
  }
  return state.mediaPrefs[key];
}

function mediaPreferenceKey(kind) {
  const dir = kind === "poster" ? config.posterDir : config.mp3Dir;
  return `${kind}:${trimSlashes(dir)}`;
}

function saveMediaPreference(kind) {
  const items = getAvailableMedia(kind);
  state.mediaPrefs[mediaPreferenceKey(kind)] = {
    order: items.map((item) => item.name),
    disabled: items.filter((item) => !item.enabled).map((item) => item.name),
    durations: Object.fromEntries(
      items
        .filter((item) => normalizeOptionalSeconds(item.durationSeconds))
        .map((item) => [item.name, normalizeOptionalSeconds(item.durationSeconds)])
    )
  };
  saveSettings();
}

function applyActiveMedia() {
  state.posters = state.availablePosters.filter((item) => item.enabled);
  state.tracks = state.availableTracks.filter((item) => item.enabled);
  state.posterIndex = normalizeIndex(state.posterIndex, Math.max(1, state.posters.length));
  state.trackIndex = normalizeIndex(state.trackIndex, Math.max(1, state.tracks.length));
}

function renderMediaOrderLists() {
  renderMediaOrderList("poster", els.posterOrderList, state.availablePosters);
  renderMediaOrderList("track", els.trackOrderList, state.availableTracks);
  updateOrderCounts();
}

function renderMediaOrderList(kind, listEl, items) {
  listEl.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "media-order-empty";
    empty.textContent = kind === "poster" ? "這個目錄沒有可選海報。" : "這個目錄沒有可選 MP3。";
    listEl.append(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "media-order-row";
    row.dataset.kind = kind;
    row.dataset.index = String(index);

    const label = document.createElement("label");
    label.className = "media-order-file";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.enabled;
    checkbox.dataset.action = "toggle";
    checkbox.dataset.kind = kind;
    checkbox.dataset.index = String(index);

    const order = document.createElement("span");
    order.className = "media-order-number";
    order.textContent = String(index + 1);

    const name = document.createElement("span");
    name.className = "media-order-name";
    name.textContent = item.name;

    label.append(checkbox, order, name);

    const controls = document.createElement("div");
    controls.className = "media-order-controls";
    if (kind === "poster") {
      controls.append(durationControl(kind, index, item));
    }
    controls.append(
      orderButton("up", kind, index, "上移", index === 0),
      orderButton("down", kind, index, "下移", index === items.length - 1)
    );

    row.append(label, controls);
    listEl.append(row);
  });
}

function durationControl(kind, index, item) {
  const wrapper = document.createElement("div");
  wrapper.className = "duration-control";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "3600";
  input.step = "1";
  input.inputMode = "numeric";
  input.className = "duration-input";
  input.dataset.action = "duration";
  input.dataset.kind = kind;
  input.dataset.index = String(index);
  input.value = item.durationSeconds ? String(item.durationSeconds) : "";
  input.placeholder = String(Math.max(1, Number(config.slideSeconds) || 8));
  input.title = "Custom seconds";
  input.setAttribute("aria-label", `${item.name} custom seconds`);

  wrapper.append(
    durationButton("duration-dec", kind, index, "-"),
    input,
    durationButton("duration-inc", kind, index, "+")
  );
  return wrapper;
}

function durationButton(action, kind, index, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "duration-button";
  button.dataset.action = action;
  button.dataset.kind = kind;
  button.dataset.index = String(index);
  button.title = label === "+" ? "Increase seconds" : "Decrease seconds";
  button.setAttribute("aria-label", button.title);
  button.textContent = label;
  return button;
}

function orderButton(action, kind, index, label, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.dataset.action = action;
  button.dataset.kind = kind;
  button.dataset.index = String(index);
  button.disabled = disabled;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = action === "up" ? "↑" : "↓";
  return button;
}

function updateOrderCounts() {
  const selectedPosters = state.availablePosters.filter((item) => item.enabled).length;
  const selectedTracks = state.availableTracks.filter((item) => item.enabled).length;
  els.posterOrderCount.textContent = `${selectedPosters} / ${state.availablePosters.length} 張`;
  els.trackOrderCount.textContent = `${selectedTracks} / ${state.availableTracks.length} 首`;
}

function handleMediaOrderClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const kind = button.dataset.kind;
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index)) return;

  if (button.dataset.action === "up") {
    moveMediaItem(kind, index, -1);
  } else if (button.dataset.action === "down") {
    moveMediaItem(kind, index, 1);
  } else if (button.dataset.action === "duration-dec") {
    adjustMediaDuration(kind, index, -1);
  } else if (button.dataset.action === "duration-inc") {
    adjustMediaDuration(kind, index, 1);
  }
}

function handleMediaOrderChange(event) {
  const durationInput = event.target.closest("input[data-action='duration']");
  if (durationInput) {
    setMediaDuration(durationInput.dataset.kind, Number(durationInput.dataset.index), durationInput.value);
    return;
  }

  const checkbox = event.target.closest("input[type='checkbox'][data-action='toggle']");
  if (!checkbox) return;

  const kind = checkbox.dataset.kind;
  const index = Number(checkbox.dataset.index);
  const items = getAvailableMedia(kind);
  if (!items[index]) return;

  items[index].enabled = checkbox.checked;
  saveMediaPreference(kind);
  refreshPlaybackAfterOrderChange(kind);
}

function adjustMediaDuration(kind, index, delta) {
  const items = getAvailableMedia(kind);
  const item = items[index];
  if (!item) return;

  const base = normalizeOptionalSeconds(item.durationSeconds) || Math.max(1, Number(config.slideSeconds) || 8);
  setMediaDuration(kind, index, clamp(base + delta, 1, 3600));
}

function setMediaDuration(kind, index, value) {
  const items = getAvailableMedia(kind);
  const item = items[index];
  if (!item) return;

  item.durationSeconds = normalizeOptionalSeconds(value);
  saveMediaPreference(kind);
  renderMediaOrderLists();
  applyActiveMedia();
  refreshCurrentPlaybackTiming(kind);
}

function moveMediaItem(kind, index, delta) {
  const items = getAvailableMedia(kind);
  const nextIndex = index + delta;
  if (!items[index] || nextIndex < 0 || nextIndex >= items.length) return;

  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  saveMediaPreference(kind);
  refreshPlaybackAfterOrderChange(kind);
}

function getAvailableMedia(kind) {
  return kind === "poster" ? state.availablePosters : state.availableTracks;
}

function refreshPlaybackAfterOrderChange(kind) {
  const wasAudioPlaying = state.started && !els.audioPlayer.paused && kind === "track";
  applyActiveMedia();
  renderMediaOrderLists();
  updateSummary();
  updateStatus();

  if (kind === "poster") {
    if (state.posters.length === 0) {
      showEmpty("請至少勾選一張海報。");
      return;
    }
    hideEmpty();
    showPoster(0, true);
    if (state.started && isPosterVoiceMode()) {
      startPosterVoiceForCurrent();
    } else {
      scheduleNextSlide();
    }
    return;
  }

  if (isPosterVoiceMode()) {
    updateStatus();
    return;
  }

  if (state.tracks.length === 0) {
    els.audioPlayer.pause();
    els.audioPlayer.removeAttribute("src");
    els.audioPlayer.load();
    updateStatus();
    return;
  }

  if (wasAudioPlaying) {
    state.trackIndex = 0;
    startAudio();
  }
}

function refreshCurrentPlaybackTiming(kind) {
  updateSummary();
  updateStatus();

  if (kind !== "poster") return;
  if (state.posters.length === 0) return;
  if (state.started && isPosterVoiceMode() && voiceForPoster(currentPoster())) return;
  scheduleNextSlide();
}

function showPoster(index, instant = false) {
  if (state.posters.length === 0) return;

  state.posterIndex = normalizeIndex(index, state.posters.length);
  const current = state.posters[state.posterIndex];
  const nextSlot = state.activePoster === 0 ? 1 : 0;
  const currentSlot = state.activePoster;

  if (instant) {
    stopSlot(0);
    stopSlot(1);
    prepareSlot(0, current);
    setSlotActive(0, true);
    setSlotActive(1, false);
    state.activePoster = 0;
  } else {
    stopSlot(nextSlot);
    prepareSlot(nextSlot, current);
    setSlotActive(nextSlot, true);
    setSlotActive(currentSlot, false);
    stopSlot(currentSlot);
    state.activePoster = nextSlot;
  }

  updateStatus();
  startCurrentVideoIfNeeded();
}

function mediaSlot(slot) {
  return slot === 0
    ? { image: els.posterA, video: els.videoA, pdf: els.pdfA }
    : { image: els.posterB, video: els.videoB, pdf: els.pdfB };
}

function prepareSlot(slot, media) {
  const { image, video, pdf } = mediaSlot(slot);

  if (isVideoMedia(media)) {
    image.removeAttribute("src");
    image.alt = "";
    pdf.removeAttribute("src");
    video.src = media.url;
    video.setAttribute("aria-label", media.name);
    video.playsInline = true;
    video.preload = "auto";
    return;
  }

  video.pause();
  video.removeAttribute("src");
  video.load();

  if (isPdfMedia(media)) {
    image.removeAttribute("src");
    image.alt = "";
    pdf.src = media.url;
    pdf.title = media.name;
    return;
  }

  pdf.removeAttribute("src");
  image.src = media.url;
  image.alt = media.name;
}

function setSlotActive(slot, active) {
  const { image, video, pdf } = mediaSlot(slot);
  const media = state.posters[state.posterIndex];
  const activeElement = media && isVideoMedia(media) ? video : isPdfMedia(media) ? pdf : image;
  image.classList.toggle("is-active", active && activeElement === image);
  video.classList.toggle("is-active", active && activeElement === video);
  pdf.classList.toggle("is-active", active && activeElement === pdf);
}

function stopSlot(slot) {
  const { video } = mediaSlot(slot);
  video.pause();
  video.currentTime = 0;
}

function currentPoster() {
  return state.posters[state.posterIndex] || null;
}

function currentMediaDurationSeconds() {
  const media = currentPoster();
  return media ? normalizeOptionalSeconds(media.durationSeconds) : null;
}

function currentSlideSeconds() {
  return currentMediaDurationSeconds() || Math.max(1, Number(config.slideSeconds) || 8);
}

function startCurrentVideoIfNeeded() {
  const media = currentPoster();
  if (!state.started || state.paused || !isVideoMedia(media)) return;

  const { video } = mediaSlot(state.activePoster);
  video.play().catch(() => {
    els.settingsMessage.textContent = "Video: tap start to allow playback";
    els.startPanel.classList.remove("is-hidden");
  });
}

function pauseCurrentVideo() {
  const media = currentPoster();
  if (!isVideoMedia(media)) return;
  mediaSlot(state.activePoster).video.pause();
}

function handleVideoEnded(event) {
  const media = currentPoster();
  if (!media || event.currentTarget !== mediaSlot(state.activePoster).video) return;
  if (currentMediaDurationSeconds()) return;
  if (isPosterVoiceMode() && voiceForPoster(media)) return;
  nextPoster();
}

function scheduleNextSlide() {
  window.clearTimeout(state.slideTimer);
  if (state.paused || state.posters.length === 0) return;
  const durationSeconds = currentSlideSeconds();
  if (state.started && isVideoMedia(currentPoster()) && !currentMediaDurationSeconds()) return;
  state.slideTimer = window.setTimeout(nextPoster, durationSeconds * 1000);
}

function nextPoster() {
  if (state.posters.length === 0) return;
  showPoster(state.posterIndex + 1);
  if (state.started && isPosterVoiceMode()) {
    startPosterVoiceForCurrent();
  } else {
    scheduleNextSlide();
  }
}

function previousPoster() {
  if (state.posters.length === 0) return;
  showPoster(state.posterIndex - 1);
  if (state.started && isPosterVoiceMode()) {
    startPosterVoiceForCurrent();
  } else {
    scheduleNextSlide();
  }
}

function togglePause() {
  state.paused = !state.paused;

  if (state.paused) {
    window.clearTimeout(state.slideTimer);
    pauseCurrentVideo();
    if (isPosterVoiceMode()) {
      els.audioPlayer.pause();
    }
  } else if (isPosterVoiceMode()) {
    if (els.audioPlayer.src) {
      els.audioPlayer.play().catch(() => startPosterVoiceForCurrent());
    } else {
      startPosterVoiceForCurrent();
    }
    startCurrentVideoIfNeeded();
  } else {
    startCurrentVideoIfNeeded();
    scheduleNextSlide();
  }

  updateStatus();
}

async function startAudio() {
  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有可播放的 MP3";
    return;
  }

  await playTrack(state.trackIndex);
}

async function startPosterVoiceForCurrent() {
  window.clearTimeout(state.slideTimer);

  if (!isPosterVoiceMode() || state.posters.length === 0 || state.paused) return;

  const poster = state.posters[state.posterIndex];
  const voice = voiceForPoster(poster);
  els.audioPlayer.pause();
  els.audioPlayer.removeAttribute("src");
  els.audioPlayer.load();

  if (!voice) {
    els.audioStatus.textContent = poster
      ? `Voice: ${poster.name} has no matching MP3`
      : "Voice: no poster selected";
    scheduleNextSlide();
    return;
  }

  els.audioPlayer.src = voice.url;
  els.audioStatus.textContent = `Voice: ${voice.name}`;

  try {
    await els.audioPlayer.play();
  } catch {
    els.audioStatus.textContent = "Voice: tap start to allow playback";
    els.startPanel.classList.remove("is-hidden");
  }
}

async function playTrack(index) {
  if (state.tracks.length === 0) return;

  state.trackIndex = normalizeIndex(index, state.tracks.length);
  const track = state.tracks[state.trackIndex];
  if (!track) return;

  els.audioPlayer.src = track.url;
  els.audioStatus.textContent = `音樂：${track.name}`;

  try {
    await els.audioPlayer.play();
  } catch {
    els.audioStatus.textContent = "音樂：瀏覽器需要先點一下開始才能播放";
    els.startPanel.classList.remove("is-hidden");
  }
}

async function toggleAudio() {
  if (isPosterVoiceMode()) {
    togglePause();
    return;
  }

  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有可播放的 MP3";
    return;
  }

  if (!els.audioPlayer.src) {
    await startAudio();
    return;
  }

  if (els.audioPlayer.paused) {
    try {
      await els.audioPlayer.play();
      const track = state.tracks[state.trackIndex];
      els.audioStatus.textContent = `音樂：${track ? track.name : "播放中"}`;
    } catch {
      els.audioStatus.textContent = "音樂：瀏覽器需要先點一下開始才能播放";
    }
  } else {
    els.audioPlayer.pause();
    els.audioStatus.textContent = "音樂：已暫停";
  }
}

async function requestFullscreen() {
  if (state.installPrompt && !isStandaloneDisplay()) {
    await state.installPrompt.prompt();
    state.installPrompt = null;
    els.fullscreenButton.textContent = "全螢幕";
    return;
  }

  if (document.fullscreenElement) return;

  try {
    await els.player.requestFullscreen({ navigationUI: "hide" });
    await lockPortraitOrientation();
  } catch {
    // Some browsers block fullscreen outside trusted user gestures.
  }
}

function setupPwaMode() {
  if (isStandaloneDisplay()) {
    document.documentElement.classList.add("is-standalone");
    els.fullscreenButton.textContent = "全螢幕";
    return;
  }

  if (isMobileViewport()) {
    els.fullscreenButton.textContent = "安裝到桌面";
  }
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 820px)").matches ||
    /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function isAndroidDevice() {
  return /Android/i.test(window.navigator.userAgent);
}

async function lockPortraitOrientation() {
  if (!screen.orientation || !screen.orientation.lock) return false;

  try {
    await screen.orientation.lock("portrait-primary");
    return true;
  } catch {
    return false;
  }
}

function applyDisplayOrientationMode() {
  const mode = String(config.hdmiPortraitMode || "auto").toLowerCase();
  const isLandscapeViewport = window.innerWidth > window.innerHeight;
  const shouldAutoRotate = mode === "auto" && isAndroidDevice() && isLandscapeViewport;
  const shouldRotateRight = mode === "rotate-right" || shouldAutoRotate;
  const shouldRotateLeft = mode === "rotate-left";

  els.player.classList.toggle("is-hdmi-portrait", shouldRotateRight || shouldRotateLeft);
  els.player.classList.toggle("is-hdmi-portrait-left", shouldRotateLeft);
}

function nudgeMobileAddressBar() {
  if (isStandaloneDisplay()) return;
  if (!isMobileViewport()) return;
  setTimeout(() => window.scrollTo(0, 1), 250);
  setTimeout(() => window.scrollTo(0, 1), 900);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("service-worker.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

function handlePointerStart(event) {
  if (!event.isPrimary || isInteractiveTouch(event.target)) return;
  state.pointerStartX = event.clientX;
  state.pointerStartY = event.clientY;
  state.pointerStartTime = Date.now();
}

function handlePointerEnd(event) {
  if (!event.isPrimary || isInteractiveTouch(event.target)) return;
  if (!state.pointerStartTime) return;

  const dx = event.clientX - state.pointerStartX;
  const dy = event.clientY - state.pointerStartY;
  const elapsed = Date.now() - state.pointerStartTime;
  state.pointerStartTime = 0;

  handleTapOrSwipe(dx, dy, elapsed, event);
}

function handleTouchStart(event) {
  if (isInteractiveTouch(event.target)) return;
  const touch = event.changedTouches[0];
  state.touchStartX = touch.clientX;
  state.touchStartY = touch.clientY;
  state.touchStartTime = Date.now();
}

function handleTouchEnd(event) {
  if (isInteractiveTouch(event.target)) return;
  if (!state.touchStartTime) return;

  const touch = event.changedTouches[0];
  const dx = touch.clientX - state.touchStartX;
  const dy = touch.clientY - state.touchStartY;
  const elapsed = Date.now() - state.touchStartTime;

  state.touchStartTime = 0;

  handleTapOrSwipe(dx, dy, elapsed, event);
}

function handleTapOrSwipe(dx, dy, elapsed, event) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX >= 48 && absX > absY * 1.4) {
    event.preventDefault();
    if (dx < 0) {
      previousPoster();
    } else {
      nextPoster();
    }
    return;
  }

  if (absX < 16 && absY < 16 && elapsed < 600) {
    event.preventDefault();
    handleTouchTap();
  }
}

function isInteractiveTouch(target) {
  return target.closest("button, a, input, textarea, select, audio, .start-panel, .media-order-panel");
}

function handleTouchTap() {
  const now = Date.now();
  const doubleTapWindowMs = 320;

  if (now - state.lastTapTime <= doubleTapWindowMs) {
    window.clearTimeout(state.tapTimer);
    state.tapTimer = 0;
    state.lastTapTime = 0;
    togglePause();
    return;
  }

  state.lastTapTime = now;
  window.clearTimeout(state.tapTimer);
  state.tapTimer = window.setTimeout(() => {
    state.tapTimer = 0;
    state.lastTapTime = 0;
    nextPoster();
  }, doubleTapWindowMs);
}

function updateSummary() {
  if (isPosterVoiceMode()) {
    const voiceCount = state.posters.filter((poster) => voiceForPoster(poster)).length;
    els.mediaSummary.textContent = `${state.posters.length} posters, ${voiceCount} voice tracks`;
    return;
  }

  els.mediaSummary.textContent = `${state.posters.length} 張海報，${state.tracks.length} 首音樂`;
}

function updateStatus() {
  const playbackStatus = state.paused ? "（已暫停）" : "";
  els.posterStatus.textContent = `海報 ${state.posters.length ? state.posterIndex + 1 : 0} / ${state.posters.length}${playbackStatus}`;

  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有可播放的 MP3";
  } else if (!els.audioPlayer.src) {
    els.audioStatus.textContent = `音樂：${state.tracks.length} 首待播放`;
  }
  if (isPosterVoiceMode()) {
    const poster = state.posters[state.posterIndex];
    const voice = voiceForPoster(poster);
    if (!els.audioPlayer.src) {
      els.audioStatus.textContent = voice ? `Voice ready: ${voice.name}` : "Voice: no matching MP3";
    }
  }
}

function showEmpty(message) {
  els.emptyState.hidden = false;
  els.emptyMessage.textContent = message;
  els.startPanel.classList.remove("is-hidden");
  updateSummary();
  updateStatus();
}

function hideEmpty() {
  els.emptyState.hidden = true;
  els.emptyMessage.textContent = "";
}

function posterExtensions() {
  return [...config.imageExtensions, ...config.videoExtensions, ...config.pdfExtensions];
}

function isPosterVoiceMode() {
  return config.audioMode === "posterVoice";
}

function isVideoMedia(media) {
  return Boolean(media && hasExtension(media.name, config.videoExtensions));
}

function isPdfMedia(media) {
  return Boolean(media && hasExtension(media.name, config.pdfExtensions));
}

function buildVoiceMap(tracks) {
  const map = new Map();
  for (const track of tracks) {
    const key = baseNameWithoutExtension(track.name);
    if (key && !map.has(key)) {
      map.set(key, track);
    }
  }
  return map;
}

function voiceForPoster(poster) {
  if (!poster) return null;
  return state.voiceByPoster.get(baseNameWithoutExtension(poster.name)) || null;
}

function baseNameWithoutExtension(path) {
  const file = fileNameFromPath(path).split("?")[0].split("#")[0];
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
}

function hasExtension(path, extensions) {
  const clean = path.split("?")[0].split("#")[0].toLowerCase();
  return extensions.some((ext) => clean.endsWith(`.${ext.toLowerCase()}`));
}

function trimSlashes(path) {
  return String(path).replace(/^\/+|\/+$/g, "");
}

function withTrailingSlash(path) {
  return `${trimSlashes(path)}/`;
}

function fileNameFromPath(path) {
  return path.split("/").filter(Boolean).pop() || path;
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeIndex(index, length) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function normalizeOptionalSeconds(value) {
  if (value === "" || value === null || value === undefined) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(clamp(seconds, 1, 3600));
}

function uniqueDirs(dirs) {
  return [...new Set(dirs.map((dir) => trimSlashes(dir || "").trim()).filter(Boolean))];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
