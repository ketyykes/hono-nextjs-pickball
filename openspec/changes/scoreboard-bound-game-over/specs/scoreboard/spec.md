# Specification: scoreboard

## ADDED Requirements

### Requirement: 比賽結束對話框的動作

比賽結束（`status === "finished"`）時自動開啟的比賽結束對話框（`nextjs-pickball/components/scoreboard/GameOverDialog.tsx`）SHALL 顯示勝方與終局比分，並依計分板是否綁定對戰場次提供不同的動作。

**綁定模式的判斷來源**：是否為綁定模式 MUST 以頁面傳入計分板元件的 `matchId` prop 判斷（非 `null` 即綁定），與設定列（`ScoreboardSetup`）同一個判斷來源；SHALL NOT 改以 reducer 的 `state.matchId` 判斷——prop 在 mount 當下即已知，`state.matchId` 要等讀取完成才有值，兩處若用不同來源，會出現設定列與對話框對「是否綁定」看法不一致的過渡期。

**獨立模式**（`matchId === null`）：對話框 MUST 提供「關閉」與「再來一局」兩個按鈕。「再來一局」SHALL 直接執行 RESET、不再經二次確認（「賽前設定與階段鎖定」RESET 二次確認規則的唯一例外：比賽已結束、終局比分已在對話框呈現，按下該按鈕即為明確意圖）。

**綁定模式**（`matchId !== null`）：對話框 SHALL NOT 渲染「再來一局」或任何會觸發 RESET 的動作，MUST 改以「返回對戰」為主要動作，並保留「關閉」。理由：對戰頁依該場分槽的 `finished` 狀態自動回填比分（見 `match-stage` capability），RESET 會把分槽改回 `setup` 並清空分數，使這場比分無法回填，登入時還會把清空後的分槽寫回雲端；綁定場次打完後的下一步一律是回對戰頁。

- 「返回對戰」MUST 為連到對戰頁（`/matchmaker`）的連結，寫法與設定列既有的「返回對戰」入口一致；按下後 SHALL 只導航，SHALL NOT 觸發 RESET、SHALL NOT 寫入任何分槽或 `scoreboard:current:v1`。
- 「關閉」MUST 只關閉對話框、保留 `finished` 狀態，讓使用者檢視終局分數；關閉後不提供重新開啟對話框的入口（既有行為）。

**專注模式**：對話框為 portal 至 `body` 的元素，不受專注模式隱藏設定列影響，上述兩種模式的動作在專注模式下 MUST 相同。綁定模式在專注模式下，比賽結束對話框的「返回對戰」即為不退出專注模式而回到對戰頁的入口；「對戰場次綁定與失效處理」所述設定列返回入口在專注模式下隱藏的規則不變。

**場次失效**：綁定狀態為 `missing` 時計分板以失效說明取代整個畫面（「對戰場次綁定與失效處理」），不渲染比賽結束對話框；本 Requirement 不為失效狀態另設對話框分支。

實作位於 `nextjs-pickball/components/scoreboard/GameOverDialog.tsx` 與 `nextjs-pickball/components/scoreboard/Scoreboard.tsx`（把 `matchId` prop 傳給對話框）。

#### Scenario: 綁定模式的比賽結束對話框提供返回對戰且不提供再來一局

- **GIVEN** `status === "finished"` 的計分狀態，且對話框收到 `matchId = "m1"`
- **WHEN** 渲染比賽結束對話框
- **THEN** 對話框內有名稱為「返回對戰」的連結且其 `href` 為 `/matchmaker`，有「關閉」按鈕，SHALL NOT 有「再來一局」按鈕
- **驗收**：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`，it 名稱「綁定模式顯示返回對戰連結且不顯示再來一局」

#### Scenario: 綁定模式按關閉後對話框關閉且不重置

- **GIVEN** `status === "finished"` 的計分狀態，且對話框收到 `matchId = "m1"`
- **WHEN** 使用者按下「關閉」
- **THEN** 對話框關閉，`onPlayAgain` 未被呼叫
- **驗收**：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`，it 名稱「綁定模式按關閉後對話框關閉且不呼叫 onPlayAgain」

