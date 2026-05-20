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
  audioExtensions: ["mp3"],
  shufflePosters: false,
  shuffleMusic: false,
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
  availablePosterDirs: [...config.availablePosterDirs],
  availableMp3Dirs: [...config.availableMp3Dirs]
};

const state = {
  posters: [],
  tracks: [],
  posterIndex: 0,
  trackIndex: 0,
  activePoster: 0,
  slideTimer: 0,
  paused: false,
  started: false,
  installPrompt: null,
  touchStartX: 0,
  touchStartY: 0,
  touchStartTime: 0,
  tapTimer: 0,
  lastTapTime: 0
};

const els = {
  player: document.getElementById("player"),
  posterA: document.getElementById("posterA"),
  posterB: document.getElementById("posterB"),
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
  settingsMessage: document.getElementById("settingsMessage"),
  resetSettingsButton: document.getElementById("resetSettingsButton"),
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
    const [posters, tracks] = await Promise.all([
      loadMedia(config.posterDir, config.imageExtensions),
      loadMedia(config.mp3Dir, config.audioExtensions)
    ]);

    state.posters = config.shufflePosters ? shuffle(posters) : posters;
    state.tracks = config.shuffleMusic ? shuffle(tracks) : tracks;
    state.posterIndex = 0;
    state.trackIndex = 0;
    state.activePoster = 0;
    els.audioPlayer.pause();
    els.audioPlayer.removeAttribute("src");
    els.audioPlayer.load();

    updateSummary();
    updateStatus();

    if (state.posters.length === 0) {
      showEmpty(`找不到海報檔案。請確認 ${config.posterDir}/ 內有圖片，或建立 ${config.posterDir}/manifest.json。`);
      els.settingsMessage.textContent = "目前海報目錄沒有可播放的圖片。";
      return;
    }

    showPoster(0, true);
    scheduleNextSlide();
    els.settingsMessage.textContent = `已載入 ${config.posterDir} 和 ${config.mp3Dir}`;

    if (state.started) {
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
  await startAudio();
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
  config.availablePosterDirs = [...initialSettings.availablePosterDirs];
  config.availableMp3Dirs = [...initialSettings.availableMp3Dirs];
  setupSettingsForm();
  saveSettings();
  await loadSelectedMedia();
});

els.posterDirSelect.addEventListener("change", syncCustomDirectoryInputs);
els.mp3DirSelect.addEventListener("change", syncCustomDirectoryInputs);

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

els.player.addEventListener("touchstart", handleTouchStart, { passive: true });
els.player.addEventListener("touchend", handleTouchEnd, { passive: false });

els.audioPlayer.addEventListener("ended", () => {
  if (!config.loopMusic || state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：已停止";
    return;
  }

  state.trackIndex = (state.trackIndex + 1) % state.tracks.length;
  playTrack(state.trackIndex);
});

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
    if (Array.isArray(saved.availablePosterDirs)) {
      config.availablePosterDirs = uniqueDirs([...saved.availablePosterDirs, ...config.availablePosterDirs]);
    }
    if (Array.isArray(saved.availableMp3Dirs)) {
      config.availableMp3Dirs = uniqueDirs([...saved.availableMp3Dirs, ...config.availableMp3Dirs]);
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
    availablePosterDirs: config.availablePosterDirs,
    availableMp3Dirs: config.availableMp3Dirs
  }));
}

function showPoster(index, instant = false) {
  if (state.posters.length === 0) return;

  state.posterIndex = normalizeIndex(index, state.posters.length);
  const current = state.posters[state.posterIndex];
  const nextEl = state.activePoster === 0 ? els.posterB : els.posterA;
  const currentEl = state.activePoster === 0 ? els.posterA : els.posterB;

  nextEl.src = current.url;
  nextEl.alt = current.name;

  if (instant) {
    currentEl.src = current.url;
    currentEl.alt = current.name;
    currentEl.classList.add("is-active");
    nextEl.classList.remove("is-active");
  } else {
    nextEl.classList.add("is-active");
    currentEl.classList.remove("is-active");
    state.activePoster = state.activePoster === 0 ? 1 : 0;
  }

  updateStatus();
}

function scheduleNextSlide() {
  window.clearTimeout(state.slideTimer);
  if (state.paused) return;
  state.slideTimer = window.setTimeout(nextPoster, Math.max(1, Number(config.slideSeconds)) * 1000);
}

function nextPoster() {
  showPoster(state.posterIndex + 1);
  scheduleNextSlide();
}

function previousPoster() {
  showPoster(state.posterIndex - 1);
  scheduleNextSlide();
}

function togglePause() {
  state.paused = !state.paused;

  if (state.paused) {
    window.clearTimeout(state.slideTimer);
  } else {
    scheduleNextSlide();
  }

  updateStatus();
}

async function startAudio() {
  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有 MP3";
    return;
  }

  await playTrack(state.trackIndex);
}

async function playTrack(index) {
  const track = state.tracks[index];
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
  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有 MP3";
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

function handleTouchStart(event) {
  if (!isMobileViewport() || isInteractiveTouch(event.target)) return;
  const touch = event.changedTouches[0];
  state.touchStartX = touch.clientX;
  state.touchStartY = touch.clientY;
  state.touchStartTime = Date.now();
}

function handleTouchEnd(event) {
  if (!isMobileViewport() || isInteractiveTouch(event.target)) return;
  if (!state.touchStartTime) return;

  const touch = event.changedTouches[0];
  const dx = touch.clientX - state.touchStartX;
  const dy = touch.clientY - state.touchStartY;
  const elapsed = Date.now() - state.touchStartTime;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  state.touchStartTime = 0;

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
    handleMobileTap();
  }
}

function isInteractiveTouch(target) {
  return target.closest("button, a, input, textarea, select, audio");
}

function handleMobileTap() {
  const now = Date.now();
  const doubleTapWindowMs = 320;

  if (now - state.lastTapTime <= doubleTapWindowMs) {
    window.clearTimeout(state.tapTimer);
    state.tapTimer = 0;
    state.lastTapTime = 0;
    toggleAudio();
    return;
  }

  state.lastTapTime = now;
  window.clearTimeout(state.tapTimer);
  state.tapTimer = window.setTimeout(() => {
    state.tapTimer = 0;
    state.lastTapTime = 0;
    togglePause();
  }, doubleTapWindowMs);
}

function updateSummary() {
  els.mediaSummary.textContent = `${state.posters.length} 張海報，${state.tracks.length} 首音樂`;
}

function updateStatus() {
  const playbackStatus = state.paused ? "（已暫停）" : "";
  els.posterStatus.textContent = `海報 ${state.posters.length ? state.posterIndex + 1 : 0} / ${state.posters.length}${playbackStatus}`;

  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "音樂：沒有 MP3";
  } else if (!els.audioPlayer.src) {
    els.audioStatus.textContent = `音樂：${state.tracks.length} 首待播放`;
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
  return ((index % length) + length) % length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
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
