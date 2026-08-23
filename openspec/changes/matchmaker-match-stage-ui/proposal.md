## Why

本 change 是「對戰分配機」交付序的 **milestone M5（對戰畫面）**，位置如下：

```
M1 參賽者名單（已合併）→ M2 分配引擎（已合併）→ M3 評分引擎 → M4 回合生命週期
   → 【M5 對戰畫面（本 change）】→ M6 場邊計分銜接 → M7 歷史頁 → M8 資料工具 → M9 JPG／PDF
```

M2 的分配引擎與 M3 的評分引擎都是純函式，M4 把它們串成回合狀態機並持久化，但到 M4 結束為止
**使用者仍看不到任何一場對戰**——`/matchmaker/players` 只能維護名單，`prd.md` 第 7 節整節
（對戰畫面與視覺規格）尚未實作，連 `/matchmaker` 這個路由都不存在。分配機的核心價值
（「現場易讀易操作」，`prd.md` 第 2 節）在畫面出現之前等於零。

同時，`/matchmaker/players` 自 M1 起就**刻意未掛進全站 navbar**——M1 proposal 明文遞延
「導覽整合待對戰畫面完成後與 `site-navbar` 一併處理」（見 `app/matchmaker/players/page.tsx`
檔頭註解與 `tests/e2e/specs/player-roster.spec.ts` 的說明）。本 change 是那個約定的兌現點：
對戰畫面完成後，matchmaker 才第一次成為「使用者找得到」的功能。

## 執行相依

本 change 的 worktree **從 `main` 開出**，因此下列 change MUST 先合併回 `main`：

| 相依 change | milestone | 本 change 用到什麼 |
|---|---|---|
| `matchmaker-round-lifecycle` | M4 | 目前回合的資料模型與 store、產生本輪／重設再排／送出比分的 pipeline、`matchmaker:round:v1` 持久化 |
| `matchmaker-rating-engine` | M3 | 經由 M4 間接消費（送出比分後的評分更新）；本 change 只顯示 `rating` 與觸界狀態，不自行計算 |

M3 的產出由 M4 消費，因此「M4 已合併」即蘊含「M3 已合併」。若 apply 時 Step 0 的 baseline
測試發現 `main` 上沒有回合 capability，MUST 停止並回報，SHALL NOT 在本 change 內補做 M4。

## What Changes

新增 `/matchmaker` 對戰頁（場次舞台）與其視覺／互動規格，涵蓋 `prd.md` 第 7 節全節、4.2／4.3
的控制項、6.1／6.2 的操作入口、6.3 的手動輸入路徑、6.3.1 的目標分數選擇器、6.4.6 的觸界標示、
6.5 的完成場次視覺，以及 12.3／12.5 的可用性與無障礙條款：

- **路由與區段動線**：新增 `app/matchmaker/page.tsx`（對戰頁）與 `app/matchmaker/layout.tsx`
  （matchmaker 區段共用外框），對戰頁與既有的 `/matchmaker/players` 以區段導覽互相切換。
- **本輪設定控制項**：對戰方式（預設單打）、場地數加減（1～8，預設 1）、目標分數（11／15／21，
  預設 11）。預設值與範圍 MUST 取自 `match-allocation` 已匯出的具名常數，SHALL NOT 在 UI 寫死。
- **滿版色塊舞台**：單打每場兩個 1x1 方型色塊左右排列；雙打四個 1x1 色塊排成 2x2，上排為第一隊、
  下排為第二隊。**不得使用傳統垂直卡片列表**（`prd.md` 7.1）。色塊背景沿用 M1 既有的雙色漸層與
  `pickTextColor` 自動文字對比，每格顯示姓名、性別與強度分數。
- **休息名單輔助區**：姓名、顏色標記與累計休息次數；桌面在舞台右側、手機移到下方。
- **空白狀態**：無目前回合時顯示空白球場並提供「建立第一輪」；名單為空時改為導向「加入參賽者」。
- **手動輸入比分**：每場兩個比分欄位（`inputMode="numeric"`，喚起手機數字鍵盤）與送出鈕；送出
  一律委派回合 capability 的 pipeline，驗證錯誤以繁體中文顯示在該場次區塊。
- **完成場次視覺**：半透明低飽和樣式，顯示最終比分、勝方與完成時間；勝方以文字標籤標示。
- **觸頂／觸底標示**：`rating` 達 8.00／1.00 時於色塊標示「已達上限」／「已達下限」，
  SHALL NOT 靜默卡住（`prd.md` 6.4.6）。
- **RWD 三斷點**：桌面（場地內容 + 右側休息名單）／平板（場地優先、休息名單下移）／
  手機（單欄、觸控尺寸）。
- **全站導覽整合**：`SiteNavbar` 的 `NAV_LINKS` 新增「對戰分配」指向 `/matchmaker`，
  導航連結由 4 條增為 5 條，窄螢幕不換行的既有保證延伸涵蓋第 5 條。

### 不在本次範圍

以下為相鄰 milestone 的工作，本 change **明確排除**，SHALL NOT 順手實作：

