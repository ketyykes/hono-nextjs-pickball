# Overview — matchmaker-scoreboard-binding（M6）

> 給人類一頁讀完此 change。apply 階段不必讀本檔，validator 也不解析它。

## Scope

把「對戰頁 → 計分板 → 回填」這條路接通：計分板的狀態從「全站唯一一場」改為**可綁定特定對戰場次**，多場地同時計分互不覆蓋；由對戰進入時目標分數由該輪帶入且不可改；返回時勝負底定的比分自動回填，並且走**與手動輸入完全相同**的送出 pipeline。既有獨立使用 `/scoreboard` 的行為完全保留。

**規模判定：large。** 影響 4 個 capability（`scoreboard`、`match-stage`、`round-lifecycle`、`player-roster`），tasks 超過 20 項，且動到既有 LocalStorage schema 與三個模組間的相依方向。其中 `player-roster` 只有「重置名單」的列舉 key 清單由三個擴為四個，`match-stage` 只有「目標分數選擇器」的鎖定條件被放寬。

各條件式區塊的判定：

| 條件 | 判定 | 理由 |
|---|:---:|---|
| 前端需求 → UI Mockups | ✅ 命中 | 場地色塊新增入口與「計分中」標示、計分板設定列在綁定模式下改組、場次失效畫面 |
| 資料庫結構 → Data Model | ❌ 不命中 | 本專案無資料庫，資料全在瀏覽器 LocalStorage；儲存形狀變化改以 What Changes 的 before/after 呈現 |
| 資料遷移 → Data Migration | ❌ 不命中 | 既有 `scoreboard:current:v1` **原地沿用**為獨立槽，不搬移不轉換；新欄位以 zod `.default(null)` 補值，新 key 首次使用時才建立 |
| 跨元件流程 → Sequence Diagram | ✅ 命中 | 跨頁面導覽 + 兩個 LocalStorage key + 回合模組的送出 pipeline，且順序敏感（seed 必須先於導向、reconcile 必須晚於回合 hydrate） |

## What Changes

- `ScoreboardState` 新增 `matchId`；`null` 為獨立計分板，非 `null` 時狀態存進新的分槽 key。
- 新增 `scoreboard:matches:v1`（一場一槽，逐筆降級）；`scoreboard:current:v1` 語意不變。
- `/scoreboard?match=<matchId>` 為綁定模式；找不到對應槽即為失效，顯示繁中說明與兩個出口。
- 對戰頁每場加「進入計分板／繼續計分」入口，點擊時先寫 seed 再導向。
- 回到對戰頁時，`finished` 的槽經**同一個**送出 pipeline 回填，送出後清槽（冪等）。
- 該輪一旦有場次開始計分，`targetScore` 鎖定並說明原因；**尚未開始計分前則解鎖**（放寬 M5 的「有回合就鎖」，改走 M4 的 `setTargetScore`）。
- 重設／重排本輪或重置名單時一併清除對應的槽；「重置名單」的列舉 key 清單因此由三個擴為四個。

儲存形狀的 before / after：

```
=== Before ===

localStorage
  scoreboard:current:v1 -> { us:8, them:5, targetScore:15, ... }
                           ^ 全站唯一一場
  matchmaker:round:v1   -> { targetScore:15, matches:[m1,m2,m3] }

  進入 m1 計分 --> 寫 scoreboard:current:v1
  進入 m2 計分 --> 覆蓋 scoreboard:current:v1
                  ^ m1 的分數消失, 沒有任何提示

=== After ===

localStorage
  scoreboard:current:v1 -> { ..., matchId:null }
                           ^ 獨立計分板, 行為逐字不變
  scoreboard:matches:v1 -> { m1:{ ..., matchId:"m1" },
                             m2:{ ..., matchId:"m2" } }
                           ^ 一場一槽
  matchmaker:round:v1   -> { targetScore:15, matches:[m1,m2,m3] }

  進入 m1 計分 --> 寫 scoreboard:matches:v1 的 m1
  進入 m2 計分 --> 寫 scoreboard:matches:v1 的 m2
                  ^ 互不覆蓋

  槽有條目 <==> 綁定有效   (重排本輪 / 重置名單時清槽維持此等價)
```

## UI Mockups

四個關鍵狀態。`░░░░` 表示 disabled，`←` 為行末註解。

