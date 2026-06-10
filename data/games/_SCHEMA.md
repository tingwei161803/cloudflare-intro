# 互動小遊戲 JSON Schema — 給平行撰寫 agent

每個遊戲 = 一個 `data/games/<slug>.json`。你只負責**寫題庫資料**（純 JSON），遊戲的互動邏輯已由引擎處理好。**所有給人看的字串一律雙語 `{en,zh}`**，zh 用繁體中文台灣用語。內容要正確（依 Cloudflare 官方事實）、對初學者友善、好玩。

## 共同頂層欄位（每個檔都要有）

```jsonc
{
  "slug": "pick-storage",            // 與檔名一致
  "category": "arcade",              // 固定
  "layout": "game-pick",             // 用哪個遊戲引擎（見下表，照你被指派的填）
  "group": { "en": "Quick Pick", "zh": "選型快答" },   // 子分類（照指派填）
  "icon": "sports_esports",          // Material Symbols 名（照指派填）
  "title":    { "en": "...", "zh": "..." },
  "subtitle": { "en": "...", "zh": "..." },
  "hero": {
    "badge":   { "en": "Game", "zh": "小遊戲" },
    "tagline": { "en": "one playful line", "zh": "一句吸睛說明" }
  }
  // 之後接該遊戲引擎需要的題庫欄位（見下）
}
```

## 7 種遊戲引擎與題庫欄位

### 1. `game-match`（連連看 / 配對）
玩家點左欄一項、再點右欄一項來配對。
```jsonc
"pairs": [
  { "left": { "en": "Workers", "zh": "Workers" },
    "right": { "en": "Run serverless code at the edge", "zh": "在邊緣執行無伺服器程式碼" } }
]
```
- 給 **6–8 組** pairs。left 通常是產品/術語，right 是一句話定義或對應的情境。left/right 都要短（右側 ≤ ~16 字 / ~40 chars）。

### 2. `game-memory`（記憶翻牌）
引擎會把每個 tile 變成「圖示牌 + 名稱牌」兩張，洗牌後玩家翻牌找配對。
```jsonc
"tiles": [
  { "icon": "bolt", "label": { "en": "Workers", "zh": "Workers" } }
]
```
- 給 **6–8 個** tiles（即 6–8 對牌）。icon 用貼切的 Material Symbols 名；label 是該產品/概念名稱（短）。

### 3. `game-sort`（分類挑戰）
逐一出現的項目，玩家點正確的「桶」歸類。
```jsonc
"buckets": [
  { "key": "compute", "label": { "en": "Compute", "zh": "運算" }, "icon": "bolt" }
],
"items": [
  { "label": { "en": "Workers", "zh": "Workers" }, "icon": "bolt", "bucket": "compute" }
]
```
- **3–5 個** buckets，**10–15 個** items；每個 item 的 `bucket` 必須等於某個 bucket 的 `key`。

### 4. `game-pick`（選型快答，有計時/連勝/生命）
每題一個情境 + 4 個選項，選對的那個用 `answer`（0 起算的索引）。
```jsonc
"rounds": [
  { "scenario": { "en": "You need to store big files cheaply with no egress fees.", "zh": "你要便宜地存大檔案，而且不想付流出費。" },
    "options": [ {"en":"R2","zh":"R2"}, {"en":"KV","zh":"KV"}, {"en":"D1","zh":"D1"}, {"en":"Queues","zh":"Queues"} ],
    "answer": 0,
    "why": { "en": "R2 is object storage with zero egress fees.", "zh": "R2 是物件儲存，流出免費。" } }
]
```
- **8–10 題**；每題剛好 4 個 options；`answer` 是正解索引；`why` 一句解釋。

### 5. `game-order`（流程排序）
`steps` 請**照正確順序**寫，引擎會自動打亂讓玩家排回來。
```jsonc
"puzzles": [
  { "prompt": { "en": "Order the steps to deploy your first Worker.", "zh": "把部署第一個 Worker 的步驟排好。" },
    "steps": [
      { "en": "Install Wrangler", "zh": "安裝 Wrangler" },
      { "en": "Run wrangler login", "zh": "執行 wrangler login" },
      { "en": "Create the Worker", "zh": "建立 Worker" },
      { "en": "Run wrangler deploy", "zh": "執行 wrangler deploy" }
    ] }
]
```
- 給 **1–2 個** puzzles，每個 **5–7 個** steps（steps 已是正確順序）。

### 6. `game-truefalse`（真假快答）
```jsonc
"statements": [
  { "text": { "en": "R2 charges egress fees for downloads.", "zh": "R2 下載要收流出費。" },
    "answer": false,
    "explain": { "en": "R2 has zero egress fees — that's its headline feature.", "zh": "R2 流出免費，這正是它的招牌。" } }
]
```
- **10–12 題**；`answer` 是布林值 true/false；`explain` 一句解釋。一半對一半錯，避免猜得到。

### 7. `game-build`（架構拼圖）
給一個目標 + 一排產品 palette，玩家複選「要哪些」，`answer` 是正確該選的索引陣列。
```jsonc
"rounds": [
  { "goal": { "en": "Build a simple blog", "zh": "做一個簡單的部落格" },
    "palette": [
      { "label": {"en":"Workers","zh":"Workers"}, "icon": "bolt" },
      { "label": {"en":"D1","zh":"D1"}, "icon": "database" },
      { "label": {"en":"R2","zh":"R2"}, "icon": "inventory_2" },
      { "label": {"en":"Vectorize","zh":"Vectorize"}, "icon": "scatter_plot" }
    ],
    "answer": [0, 1, 2],
    "note": { "en": "Workers serve it, D1 stores posts, R2 holds images. Vectorize isn't needed.", "zh": "Workers 提供服務、D1 存文章、R2 放圖片；Vectorize 用不到。" } }
]
```
- 給 **2–3 個** rounds；每個 palette **5–7 項**（含 2–3 個誘答的「不需要」項）；`answer` 是正確項的索引陣列；`note` 解釋。

## 品質要求
- zh 一律繁體中文台灣用語（程式碼/伺服器/部署/設定/佇列/快取），不要簡體。
- 事實要正確（R2 免流出費、KV 最終一致、D1 是 SQL、Durable Objects 強一致…）。
- 文字要短、適合遊戲卡片/按鈕。
- 嚴格合法 JSON（雙引號、無註解、無尾逗號）。寫完回報 slug。
