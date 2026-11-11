# Overview: cloud-json-import-append

## Scope

已登入時，資料頁的「從 JSON 備份匯入到雲端」目前只在雲端完全沒有對戰分配機資料時才寫入，否則拒絕。session 無法確認期間在本機產生的資料（經 JSON 備份）因此救不回雲端。
本 change 改為：雲端已有資料時先顯示附加確認與四條說明，使用者按「附加到雲端」才把備份的參賽者與歷史**附加**上去。同名參賽者視為同一人而略過，重複的歷史也略過，雲端既有資料一律不覆寫。附加的歷史中，同名者的球員 id 改寫為雲端那位的 id，讓比賽算進他的統計。回合不匯入，強度分數不變。

**Size**: large — 跨前端與後端兩個 Worker 加上核心套件，tasks 超過 20 項；影響 2 個 capability（user-data-sync、data-transfer），無新依賴、無資料遷移。
**Frontend involved**: yes — 資料頁 JSON 匯入區塊新增附加確認、無可附加提示與附加結果。
**DB schema touched**: no — 沿用既有 `matchmaker_players`、`matchmaker_history`，不新增表、欄位或索引。
**Data migration**: no — 只新增列，不搬移、不轉換既有資料。
**Cross-component flow**: yes — 「整份匯入 → 409 → 使用者確認 → 附加」是順序敏感的兩段式請求，且附加在單一 batch 內依序完成「參賽者寫入 → 依寫入後名單改寫歷史 id」。

---

## What Changes

- 新增後端 `POST /api/import/append`：單一 D1 batch、固定兩條 `INSERT … SELECT … FROM json_each(?)`；雲端同名或 id 已存在的參賽者略過，已存在 `matchId` 的歷史略過；新參賽者接在名單之後；附加的歷史中，同名而被略過者的球員 id 改寫為雲端那位的 id。
- 不碰回合、分槽、獨立計分板、版本下限與整批守衛表；同一份備份附加兩次，第二次全部略過；沒有 409。
- 核心新增附加契約：`AppendImportRequestSchema`、`AppendImportResponseSchema`、`serializeAppendSegments`（同名去重＋參賽者對照段）、`checkAppendLimits`。
- 前端 JSON 雲端匯入：照舊先整份匯入，409 時顯示附加確認，按下才附加；成功顯示新增與略過筆數。
- 雲端分支說明文字 `jsonCloudImportHint` 改寫；「匯入本機資料到雲端」區塊不變。

Before / after 對照（已登入、雲端已有資料、選取 JSON 備份）：

```
=== Before ===
選檔 -> POST /api/import -> 409
     -> 顯示「雲端已有對戰分配機資料，未匯入任何資料...」
     -> 備份內容無法進雲端

=== After ===
選檔 -> POST /api/import -> 409
     -> 備份無參賽者與歷史 -> 顯示「沒有可附加的...」, 不渲染按鈕
     -> 否則顯示附加確認: N 位參賽者, M 筆歷史 + 四條說明
          [取消]       -> 收起確認, 不送請求
          [附加到雲端] -> POST /api/import/append
                          -> 200: 已新增 x 位, y 筆 + 略過說明
                          -> 401: 請重新登入 + refresh session
                          -> 413 / 其他: 既有失敗文案
選檔 -> POST /api/import -> 200 (雲端為空): 與現在完全相同
```

---

## UI Mockups

資料頁「從 JSON 備份匯入到雲端」區塊（雲端模式；訪客模式不變）。

