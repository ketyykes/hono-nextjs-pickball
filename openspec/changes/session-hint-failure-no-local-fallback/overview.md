# Overview: session-hint-failure-no-local-fallback

## Scope

有「上次登入提示」的使用者，若 `/api/session` 請求失敗或等 10 秒還沒回應，現在會悄悄改用本機資料，修改不會上雲端。
本 change 改為先擋住資料畫面，顯示「無法載入雲端資料，請重新整理頁面」與按鈕「先用這台裝置的資料」；按了才進本機模式，並常駐提示「修改只會存在這台裝置」。沒有提示的訪客完全不變。

**Size**: large — 影響 5 個 capability（auth、user-data-sync、player-roster、round-lifecycle、scoreboard），tasks 超過 20 項；無新依賴、無資料遷移。
**Frontend involved**: yes — 新增阻擋畫面的按鈕與跨頁常駐的本機提示。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 提示 key 格式不變。
**Cross-component flow**: yes — 「請求 → 失敗或逾時 → 無法確認 → 晚到回應或使用者選擇 → 本機備援」是順序敏感的非同步流程。

---

## What Changes

- `fetchSession()` 失敗回 `null`；由 session store 依提示決定：有提示 → 「無法確認」快照、沒有 → 照舊視為 auth 停用。
- 逾時改為「無法確認」，不再改回不帶提示的 loading；晚到的回應照常採用。
- 新 store 函式 `chooseLocalFallback()`：無法確認時才有效，切到「本機備援」並丟棄進行中的回應。
- 提示只在 200 且確認非登入時清除；失敗、逾時、按下按鈕都保留。
- 顯示狀態新增 `unavailable`：`SyncStatusNotice` 顯示既有失敗文案＋按鈕；各使用端以 `pendingDataStatus` 取得。
- root layout 新增 `LocalFallbackBanner`，只在本機備援時顯示。

Before / after 對照（有上次登入提示的使用者）：

```
=== Before ===
/api/session 500 或網路錯誤 -> 視為 auth 停用 -> 清除提示 -> 本機資料
等待 10 秒仍無回應         -> loading(無提示) -> 本機資料
(使用者不知道修改只存在本機)

=== After ===
/api/session 500 或網路錯誤 -> 無法確認(保留提示) -> 阻擋畫面+按鈕
等待 10 秒仍無回應         -> 無法確認(保留提示) -> 阻擋畫面+按鈕
  晚到回應(按鈕前)         -> 照常採用(雲端或本機)
  按下按鈕                 -> 本機備援 -> 本機資料+常駐本機提示
200 且確認非登入           -> 清除提示 -> 本機資料(不變)
沒有提示的訪客             -> 完全不變
```

---

## UI Mockups

參賽者頁（對戰、統計、計分板、歷史、資料頁三區塊同一套取代呈現）：

```
=== State 1: Before，有提示而 session 失敗 ===

┌──────────────────────────────────────────────┐
│ 參賽者名單                [新增參賽者][重置] │
│ 共 1 位參賽者                                │ <- 本機資料
│ ┌──────────────────────────────────────────┐ │
│ │ 本機甲                                   │ │ <- 修改不會上雲
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

=== State 2: After，無法確認 (data-sync-status="unavailable") ===

┌──────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────┐ │
│ │    無法載入雲端資料，請重新整理頁面      │ │ <- role="status"
│ └──────────────────────────────────────────┘ │
│            [先用這台裝置的資料]              │ <- status 之外
└──────────────────────────────────────────────┘
              │
              │ 按下按鈕
              ▼

=== State 3: After，本機備援 (無 data-sync-status) ===

┌──────────────────────────────────────────────┐
│ 參賽者名單                [新增參賽者][重置] │
│ 共 1 位參賽者                                │
│ ┌──────────────────────────────────────────┐ │
│ │ 本機甲                                   │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 目前連不上雲端，修改只會存在這台裝置； │  │ <- fixed 底部
│  │ 重新整理頁面可再次連線雲端             │  │    不擋點擊
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

資料頁（三區塊各一組提示與按鈕，任一顆效果相同）：

```
=== State: 無法確認 ===

┌ JSON 完整備份 ───────────────────────────────┐
│   無法載入雲端資料，請重新整理頁面           │
│   [先用這台裝置的資料]                       │
├ 歷史賽果 CSV 匯出 ───────────────────────────┤
│   無法載入雲端資料，請重新整理頁面           │
│   [先用這台裝置的資料]                       │
├ 參賽者名單 CSV 匯入 ─────────────────────────┤
│   無法載入雲端資料，請重新整理頁面           │
│   [先用這台裝置的資料]                       │
├ 清除本機資料 ────────────────────────────────┤
│ [清除本機資料]                               │ <- 不變
└──────────────────────────────────────────────┘
```

navbar（已知取捨，不修改）：

```
無法確認 / 本機備援時：帳號入口維持隱形佔位 (data-account-entry="loading")
登入頁 /login：LoginForm 回傳 null（空白），重新整理即重新確認
```

---

## Architecture

session store 多兩個 loading 快照；儲存模式與顯示狀態各由一個函式判斷，使用端只問這兩個函式。

```
 lib/auth                         lib/sync                    元件 / 選擇器
┌─────────────────┐ null  ┌──────────────────┐
│ session-client  │──────►│ session-store    │
│ fetchSession    │       │ loading          │
└─────────────────┘       │ loading+hint     │
                          │ loading+unavail. │◄── chooseLocalFallback()