#### Scenario: 獨立模式維持關閉與再來一局且再來一局不經二次確認

- **GIVEN** `status === "finished"` 的計分狀態，且對話框收到 `matchId = null`（或未傳入）
- **WHEN** 渲染比賽結束對話框並按下「再來一局」
- **THEN** 對話框有「關閉」與「再來一局」兩個按鈕、SHALL NOT 有「返回對戰」連結；按下「再來一局」後 `onPlayAgain` 恰被呼叫一次，且畫面上不出現二次確認的 `alertdialog`
- **驗收**：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`，it 名稱「獨立模式顯示再來一局且點擊即呼叫 onPlayAgain 而不經二次確認」

#### Scenario: 綁定場次打到結束後由對話框返回對戰且比分已回填

- **GIVEN** 訪客模式下名單有四位、已產生一輪 11 分制對戰，由某場地的「進入計分板」進入 `/scoreboard?match=<該場 matchId>`
- **WHEN** 我方連贏 11 球使比賽結束，使用者在比賽結束對話框按下「返回對戰」
- **THEN** 對話框內 SHALL NOT 有「再來一局」按鈕；按下後回到 `/matchmaker`，該場比分顯示 `11:0`、第一隊為勝方，且不再提供進入計分板的入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定場次比賽結束時對話框以返回對戰取代再來一局且返回後比分已回填」

#### Scenario: 專注模式下綁定場次結束後可由對話框返回對戰

- **GIVEN** 同上的綁定場次，使用者已進入專注模式（設定列與其「返回對戰」不渲染）
- **WHEN** 我方連贏 11 球使比賽結束，使用者在比賽結束對話框按下「返回對戰」
- **THEN** 回到 `/matchmaker`，該場比分顯示 `11:0` 且第一隊為勝方
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「專注模式下綁定場次比賽結束後可由對話框返回對戰」

## MODIFIED Requirements

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）、先發球方（`firstServer`）與目標分數（`targetScore`：11／15／21），並 MUST 在 `playing` 與 `finished` 階段忽略這三個 action。

`mode` 與 `firstServer` 中途變更會使 `serverNumber` 與發球權推導失去基準，已累積的分數隨之失去意義；`targetScore` 中途變更雖不影響既有分數的有效性，仍 MUST 一併鎖定 —— 三項設定行為一致可避免使用者建立「有些設定改得動」的錯誤心智模型，並使 `finished → playing` 的反向狀態轉換不必存在（11 分制已判勝後改為 15 分制是否要讓比賽復活，是本規格刻意不引入的複雜度）。比賽中變更分制的唯一路徑為經二次確認的重置。

**綁定對戰場次時目標分數額外鎖定**：`matchId !== null` 時，系統 MUST 在**所有階段**（含 `setup`）忽略 `SET_TARGET_SCORE`。目標分數為每輪設定、同一輪所有場地共用（`prd.md` 6.3.1），若允許單一場地在 setup 階段改掉分制，同一輪的三個場地會打不同分制，回填後的歷史紀錄也會失去可比性。`mode` 同樣由該輪的對戰方式決定，UI MUST NOT 提供切換入口；`firstServer` 仍 SHALL 於 `setup` 階段可調整——先發球方是每場現場決定的事，且不影響回填的比分。

`matchId` MUST 隨 `mode`、`firstServer`、`targetScore` 一併被視為「重建初始狀態時要原樣帶入」的欄位：UNDO 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），RESET 亦重建初始 state，兩者若未帶入 `matchId`，狀態會在使用者按下 Undo 或重置的瞬間**靜默脫離綁定**並改寫獨立槽 `scoreboard:current:v1`，同時汙染獨立計分板的進度。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），三個控制項 MUST 各有 `aria-label`（「比賽形式」、「先發球方」與「目標分數」）。綁定模式下目標分數 MUST 改以**唯讀文字**呈現（形如「本輪 15 分制」）而非 disabled 的 radiogroup，SHALL NOT 只把 radiogroup 設為 disabled —— disabled 的互動控制項仍向使用者暗示「這裡本來可以改」，而綁定模式下它永遠不會解鎖，唯讀文字才是誠實的表達，且少三顆按鈕可讓出高度預算給「返回對戰」入口（見「對戰場次綁定與失效處理」Requirement）。

目標分數 MUST 以 `role="radiogroup"` + 三顆 `role="radio"`（帶 `aria-checked`）表達 —— 三個分制為互斥單選，此語意使讀屏能告知「三選一」而非三個獨立開關。該群組 MUST 實作 WAI-ARIA APG 的 radio group 鍵盤模式：roving tabindex（僅選中項 `tabIndex=0`，使 Tab 進入群組即落在選中項、再按 Tab 離開整組）、方向鍵移動即選取並循環。索引計算 MUST 抽為純函式（`nextjs-pickball/lib/scoreboard/radio-navigation.ts`）並於該層 TDD，SHALL NOT 只寫在元件內 —— 依專案分層規範，元件的行為邏輯須下放到可單元測試的層級。此段僅適用於**未綁定**（`matchId === null`）的獨立計分板。

比賽形式與先發球方的下拉選單 MUST 以 `position="popper"` 展開（`SelectContent` 的 prop），SHALL NOT 使用 shadcn 的預設值 `"item-aligned"` —— 後者會移動面板使**目前選中項**對齊觸發器，當選中的是第二個選項時面板整體上移約一格，而設定列緊貼 navbar 下方（觸發器 top 約 67px、navbar bottom 為 56px，僅 11px 間隙），面板上緣因此落入 navbar 範圍、第一個選項被遮掉一半。`popper` 固定在觸發器下方展開並自帶碰撞偵測，選中項不再影響面板位置。

此約束 MUST 於使用端（`ScoreboardSetup.tsx`）傳入，SHALL NOT 修改 `nextjs-pickball/components/ui/select.tsx` —— 該檔為 shadcn 原生元件，專案慣例為不自行修改其結構、更新走 shadcn CLI，且改動預設值會波及全站所有 Select。

重置（RESET）MUST 保留 `mode`、`firstServer`、`targetScore` 與 `matchId`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。**唯一例外**為獨立計分板（`matchId === null`）比賽結束對話框的「再來一局」：此時比賽已結束（`status === "finished"`）、終局比分已在對話框呈現，且該按鈕只在對話框內出現、按下本身即為明確意圖，SHALL 直接執行 RESET 而不再經二次確認；綁定對戰場次時比賽結束對話框 SHALL NOT 提供任何會觸發 RESET 的動作（見「比賽結束對話框的動作」Requirement）。ActionBar 的「重置」在任何階段、任何模式下仍 MUST 經二次確認。

UNDO 同樣 MUST 保留 `targetScore` 與 `matchId`：`UNDO` 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），重建時若未帶入 `targetScore`，目標分數會靜默退回 11，使 15／21 分制的比賽在 Undo 後可能立即誤判為結束。此失效路徑僅在使用者按下 Undo 時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"` 且 `matchId === null`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員），`targetScore` 與 `matchId` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新，`mode`、`targetScore` 與 `matchId` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: setup 階段可切換目標分數

