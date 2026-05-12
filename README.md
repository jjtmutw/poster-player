# 海報播放機

這是一個可以部署到 GitHub Pages 的純靜態 HTML 海報播放機。

## 使用方式

1. 把海報圖片放進 `poster/`。
2. 把背景音樂 MP3 放進 `mp3/`。
3. 在 `config.js` 調整每張海報秒數、目錄名稱、音量與播放模式。
4. 推到公開 GitHub repo 後，開啟 GitHub Pages。

在 GitHub Pages 上，播放器會用 GitHub public repo API 自動讀取 `poster/` 與 `mp3/` 目錄，所以通常不需要手動更新清單。

## config.js 重點設定

```js
window.POSTER_PLAYER_CONFIG = {
  slideSeconds: 8,
  posterDir: "poster",
  mp3Dir: "mp3",
  sourceMode: "auto",
  githubBranch: "main",
  audioVolume: 0.75,
  startFullscreen: true
};
```

## 備援清單

如果不是放在 GitHub Pages，且伺服器沒有開啟目錄索引，可以改用 manifest：

`poster/manifest.json`

```json
{
  "files": ["poster-01.jpg", "poster-02.png"]
}
```

`mp3/manifest.json`

```json
{
  "files": ["music-01.mp3", "music-02.mp3"]
}
```

## 操作

- 點「開始播放」：開始背景音樂，並依設定進入全螢幕。
- 空白鍵：暫停或恢復自動播放。
- `PageDown` 或右方向鍵：下一張海報。
- `PageUp` 或左方向鍵：上一張海報。
- `M`：背景音樂播放或暫停。
- `F`：進入全螢幕。
- 手機點一下畫面：暫停或恢復自動播放。
- 手機快速點兩下畫面：背景音樂播放或暫停。
- 手機向左滑：上一張海報。
- 手機向右滑：下一張海報。

瀏覽器通常不允許網頁未經點擊就自動播放有聲音的音樂，所以第一次播放需要按一次「開始播放」。

## 手機全螢幕

一般手機瀏覽器分頁不能完全隱藏地址列。若要真正無地址列顯示，請用加入主畫面的 PWA 模式開啟：

- Android Chrome/Edge：開啟播放器網址，選單選「加入主畫面」或「安裝應用程式」，之後從主畫面圖示開啟。
- iPhone Safari：開啟播放器網址，分享選單選「加入主畫面」，之後從主畫面圖示開啟。

此專案已包含 `manifest.webmanifest`，會以 `fullscreen` 模式啟動。
