## Why

**本 change 為 milestone M7（歷史紀錄頁）。** 在「匹克球對戰分配機」的交付序中，M1（`player-roster` 名單）與 M2（`match-allocation` 分配引擎）已合併，M3（評分引擎）、M4（回合生命週期與歷史寫入）、M5（對戰畫面與導覽整合）依序在前；M7 屬於 M5 之後可並行的段落之一（M6／M7／M8／M9），本 change 只交付其中的**歷史紀錄頁**。

M4 已把每場完成的賽果寫進 `matchmaker:history:v1`，但**目前沒有任何畫面能看到它們**——資料只進不出。主持人打完一整晚後想回顧「今天誰跟誰打過、分數怎麼變的」，唯一辦法是開 DevTools 讀 LocalStorage。

而 `prd.md` 8.1 的五個時間區間並不是「隨手切五段」：它以 `min()` 串接四個切點來保證**互斥且完整覆蓋**，跨月的那一週會自動歸入「本週」而讓「本月」變成空區間（PRD 驗算二）。舊式的「當月月初至上週一之前」定義會讓 PRD 驗算一中的 8/1～8/9 這一段**無人認領**——賽果消失但沒有任何錯誤訊息。這種靜默漏失只能靠純函式加單元測試鎖住，不能等使用者在畫面上發現。

## What Changes

- 新增純函式模組 `nextjs-pickball/lib/matchmaker/history-range.ts`，實作 `prd.md` 8.1 的切點與區間歸屬：
  - `C0 = 今天 00:00`、`C1 = min(本週一 00:00, C0)`、`C2 = min(當月 1 日 00:00, C1)`、`C3 = min(上月 1 日 00:00, C2)`。
  - 切點一律取**當地時區**的 00:00，**週起始為週一**。
  - 五個區間為半開區間：今日 `[C0, ∞)`、本週 `[C1, C0)`、本月 `[C2, C1)`、上月 `[C3, C2)`、更早 `(-∞, C3)`；任一時間點恰好落入其中一個。
  - `prd.md` 8.1 的兩個驗算例（8/15 一般情形、8/1 跨月週）**直接成為單元測試案例**。
  - 「現在」一律由呼叫端注入，模組內 SHALL NOT 呼叫 `new Date()` 或 `Date.now()`（沿用 M1 `addPlayer({ id, now })` 的注入慣例）。
- 新增路由 `/matchmaker/history`（`app/matchmaker/history/page.tsx`）與對應呈現元件：
  - 五個區間篩選（今日／本週／本月／上月／更早），預設選中「今日」。
  - 每筆顯示 `prd.md` 8.2 的全部欄位：對戰 ID、場地、對戰時間、對戰方式、雙打組成標示、第一隊、第二隊、比分、勝方、賽前分數、賽後分數。
  - 區間內依對戰時間**由新到舊**排序。
  - 空區間顯示友善空狀態；跨月週使「本月」為空時，該空狀態是**正常結果而非錯誤**（`prd.md` 13.5）。
- 歷史頁對 `matchmaker:history:v1` **唯讀**：只透過 M4 提供的 reader 讀取，SHALL NOT 寫入、修改或刪除任何歷史紀錄。
- 由 matchmaker 區段的既有導覽加入通往歷史頁的連結入口（以本 capability 自己的 requirement 描述，不改動 M5 的導覽 requirement）。

### 不在本次範圍

