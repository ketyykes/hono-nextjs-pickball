# Overview: session-pending-loading

## Scope

登入過的人重新整理 matchmaker 各頁時，在 `/api/session` 回來之前不再先看到本機（通常是空的）資料，而是直接看到既有的「正在載入雲端資料…」。
做法是瀏覽器記住「上次確認時是登入狀態」的提示（只存 `"1"`），有提示就把這段時間當成「等待中」；從沒登入過的訪客完全不變。

**Size**: large — 影響 5 個 capability（user-data-sync、auth、player-roster、round-lifecycle、data-transfer），tasks 38 項（>20）；無新依賴、無資料遷移。
**Frontend involved**: yes — 等待中時各頁、計分板與資料頁區塊的畫面改變。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 新 localStorage key 由前端在確認登入時自行寫入，沒有既有資料要搬。
**Cross-component flow**: yes — 「讀提示 → hydration → 等 session → 寫入／清除提示 → 切換模式」是順序敏感的非同步流程，另有逾時分支。

---

## What Changes

- 新增 `lib/auth/session-hint.ts`：上次登入提示的讀寫清除（key `auth:signed-in-hint:v1`）。
- session store：帶提示的初始快照、server snapshot 不帶提示、採用回應時寫入／清除、10 秒逾時；`signOut()` 成功即清除。
- `resolveStorageMode` 多一個 `"pending"`。
- 三個選擇器在等待中回傳空資料＋`loading`；歷史頁、統計頁入口、資料頁三個區塊各自處理等待中。

重新整理時畫面的前後對照（已登入、本機名單為空、雲端有資料）：

```
=== Before ===
JS 載入前  : [空名單]                 <- 靜態 HTML
hydration  : [空名單]                 <- 本機模式，等 /api/session
session 回 : [正在載入雲端資料...]
雲端回     : [雲端名單]

=== After（有上次登入提示） ===
JS 載入前  : [空名單]                 <- 靜態 HTML，本 change 不處理
hydration  : [正在載入雲端資料...]    <- 等待中
session 回 : [正在載入雲端資料...]    <- 雲端載入中，畫面不變
雲端回     : [雲端名單]

=== After（訪客，無提示） ===
與 Before 的本機路徑完全相同
```

---

## UI Mockups

參賽者頁（對戰頁、統計頁、計分板同一套 loading 呈現）：

```
=== State 1: Before，hydration 後、session 回應前 ===

┌──────────────────────────────────────────────┐
│ 參賽者名單                [新增參賽者][重置] │
│ 共 0 位參賽者                                │
│ ┌──────────────────────────────────────────┐ │
│ │ 目前還沒有參賽者                         │ │ <- 誤導：雲端其實有資料
│ │ [新增第一位參賽者]                       │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

=== State 2: After，等待中（data-sync-status="loading"）===

┌──────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────┐ │
│ │        正在載入雲端資料...               │ │ <- role="status"
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
              │
              │ session 確認已登入 -> 雲端載入
              ▼
=== State 3: synced ===

┌──────────────────────────────────────────────┐
│ 參賽者名單                [新增參賽者][重置] │
│ 共 3 位參賽者                                │
│ [雲端甲] [雲端乙] [雲端丙]                   │
└──────────────────────────────────────────────┘
```

歷史頁（標題由 server component 輸出，維持顯示）：

```
=== State 1: Before，等待 session 時 ===

┌──────────────────────────────────────────────┐
│ 對戰歷史                                     │
│ (●)今日 ( )本週 ( )本月 ( )上月 ( )更早      │ <- 本機的篩選器
│ 還沒有任何對戰紀錄                           │ <- 本機歷史
└──────────────────────────────────────────────┘

=== State 2: After，等待中 ===

┌──────────────────────────────────────────────┐
│ 對戰歷史                                     │
│ ┌──────────────────────────────────────────┐ │
│ │        正在載入雲端資料...               │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

資料頁（三個區塊的操作區換成提示；匯入本機資料區塊不渲染；清除本機資料不變）：

```
=== State 1: Before，等待 session 時 ===

┌ 資料匯入匯出 ─────────────────────────────────┐
│ ┌ JSON 完整備份 ───────────────────────────┐ │
│ │ [匯出 JSON] [選擇備份檔...]              │ │ <- 本機覆寫式還原可用
│ └──────────────────────────────────────────┘ │
│ ┌ 歷史賽果 CSV 匯出 ───────────────────────┐ │
│ │ [匯出 CSV]                               │ │ <- 匯出本機歷史
│ └──────────────────────────────────────────┘ │
│ ┌ 參賽者名單 CSV 匯入 ─────────────────────┐ │
│ │ [選擇 CSV 檔...] [確認匯入]░░░░          │ │ <- 寫入本機並 reload
│ └──────────────────────────────────────────┘ │
│ ┌ 清除本機資料 ────────────────────────────┐ │
│ │ [清除本機資料]                           │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

=== State 2: After，等待中 ===

