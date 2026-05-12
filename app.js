"use strict";

const config = {
  slideSeconds: 8,
  posterDir: "poster",
  mp3Dir: "mp3",
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
  transitionMs: 900,
  showStatusBar: true,
  ...(window.POSTER_PLAYER_CONFIG || {})
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
  installPrompt: null
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
  statusBar: document.getElementById("statusBar"),
  posterStatus: document.getElementById("posterStatus"),
  audioStatus: document.getElementById("audioStatus"),
  mediaSummary: document.getElementById("mediaSummary"),
  audioPlayer: document.getElementById("audioPlayer")
};

document.documentElement.style.setProperty("--transition-ms", `${config.transitionMs}ms`);
els.statusBar.hidden = !config.showStatusBar;
els.audioPlayer.volume = clamp(config.audioVolume, 0, 1);
setupPwaMode();

init();

async function init() {
  try {
    const [posters, tracks] = await Promise.all([
      loadMedia(config.posterDir, config.imageExtensions),
      loadMedia(config.mp3Dir, config.audioExtensions)
    ]);

    state.posters = config.shufflePosters ? shuffle(posters) : posters;
    state.tracks = config.shuffleMusic ? shuffle(tracks) : tracks;

    updateSummary();
    updateStatus();

    if (state.posters.length === 0) {
      showEmpty(`找不到海報圖片。請把圖片放進 ${config.posterDir}/，或更新 ${config.posterDir}/manifest.json。`);
      return;
    }

    showPoster(0, true);
    scheduleNextSlide();
  } catch (error) {
    console.error(error);
    showEmpty(`讀取媒體失敗：${error.message}`);
  }
}

els.startButton.addEventListener("click", async () => {
  state.started = true;
  els.startPanel.classList.add("is-hidden");

  if (config.startFullscreen) {
    await requestFullscreen();
  }

  await startAudio();
});

els.fullscreenButton.addEventListener("click", requestFullscreen);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  if (!isStandaloneDisplay()) {
    els.fullscreenButton.textContent = "加入主畫面";
  }
});

window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  els.fullscreenButton.textContent = "全螢幕";
});

window.addEventListener("orientationchange", nudgeMobileAddressBar);

window.addEventListener("load", () => {
  nudgeMobileAddressBar();
  registerServiceWorker();
});

els.audioPlayer.addEventListener("ended", () => {
  if (!config.loopMusic || state.tracks.length === 0) {
    els.audioStatus.textContent = "背景音樂：已停止";
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
  if (!repo) throw new Error("無法推斷 GitHub repo，請在 config.js 設定 githubOwner 與 githubRepo。");

  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${encodeURIComponent(dir)}?ref=${encodeURIComponent(config.githubBranch)}`;
  const response = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub API ${dir} 讀取失敗 (${response.status})`);

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
  if (!response.ok) throw new Error(`目錄索引 ${dir} 讀取失敗 (${response.status})`);

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
  if (!response.ok) throw new Error(`manifest ${dir} 讀取失敗 (${response.status})`);

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
    els.audioStatus.textContent = "背景音樂：沒有 MP3";
    return;
  }

  await playTrack(state.trackIndex);
}

async function playTrack(index) {
  const track = state.tracks[index];
  if (!track) return;

  els.audioPlayer.src = track.url;
  els.audioStatus.textContent = `背景音樂：${track.name}`;

  try {
    await els.audioPlayer.play();
  } catch {
    els.audioStatus.textContent = "背景音樂：瀏覽器需要點一下開始播放";
    els.startPanel.classList.remove("is-hidden");
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
    els.fullscreenButton.textContent = "加入主畫面";
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

function updateSummary() {
  els.mediaSummary.textContent = `${state.posters.length} 張海報，${state.tracks.length} 首背景音樂`;
}

function updateStatus() {
  const playbackStatus = state.paused ? "（已暫停）" : "";
  els.posterStatus.textContent = `海報 ${state.posters.length ? state.posterIndex + 1 : 0} / ${state.posters.length}${playbackStatus}`;

  if (state.tracks.length === 0) {
    els.audioStatus.textContent = "背景音樂：沒有 MP3";
  } else if (!els.audioPlayer.src) {
    els.audioStatus.textContent = `背景音樂：${state.tracks.length} 首待播放`;
  }
}

function showEmpty(message) {
  els.emptyState.hidden = false;
  els.emptyMessage.textContent = message;
  els.startPanel.classList.remove("is-hidden");
  updateSummary();
  updateStatus();
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

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