```
=== State 1: 對戰頁的場地區塊 - Before ===

┌─ 場地 1 ──────────────────────────┐
│ ┌──────┐ ┌──────┐                 │
│ │ 阿明 │ │ 小華 │                 │
│ │ 5.20 │ │ 4.80 │                 │
│ └──────┘ └──────┘                 │
│ 第一隊 [___] 第二隊 [___] [送出]  │  ← 只有手動輸入一條路
└───────────────────────────────────┘

=== State 2: 對戰頁的場地區塊 - After ===

┌─ 場地 1 ──────────────────────────┐
│ ┌──────┐ ┌──────┐                 │
│ │ 阿明 │ │ 小華 │                 │
│ │ 5.20 │ │ 4.80 │                 │
│ └──────┘ └──────┘                 │
│ [進入計分板]                      │  ← 新增, 先寫 seed 再導向
│ 第一隊 [___] 第二隊 [___] [送出]  │  ← 手動輸入原樣保留
└───────────────────────────────────┘
         │
         │ 點擊後
         ▼
┌─ 場地 1 ──────────────────────────┐
│ 計分中 8 : 5                      │  ← 文字標示, 不只靠顏色
│ [繼續計分]                        │  ← 文案由「進入」改為「繼續」
│ 第一隊 [___] 第二隊 [___] [送出]  │
└───────────────────────────────────┘

=== State 3: 計分板設定列 - 獨立模式 vs 綁定模式 ===

獨立模式 /scoreboard
┌──────────────────────────────────────────────┐
│ [雙打 ▼] [先發:我方 ▼] ( )11 (●)15 ( )21 [⛶] │
└──────────────────────────────────────────────┘
                          ^ radiogroup 三選一

綁定模式 /scoreboard?match=m1
┌──────────────────────────────────────────────┐
│ 場地 3   [先發:我方 ▼]   本輪 15 分制   [⛶]  │
│ [返回對戰]                                   │
└──────────────────────────────────────────────┘
   ^ 場地標示     ^ 仍可調      ^ 唯讀文字, 非 disabled 按鈕

=== State 4: 場次失效 /scoreboard?match=<已不存在> ===

┌──────────────────────────────────────────────┐
│                                              │
│   這場對戰已經不在了                         │
│                                              │
│   可能是這一輪已經重設, 或這個場次被刪除了。 │
│   你可以回到對戰頁重新開始, 或改用獨立計分板 │
│   繼續計這一場。                             │
│                                              │
│   [回到對戰頁]  [改用獨立計分板]             │
│                                              │
└──────────────────────────────────────────────┘
   ← 沒有任何技術錯誤碼, 沒有白畫面, 不靜默退回獨立槽

=== State 5: 本輪已開始計分 - 目標分數鎖定 ===

┌─ 本輪設定 ───────────────────────────────────┐
│ 目標分數  ( )11 ░░░░ (●)15 ░░░░ ( )21 ░░░░   │
│ 本輪已開始計分, 目標分數不可更改。           │
└──────────────────────────────────────────────┘
   ← 停用同時說明原因, 沉默的 disabled 會被讀成故障
```

## Architecture

模組相依為**單向**：matchmaker 可以認識 scoreboard，scoreboard 不認識 matchmaker。這條線是 design Decision 2 的結構保證——`/scoreboard` 先於分配機存在，讓它去理解回合 schema 會使 M4 的任何調整都變成獨立計分板的迴歸風險。

```
┌──────────────── nextjs-pickball ─────────────────────────┐
│                                                          │
│  app/matchmaker/<對戰頁>         app/scoreboard/page.tsx │
│    例外層 入口                     例外層 入口           │
│        │                               │ searchParams    │
│        ▼                               ▼ 以 prop 注入    │
│  components/matchmaker/          components/scoreboard/  │
│    <場地色塊>  純呈現              Scoreboard 純呈現     │
│        │                               │                 │
│        ▼                               ▼                 │
│  lib/matchmaker/                 hooks/                  │
│    scoreboard-binding.ts           useScoreboardStore.ts │
│      buildMatchSlotSeed                │                 │
│      ensureMatchSlot                   ▼                 │
│      collectFinishedSubmissions  lib/scoreboard/         │
│      isTargetScoreLocked           storage.ts            │
│      clearSlotsFor                   依 matchId 分派     │
│        │                               │                 │
│        │              ┌────────────────┘                 │
│        ▼              ▼                                  │
│  M4 送出 pipeline   lib/scoreboard/match-slots.ts        │
│    驗證 → 評分         key: scoreboard:matches:v1        │
│    → 歷史 → 完成       逐筆降級 / 批次清除               │
│                                                          │
│  單向相依: lib/matchmaker ──► lib/scoreboard  絕不反向   │
└──────────────────────────────────────────────────────────┘
```

## Sequence Diagram

只畫關鍵路徑與失敗分支。`──►` 同步呼叫、`◄──` 回應、`╌╌►` 非同步或分支結果。

