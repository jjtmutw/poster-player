# 海報播放器

這是一個可部署在 GitHub Pages 的靜態海報播放器。圖片放在海報目錄，MP3 放在音樂目錄，開啟首頁後可以選擇要播放哪一組目錄與海報切換速度。

## 使用方式

1. 將圖片放到 `poster/`、`poster1/`、`poster2/` 等海報目錄。
2. 將 MP3 放到 `mp3/`、`mp3_1/`、`mp3_2/` 等音樂目錄。
3. 在首頁選擇「海報目錄」、「音樂目錄」與「播放速度」。
4. 按「套用設定」讀取所選目錄，再按「開始播放」。

首頁設定會儲存在目前裝置的瀏覽器中，下次開啟會自動沿用。

## 新增可選目錄

編輯 `config.js`，把新資料夾名稱加入選單清單：

```js
window.POSTER_PLAYER_CONFIG = {
  posterDir: "poster",
  mp3Dir: "mp3",
  availablePosterDirs: ["poster", "poster1", "poster2", "poster3"],
  availableMp3Dirs: ["mp3", "mp3_1", "mp3_2", "mp3_3"]
};
```

首頁也有「自訂目錄...」可直接輸入未列在清單中的資料夾名稱。

## manifest.json

如果伺服器不提供目錄索引，請在每個媒體目錄放一個 `manifest.json`：

`poster1/manifest.json`

```json
{
  "files": ["poster-01.jpg", "poster-02.png"]
}
```

`mp3_1/manifest.json`

```json
{
  "files": ["music-01.mp3", "music-02.mp3"]
}
```

## 常用按鍵

- 空白鍵：暫停或繼續海報輪播
- `PageDown` / 右方向鍵：下一張海報
- `PageUp` / 左方向鍵：上一張海報
- `M`：播放或暫停音樂
- `F`：全螢幕
