window.POSTER_PLAYER_CONFIG = {
  // 每張海報停留秒數。使用者在首頁調整後，會優先使用該裝置儲存的設定。
  slideSeconds: 20,

  // 預設讀取目錄。
  posterDir: "poster",
  mp3Dir: "mp3",

  // 首頁目錄選單。新增資料夾時，把資料夾名稱加在這裡即可出現在選單中。
  availablePosterDirs: ["poster", "poster1", "poster2"],
  availableMp3Dirs: ["mp3", "mp3_1", "mp3_2"],

  // auto: 依序嘗試 GitHub API、目錄索引、manifest.json。
  // github: 只使用 GitHub API。
  // directory: 只讀取伺服器目錄索引。
  // manifest: 只讀取各目錄內的 manifest.json。
  sourceMode: "auto",

  // 如果不是部署在 GitHub Pages，且需要 GitHub API，請填入 repo 資訊。
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",

  imageExtensions: ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"],
  audioExtensions: ["mp3"],

  shufflePosters: false,
  shuffleMusic: false,
  audioMode: "background",
  loopMusic: true,
  audioVolume: 0.75,

  startFullscreen: true,

  // Android Type-C/HDMI 直式螢幕輸出可用 auto、off、rotate-right、rotate-left。
  hdmiPortraitMode: "auto",

  transitionMs: 900,
  showStatusBar: true
};
