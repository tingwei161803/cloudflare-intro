# Cloudflare 開發者入門指南

> 用大量圖示與白話說明，帶完全沒基礎的初學者認識整個 Cloudflare 開發者平台的 28 個產品——每個都講清楚「這是什麼、什麼時候用、怎麼開始」。

這個網站把 Cloudflare 龐雜的開發者產品整理成 **6 大分類、28 個產品教材頁**，外加新手上路指南、可搜尋的詞彙表、隨堂測驗與字卡。所有內容皆為中英雙語、可一鍵切換，並整理自 Cloudflare 官方開發者文件。

---

## 🔗 線上版 / Live

| | |
|---|---|
| 🌐 網站 | <https://tingwei161803.github.io/cloudflare-intro/> |

> 直接點進去就能用，無需安裝。每一頁都有獨立網址，例如產品頁 `…/workers.html`、分類頁 `…/compute.html`，方便分享與收藏。

---

## ✨ 功能特色

- 🧭 **39 個頁面** — 1 個總覽首頁 + 新手上路 + 6 個分類頁 + 28 個產品教材頁 + 詞彙表／測驗／字卡
- 🗂️ **分門別類** — 運算、AI、儲存與資料庫、媒體、安全、效能，六大家族一目了然
- 🎨 **大量圖示** — 每個概念、情境、步驟都搭配 Material Symbols 圖示，初學者好吸收
- 📖 **教材式說明** — 每個產品都依「這是什麼 → 為什麼用 → 何時用 → 怎麼開始 → 重點概念 → 小提示」循序漸進，附可直接複製的範例程式碼
- 🌏 **雙語切換** — 中文 / English 一鍵切換，整頁重繪不殘留
- 🌗 **深色 / 淺色模式** — 手動切換，並記住你的選擇
- 🔍 **詞彙速查** — 50 個術語可即時搜尋，白話解釋
- 📝 **隨堂測驗** — 15 題即時回饋 + 計分，檢查學習成果
- 🃏 **翻卡字卡** — 32 張點擊翻面的記憶卡
- 📱 **響應式設計** — 手機、平板、桌機皆適配
- ⚡ **純靜態** — 無後端、零建置、載入快、可離線瀏覽

---

## 📂 內容結構 / 資料來源

本站內容整理自 **Cloudflare 官方開發者文件**（<https://developers.cloudflare.com/>）。

```
cloudflare-intro/
├── index.html              # 總覽首頁（hub）
├── start.html              # 新手上路
├── compute|ai|storage|…    # 6 個分類頁
├── workers|r2|d1|…         # 28 個產品教材頁（每個產品一頁）
├── glossary|quiz|flashcards.html  # 詞彙表 / 測驗 / 字卡
├── assets/
│   ├── styles.css          # Material Design 3 + Cloudflare 橘配色
│   ├── shell.js            # 共用框架：app bar、跨頁導覽、頁尾、語言/主題
│   └── app.js              # 版型引擎：home / category / lesson / glossary / quiz / flashcards
├── data/
│   ├── data.js             # 組裝後的單一資料檔（SITE_META / SITE_CATEGORIES / SITE_PAGES）
│   ├── products/*.json     # 28 個產品的教材內容原始檔
│   └── extra/*.json        # 詞彙表 / 測驗 / 字卡 / 新手上路 / 站台文案
├── scripts/
│   ├── assemble.py         # 把 products + extra + site.json 組成 data/data.js
│   └── gen_pages.py        # 由 data.js 產生所有 .html 進入點
└── .nojekyll
```

> ⚠️ **非官方**：本網站為個人整理之非官方學習資源，內容整理自 Cloudflare 官方開發者文件，
> 產品規格、限制與計費可能隨時間調整，**請一律以官方來源為準**。各產品頁底部皆附官方文件連結。

設計與圖示參考：[Material Symbols](https://fonts.google.com/icons) 圖示庫、Material Design 3 配色系統（主色採 Cloudflare 招牌橘 `#F6821F`）。

---

## 🛠 本機使用

```bash
# 1. clone 專案
git clone https://github.com/tingwei161803/cloudflare-intro.git
cd cloudflare-intro

# 2. 啟動本機伺服器（建議；多頁面 + 相對路徑需要 http://，不要直接開檔案）
uv run python -m http.server 4173
# 然後瀏覽 http://localhost:4173
```

> 本專案為純靜態網站，不需安裝任何依賴。若要重新產生內容：
> `uv run python scripts/assemble.py`（重建 `data/data.js`）→ `uv run python scripts/gen_pages.py`（重建所有 `.html`）。

---

## 📝 聲明 / License

- 本站為非官方整理，內容著作權歸原始來源 Cloudflare 所有；Cloudflare、Workers、R2 等為 Cloudflare, Inc. 的商標。
- 本站使用 **Google Analytics 4**（GA4 property：「Cloudflare 開發者入門指南 - GA4」）蒐集匿名的造訪流量數據，用於了解使用情況；不會用於識別個人身分。
- 程式碼以 **MIT** 授權釋出。
- 如為權利人且希望調整或移除內容，請開 issue 聯絡。
