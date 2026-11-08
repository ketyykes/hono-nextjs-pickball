# Overview: session-pending-loading

## Scope

全站「資料還沒確定就先畫出空白或錯誤內容」的閃爍一次處理：伺服器輸出（JS 載入前）、hydration、session 等待、本機資料讀入前，一律只顯示「正在載入資料…」，不再先畫空名單、空舞台、0:0、空歷史或本機版的資料工具。
登入者靠瀏覽器記住的「上次登入提示」（只存 `"1"`）在 session 回應前也維持等待中；訪客在 hydration 後本機資料讀入的同一次 render 直接看到資料。

全站盤點（design「盤點清單」）：處理 9 項（參賽者、對戰、統計、歷史、獨立與綁定計分板、資料頁三區塊），不處理 8 項（導覽入口、登入頁、測驗、導覽頁、匯入提示、清除區塊查證不會閃；首頁捲動樣式與減少動態不屬資料狀態）。

**Size**: large — 影響 7 個 capability（user-data-sync、auth、player-roster、round-lifecycle、scoreboard、match-history、data-transfer），tasks 46 項（>20）；無新依賴、無資料遷移。
**Frontend involved**: yes — 七個頁面路徑的初始畫面改為等待中提示。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 新 localStorage key 由前端在確認登入時自行寫入。
**Cross-component flow**: yes — 「伺服器輸出 → hydration → 讀本機 → 等 session → 寫入／清除提示 → 切換模式」是順序敏感的非同步流程，另有逾時分支。

---

## What Changes

- 統一判斷：儲存模式未定（三態 `pending`）＋本機資料未讀入，兩層都回報同一個顯示狀態 `pending`；頁面一律用 `isContentBlocked` 決定是否以提示取代內容。
- 新文案只有一個：`DATA_PENDING_MESSAGE`「正在載入資料…」（不寫「雲端」，因為伺服器輸出對訪客與登入者相同）。
- `useSession()` 多回傳 `hydrated`；session store 帶提示的初始快照、寫入／清除、10 秒逾時；`signOut()` 成功即清除提示。
- 三個選擇器與三個本機 hook 回報 `pending`；歷史、統計入口、資料頁三區塊處理 `pending`。

重新整理 `/matchmaker/players` 的前後對照：

```
=== Before（已登入，本機名單空，雲端有資料）===
JS 載入前  : [共 0 位][目前還沒有參賽者]   <- 伺服器輸出
hydration  : [目前還沒有參賽者]           <- 本機模式，等 /api/session
session 回 : [正在載入雲端資料...]
雲端回     : [雲端名單]

=== After（已登入，有上次登入提示）===
JS 載入前  : [正在載入資料...]            <- pending
hydration  : [正在載入資料...]            <- 提示 => pending
session 回 : [正在載入雲端資料...]        <- loading
雲端回     : [雲端名單]

=== After（訪客，本機有名單）===
JS 載入前  : [正在載入資料...]            <- pending
hydration  : [正在載入資料...]            <- 本機尚未讀入
讀入本機   : [本機名單]                   <- 同一次 render
```

---

## UI Mockups

參賽者頁（對戰頁、統計頁、計分板同一套取代呈現）：

```
=== State 1: Before，伺服器輸出 ===

┌──────────────────────────────────────────────┐
│ 參賽者名單                [新增參賽者][重置] │
│ 共 0 位參賽者                                │ <- 錯誤：資料還沒讀
│ ┌──────────────────────────────────────────┐ │
│ │ 目前還沒有參賽者                         │ │
│ │ [新增第一位參賽者]                       │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

=== State 2: After，等待中（data-sync-status="pending"）===

┌──────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────┐ │
│ │           正在載入資料...                │ │ <- role="status"
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
       │                          │
       │ 訪客：本機讀入           │ 登入：session 確認
       ▼                          ▼
  [本機名單，無 data-sync-status]  [正在載入雲端資料...] -> [雲端名單]
```

計分板（獨立與 `?match=` 綁定皆同）：