┌─────────────────┐ read  │ loading+localFb. │        ▲
│ session-hint    │◄──────│ ready            │        │ onClick
└─────────────────┘       └────────┬─────────┘        │
                                   │ useSession       │
                     ┌─────────────┴──────────┐       │
                     ▼                        ▼       │
          ┌────────────────────┐  ┌────────────────────────┐
          │ resolveStorageMode │  │ pendingDataStatus      │
          │ localFb -> local   │  │ unavail. -> unavailable│
          │ unavail -> pending │  │ else     -> pending    │
          └─────────┬──────────┘  └───────────┬────────────┘
                    └────────────┬────────────┘
                                 ▼
          ┌──────────────────────────────────────────────┐
          │ 3 選擇器 / HistoryModeSwitch / 資料頁 3 區塊 │
          │ syncStatus / data-sync-status                │
          └─────────────────────┬────────────────────────┘
                                ▼
          ┌──────────────────────────────────────────────┐
          │ isContentBlocked -> SyncStatusNotice         │
          │ unavailable: 失敗文案 + [先用這台裝置的資料] │
          └──────────────────────────────────────────────┘

 app/layout.tsx ──► LocalFallbackBanner（只在 loading+localFb. 時渲染）
```

---

## Sequence Diagram

有提示的使用者重新整理時，失敗、逾時、晚到回應與按下按鈕四條分支：

```
 Browser        session-store        畫面               /api/session
   │                 │                 │                     │
   │ 訂閱 ──────────►│ loading+hint ──►│ 正在載入資料...     │
   │                 │── fetchSession ──────────────────────►│
   │                 │                 │                     │
   │ [失敗]          │◄────────── 500 / 網路錯誤 => null ────│
   │                 │ 讀提示=有       │                     │
   │                 │ unavailable ───►│ 失敗文案+按鈕       │
   │                 │ (不清除提示)    │                     │
   │                 │                 │                     │
   │ [逾時 10s]      │ timer           │                     │
   │                 │ unavailable ───►│ 失敗文案+按鈕       │
   │                 │                 │                     │
   │ [晚到,按鈕前]   │◄────────── 200 {user} ────────────────│
   │                 │ ready+寫提示 ──►│ 雲端資料            │
   │                 │                 │                     │
   │ [按下按鈕]      │                 │                     │
   │ chooseLocal ───►│ requestId+1     │                     │
   │  Fallback()     │ localFallback ─►│ 本機資料+本機提示   │
   │                 │◄────────── 200 (晚到) ────────────────│
   │                 │ 丟棄(過時)      │ 不變                │
```

---

## Task Tree

依序執行，群組間嚴格序列（主 repo、同一分支）。

```
§1 對齊與基線（不寫產品碼）
└── §2 lib 層：fetchSession null、store 兩個新快照、儲存模式
    ├── 2.1-2.2  client 改寫 2 it + store 6 新 it、改寫逾時 it
    ├── 2.3-2.4  storage-mode：本機備援/無法確認(guard)、pendingDataStatus
    └── 2.5      REFACTOR
        └── §3 顯示狀態、按鈕、選擇器、對戰頁、本機提示
            ├── 3.1        E2E RED（500、網路中斷）
            ├── 3.2-3.3    unavailable、兩個文案、SyncStatusNotice 按鈕
            ├── 3.4-3.9    名單（含殘留名單、guard）、回合、計分板
            ├── 3.10-3.11  對戰頁優先序（頁面測試）
            ├── 3.12-3.13  LocalFallbackBanner + layout
            ├── 3.14       E2E 轉綠
            └── 3.15       REFACTOR
                └── §4 歷史頁與資料頁三區塊
                    ├── 4.1-4.2  四個元件 RED / GREEN
                    └── 4.3      REFACTOR
                        └── §5 文件、指令驗收 C1-C10、gate、verify
```

---

## Cross-Cutting Impact

| 檔案（`nextjs-pickball/` 下） | 群組 | 變更 |
|---|---|---|
| `lib/auth/session-client.ts` | §2 | `fetchSession` 失敗回 `null` |
| `lib/auth/session-store.ts` | §2 | 無法確認、本機備援快照；逾時；`chooseLocalFallback` |
| `lib/sync/storage-mode.ts` | §2 | 本機備援為 `local`；`pendingDataStatus` |
| `lib/sync/sync-status.ts` | §3 | `unavailable`、`isContentBlocked`、兩個文案常數 |
| `components/sync/SyncStatusNotice.tsx` | §3 | `unavailable` 文案＋按鈕 |
| `hooks/useRosterStore.ts`、`useRoundStore.ts`、`useScoreboardStore.ts` | §3 | 等待中改用 `pendingDataStatus`；名單明確空陣列；回合名單狀態對應 |
| `app/matchmaker/page.tsx` | §3 | `SYNC_STATUS_PRIORITY` 加 `unavailable` |
| `components/sync/LocalFallbackBanner.tsx`（新）、`app/layout.tsx` | §3 | 本機提示 |
| `components/matchmaker/HistoryModeSwitch.tsx`、`JsonBackupSection.tsx`、`HistoryCsvSection.tsx`、`RosterCsvImportSection.tsx` | §4 | 等待中容器改用 `pendingDataStatus` |
| `CLAUDE.md` | §5 | 敘述同步 |
| 後端、核心、`useSession`、`session-hint`、雲端 hook、navbar、登入頁、參賽者頁、統計頁、`Scoreboard`、`HistoryView` 等 | — | 零變更（C8） |
