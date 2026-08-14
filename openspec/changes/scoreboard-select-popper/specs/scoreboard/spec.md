## MODIFIED Requirements

### Requirement: 賽前設定與階段鎖定

系統 SHALL 於 `status === "setup"` 期間允許調整比賽形式（`mode`：單打／雙打）、先發球方（`firstServer`）與目標分數（`targetScore`：11／15／21），並 MUST 在 `playing` 與 `finished` 階段忽略這三個 action。

`mode` 與 `firstServer` 中途變更會使 `serverNumber` 與發球權推導失去基準，已累積的分數隨之失去意義；`targetScore` 中途變更雖不影響既有分數的有效性，仍 MUST 一併鎖定 —— 三項設定行為一致可避免使用者建立「有些設定改得動」的錯誤心智模型，並使 `finished → playing` 的反向狀態轉換不必存在（11 分制已判勝後改為 15 分制是否要讓比賽復活，是本規格刻意不引入的複雜度）。比賽中變更分制的唯一路徑為經二次確認的重置。

UI MUST 以原生 `disabled` 屬性表達鎖定狀態（`nextjs-pickball/components/scoreboard/ScoreboardSetup.tsx` 的 `disabled={locked}`），三個控制項 MUST 各有 `aria-label`（「比賽形式」、「先發球方」與「目標分數」）。

目標分數 MUST 以 `role="radiogroup"` + 三顆 `role="radio"`（帶 `aria-checked`）表達 —— 三個分制為互斥單選，此語意使讀屏能告知「三選一」而非三個獨立開關。該群組 MUST 實作 WAI-ARIA APG 的 radio group 鍵盤模式：roving tabindex（僅選中項 `tabIndex=0`，使 Tab 進入群組即落在選中項、再按 Tab 離開整組）、方向鍵移動即選取並循環。索引計算 MUST 抽為純函式（`nextjs-pickball/lib/scoreboard/radio-navigation.ts`）並於該層 TDD，SHALL NOT 只寫在元件內 —— 依專案分層規範，元件的行為邏輯須下放到可單元測試的層級。

比賽形式與先發球方的下拉選單 MUST 以 `position="popper"` 展開（`SelectContent` 的 prop），SHALL NOT 使用 shadcn 的預設值 `"item-aligned"` —— 後者會移動面板使**目前選中項**對齊觸發器，當選中的是第二個選項時面板整體上移約一格，而設定列緊貼 navbar 下方（觸發器 top 約 67px、navbar bottom 為 56px，僅 11px 間隙），面板上緣因此落入 navbar 範圍、第一個選項被遮掉一半。`popper` 固定在觸發器下方展開並自帶碰撞偵測，選中項不再影響面板位置。

此約束 MUST 於使用端（`ScoreboardSetup.tsx`）傳入，SHALL NOT 修改 `nextjs-pickball/components/ui/select.tsx` —— 該檔為 shadcn 原生元件，專案慣例為不自行修改其結構、更新走 shadcn CLI，且改動預設值會波及全站所有 Select。

重置（RESET）MUST 保留 `mode`、`firstServer` 與 `targetScore`、清空分數與 history、將 `status` 回到 `setup`，且 MUST 經二次確認才執行 —— 誤觸重置會讓整場比賽的分數消失且無法 Undo。

UNDO 同樣 MUST 保留 `targetScore`：`UNDO` 以「重建初始 state 後 replay」實作（見「Undo 機制」Requirement），重建時若未帶入 `targetScore`，目標分數會靜默退回 11，使 15／21 分制的比賽在 Undo 後可能立即誤判為結束。此失效路徑僅在使用者按下 Undo 時顯現，正常計分完全正常，MUST 有獨立測試覆蓋。

#### Scenario: setup 階段可切換比賽形式

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_MODE 切換為 singles
- **THEN** `mode` 更新，且 `serverNumber` 設為 1、`isFirstService` 設為 false（單打無 #2 發球員），`targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false」

#### Scenario: setup 階段可切換先發球方

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_FIRST_SERVER
- **THEN** `firstServer` 更新，`mode` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 firstServer」

#### Scenario: setup 階段可切換目標分數

- **GIVEN** `status === "setup"`
- **WHEN** dispatch SET_TARGET_SCORE 切換為 15
- **THEN** `targetScore` 變為 15，`mode` 與 `firstServer` 維持不變，分數維持 0-0
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「setup 階段可切換 targetScore 且保留 mode 與 firstServer」

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

#### Scenario: 重置需二次確認且解除鎖定

- **GIVEN** 比賽進行中，設定控制項為 disabled
- **WHEN** 使用者按下「重置」
- **THEN** 先顯示標題為「確定要重置比賽？」的 AlertDialog；確認後分數與 history 清空、`status` 回到 `setup`、三個設定控制項恢復 enabled，且 `mode`、`firstServer` 與 `targetScore` 維持不變
- **驗收**：`nextjs-pickball/lib/scoreboard/reducer.test.ts`，it 名稱「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」；E2E 為 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「重置含二次確認；確認後 mode toggle 解鎖（enabled）」

#### Scenario: 目標分數群組支援方向鍵導覽與 roving tabindex

- **GIVEN** `status === "setup"`、目前選中 11 分制
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

- **GIVEN** 比賽已開始（`status === "playing"`）
- **WHEN** 檢視設定列
- **THEN** 「目標分數」控制項與其餘兩項同為原生 `disabled`，使用者無法變更分制
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「比賽開始後三個賽前設定控制項皆為 disabled」
