window.POSTER_PLAYER_CONFIG = {
  // 每張海報停留秒數。
  slideSeconds: 20,

  // GitHub Pages 建議維持這兩個目錄名稱，直接把圖片放進 poster、MP3 放進 mp3。
  posterDir: "poster",
  mp3Dir: "mp3",

  // auto: GitHub Pages 會用 GitHub API 自動讀 public repo 目錄；
  //      一般伺服器會嘗試讀目錄索引；
  //      失敗時讀 poster/manifest.json 與 mp3/manifest.json。
  // github: 強制使用 GitHub API。
  // directory: 強制解析伺服器目錄索引。
  // manifest: 強制使用 manifest.json。
  sourceMode: "auto",

  // 留空時會從 GitHub Pages 網址自動推斷。
  // 例如 https://jjtmutw.github.io/poster-player/ 會推斷 owner=jjtmutw, repo=poster-player。
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",

  imageExtensions: ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"],
  audioExtensions: ["mp3"],

  shufflePosters: false,
  shuffleMusic: false,
  loopMusic: true,
  audioVolume: 0.75,

  // true 時點「開始播放」會同時要求瀏覽器進入全螢幕。
  startFullscreen: true,

  // Android Type-C/HDMI 有時會把外接直立螢幕當橫向輸出。
  // auto: Android 橫向 viewport 時自動把播放畫面旋轉成直式。
  // off: 不旋轉。
  // rotate-right / rotate-left: 強制指定旋轉方向。
  hdmiPortraitMode: "auto",

  transitionMs: 900,
  showStatusBar: true
};