- **GIVEN** `status === "setup"` 且 `matchId === null`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 15
- **THEN** `targetScore` 變為 15，`mode` 與 `firstServer` 維持不變，分數維持 0-0
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 targetScore 且保留 mode 與 firstServer」

#### Scenario: 綁定對戰場次時 setup 階段仍不得變更目標分數

- **GIVEN** `matchId === "m1"`、`targetScore === 15` 且 `status === "setup"`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 11
- **THEN** state 完全不變（`targetScore` 仍為 15）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「綁定場次時 setup 階段 ignore SET_TARGET_SCORE」

#### Scenario: 綁定模式的目標分數以唯讀文字呈現

- **GIVEN** 以 `/scoreboard?match=<有效 matchId>` 開啟且該輪為 15 分制
- **WHEN** 檢視設定列
- **THEN** 設定列顯示「本輪 15 分制」唯讀文字，`role="radiogroup"` 的目標分數群組 SHALL NOT 存在，比賽形式的下拉選單亦 SHALL NOT 存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉」

#### Scenario: 下拉選單不得被 navbar 遮擋

- **GIVEN** 目前選中的是下拉選單的**第二個**選項（如比賽形式選「單打」、先發球方選「先發：對方」）
- **WHEN** 再次展開該下拉選單
- **THEN** 面板的上緣 MUST 不小於 navbar 的下緣，所有選項完整可見
- **理由**：「可互動」不等於「可見」。面板被遮住一半時選項仍可點擊，Playwright 的 `.click()` 也會照常通過（它只在 pointer events 真被攔截時失敗），因此功能測試對此類缺陷完全無感 —— 本 change 之前的 80 個 E2E 全數通過卻沒抓到。驗收 MUST 直接比較幾何座標，SHALL NOT 以「點得到」作為通過條件
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「下拉選單展開時不被 navbar 遮擋」