```
對戰頁      binding     分槽storage   計分板頁   M4送出入口
  │            │             │            │           │
  │ 點「進入計分板」         │            │           │
  ├───────────►│             │            │           │
  │            │ensureSlot   │            │           │
  │            ├────────────►│            │           │
  │            │  已有則不覆蓋            │           │
  │            │◄────────────┤            │           │
  │ push /scoreboard?match=m1             │           │
  ├──────────────────────────────────────►│           │
  │            │             │ read m1    │           │
  │            │             │◄───────────┤           │
  │            │             │            │           │
  │            │  [失敗分支] 無 m1 條目    │           │
  │            │             ├╌╌╌╌╌╌╌╌╌╌►│ 顯示失效  │
  │            │             │            │ 說明+出口 │
  │            │             │            │           │
  │            │             │ 每球 write m1          │
  │            │             │◄───────────┤           │
  │ 「返回對戰」或瀏覽器上一頁            │           │
  │◄──────────────────────────────────────┤           │
  │            │             │            │           │
  │ 回合 hydrate 完成後才 reconcile        │           │
  ├───────────►│ collectFinishedSubmissions           │
  │            ├────────────►│            │           │
  │            │◄────────────┤ [m1: 11-7] │           │
  │            │ 與手動輸入同一入口                   │
  │            ├─────────────────────────────────────►│
  │            │◄─────────────────────────────────────┤
  │            │ clearSlotsFor(["m1"])    │           │
  │            ├────────────►│            │           │
  │◄───────────┤ 場地 1 轉為已完成        │           │
```

順序上的兩個硬性要求：

1. **seed 必須先於導向**——計分板以「槽有無條目」判定綁定有效，先導向會閃一下失效畫面。
2. **reconcile 必須晚於回合 hydrate**——否則會拿空回合去比對而漏掉回填（design Risks）。

## Task Tree

```
§0 上游契約對齊  (前置調查, 不寫程式碼)
 │
 ├─ §1 分槽儲存 match-slots.ts
 │   ├─ §3 storage 分派 + hook 綁定        (亦依賴 §2)
 │   │   └─ §7 計分板 UI 接線  例外層/E2E
 │   │       └─ §8 對戰頁 UI 接線 例外層/E2E (亦依賴 §4 §5 §6)
 │   ├─ §4 入口純函式  seed / ensureSlot / 隊伍對應
 │   │   └─ §5 回填清單 + 目標分數鎖定判定
 │   │       └─ §6 清除範圍  重設本輪 / 重置名單  (亦依賴 §1)
 │   └─ §6 清除範圍
 │
 ├─ §2 matchId 欄位 + reducer 鎖定
 │   └─ §3 storage 分派 + hook 綁定
 │
 └─ §9 收尾驗證  (全部完成後)
```

## Cross-Cutting Impact

| 檔案 / 模組 | 動作 | 群組 | TDD 歸屬 |
|---|---|---|---|
| `lib/scoreboard/match-slots.ts` | 新增 | §1 | 行為邏輯，必 TDD |
| `lib/scoreboard/types.ts` | 加 `matchId` 欄位 | §2 | 行為邏輯，必 TDD |
| `lib/scoreboard/reducer.ts` | 綁定時鎖 `SET_TARGET_SCORE`、保留 `matchId` | §2 | 行為邏輯，必 TDD |
| `lib/scoreboard/storage.ts` | 依 `matchId` 分派槽位 | §3 | 行為邏輯，必 TDD |
| `hooks/useScoreboardStore.ts` | 接受 `matchId`、回傳綁定狀態 | §3 | 行為邏輯，必 TDD |
| `lib/matchmaker/scoreboard-binding.ts` | 新增 | §4、§5、§6 | 行為邏輯，必 TDD |
| M4 的回合重設流程 | 尾端追加逐場清槽 | §6 | 行為邏輯，必 TDD |
| `lib/matchmaker/storage.ts`（M1 建立、M4 修訂） | 重置名單的列舉 key 清單 `RESET_KEYS` 加入分槽 key | §6 | 行為邏輯，必 TDD |
| M5 的目標分數選擇器與其單元測試 | 鎖定條件改委派判定純函式；未鎖定時委派 `setTargetScore` | §8 | 例外層（純呈現），既有單元測試須更新 |
| `app/scoreboard/page.tsx` | 讀 `searchParams` 傳 prop | §7 | 例外層（入口），E2E |
| `components/scoreboard/Scoreboard.tsx` | 接 `matchId` prop、失效分支 | §7 | 例外層（純呈現），E2E |
| `components/scoreboard/ScoreboardSetup.tsx` | 綁定模式的設定列組成 | §7 | 例外層（純呈現），E2E |
| `components/scoreboard/MatchBindingNotice.tsx` | 新增 | §7 | 例外層（純呈現），E2E |
| M5 的場地色塊元件 | 入口按鈕、計分中標示 | §8 | 例外層（純呈現），E2E |
| M5 的對戰頁 | reconcile 掛載、鎖定 UI | §8 | 例外層（入口），E2E |
| `tests/e2e/specs/scoreboard-binding.spec.ts` | 新增 | §7、§8 | 例外層（測試基礎建設） |
| `tests/e2e/specs/scoreboard.spec.ts` | **不改**，必須原樣通過 | §9 | 迴歸證據 |
| `lib/scoreboard/rules.ts` | **不動** | — | 計分規則不在本次範圍 |
| `hooks/useFocusMode.ts`、`useFullscreen.ts` | **不動** | — | 專注模式與全螢幕行為不變 |
| `hono-pickball/**` | **不動** | — | 本段純前端、無 API 變更 |
