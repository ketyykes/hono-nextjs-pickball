# Overview: matchmaker-history-stats-backend（B8）

## Scope

登入後，歷史頁、統計頁、歷史 CSV 與 JSON 匯出的歷史都改讀雲端；B7 已在送出比分時把歷史寫進雲端，本 change 只補「讀」。
區間（今日／本週…）仍由使用者裝置的時區決定，前端算好毫秒界線再交給後端篩選。訪客完全不變。

**Size**: large — 影響 5 個 capability，tasks 30 項，跨前端／後端／核心套件。
**Frontend involved**: yes — 歷史頁與統計頁的雲端內容、載入與錯誤狀態。
**DB schema touched**: no — 沿用 B7 的 `matchmaker_history`（`played_at` 已存在）。
**Data migration**: no。
**Cross-component flow**: yes — 前端以核心 `rangeBounds` 算界線 → 後端以 `played_at` 篩選 → 前端以同一個 `computePlayerStats` 統計；區間快速切換的競態處理。

---

## What Changes

- 後端：`GET /api/matchmaker/history?from&to&order` → `{ items, total, droppedCount }`（唯讀，不提供寫入）
- 核心套件：`rangeBounds(range, now)`、`api/history.ts`
- 前端：`useRemoteHistory`、`history-api.ts`、`RemoteHistoryView`、`RemoteStatsContent`；歷史頁與統計頁依模式擇一
- 資料頁：雲端 JSON 匯出的 `history`、歷史 CSV 改取雲端
- 刪除 `resetLocalMatchProgress()`

```
=== Before (B7 後，登入時) ===
送出比分 --> D1 matchmaker_history（寫）
歷史頁 / 統計頁 / 歷史 CSV / JSON history --> localStorage（讀）
登入時重置名單 --> 清本機 matchmaker:history:v1

=== After (B8，登入時) ===
送出比分 --> D1 matchmaker_history（寫）
歷史頁 / 統計頁 --> GET /history?from&to （前端算界線）
歷史 CSV / JSON history --> GET /history?order=asc
登入時重置名單 --> 不碰任何本機 key
```

## UI Mockups

```
=== State 1: 歷史頁（登入），載入中 ===
┌──────────────────────────────────────────────┐
│ 對戰歷史                                      │
│ ⟳ 正在載入雲端資料…                          │ ← data-sync-status=loading
└──────────────────────────────────────────────┘
        │ GET /history?from=<今日 0 點>
        ▼
=== State 2: 已同步（含損毀提示）===
┌──────────────────────────────────────────────┐
│ (●)今日 ( )本週 ( )本月 ( )上月 ( )更早       │
│ ! 有 1 筆損毀的歷史紀錄已略過，其餘歷史紀錄  │ ← droppedCount 來自後端
│   不受影響。                                  │
│ ┌ 場地 1  11 : 7  勝方：第一隊 ─────────────┐ │
│ │ 王小明 4.20→4.31  李大華 3.90→4.02        │ │
│ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
        │ 切到「上月」，雲端此區間無資料（total > 0）
        ▼
=== State 3: 區間空狀態 ===
│ 上月沒有對戰紀錄                              │ ← EmptyHistory range=lastMonth

=== State 4: total = 0 ===
│ 還沒有任何對戰紀錄，先完成一場對戰吧         │ ← EmptyHistory range=null

=== State 5: 統計頁（登入），計時回合平局後 ===
┌──────────────────────────────────────────────┐
│ 名次 球員   強度 出場 勝負和  勝率 …          │
│ 1    王小明 4.20 1    0 0 1  0%  …            │ ← 和局沿用 draw-followups
│ 1    李大華 3.90 1    0 0 1  0%  …            │
└──────────────────────────────────────────────┘
```

## Architecture

```
 前端                                          後端
┌────────────────────────────────┐          ┌─────────────────────────┐
│ history/page ─┬ HistoryView(本機)│          │ routes/matchmaker.ts    │
│               └ RemoteHistoryView│          │  GET /history           │
│ stats/page ───┬ 本機內容         │  GET     │   └ history-repository  │
│               └ RemoteStatsContent ───────> │      驗證每列、計數     │
│ useRemoteHistory                 │          │      ORDER BY played_at │
│  └ rangeBounds(range, now) ──┐   │          └──────────┬──────────────┘
│ remote-transfer (CSV/JSON)   │   │                     ▼
└──────────────────────────────┼───┘             D1 matchmaker_history
                               │
   @pickball/core history-range：computeRangeCutoffs／rangeOfTime／rangeBounds
```

## Sequence Diagram

```
使用者     RemoteStatsContent   useRemoteHistory      API          D1
  │ 切到本週 │                    │                  │            │
  │────────>│ range=thisWeek     │                  │            │
  │         │───────────────────>│ now=new Date()   │            │
  │         │                    │ rangeBounds      │            │
  │         │                    │ req#2 GET ?from&to            │
  │         │                    │─────────────────>│ SELECT ... │
  │         │                    │                  │───────────>│
  │         │                    │ (req#1 晚到 → 丟棄)            │
  │         │                    │<── items,total,droppedCount ──│
  │         │<── synced ─────────│                  │            │
  │         │ computePlayerStats(items, 雲端名單)   │            │
```

## Task Tree

```
§1 對齊 main＋Context7 (3)
 └─ §2 核心 rangeBounds＋api/history (2)
     └─ §3 後端 GET /history (3)
         └─ §4 history-api＋useRemoteHistory＋歸屬清單 (6)
             └─ §5 雲端歷史與統計元件 (2)
                 └─ §6 資料頁＋刪除 resetLocalMatchProgress (2)
                     └─ §7 E2E＋頁面接線 (3)
                         └─ §8 文件＋平局守衛＋總驗收 (9)
```

## Cross-Cutting Impact

- **時區**：區間切點只在前端（使用者裝置時區）計算；後端不得自行算「今日」。
- **既有測試**：允許動的只有三個 B7 改寫過的 it；本機元件與 `history-range.ts` 既有函式不改。
- **平局**：雲端統計與本機共用 `computePlayerStats`；draw-followups 的 it 在總驗收中單獨執行。
- **B9 依賴**：匯入的歷史必須帶 `played_at` 並依追加順序插入。
- **相依**：無新增第三方套件。
