# 整合教學（串接）JSON Schema — 給平行撰寫 agent

每篇整合教學 = 一個 `data/guides/<slug>.json`。**結構與產品教材頁相同**（見 `../products/_SCHEMA.md` 的 sections / blocks 規格），但有三個差異：

1. 頂層 `"category": "integrations"`（固定）。
2. 多一個頂層 `"group"` 欄位（雙語），用於在分類頁分組。可用值（照填其一）：
   - `{ "en": "Full-stack Basics", "zh": "全端串接基礎" }`
   - `{ "en": "Data & Storage", "zh": "資料庫與儲存" }`
   - `{ "en": "Architecture Blueprints", "zh": "架構藍圖" }`
   - `{ "en": "Flows & Lifecycles", "zh": "流程圖解" }`
3. blocks 多一個 **`mermaid` 圖表型別**（見下）。**這是本章重點：每篇至少要有 2–4 張 mermaid 圖。**

所有給人看的字串一律雙語 `{en,zh}`，zh 用繁體中文台灣用語。對象是想「把前端、後端、資料庫串起來」的初學～中階開發者。

## 頂層範例

```jsonc
{
  "slug": "frontend-worker-d1-crud",
  "category": "integrations",
  "group": { "en": "Full-stack Basics", "zh": "全端串接基礎" },
  "icon": "sync_alt",
  "title": { "en": "Front-end ↔ Worker ↔ D1: full CRUD", "zh": "前端 ↔ Worker ↔ D1：完整 CRUD 串接" },
  "subtitle": { "en": "Wire a web page to a Worker API backed by a SQL database", "zh": "把網頁串到 Worker API，再接上 SQL 資料庫" },
  "hero": {
    "badge": { "en": "Integration", "zh": "整合實戰" },
    "tagline": { "en": "...", "zh": "..." }
  },
  "stats": [ { "value": "3", "label": { "en": "Layers wired", "zh": "層串接" } } ],
  "sections": [ /* 見下 */ ],
  "related": [ { "slug": "d1", "label": { "en": "D1", "zh": "D1" } }, { "slug": "workers", "label": {"en":"Workers","zh":"Workers"} } ],
  "docs": "https://developers.cloudflare.com/d1/"
}
```

## 建議 section 結構（每篇 5–7 段）

1. `overview` icon `insights` — 「我們要串什麼？」lead + 一張**架構圖（mermaid flowchart）**顯示 前端 → Worker → DB 的關係
2. `architecture` icon `account_tree` — 各層職責（cards），再一張更細的架構或元件圖
3. `data-model` icon `schema` —（資料庫相關才有）**ER 圖（mermaid erDiagram）** + 建表 SQL（code）
4. `flow` icon `swap_vert` — **請求流程（mermaid sequenceDiagram）**：使用者點擊 → fetch → Worker → DB → 回傳
5. `build` icon `construction` — 怎麼動手串（steps），**前端 code + Worker code + wrangler 設定 + SQL 各一段**
6. `concepts` icon `school` — 重點概念/術語（cards）
7. `tips` icon `tips_and_updates` — 常見錯誤、陷阱、計費提醒（callout + ul）

務必包含 overview、build 兩段，且 build 要有**前端、後端(Worker)、資料層**三邊的真實程式碼。

## block 型別

沿用 products schema 的所有型別：`lead` `p` `h3` `ul` `quote` `callout`(variant analogy/tip/note/warn) `cards`(每張帶 icon) `steps`(可帶 code) `code`(lang+body 純字串)。**新增**：

```jsonc
// mermaid 圖表（雙語：code 的 en/zh 是兩份 mermaid 原始碼，只有「標籤文字」不同、結構相同）
{ "type": "mermaid",
  "title": { "en": "Request flow", "zh": "請求流程" },
  "code": {
    "en": "sequenceDiagram\n  participant U as Browser\n  participant W as Worker\n  participant D as D1\n  U->>W: GET /api/todos\n  W->>D: SELECT * FROM todos\n  D-->>W: rows\n  W-->>U: JSON",
    "zh": "sequenceDiagram\n  participant U as 瀏覽器\n  participant W as Worker\n  participant D as D1\n  U->>W: GET /api/todos\n  W->>D: SELECT * FROM todos\n  D-->>W: 資料列\n  W-->>U: JSON"
  }
}
```

### mermaid 撰寫規則（很重要，違反會渲染失敗）
- 只用這三種圖：`flowchart TD`（或 `LR`）、`sequenceDiagram`、`erDiagram`。其餘不要用。
- **節點/參與者的標籤若含空白、中文、`/`、`-`、`:`、`(` `)` 等，務必用雙引號包起來**，例如 `A["前端網頁"]`、`participant DB as "D1 資料庫"`。純英數字 ID 不用引號。
- 每張圖 ≤ 12 個節點，保持清楚。
- **`code.en` 與 `code.zh` 結構必須一模一樣，只翻譯標籤文字**（這樣切語言時圖會跟著換、不殘留）。
- 換行用 `\n`（JSON 字串內）。不要在標籤裡放雙引號或反斜線。
- flowchart 連線用 `-->`，可加文字 `--|"文字"|-->` 請寫成 `A -->|文字| B`（文字含特殊字元時 `A -->|"文字"| B`）。
- erDiagram 範例：
  ```
  erDiagram\n  USERS ||--o{ TODOS : has\n  USERS {\n    int id PK\n    text email\n  }\n  TODOS {\n    int id PK\n    int user_id FK\n    text title\n  }
  ```

## 品質要求
- 對象是初學～中階；用白話 + 生活化比喻；每個術語第一次出現用繁中解釋。
- `build` 的程式碼要真實可跑：前端用原生 `fetch`、Worker 用 `export default { async fetch(req, env) {...} }` 並讀 `env.DB` 之類 binding、wrangler 設定（`wrangler.toml` 或 `wrangler.jsonc`）、SQL 用真實 `CREATE TABLE` / `INSERT` / `SELECT`。
- `related[].slug` 必須是站內真實 slug（28 個產品 slug，見 products/_SCHEMA.md；也可指向其他 guide 的 slug）。
- 輸出**嚴格合法 JSON**（雙引號、無註解、無尾逗號）。
- 每篇 ≥ 2 張 mermaid 圖（資料庫相關的請含一張 erDiagram，有請求往返的請含一張 sequenceDiagram，一定要有一張整體 flowchart 架構圖）。
