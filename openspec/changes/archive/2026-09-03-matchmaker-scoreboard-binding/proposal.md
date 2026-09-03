## Why

> **Milestone M6**（對戰分配機交付序的第 6 段，M3～M9 中的第 4 段）。
> 前置：M3 評分引擎 → M4 回合資料模型與送出 pipeline → M5 對戰畫面 UI → **M6 計分板銜接** →
> M7 歷史頁 → M8 匯出 → M9 收尾。

M5 交付後，使用者已能看到本輪的場地色塊並手動輸入比分；但 `prd.md` 6.3 承諾的**兩條**比分來源目前只有一條可用——「場邊計分」這條路完全斷開：對戰頁沒有進入 `/scoreboard` 的入口，計分板也不知道自己正在計哪一場。

斷開的根因是資料形狀：現行 `scoreboard:current:v1` 是**全站單一場次**（見 `scoreboard` capability 的「localStorage 持久化」Requirement）。主持人開 3 個場地、依序點進三個計分板時，第二場的第一球會直接覆蓋第一場的進度，且沒有任何錯誤提示——失敗模式是**靜默的分數消失**，正是該 Requirement 的「向後相容策略」段落明文警告的那種事故。因此在接上分配機之前，計分板的狀態必須先能識別所屬對戰場次。

本段把這條路接通：對戰頁 → 計分板 → 回填，並讓回填走**與手動輸入完全相同**的送出 pipeline，使兩條來源產生的回合、評分與歷史逐欄一致（`prd.md` 6.3 表格的承諾）。

## 執行相依

- **M5（`matchmaker-match-stage-ui`）必須先合併回 `main`**，本 change 的 worktree 才能從 `main` 開出。M5 之前的 M3（評分引擎）與 M4（回合資料模型與送出 pipeline）隨 M5 一併在內。
  - 相依的具體內容：M5 的對戰頁與場地色塊元件（本段要在其上加入口）、M4 的 `matchmaker:round:v1` 回合資料模型與送出比分 pipeline（本段要複用）、M3 的評分 API（本段不直接呼叫，經由 M4 的 pipeline 間接使用）。
- 與 M7（歷史頁）、M8（CSV 匯出）、M9 可**並行開 worktree**，但三者與本段都會觸及對戰頁與回合模組等共同檔案。**建議本段最先合併**，M7／M8／M9 再 rebase——本段改動的是 M5 剛落地的檔案，衝突面最小化的順序是先讓它進 `main`。

## What Changes

- **計分板狀態改為可綁定對戰場次**：`ScoreboardState` 新增 `matchId`（`string | null`，zod `.default(null)`）。`matchId === null` 為既有的獨立計分板；非 null 時狀態存於新的分槽 key `scoreboard:matches:v1`（以 `matchId` 為索引的物件），**多場地互不覆蓋**。
- **既有 `/scoreboard` 獨立用法完全保留**：不帶 `?match=` 參數時行為與現在逐字相同，仍讀寫 `scoreboard:current:v1`，既有進行中的比賽不會因本次改動而歸零（新欄位以 `.default(null)` 補值，**不 bump storage key**）。
- **由對戰進入時目標分數由該輪帶入且不可改**：`matchId !== null` 時 reducer MUST 忽略 `SET_TARGET_SCORE`，UI 以唯讀文字取代目標分數 radiogroup。
- **對戰頁每個場地色塊新增「進入計分板」入口**：點擊時先寫入該場的計分板初始狀態（seed；已有進度則**不覆蓋**），再導向 `/scoreboard?match=<matchId>`。
- **返回動線**：綁定模式的設定列提供「返回對戰」按鈕；回到對戰頁時，凡該輪有 `status === "finished"` 的計分板槽且該場尚未完成者，以其比分呼叫**與手動輸入相同的送出 pipeline**（驗證 → 評分更新 → 寫入歷史 → 標示完成），已完成者不重複送出。
- **失效處理**（`prd.md` §11「由計分板返回時該場次已被刪除或該輪已重設」）：重設／重排本輪時一併清除對應的計分板槽；以 `?match=<已失效 id>` 開啟計分板時顯示繁體中文說明與兩個出口（回到對戰頁／改用獨立計分板），SHALL NOT 顯示技術錯誤碼或白畫面。
- **開始計分即鎖定本輪目標分數**：該輪只要有任一場次已開始計分（計分板槽的 `status !== "setup"`）或已完成，`targetScore` 即不可更改。反面亦成立——**回合存在但一場都還沒開始計分時，目標分數 MUST 仍可更改**（經 M4 既有的 `setTargetScore`）。這是對 M5 行為的放寬：M5 因當時拿不到「開始計分」的判準而採「有回合就鎖」，本段補上判準後回到 `prd.md` 6.3.1 的原文。
- **重置名單的清除範圍擴為四個 key**：`matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1` 之外加入 `scoreboard:matches:v1`；`scoreboard:current:v1` 仍不在範圍內。