```
=== State 1: Before，雲端已有資料時選檔 ===

┌──────────────────────────────────────────────────────┐
│ JSON 備份                                            │
│ 登入時選擇的備份檔只有雲端沒有任何對戰分配機資料時   │
│ 才會寫入; 不會覆寫或合併雲端資料                     │
│ [匯出 JSON 備份] [選擇備份檔]                        │
│ ! 雲端已有對戰分配機資料, 未匯入任何資料...          │ <- role=alert
└──────────────────────────────────────────────────────┘


=== State 2: After，雲端已有資料時選檔，顯示附加確認 ===

┌──────────────────────────────────────────────────────┐
│ JSON 備份                                            │
│ 登入時選擇的備份檔會匯入到雲端, 不會寫入本機; 雲端已 │ <- 新說明文字
│ 有資料時, 可確認後把參賽者與歷史附加到雲端...        │
│ [匯出 JSON 備份] [選擇備份檔]                        │
│ ┌─ json-backup-append-confirm ─────────────────────┐ │
│ │ 雲端已有對戰分配機資料. 可以把這份備份的 2 位    │ │
│ │ 參賽者, 1 筆歷史附加到雲端:                      │ │
│ │ - 同名或已在雲端的參賽者視為同一人, 不重複新增、 │ │
│ │   不覆寫; 附加的歷史會算在雲端那位身上           │ │
│ │ - 雲端已有的同一場歷史不會重複新增               │ │
│ │ - 尚未完成的回合不會帶過去; 請先在本機結束回合   │ │
│ │ - 雲端強度分數不變, 需要時請在參賽者頁手動調整   │ │
│ │ [附加到雲端] [取消]                              │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
              │
              │ 按下 [附加到雲端]
              ▼

=== State 3: 附加請求進行中 ===

│ │ [附加到雲端] (disabled) [取消] (disabled)        │ │


              │ 200
              ▼

=== State 4: 附加成功，確認收起 ===

┌──────────────────────────────────────────────────────┐
│ JSON 備份                                            │
│ [匯出 JSON 備份] [選擇備份檔]                        │
│ 已新增 1 位參賽者, 1 筆歷史.                         │ <- import-message
│ 略過同名或已在雲端的參賽者 1 位.                     │ <- -note
└──────────────────────────────────────────────────────┘


=== State 5: 備份只有回合，沒有參賽者與歷史 ===

┌──────────────────────────────────────────────────────┐
│ JSON 備份                                            │
│ [匯出 JSON 備份] [選擇備份檔]                        │
│ ! 雲端已有對戰分配機資料, 這份備份沒有可附加的參賽者 │ <- role=alert
│   或歷史, 未匯入任何資料.                            │    無附加按鈕
└──────────────────────────────────────────────────────┘
```

（實際文字以 delta spec `data-transfer`「登入時的資料工具頁」為準；圖中以半形標點示意。）

---

## Architecture

各層的新增元件與資料流（粗體檔案為本 change 改動）：

```
 nextjs-pickball (Worker)                   hono-pickball (Worker)
┌──────────────────────────────┐          ┌───────────────────────────────┐
│ JsonBackupSection            │          │ routes/import.ts              │
│  handleCloudImportText       │          │  POST /          (unchanged)  │
│   409 -> append confirm      │          │  POST /append    (new)        │
│        │                     │          │   jsonBodyLimit -> zValidator │
│        ▼                     │          │   -> checkAppendLimits (413)  │
│ lib/sync/local-import.ts     │  /api/*  │        │                      │
│  backupToAppendRequest       │ service  │        ▼                      │
│  appendBackupToCloud ────────┼─binding─►│ import/local-import-repo.ts   │
│        │                     │          │  appendLocalBackup: 1 batch   │
│        ▼                     │          │   1 INSERT players  RETURNING │
│ local-import-view.ts         │          │   2 INSERT history  RETURNING │
│  describeAppendPreview       │          │     (id map CTE + json_set)   │
│  describeAppendOutcome       │          └───────────────┬───────────────┘
│  APPEND_RULES                │                          │
└──────────────┬───────────────┘                          ▼
               │                                ┌───────────────────┐
               │   packages/pickball-core       │ D1                │
               └─────────┐  api/import.ts       │ matchmaker_players│
                         ▼                      │ matchmaker_history│
              AppendImportRequestSchema ◄───────┤ (read) floors     │
              AppendImportResponseSchema        └───────────────────┘
              serializeAppendSegments
              checkAppendLimits  (shared by both sides)
```

---

## Sequence Diagram

雲端已有資料時的附加流程（關鍵路徑與失敗分支）：

