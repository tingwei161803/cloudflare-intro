# 產品教材頁 JSON Schema（給平行撰寫 agent 用）

每個 Cloudflare 產品 = 一個 `data/products/<slug>.json`，結構如下。**所有給人看的字串都必須是雙語物件 `{"en": "...", "zh": "..."}`**（zh 用繁體中文台灣用語）。程式碼 `code.body` 例外，是純字串（程式碼不翻譯，但程式碼裡的「中文說明 callout」要寫在 callout 裡，不要塞進 code）。

對象是**完全沒接觸過 Cloudflare 的初學者**：用生活化比喻、白話、step-by-step，避免行話；出現專有名詞要當場解釋。

## 頂層欄位

```jsonc
{
  "slug": "workers",                 // 檔名一致，URL-safe，kebab-case
  "category": "compute",             // compute | ai | storage | media | security | performance
  "icon": "bolt",                    // Material Symbols Rounded 名（由我指定，照填）
  "title": { "en": "Workers", "zh": "Workers" },     // 產品名（通常 en=zh）
  "subtitle": { "en": "Serverless code at the edge", "zh": "在邊緣執行的無伺服器程式碼" }, // 一句話定位
  "hero": {
    "badge":   { "en": "Compute", "zh": "運算" },     // 分類標籤（照分類填）
    "tagline": { "en": "...", "zh": "..." }           // hero 大標下方一句吸睛說明（1 句）
  },
  "stats": [                          // 2-4 個亮眼數字（來自官方文件，標準化）
    { "value": "330+", "label": { "en": "Cities", "zh": "城市" } },
    { "value": "0ms",  "label": { "en": "Cold starts", "zh": "冷啟動" } }
  ],
  "sections": [ /* 見下 */ ],
  "related": [                        // 2-4 個相關產品（slug 必須是站內真實 slug）
    { "slug": "kv",  "label": { "en": "Workers KV", "zh": "Workers KV" } },
    { "slug": "r2",  "label": { "en": "R2", "zh": "R2" } }
  ],
  "docs": "https://developers.cloudflare.com/workers/"   // 官方文件首頁
}
```

## sections（教材主體，建議 4-6 個 section）

每個 section 有 `id`（kebab-case、頁內唯一）、`icon`（Material Symbols 名）、`heading`（雙語）、`blocks`（內容區塊陣列）。

**建議的 section 順序**（這就是「給初學者的詳細說明 + 怎麼使用」）：
1. `what` 「這是什麼？」icon `lightbulb` — lead 段 + 生活化比喻 callout
2. `why` 「為什麼用它 / 解決什麼問題？」icon `help` — p + cards（痛點/好處）
3. `when` 「什麼時候該用？」icon `target` — cards（適用情境，每張一個 icon）
4. `how` 「怎麼開始用？」icon `rocket_launch` — steps（含安裝/部署指令 code）
5. `concepts` 「重點概念」icon `school` — cards（術語解釋，每個一個 icon）
6. `tips` 「小提示 / 計費」icon `tips_and_updates` — callout(tip) + ul

可依產品微調，但務必包含 what / when / how 三段，且 how 要有可實際執行的程式碼或指令。

### block 型別（放在 section.blocks 內）

```jsonc
// 大段引言（每段開頭用一次）
{ "type": "lead", "text": { "en": "...", "zh": "..." } }

// 一般段落
{ "type": "p", "text": { "en": "...", "zh": "..." } }

// 小標題
{ "type": "h3", "text": { "en": "...", "zh": "..." } }

// 條列
{ "type": "ul", "items": { "en": ["a","b","c"], "zh": ["甲","乙","丙"] } }

// 重點框（variant: analogy 比喻 | tip 提示 | note 補充 | warn 注意）
{ "type": "callout", "variant": "analogy", "icon": "lightbulb",
  "title": { "en": "Think of it like…", "zh": "把它想成…" },
  "text":  { "en": "...", "zh": "..." } }

// 圖示卡片格（適用情境、好處、概念都用這個——每張卡一個 icon，給很多圖示）
{ "type": "cards", "items": [
  { "icon": "speed",  "title": { "en": "Fast", "zh": "快" }, "text": { "en": "...", "zh": "..." } },
  { "icon": "savings","title": { "en": "Cheap","zh": "便宜" }, "text": { "en": "...", "zh": "..." } }
] }

// 編號步驟（怎麼用，step 可帶 code）
{ "type": "steps", "items": [
  { "title": { "en": "Install Wrangler", "zh": "安裝 Wrangler" },
    "text":  { "en": "...", "zh": "..." },
    "code":  { "lang": "bash", "body": "npm install -g wrangler\nwrangler login" } },
  { "title": { "en": "Deploy", "zh": "部署" },
    "text":  { "en": "...", "zh": "..." } }   // code 可省略
] }

// 獨立程式碼區塊（會有複製按鈕；body 是純字串，可多行用 \n）
{ "type": "code", "lang": "js", "title": { "en": "hello.js", "zh": "hello.js" },
  "body": "export default {\n  async fetch(request) {\n    return new Response('Hello!');\n  }\n};" }

// 引言/金句
{ "type": "quote", "text": { "en": "...", "zh": "..." } }
```

## 撰寫品質要求

- zh 用**繁體中文、台灣慣用語**（例如「程式碼」「伺服器」「部署」「設定」），不要簡體、不要中國用語。
- 每段都要白話、對初學者友善；出現英文術語第一次時用括號補一句中文解釋。
- `stats`、指令、限制數字都要**來自官方文件**（會給你官方網址，請 WebFetch 查證）。
- `code` 要是能跑、正確的真實範例（Wrangler / Workers / wrangler.toml 等），不要假碼。
- `cards` 多用、每張配貼切的 Material Symbols icon —— 使用者特別要求「很多圖示」。
- 所有 `related[].slug` 必須是這 28 個真實 slug 之一（見下）。

## 28 個產品 slug（related 只能引用這些）

compute: `workers` `containers` `durable-objects` `queues`
ai: `workers-ai` `ai-gateway` `agents` `vectorize` `browser-rendering`
storage: `r2` `d1` `kv` `hyperdrive` `pipelines`
media: `images` `stream` `realtime`
security: `waf` `ssl-tls` `turnstile` `tunnel` `access` `gateway`
performance: `dns` `cdn` `speed` `smart-shield` `web-analytics`
