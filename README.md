# Songcraft Suno

用 Suno 製作單曲與專輯的本機創作工作室。

## 開始使用

```powershell
npm start
```

開啟 <http://127.0.0.1:4317>。

網站可協助整理主題、歌詞、曲風、版本、音檔與共用封面；歌曲生成與下載仍由使用者在 Suno 網頁手動完成。

## AI 選項

- 可在「AI 設定」填入 Gemini API 金鑰，直接在網站生成結構化草稿。
- 不填金鑰時，使用「開啟 Gemini Chat」：網站會依模板替換 `%s`、複製提示詞並開啟 Gemini，回覆再貼回網站。
- 金鑰只保留在目前頁面記憶體，不會寫入作品備份。

## Suno 小幫手

`dist/suno-helper.zip` 是 Chrome／Edge MV3 擴充套件。解壓縮後從瀏覽器擴充功能頁以「載入未封裝項目」安裝。它只在使用者點擊後填入目前 Suno Custom 頁面的歌名、歌詞與曲風，不會按生成或下載。

## 驗證

```powershell
npm run check
npm test
```

作品保存在目前瀏覽器的 IndexedDB；請定期使用網站的「備份這份作品」。