┌ 資料匯入匯出 ─────────────────────────────────┐
│ ┌ JSON 完整備份 ───────────────────────────┐ │
│ │   正在載入雲端資料...                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌ 歷史賽果 CSV 匯出 ───────────────────────┐ │
│ │   正在載入雲端資料...                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌ 參賽者名單 CSV 匯入 ─────────────────────┐ │
│ │   正在載入雲端資料...                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌ 清除本機資料 ────────────────────────────┐ │
│ │ [清除本機資料]                           │ │ <- 兩種模式語意相同，不變
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

---

## Architecture

提示由 session store 持有並經既有 `useSession` 帶出；所有使用端只看 `resolveStorageMode` 的三態。

```
 localStorage                lib/auth                         使用端
┌───────────────┐   read   ┌──────────────────┐  snapshot  ┌──────────────┐
│ auth:signed-  │ ───────► │ session-store    │ ─────────► │ useSession   │
│ in-hint:v1    │ ◄─────── │  loading(+hint)  │            └──────┬───────┘
└───────────────┘ write/   │  ready           │                   │
        ▲         clear    │  10s timeout     │                   ▼
        │                  └────────┬─────────┘          ┌──────────────────┐
        │ clear (2xx)               │ fetchSession       │ resolveStorage   │
┌───────┴────────┐                  ▼                    │ Mode: local /    │
│ session-client │            /api/session               │ remote / pending │
│  signOut()     │                                       └────────┬─────────┘
└────────────────┘                                                │
          ┌──────────────────┬─────────────────┬───────────┴──────┐
          ▼                  ▼                 ▼                  ▼
   3 個選擇器 hook    HistoryModeSwitch    stats page       資料頁 4 區塊
   pending:           pending:             pending:         pending:
   空資料+loading     提示                 Local 內容       提示或不渲染
```

---

## Sequence Diagram

已登入者重新整理，以及兩條分支（提示殘留、請求懸住）：

```
 Browser        session-store        useSession/頁面        /api/session
   │                 │                     │                     │
   │ 靜態 HTML（本機初始畫面）              │                     │
   │ hydration ────────────────────────────►│ server snapshot     │
   │                 │                     │ (無提示 = local)    │
   │                 │◄── getSnapshot ─────│                     │
   │  read hint="1"  │                     │                     │
   │                 │── loading+hint ────►│ pending: 載入中     │
   │                 │── fetchSession ──────────────────────────►│
   │                 │                     │                     │
   │   [已登入]      │◄───────────────── 200 {user} ─────────────│
   │  write hint     │── ready ───────────►│ remote: 雲端載入中  │
   │                 │                     │──► 雲端 API ──► 資料 │
   │                 │                     │                     │
   │   [殘留提示]    │◄───────────────── 200 {user:null} ────────│
   │  clear hint     │── ready ───────────►│ local: 本機畫面     │
   │                 │                     │                     │
   │   [懸住 10s]    │ timer ╌╌► loading ─►│ local: 本機畫面     │
   │                 │ (之後回應照常 ready)│                     │
```

---

## Task Tree

```
§1 對齊與基線（不寫產品碼）
└── §2 上次登入提示與第三態（lib/auth、lib/sync）
    ├── 2.1-2.2 session-hint 模組
    ├── 2.3-2.4 session-store：初始快照、寫入清除、過時回應、逾時、hydration
    ├── 2.5-2.6 signOut 清除
    ├── 2.7-2.8 resolveStorageMode 第三態
    └── 2.9     regression guard：清除本機資料不動提示
        └── §3 選擇器等待中結果（hooks）＋ E2E
            ├── 3.1    E2E RED（登入者 reload、提示殘留）＋訪客 guard
            ├── 3.2-3.3 useRosterStore
            ├── 3.4-3.5 useRoundStore
            └── 3.6-3.7 useScoreboardStore（E2E 轉綠）
                └── §4 頁面與元件等待中處置（components、stats page）
                    └── §5 文件與指令驗收 C1-C8
```

---

## Cross-Cutting Impact

| 檔案（`nextjs-pickball/` 下） | 群組 | 變更 |
|---|---|---|
| `lib/auth/session-hint.ts`（新） | §2 | 提示讀寫清除 |
| `lib/auth/session-store.ts` | §2 | 帶提示快照、寫入清除、逾時 |
| `lib/auth/session-client.ts` | §2 | `signOut` 成功時清除 |
| `lib/sync/storage-mode.ts` | §2 | 第三態 `pending` |
| `hooks/useRosterStore.ts` | §3 | 等待中結果 |
| `hooks/useRoundStore.ts` | §3 | 等待中結果 |
| `hooks/useScoreboardStore.ts` | §3 | 等待中結果（綁定 `pending`） |
| `components/matchmaker/HistoryModeSwitch.tsx` | §4 | 等待中提示 |
| `app/matchmaker/stats/page.tsx` | §4 | 等待中走本機內容 |
| `components/matchmaker/JsonBackupSection.tsx` | §4 | 操作區換提示 |
| `components/matchmaker/HistoryCsvSection.tsx` | §4 | 操作區換提示 |
| `components/matchmaker/RosterCsvImportSection.tsx` | §4 | 操作區換提示 |
| `CLAUDE.md` | §5 | 三處敘述同步 |
| 後端、核心套件、雲端 hook、`useSession.ts`、`SyncStatusNotice`、`transfer-storage.ts`、各頁 page（統計除外） | — | 零變更（C7） |