**不在本次範圍**（相鄰 milestone 的東西明確排除）：

- **計分規則本身不動**。side-out 判定、Undo、勝利條件、發球位置推導、0-0-2 起手全部照舊；本段不新增、不修改 `lib/scoreboard/rules.ts` 的任何規則。
- **Undo、全螢幕、專注模式行為不變**。三者的 Requirement 因此**不列入 MODIFIED**——綁定模式只是多帶一個 `matchId` 欄位，`useFocusMode`／`useFullscreen` 與 replay 機制完全不受影響（`matchId` 隨 `mode`／`firstServer`／`targetScore` 一併在 UNDO replay 與 RESET 後保留，見 `scoreboard` delta）。
- **歷史紀錄頁與 CSV 匯出（M7／M8）不做**。本段只保證回填**寫入**歷史時與手動輸入走同一條 pipeline、欄位同一份 schema；歷史的呈現、篩選與匯出屬 M7／M8。
- **評分公式與常數（M3）不動**。本段不呼叫評分 API，只透過 M4 的送出 pipeline 間接觸發。
- **回合的產生、重設／重排（M4）不動**。本段只在「重設／重排本輪」既有流程尾端追加「清除對應計分板槽」一步。
- **全站 navbar 的 matchmaker 入口不動**。該入口由 M5 以 Modified `site-navbar` 處理，本段不碰 `site-navbar`，也不 MODIFY M5 的對戰頁導覽 Requirement——避免與 M7／M8 的並行 worktree 在同一段落上衝突。
- **計分板不顯示實際球員姓名**。隊伍標籤維持「我方／對方」；帶入姓名需在 seed 中多帶顯示資料，屬可獨立提出的體驗改善（見 design 的 Open Questions）。
- **跨分頁即時同步不做**。同一台裝置開兩個分頁分別計兩個場地是**支援**的（各自綁不同 `matchId`），但一個分頁的變更不會即時推播到另一個分頁；PRD 未要求（見 design 的 Open Questions）。

## Capabilities

### New Capabilities

（無）本段不引入新的 capability，三份 delta 都掛在既有 capability 上。

### Modified Capabilities

- `scoreboard`：**MODIFIED** 兩個既有 Requirement——「localStorage 持久化」（單一場次 → 依 `matchId` 分槽、逐筆降級）與「賽前設定與階段鎖定」（綁定模式下目標分數改為唯讀）；**ADDED** 一個新 Requirement 描述綁定的建立、失效判定與返回動線。
- `match-stage`（M5 建立）：**ADDED** 兩個新 Requirement——場地色塊的計分板入口、計分中場次的標示與返回後呈現；**MODIFIED** 一個既有 Requirement——「目標分數選擇器」的鎖定條件由 M5 的「目前回合存在即鎖」放寬為「本輪已開始計分才鎖」，且鎖定與否改為委派 `lib/matchmaker/scoreboard-binding.ts` 的判定純函式。這一條**必須** MODIFIED：M5 的既有字句直接寫了「目前回合存在時，選擇器 MUST 為 disabled」，本段推翻它而非追加（M5 design Decision 5 已預告「M6 接上場邊計分後若要放寬，那是一次明確的規格變更」）；連帶 M5 的既有單元測試需更新，已列入 tasks（見 design Decision 7）。
- `round-lifecycle`（M4 建立）：**ADDED** 三個新 Requirement——計分板結果的自動回填共用送出 pipeline、開始計分後鎖定本輪目標分數、重排本輪或重置名單時清除對應計分板進度。此三條採 ADDED——它們是新的生命週期步驟，沒有推翻 M4 任何既有 Requirement 的字句。
- `player-roster`（M1 建立、M4 修訂）：**MODIFIED** 一個既有 Requirement——「重置名單與二次確認」的列舉 key 清單由三個擴為四個（新增 `scoreboard:matches:v1`）。清單是該 Requirement 明文擁有的內容（「重置範圍 MUST 以列舉的 key 清單實作」「目前的清單為三個 key」），本段擴大清除範圍即是修訂它；若只在 `round-lifecycle` 追加一句「重置名單須清分槽 key」，歸檔後主 spec 會同時存在兩條互相打架的規定，而實作點 `resetMatchmakerData()` 只有一個。基底 MUST 取 M4 的 MODIFIED 版本（三個 key），不可取主 spec 的單一 key 前身版本。

## Impact

**修改既有程式碼**（皆位於 `nextjs-pickball/`）：