```
=== Before，伺服器輸出 ===          === After ===

┌──────────────────────────┐       ┌──────────────────────────┐
│ [請轉橫向] [設定列]      │       │                          │
│   我方 0   │   對方 0    │       │     正在載入資料...      │
│ [贏這一球] │ [贏這一球]  │       │                          │
└──────────────────────────┘       └──────────────────────────┘
  <- 存檔比分與方向都還沒讀          <- 讀入後直接顯示正確比分
```

歷史頁（標題由 server component 輸出，維持顯示）：

```
=== Before，伺服器輸出 ===

┌──────────────────────────────────────────────┐
│ 對戰歷史                                     │
│ (●)今日 ( )本週 ( )本月 ( )上月 ( )更早      │
│ 還沒有任何對戰紀錄                           │ <- 錯誤：還沒讀
└──────────────────────────────────────────────┘

=== After，等待中 ===

┌──────────────────────────────────────────────┐
│ 對戰歷史                                     │
│ ┌──────────────────────────────────────────┐ │
│ │           正在載入資料...                │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

資料頁（三區塊操作區換成提示；匯入本機資料不渲染；清除本機資料不變）：

```
=== Before，伺服器輸出與 session 等待 ===

┌ JSON 完整備份 ───────────────────────────────┐
│ [匯出 JSON] [選擇備份檔...]                  │ <- 本機覆寫式還原
├ 歷史賽果 CSV 匯出 ───────────────────────────┤
│ [匯出 CSV]                                   │ <- 會匯出本機歷史
├ 參賽者名單 CSV 匯入 ─────────────────────────┤
│ [選擇 CSV 檔...] [確認匯入]                  │ <- 會寫入本機
├ 清除本機資料 ────────────────────────────────┤
│ [清除本機資料]                               │
└──────────────────────────────────────────────┘

=== After，等待中 ===

┌ JSON 完整備份 ───────────────────────────────┐
│   正在載入資料...                            │
├ 歷史賽果 CSV 匯出 ───────────────────────────┤
│   正在載入資料...                            │
├ 參賽者名單 CSV 匯入 ─────────────────────────┤
│   正在載入資料...                            │
├ 清除本機資料 ────────────────────────────────┤
│ [清除本機資料]                               │ <- 兩種模式相同
└──────────────────────────────────────────────┘
```

---

## Architecture

兩層判斷合成一個顯示狀態，頁面只問一次 `isContentBlocked`。

```
 localStorage           lib/auth             hooks                   頁面
┌─────────────┐ read ┌──────────────┐  ┌──────────────────┐
│ signed-in-  │─────►│ session-     │─►│ useSession       │
│ hint:v1     │◄─────│ store        │  │ +hydrated        │
└─────────────┘write/│ +hint +10s   │  └────────┬─────────┘
                clear└──────────────┘           │
                                                ▼
                                    ┌──────────────────────┐
                                    │ resolveStorageMode   │
                                    │ local/remote/pending │
                                    └──┬────────────────┬──┘
           層一：模式未定              │                │
                        ┌──────────────┘                └──────────┐
                        ▼                                          ▼
          ┌───────────────────────────┐            ┌────────────────────┐
          │ 3 個選擇器                │            │ HistoryModeSwitch  │
          │ pending -> 空+pending     │            │ stats page         │
          │ local 未讀 -> pending     │<- 層二     │ 資料頁 3 區塊      │
          └─────────────┬─────────────┘            └─────────┬──────────┘
                        │ syncStatus: DataStatus             │ mode
                        ▼                                    ▼
          ┌──────────────────────────────────────────────────────────┐
          │ isContentBlocked(pending/loading/load-failed)            │
          │ -> SyncStatusNotice（pending：正在載入資料...）          │
          └──────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

重新整理時的時序，含訪客、登入者、提示殘留、請求懸住四條分支：

