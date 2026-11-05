# Overview: round-settings-follow-round

## Scope

對戰頁的「本輪設定」在回合存在時跟著目前回合走：離開對戰頁再回來不會重置成單打 1 場，回合存在時改的目標分數與計時也會帶到下一輪。

**Size**: small — 只影響 1 個 capability（match-stage，ADDED 一個 Requirement），產品碼三檔（一個新純函式、頁面接線、一行方向鍵起算值），無新依賴、無架構變更。
**Frontend involved**: yes — 對戰頁設定列的顯示值與「產生本輪對戰」的送出值。
**DB schema touched**: no — 後端零變更。
**Data migration**: no — 不新增、不改動任何儲存 key。
**Cross-component flow**: no — 仍是「頁面讀回合 → 純函式解析設定 → RoundControls 顯示與回呼」的同步計算。

---

## What Changes

- 新純函式 `resolveRoundSettings(draft, round)`：無回合時用變更值或預設值；有回合時對戰方式／場地數用變更值或回合的值，目標分數與計時一律用回合的值。
- `page.tsx` 只保存使用者變更過的設定（`draft`，初始 `null`），每次 render 解析出設定。
- `RoundControls` 目標分數方向鍵改以畫面選中值起算。
- 不新增儲存 key、不處理「不計時」缺口（見 design Risk 1）。

解析輸入與結果的前後對照（回合為雙打 2 場、21 分、10 分鐘；使用者剛從參賽者頁回來）：

```
round = { doubles, courts 2, target 21, timer 10 }

=== Before ===
settings = createRoundSettings()          -> { singles, 1, 11, null }
display  = format/courts from settings    -> singles, 1   (mismatch)
         = target/timer from round        -> 21, 10
generate(settings)                        -> singles, 1, 11, no timer

=== After ===
draft    = null
settings = resolveRoundSettings(null, round) -> { doubles, 2, 21, 10 }
display  = settings                       -> doubles, 2, 21, 10
generate(settings)                        -> doubles, 2, 21, 10
```

---

## UI Mockups

```
=== State 1: 以雙打、2 場地、15 分產生本輪 ===

┌──────────────────────────────────────────────┐
│ 對戰方式 ( )單打 (●)雙打                     │
│ 場地數 [-] 2 [+]                             │
│ 目標分數 ( )11 (●)15 ( )21                   │
│ [產生本輪對戰]                               │
│ 場地 1 (雙打)    場地 2 (雙打)               │
└──────────────────────────────────────────────┘
              │
              │ 區段導覽：參賽者 -> 對戰
              ▼

=== State 2 (Before): 設定列被重置 ===

┌──────────────────────────────────────────────┐
│ 對戰方式 (●)單打 ( )雙打                     │ <- 與舞台不一致
│ 場地數 [-](disabled) 1 [+]                   │ <- 與舞台不一致
│ 目標分數 ( )11 (●)15 ( )21                   │
│ [產生本輪對戰]  -> 會產生單打 1 場            │
│ 場地 1 (雙打)    場地 2 (雙打)               │
└──────────────────────────────────────────────┘

=== State 2 (After): 設定列跟隨目前回合 ===

┌──────────────────────────────────────────────┐
│ 對戰方式 ( )單打 (●)雙打                     │
│ 場地數 [-] 2 [+]                             │
│ 目標分數 ( )11 (●)15 ( )21                   │
│ [產生本輪對戰]  -> 產生雙打 2 場、15 分       │
│ 場地 1 (雙打)    場地 2 (雙打)               │
└──────────────────────────────────────────────┘
```
