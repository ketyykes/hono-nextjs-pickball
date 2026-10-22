# Overview: local-data-import（B9）

## Scope

登入後，使用者可以把訪客時期留在本機的名單、回合、歷史與計分板進度一次匯入雲端；雲端已有對戰分配機資料時拒絕並說明，本機資料一律保留。
登入時的 JSON 還原恢復，改為「從 JSON 備份匯入到雲端」，規則相同。訪客完全不變。

**Size**: large — 只影響 2 個 capability，但 tasks 22 項（>20）且跨前端／後端／核心套件。
**Frontend involved**: yes — 資料頁新增匯入區塊、JSON 還原改為匯入、參賽者頁提示。
**DB schema touched**: no — 沿用 B5～B7 的表與守衛表。
**Data migration**: yes（使用者觸發）— 把本機 LocalStorage 資料搬進 D1；無 schema 變更。
**Cross-component flow**: yes — 讀本機 → 前端過濾與大小檢查 → 單一 batch 的守衛與 `json_each` 插入 → 各頁改讀雲端。

---

## What Changes

- 後端：`POST /api/import`（守衛：四張對戰分配機表皆空；`json_each` 插入；獨立計分板已存在則略過）
- 核心套件：`api/import.ts`
- 前端：`lib/sync/local-import.ts`、`LocalDataImportSection`、`LocalImportNotice`；`JsonBackupSection` 雲端分支改為匯入

```
=== Before (B8 後，登入時) ===
本機 5 個 key（訪客資料）--> 無法帶到雲端
資料頁 JSON 還原        --> 停用（顯示說明）

=== After (B9，登入時) ===
本機 5 個 key --> [匯入本機資料到雲端] --> POST /api/import
                  雲端為空：寫入 / 雲端已有：409 拒絕
                  本機資料保留
資料頁 JSON 還原 --> 從 JSON 備份匯入到雲端（同一規則）
```

## UI Mockups

```
=== State 1: 參賽者頁（登入，雲端名單為空，本機有資料）===
┌──────────────────────────────────────────────┐
│ ℹ 這台裝置有登入前的資料，可匯入雲端。       │
│   [前往匯入]                                  │ ← LocalImportNotice
│ （空白名單）  [新增參賽者]                    │
└──────────────────────────────────────────────┘
        │ 前往資料頁
        ▼
=== State 2: 資料頁「匯入本機資料到雲端」===
┌──────────────────────────────────────────────┐
│ 匯入本機資料到雲端                            │
│ 參賽者 12 位、目前回合 1 個、歷史 48 筆、     │
│ 計分板進度 2 場（略過 1 筆重複歷史）          │
│ 只有在雲端沒有任何對戰分配機資料時才能匯入；  │
│ 匯入後本機資料會保留。                        │
│ [匯入本機資料到雲端]                          │
└──────────────────────────────────────────────┘
        │ 按下
        ├────────────── 200 ──────────────┐
        ▼                                 ▼
=== State 3: 已匯入 ===            === State 4: 409 ===
│ ✓ 已匯入 12 位參賽者、48 筆歷史… │ │ ✕ 雲端已有對戰分配機資料，無法匯入。 │
                                    │   若要以本機資料取代，請先在參賽者頁 │
                                    │   重置名單。                         │

=== State 5: 本機沒有資料 ===
│ 本機沒有可匯入的資料                          │ ← 無按鈕

=== State 6: JSON 還原（登入時）===
│ 從 JSON 備份匯入到雲端  [選擇檔案]            │ ← 規則同 State 2～4
```

## Data Migration

```
LocalStorage（訪客）                     D1（本人 user_id）
matchmaker:roster:v1   ── 3 位 ───────> matchmaker_players   sort_order=索引
matchmaker:round:v1    ── 1 個 ───────> matchmaker_round     version=1
scoreboard:matches:v1  ── 只讀回合中 ─> matchmaker_match_slots
                          未完成場次
matchmaker:history:v1  ── 去重、原順序 > matchmaker_history   played_at=ms
scoreboard:current:v1  ── 有則寫 ─────> scoreboard_current   已存在則略過
（本機資料不刪除；重送由守衛拒絕，不會重複）
```

- 執行者：使用者在資料頁按下按鈕；不自動執行。
- 回滾：在參賽者頁「重置名單」清除雲端的對戰分配機資料（本機資料仍在，可再匯入）。

## Architecture

```
 前端                                         後端
┌───────────────────────────────┐          ┌──────────────────────────┐
│ players/page                  │          │ routes/import.ts         │
│  └ LocalImportNotice          │          │  └ local-import-repository│
│ data/page                     │  POST    │     batch:                │
│  ├ LocalDataImportSection ────┼────────> │      guard(四表皆空)      │
│  └ JsonBackupSection(雲端分支)│ /api/    │      json_each ×4         │
│ lib/sync/local-import.ts      │ import   │      scoreboard DO NOTHING│
│  └ 既有 reader（只讀）        │          │      delete guard         │
└───────────────────────────────┘          └────────────┬─────────────┘
       共用：@pickball/core api/import（LocalImportRequestSchema）
                                                         ▼
                                                 D1（B5～B7 的表）
```

## Sequence Diagram

```
使用者   資料頁            local-import.ts      API /import        D1
  │ 按匯入 │                   │                   │               │
  │──────>│ buildLocalImport   │                   │               │
  │       │──────────────────>│ 讀 5 key（只讀）  │               │
  │       │<── payload,summary │ 過濾、去重、大小  │               │
  │       │ importLocalData ──>│ POST ────────────>│ 驗證 schema   │
  │       │                    │                   │ batch ───────>│
  │       │                    │                   │  guard 失敗 → │
  │       │                    │                   │  整批回滾 409 │
  │       │                    │<── 200 imported ──│               │
  │<─ 已匯入 N 筆（本機不動）  │                   │               │
  │ 再按一次 ──────────────────────────────────────> 409（不重複）  │
```

## Task Tree

```
§1 對齊 main＋Context7＋實測 (4)
 └─ §2 核心 api/import (2)
     └─ §3 後端 POST /api/import (3)
         └─ §4 local-import.ts (2)
             └─ §5 E2E＋畫面接線 (3)
                 └─ §6 文件＋總驗收 (8)
```

## Cross-Cutting Impact

- **使用者定案**：保留本機、拒絕不覆寫不合併、冪等——各有 integration 與 e2e 測試。
- **重用**：整批守衛與錯誤分類沿用 B7 `batch-guard.ts`；排序沿用 B8 的 `played_at`＋`rowid`。
- **既有測試**：只刪除 B6 的一條 E2E（JSON 還原停用）。
- **hooks 歸屬清單**：不變（無新 hook）。
- **相依**：無新增第三方套件。