- **歷史紀錄的寫入與資料模型（M4）**。`matchmaker:history:v1` 的 key 名、紀錄欄位 schema、寫入時機、重置範圍（`storage.ts` 的 `RESET_KEYS`）全部由 M4 定案，本 change **只消費不定義**，也不修改 M4 的任何 requirement。
- **CSV 匯出（M8，`prd.md` 9.3）**。本頁不提供任何匯出按鈕；M8 會與本頁共用同一份紀錄 schema，但匯出的欄位順序、跳脫規則與檔名由 M8 自訂。
- **對戰畫面、回合狀態與比分輸入（M4／M5）**。本頁不產生回合、不改比分、不觸發評分更新。
- **評分計算（M3）**。歷史頁只**顯示** M4 寫入的賽前／賽後分數，不重算。
- **全站 navbar 的 matchmaker 入口（M5）**。M5 已以 Modified `site-navbar` 處理，本 change SHALL NOT 動 `site-navbar` 的任何 requirement，也不 MODIFY M5 的 `match-stage` 導覽 requirement——並行 worktree 同時改同一條 requirement 會造成 spec 衝突。
- **JSON／JPG／PDF 匯出（`prd.md` 9.2、9.4、9.5）** 與**後端持久化**（`prd.md` 14 的後續版本方向）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-history`：M4 已建立此 capability（紀錄欄位與寫入時機）。本 change 對同一 capability **ADDED** 區間切點計算、區間互斥與完整覆蓋、歷史頁的篩選與排序、8.2 顯示欄位、空區間空狀態、頁面導覽入口、唯讀消費共七條 requirement，**不修改也不移除 M4 既有的任何 requirement**。

## 執行相依

- **M5 必須先合併回 `main`**，本 change 的 worktree 才能從 `main` 開出：
  - 歷史資料的寫入與 `matchmaker:history:v1` 的紀錄 schema 由 **M4** 提供；
  - matchmaker 區段的頁面骨架與導覽由 **M5** 提供，本頁的入口連結掛在其上；
  - M5 本身相依 M4，因此 M5 進入 `main` 時 M4 必然已在 `main`。
- 與 **M6／M8／M9 可並行**：本 change 只新增 `lib/matchmaker/history-range.ts`、`app/matchmaker/history/**`、`components/matchmaker/History*.tsx` 與一支 E2E spec，唯一會觸碰到既有檔案的地方是「在 M5 的 matchmaker 導覽加一個連結」（見 design Decision 6 的衝突處置）。

## Impact

**新增程式碼**（皆位於 `nextjs-pickball/`）：

| 檔案 | 內容 | TDD 歸屬 |
|---|---|---|
| `lib/matchmaker/history-range.ts` | `HISTORY_RANGES`／`HistoryRange`、`computeRangeCutoffs(now)`、`rangeOfTime(time, now)`、`filterHistoryByRange(records, range, now)` | 行為邏輯，必 TDD（unit） |
| `app/matchmaker/history/page.tsx` | 路由入口 | 例外層（入口），E2E 驗收 |
| `components/matchmaker/HistoryView.tsx` | client 組合層：hydration 讀取、目前選取區間 | 例外層（純呈現），E2E 驗收 |
| `components/matchmaker/HistoryRangeFilter.tsx` | 五個區間篩選 | 例外層（純呈現），E2E 驗收 |
| `components/matchmaker/HistoryRecordCard.tsx` | 單筆紀錄的 8.2 欄位 | 例外層（純呈現），E2E 驗收 |
| `components/matchmaker/EmptyHistory.tsx` | 各區間的友善空狀態 | 例外層（純呈現），E2E 驗收 |

**測試**：

- 新增 `lib/matchmaker/history-range.test.ts`（切點、區間歸屬、篩選與排序）。
- 新增 `tests/e2e/specs/matchmaker-history.spec.ts`（路由、預設區間、切換區間、8.2 欄位、空狀態、導覽入口、唯讀）。

**重用（唯讀，不修改）**：

- M4 的 `MatchHistoryEntry`／`MatchHistoryEntrySchema`（`lib/matchmaker/history.ts`）——本 change SHALL NOT 自行定義歷史紀錄型別。
- M4 的 `readHistory()`（`lib/matchmaker/round-storage.ts`）——`matchmaker:history:v1` 的唯一讀取來源。
- M4 的 key 常數（`lib/matchmaker/storage-keys.ts`）——不重複寫死 key 字串。
- M2 的 `MatchFormat`／`DoublesComposition`（`lib/matchmaker/allocation-types.ts`），僅用於顯示文案對應。

**修改既有檔案**：

- `lib/matchmaker/section-nav.ts`——M5 的 matchmaker 區段導覽，分頁清單與文案的單一來源；在 `MATCHMAKER_SECTION_HREFS`（第 13 行）與 `MATCHMAKER_SECTION_LABELS`（第 15～21 行）各加一筆 `/matchmaker/history`。渲染層 `components/matchmaker/MatchmakerTabs.tsx` 只 map 清單，不需改動。
- `lib/matchmaker/section-nav.test.ts`——第 31～36 行的 regression guard 以 `toEqual` 逐字釘住「分頁清單依序為對戰與參賽者兩筆」，新增分頁後必轉紅，MUST 一併更新該斷言（`section-nav.ts` 屬 `lib/**`，為必 TDD 的行為邏輯）。

**不動**：`lib/matchmaker/storage.ts` 的 `RESET_KEYS`（重置範圍屬 M4）、`lib/matchmaker/{types,roster,colors,allocation*,candidates,pairing,duplication,rating-math}.ts`、`app/matchmaker/players/**`、`components/layout/SiteNavbar.tsx`、後端 `hono-pickball`、部署設定。

**使用者資料**：只讀取 `matchmaker:history:v1`，不新增任何 LocalStorage key，不讀寫 `matchmaker:roster:v1`、`matchmaker:round:v1` 與 `scoreboard:current:v1`。

**無新增外部相依**：不新增任何 npm 套件；日期計算一律用原生 `Date`，不引入 `date-fns`／`dayjs`（見 design Decision 2）。