- **場邊計分入口與回填（M6）**：色塊上不提供「進入計分板」按鈕，`scoreboard:current:v1` 的
  多場次綁定（`prd.md` 6.3.1 第二點）不在本 change 處理。本 change 只做手動輸入這條路徑——
  它是 `prd.md` 6.3 明訂「不得移除」的 fallback，本來就必須能獨立完成一場。
- **歷史頁（M7）**：`prd.md` 8.1 的五個時間區間與歷史列表不在本 change；本 change 只負責讓
  完成的場次進入完成狀態，寫入歷史由 M4 的 pipeline 負責。
- **資料匯入匯出（M8）**：JSON／CSV 的匯出入與預覽流程不在本 change。
- **JPG／PDF 匯出（M9）**：`prd.md` 9.4／9.5 的畫面匯出不在本 change；本 change 的 DOM 結構
  不為了日後截圖而預先扭曲。
- **回合狀態機本身（M4）**：產生回合、重設未完成場次、送出比分後的評分與歷史寫入皆由 M4 提供，
  本 change 只提供操作入口與結果呈現，SHALL NOT 在 UI 層複製任何一份分配、評分或驗證邏輯。
- **`hooks/` 新增任何 hook**：見 design Decision 3——本 change 的狀態邏輯一律以純函式模組
  承載，避免動到 `pickleball-guide-page` 的 hooks 歸屬清單 Requirement 而與 M4 的並行
  worktree 衝突。

## Capabilities

### New Capabilities

- `match-stage`：對戰頁（場次舞台）的視覺與互動規格——路由與區段動線、本輪設定控制項、
  單打／雙打色塊佈局、休息名單輔助區、空白狀態、手動比分輸入與送出、完成場次視覺、
  觸界標示、RWD 三斷點與無障礙條款。

### Modified Capabilities

- `site-navbar`：新增 matchmaker 入口。ADDED「對戰分配連結」Requirement（比照既有「測驗連結」
  的寫法），並 MODIFIED「窄螢幕導航呈現」Requirement 使其由 4 條連結改述為 5 條——該
  Requirement 明文寫著「維持 4 個導航連結全部可見」且其 Scenario 逐字列舉四個連結名稱，
  不改則規格與實作立刻不符。

> 未列入 Modified 的 capability 與理由：
> - `player-roster`：本 change 為 `/matchmaker/players` 加上區段導覽外框，但不改該頁的任何
>   既有 Requirement（資料模型、新增編輯刪除、重置流程皆不動）。區段導覽屬 `match-stage`
>   自己的 Requirement。
> - `match-allocation`：只**讀取**其匯出的常數與型別，不改任何 Requirement。
> - `pickleball-guide-page`：本 change 不新增任何 `hooks/` 檔案，因此不觸及其 hooks 歸屬清單
>   Requirement（該清單有守衛測試 `hooks/hooksInventory.test.ts` 雙向把關）。這是刻意的設計
>   約束，不是巧合，見 design Decision 3。

## Impact

- **新增**：
  - `nextjs-pickball/app/matchmaker/page.tsx`、`nextjs-pickball/app/matchmaker/layout.tsx`
  - `nextjs-pickball/components/matchmaker/` 下的 `MatchStage`、`RoundControls`、`CourtCard`、
    `PlayerTile`、`ScoreEntry`、`RestingPanel`、`EmptyStage`、`MatchmakerTabs`
  - `nextjs-pickball/lib/matchmaker/` 下的 `stage-layout.ts`、`tile-style.ts`、
    `rating-bounds.ts`、`section-nav.ts`、`round-settings.ts` 與各自的 `*.test.ts`
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`
- **修改**：
  - `nextjs-pickball/components/layout/SiteNavbar.tsx`（`NAV_LINKS` 增第 5 條）與
    `SiteNavbar.test.tsx`
  - `nextjs-pickball/tests/e2e/specs/navbar-rwd.spec.ts`（新增第 5 條連結的可見性 test；
    既有四連結 test 原樣保留，理由見 `specs/site-navbar/spec.md` 的 MODIFIED 內註）
  - `nextjs-pickball/CLAUDE.md` 的「架構總覽」路由清單（新增 `/matchmaker`，並移除
    「分配引擎已完成但尚未接 UI」的敘述）
- **重用（唯讀，不修改）**：`lib/matchmaker/colors.ts` 的 `pickTextColor`、
  `lib/matchmaker/allocation-types.ts` 的常數與型別、`lib/matchmaker/types.ts` 的 `Player`、
  `lib/scoreboard/radio-navigation.ts` 的 `nextRadioIndex`（見 design Decision 6）
- **消費（由 M4 提供）**：目前回合的 store 與 pipeline、`matchmaker:round:v1` 持久化
- **無外部相依**：不新增任何 npm 套件；shadcn/ui 元件若需新增則以
  `pnpm dlx shadcn@latest add <component>` 於 `nextjs-pickball/` 內執行
- **不動**：`hono-pickball/**`（本 change 全在前端，matchmaker 依 `prd.md` 為
  LocalStorage-only 純前端功能）、`/scoreboard` 既有行為與其 `scoreboard:current:v1`