#### Scenario: 比賽進行中鎖定設定

- **GIVEN** `status === "playing"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「playing 階段 ignore SET_MODE」、「playing 階段 ignore SET_FIRST_SERVER」與「playing 階段 ignore SET_TARGET_SCORE」

#### Scenario: 比賽結束後仍鎖定設定

- **GIVEN** `status === "finished"`
- **WHEN** dispatch SET_MODE、SET_FIRST_SERVER 或 SET_TARGET_SCORE
- **THEN** state 完全不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「finished 階段 ignore SET_MODE」、「finished 階段 ignore SET_FIRST_SERVER」與「finished 階段 ignore SET_TARGET_SCORE」

#### Scenario: UNDO 保留目標分數

- **GIVEN** `targetScore === 21`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO
- **THEN** replay 後的 state 之 `targetScore` 仍為 21（SHALL NOT 退回 11），`status` 不因此誤判為 `finished`
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 後保留 targetScore，不退回預設 11」

#### Scenario: UNDO 與 RESET 保留 matchId

- **GIVEN** `matchId === "m1"`、比賽進行中且 `history.length > 0`
- **WHEN** dispatch UNDO，接著 dispatch RESET
- **THEN** 兩次的結果 state 之 `matchId` 皆為 `"m1"`（SHALL NOT 退回 `null`）
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「UNDO 與 RESET 後保留 matchId，不退回 null」

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、三個設定控制項恢復 enabled，且 `mode`、`firstServer` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」

#### Scenario: 目標分數群組支援方向鍵導覽與 roving tabindex

- **GIVEN** `status === "setup"`、`matchId === null`、目前選中 11 分制
- **WHEN** 焦點位於目標分數群組並按下 ArrowRight 或 ArrowDown
- **THEN** 選取移至 15 分制、焦點同步移到該按鈕；再按兩次依序到 21 並循環回 11。ArrowLeft／ArrowUp 反向循環；Home／End 跳至首／末項
- **AND** 任一時刻僅選中項的 `tabIndex` 為 0，其餘為 -1
- **驗收**：`nextjs-pickball/lib/scoreboard/radio-navigation.test.ts`（索引計算的純函式層）；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」

#### Scenario: 比賽中方向鍵不得變更目標分數

- **GIVEN** `status === "playing"`（三個控制項皆為 disabled）
- **WHEN** 於目標分數群組按下任一方向鍵
- **THEN** 選取不變 —— 按鈕雖為原生 `disabled`，但 `onKeyDown` 掛在群組容器上仍會收到事件，實作 MUST 自行 guard `locked` 狀態
- **驗收**：同上 E2E test 的後段

#### Scenario: 目標分數控制項於比賽中為 disabled

- **GIVEN** 比賽已開始（`status === "playing"`）且 `matchId === null`
- **WHEN** 檢視設定列
- **THEN** 「目標分數」控制項與其餘兩項同為原生 `disabled`，使用者無法變更分制
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「比賽開始後三個賽前設定控制項皆為 disabled」