```
 User     JsonBackupSection   local-import.ts    Hono /api/import      D1
  │              │                  │                   │               │
  │ select file  │                  │                   │               │
  │─────────────►│ parseBackup      │                   │               │
  │              │─ importLocalData►│ POST /api/import  │               │
  │              │                  │──────────────────►│ guard batch   │
  │              │                  │                   │──────────────►│
  │              │                  │◄── 409 ───────────│◄─ not empty ──│
  │              │◄ cloud-not-empty │                   │               │
  │              │ backupToAppendRequest                │               │
  │              │ (empty? -> appendNothing, stop)      │               │
  │◄─ confirm ───│                  │                   │               │
  │ [append]     │                  │                   │               │
  │─────────────►│ user id at click │                   │               │
  │              │─ appendBackup───►│ POST /append      │               │
  │              │  ToCloud         │──────────────────►│ limits ok?    │
  │              │                  │                   │ batch:        │
  │              │                  │                   │ 1 players ───►│
  │              │                  │                   │ 2 history ───►│
  │              │                  │                   │  (reads 1's   │
  │              │                  │                   │   new rows)   │
  │              │                  │◄─ 200 counts ─────│◄──────────────│
  │              │◄ appended        │                   │               │
  │◄─ result ────│ describeAppendOutcome                │               │
  │              │                  │                   │               │
  │   失敗分支: 401 -> unauthorized + refresh(); 413 -> tooLarge;       │
  │             500 / 409 / 網路錯誤 -> failed; 一律不寫本機、不重新載入 │
```

---

## Task Tree

tasks.md 的依賴關係（群組間嚴格序列）：

```
§1 對齊與基線
└── §2 核心契約 (pickball-core)
    ├── 2.1 RED  schema / segments / limits 四個 it
    ├── 2.2 GREEN
    └── 2.3 REFACTOR
        └── §3 後端附加端點 (hono-pickball)
            ├── 3.1 RED  守衛樣本表 (改寫既有 it)
            ├── 3.2 RED  local-import-append.test.ts 15 個 it
            ├── 3.3 GREEN 路由 + repository
            └── 3.4 REFACTOR
                └── §4 前端 lib 與文案
                    ├── 4.1 RED  local-import / local-import-view
                    ├── 4.2 GREEN (含 E2E 常數同步)
                    └── 4.3 REFACTOR
                        └── §5 JsonBackupSection 與 E2E
                            ├── 5.1 RED  E2E 新 test + 改寫斷言
                            ├── 5.2 RED  元件 5 個 it
                            ├── 5.3 GREEN
                            ├── 5.4 REFACTOR
                            └── 5.5 E2E user-data 全綠
                                └── §6 文件、指令驗收、gate、review、verify、合併
```

---

## Cross-Cutting Impact

| 檔案 | 層 | 改動 |
|---|---|---|
| `packages/pickball-core/src/api/import.ts` | 核心 | 新增附加 schema、型別、`serializeAppendSegments`、`checkAppendLimits` |
| `packages/pickball-core/test/api/import.test.ts`、`import-limits.test.ts` | 核心測試 | 各新增 2 個 it |
| `hono-pickball/src/routes/import.ts` | 後端 | 新增 `POST /append` |
| `hono-pickball/src/import/local-import-repository.ts` | 後端 | 新增附加函式（兩條陳述式） |
| `hono-pickball/test/local-import-append.test.ts` | 後端測試 | 新檔，15 個 it |
| `hono-pickball/test/expected-user-guard.test.ts` | 後端測試 | 改寫：樣本表補一條、長度 16 |
| `nextjs-pickball/lib/sync/local-import.ts` | 前端 | 新增 `backupToAppendRequest`、`appendBackupToCloud` |
| `nextjs-pickball/components/matchmaker/local-import-view.ts` | 前端 | 新增附加文案與 `describeAppend*`；改寫 `jsonCloudImportHint` |
| `nextjs-pickball/components/matchmaker/JsonBackupSection.tsx` | 前端 | 409 改進入附加確認 |
| 前端三個對應 `*.test.ts(x)` | 前端測試 | 新增 9 個 it |
| `nextjs-pickball/tests/e2e/user-data/local-import.spec.ts` | E2E | 新增 1 條；改寫第二次選檔斷言；常數同步 |
| `nextjs-pickball/tests/e2e/user-data/{history,roster}-sync.spec.ts` | E2E | 常數同步 |
| `hono-pickball/CLAUDE.md`、`nextjs-pickball/CLAUDE.md` | 文件 | 路由數 16、附加端點與前端流程 |