```
 Browser       useSession        選擇器/頁面          /api/session
   │               │                   │                    │
   │ 伺服器輸出 ── hydrated=false ────►│ pending：等待中     │
   │ hydration ──  hydrated=false ────►│ pending（與輸出同） │
   │               │── fetchSession ───────────────────────►│
   │ 同步 re-render: hydrated=true      │                    │
   │               │                   │                    │
   │ [訪客無提示]  │── loading ───────►│ local 未讀：pending │
   │ effect 讀本機 ───────────────────►│ local：本機資料     │
   │               │                   │                    │
   │ [有提示]      │── loading+hint ──►│ pending：等待中     │
   │               │◄──────────────── 200 {user} ───────────│
   │  write hint   │── ready ─────────►│ remote：雲端載入中  │
   │               │                   │──► 雲端資料         │
   │               │                   │                    │
   │ [殘留提示]    │◄──────────────── 200 {user:null} ──────│
   │  clear hint   │── ready ─────────►│ local：本機資料     │
   │               │                   │                    │
   │ [懸住 10s]    │ timer -> loading ►│ local：本機資料     │
```

---

## Task Tree

```
§1 對齊與基線（不寫產品碼）
└── §2 提示、hydration 旗標、儲存模式三態（lib/auth、lib/sync、useSession）
    ├── 2.1-2.2   session-hint 模組
    ├── 2.3-2.4   session-store：快照、寫入清除、過時回應、逾時
    ├── 2.5-2.6   useSession.hydrated
    ├── 2.7-2.8   signOut 清除
    ├── 2.9-2.10  resolveStorageMode 三態
    └── 2.11      regression guard：清除本機資料不動提示
        └── §3 顯示狀態、選擇器、使用選擇器的頁面
            ├── 3.1       E2E RED（閃爍記錄器、提示殘留、登入 reload）
            ├── 3.2-3.3   DataStatus、isContentBlocked、SyncStatusNotice
            ├── 3.4-3.9   名單、回合、計分板選擇器與本機讀入旗標
            ├── 3.10-3.11 統計頁入口
            └── 3.12      四頁改用 isContentBlocked（E2E 轉綠）
                └── §4 歷史頁與資料頁
                    ├── 4.1       E2E RED（停用 JS、歷史記錄器）
                    ├── 4.2-4.3   HistoryModeSwitch、HistoryView
                    ├── 4.4-4.6   資料頁三區塊＋匯入區塊 guard
                    └── 4.7       E2E 轉綠
                        └── §5 文件與指令驗收 C1-C9
```

---

## Cross-Cutting Impact

| 檔案（`nextjs-pickball/` 下） | 群組 | 變更 |
|---|---|---|
| `lib/auth/session-hint.ts`（新） | §2 | 提示讀寫清除 |
| `lib/auth/session-store.ts` | §2 | 帶提示快照、寫入清除、逾時 |
| `lib/auth/session-client.ts` | §2 | `signOut` 成功時清除 |
| `hooks/useSession.ts` | §2 | 回傳 `hydrated` |
| `lib/sync/storage-mode.ts` | §2 | 三態 `pending` |
| `lib/sync/sync-status.ts` | §3 | `DataStatus`、文案、`isContentBlocked` |
| `components/sync/SyncStatusNotice.tsx` | §3 | 支援 `pending` |
| `hooks/useRosterStore.ts`、`useRoundStore.ts`、`useScoreboardStore.ts` | §3 | 本機讀入旗標、等待中結果 |
| `app/matchmaker/players/page.tsx`、`app/matchmaker/page.tsx` | §3 | 改用 `isContentBlocked` |
| `app/matchmaker/stats/page.tsx`、`LocalStatsContent.tsx`、`RemoteStatsContent.tsx` | §3 | 入口三態、改用 `isContentBlocked` |
| `components/scoreboard/Scoreboard.tsx` | §3 | 改用 `isContentBlocked` |
| `components/matchmaker/HistoryModeSwitch.tsx`、`HistoryView.tsx` | §4 | 等待中容器 |
| `components/matchmaker/JsonBackupSection.tsx`、`HistoryCsvSection.tsx`、`RosterCsvImportSection.tsx` | §4 | 操作區換提示 |
| `CLAUDE.md` | §5 | 敘述同步 |
| 後端、核心套件、雲端 hook、navbar、登入頁、quiz／tour／guide、`LocalDataImportSection`、`ClearLocalDataSection`、`RemoteHistoryView`、`transfer-storage.ts` | — | 零變更（C8） |