| 檔案 | 改動 | TDD 歸屬 |
|---|---|---|
| `lib/scoreboard/types.ts` | `ScoreboardStateSchema` 新增 `matchId`（`.nullable().default(null)`）；`MatchSettings` 併入 `matchId` | 行為邏輯，必 TDD |
| `lib/scoreboard/reducer.ts` | `createInitialState` 帶入 `matchId`；`SET_TARGET_SCORE` 在綁定時忽略；UNDO／RESET 保留 `matchId` | 行為邏輯，必 TDD |
| `lib/scoreboard/storage.ts` | `readScoreboard(matchId)`／`writeScoreboard(state)`／`clearScoreboard(matchId)` 依 `matchId` 分派槽位 | 行為邏輯，必 TDD |
| `hooks/useScoreboardStore.ts` | 接受 `matchId`，回傳值增加綁定狀態（`standalone`／`bound`／`missing`） | 行為邏輯，必 TDD |
| `app/scoreboard/page.tsx` | 讀 `searchParams.match` 並以 prop 傳入 `<Scoreboard />` | 例外層（入口） |
| `components/scoreboard/Scoreboard.tsx` | 接受 `matchId` prop；綁定模式的設定列與失效畫面分支 | 例外層（純呈現） |
| `components/scoreboard/ScoreboardSetup.tsx` | 綁定模式下以唯讀文字取代目標分數 radiogroup，並顯示場地標示與「返回對戰」 | 例外層（純呈現） |
| M5 的場地色塊元件（路徑以 M5 實際產出為準） | 加入「進入計分板」入口與「計分中」標示 | 例外層（純呈現） |
| M5 的目標分數選擇器元件（`components/matchmaker/RoundControls.tsx`，路徑以 M5 實際產出為準） | 鎖定條件改為委派判定純函式；未鎖定時委派 `setTargetScore` | 例外層（純呈現），既有單元測試須更新 |
| `lib/matchmaker/round.ts`（M4 建立）的 `resetIncompleteMatches` | 尾端追加清除對應計分板槽 | 行為邏輯，必 TDD |
| `lib/matchmaker/storage.ts`（M1 建立、M4 修訂） | 列舉的重置 key 清單 `RESET_KEYS` 加入分槽 key（字面值 import 自 `lib/scoreboard/match-slots.ts`） | 行為邏輯，必 TDD |
| `hooks/useRoundStore.ts`（M4 建立、M5 擴充） | 新增 `setTargetScore` 動作（§8.6）；回合 hydrate 後的計分板回填 reconcile（§8.4） | 行為邏輯，必 TDD |
| `app/matchmaker/page.tsx`（M5 建立） | 把 `setTargetScore` 與回填 reconcile 以 prop 下傳（§8.4、§8.6） | 例外層（入口） |

**新增程式碼**：

| 檔案 | 內容 | TDD 歸屬 |
|---|---|---|
| `lib/scoreboard/match-slots.ts` | 分槽 key `scoreboard:matches:v1` 的 schema、讀寫、逐筆降級、批次清除 | 行為邏輯，必 TDD |
| `lib/matchmaker/scoreboard-binding.ts` | seed 建立、`ensureMatchSlot`（不覆蓋既有進度）、完成場次的回填清單、目標分數鎖定判定、隊伍對應 | 行為邏輯，必 TDD |
| `components/scoreboard/MatchBindingNotice.tsx` | 場次失效時的繁體中文說明與兩個出口 | 例外層（純呈現） |

**測試**：新增 `lib/scoreboard/match-slots.test.ts`、`lib/matchmaker/scoreboard-binding.test.ts` 與 `tests/e2e/specs/scoreboard-binding.spec.ts`；擴充 `lib/scoreboard/{types,reducer,storage}.test.ts`、`hooks/useScoreboardStore.test.tsx`、`lib/matchmaker/storage.test.ts`；更新 M5 既有的 `components/matchmaker/RoundControls.test.tsx`（目標分數鎖定條件放寬）。

**使用者資料**：新增 LocalStorage key `scoreboard:matches:v1`，且該 key **屬於「重置名單」的清除範圍**。既有 `scoreboard:current:v1` 原地沿用為獨立槽，**不搬移、不轉換、不刪除**，也不在重置範圍內；`matchmaker:roster:v1`（M1）與 `matchmaker:round:v1`／`matchmaker:history:v1`（M4）的形狀不受本段改動。

**無影響**：後端 `hono-pickball`、部署設定、無新增 npm 套件；`quiz`、`tour-experience`、`pickleball-guide-page`、`site-navbar`、`api-connectivity`、`dev-workflow`、`match-allocation` 等 capability 的 Requirement 不變（`player-roster` 有一條 Requirement 被 MODIFIED，見上）。
