## Why

本 change 是「對戰分配機」交付序的 **milestone M14（輪次計時器）**，位置如下：

```
M10 stage-gaps → M11 player-stats → M12 scoreboard-team-labels → M13 player-swap
   → 【M14 輪次計時器（本 change）】 → M15 timed-draw
```

**出處**：2026-09-03 的功能探索（A4 前半）中，
`archive/2026-09-03-matchmaker-rating-engine/design.md` 的 Open Questions 第 1 條已預想過
「計時制」對局形態，但當時判定超出評分引擎的範圍、留待後續 milestone。球聚實務上常見
「一場先搶 11 分、換場地」與「固定時間到就換場」兩種節奏並存，目前的對戰分配機只支援
前者——`prd.md` 6.3.1 的目標分數是唯一的「這一場什麼時候結束」依據，沒有時間到的提示，
主持人只能自己看手錶喊停，喊晚了場地周轉率就下降。

本 change **只做計時器本體**（設定、倒數、時間到提示）；「時間到但平手怎麼判」屬**平局**
規則，留給 **M15（timed-draw）** 處理——這正是本 change 標題「輪次計時器」與 M15 標題
「timed-draw」的分工邊界，兩者常被誤認為同一件事，先在此明確切開。

## 執行相依

本 change 的分支從 `main` 開出（本批 M10～M15 不用 git worktree，直接在主 repo 切分支，
見 environment.md），`main` 上 MUST 已合併 `matchmaker-player-swap`（M13）——這是 M10～M15
序列執行慣例的直接要求（一次一條分支、一個工作目錄，前一棒未合併不得開下一棒）。

**重要澄清**：本文件撰寫時 M10～M13 四個 change **尚未存在**（`main` HEAD 仍停在 M9 archive
之後的 `3fa2d22`），故上一段「M13 完成後會動到哪些檔案」無從查證，本 change 的 proposal／
design／test-plan／tasks 對 `nextjs-pickball/lib/matchmaker/round.ts`、
`hooks/useRoundStore.ts`、`components/matchmaker/RoundControls.tsx`、
`app/matchmaker/page.tsx` 四個既有檔案的引用，**一律以撰寫當下 `main`（`3fa2d22`）的實際
內容為準**（已逐一 `grep`／`Read` 確認存在），**不是**對 M10～M13 完成後版本的推測。
「player-swap」從命名上很可能同樣觸碰 `round.ts`／`useRoundStore.ts`（換人涉及回合內的
場次與名單狀態），但本 change 不對此做任何假設性設計；apply 的 Step 0（tasks 1.2）MUST
在合併後的 `main` 上重新讀取這四個檔案的實際簽章，逐項核對本文件的引用是否仍然成立，
差異一律補記進 `design.md` 的 Open Questions 第 1 條，**SHALL NOT** 依本文件撰寫當下的
假設開工（`design.md` 已預留此節）。

M10（stage-gaps）／M11（player-stats）／M12（scoreboard-team-labels）／M13
（player-swap）四者的實際範圍同樣未知（僅有 milestone 標題可供推測），本 change 不對
它們的產出做任何具體假設，只依「序列執行」的既有慣例要求全部四棒皆已合併，且以 apply
Step 0 的實測結果為唯一準繩。

## What Changes

- **每輪設定新增「計時」**：選項為不計時／10／15／20 分鐘，預設 MUST 為不計時，與對戰方式、
  場地數、目標分數同層放在 `components/matchmaker/RoundControls.tsx`。計時長度於「產生本輪
  對戰」時決定，鎖定條件與目標分數完全相同（該輪任一場次已開始計分，或任一計分板槽離開
  `"setup"`）——SHALL NOT 另立第二個「是否已開始計分」判定，MUST 委派既有的
  `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked`。
- **回合資料模型新增 `timer` 欄位**：`Round.timer` 為 `{ durationMinutes: 10 | 15 | 20;
  startedAt: string | null } | null`，以 `.nullable().default(null)` 定義，向後相容既有
  `matchmaker:round:v1` 資料，SHALL NOT bump storage key。
- **新增純函式 `nextjs-pickball/lib/matchmaker/round-timer.ts`**：`remainingSeconds(timer,
  nowIso)`、`isExpired(timer, nowIso)`、`formatRemaining(seconds)`（mm:ss）。零 I/O，
  「現在時間」一律由呼叫端傳入。
- **回合模組新增兩個狀態轉換入口**（`nextjs-pickball/lib/matchmaker/round.ts`）：
  `setTimerDuration(round, durationMinutes)`（尚未開始計分時可變更，變更會產生全新的
  `timer` 物件、`startedAt` 重置為 `null`）與 `startTimer(round, now)`（本輪已設定計時長度
  且尚未開始時寫入 `startedAt`），兩者皆經 `hooks/useRoundStore.ts` 接線並持久化到
  `matchmaker:round:v1`，重新整理後倒數續跑。
- **新增 `hooks/useRoundTimer.ts`**：每秒 tick 取目前時間並呼叫 `round-timer.ts` 的純函式，
  是本 capability **唯一**呼叫 `setInterval`／`new Date()` 的位置。
- **新增顯示元件 `components/matchmaker/RoundTimerBanner.tsx`**：由
  `app/matchmaker/page.tsx` 掛載，倒數期間顯示 mm:ss（不使用 `aria-live` 逐秒宣讀），
  時間到時顯示大字「時間到」＋帶 `role="alert"` 的繁體中文提示「時間到：領先者勝，平手請
  再打一球」（`nextjs-pickball/lib/matchmaker/labels.ts` 的具名常數）＋播放一段由 Web Audio
  API 產生的短提示音（新增例外層純瀏覽器 API 模組 `lib/matchmaker/round-timer-sound.ts`，
  比照 `scene-canvas.ts` 的既有分層先例；**不加音檔、不加任何 npm 相依**）。同一次到期
  MUST 只播放一次。視覺呈現為**靜態文字、不做任何閃爍或脈動動畫**，以此滿足「尊重
  `prefers-reduced-motion`」——不製造動畫就不需要另外關閉動畫。
- **時間到不自動結束任何場次**：純粹是提示，勝負仍由主持人手動送出比分決定；「重排未完成
  場次」SHALL NOT 重置計時；「產生本輪對戰」（含產生下一輪）MUST 一律產生全新的 `timer`
  （`startedAt` 為 `null`），即使沿用相同的計時長度也重新起算。
- **新增 hook ⇒ `pickleball-guide-page` 的 hooks 歸屬清單新增一行**：`useRoundTimer` →
  `round-lifecycle`（見「Capabilities」節）。

### 明確不做

以下為相鄰 milestone 的工作或已否決的方向，SHALL NOT 順手實作：

- **平局判定與「時間到但平手」的處理規則**：屬 **M15（timed-draw）**。本 change 的時間到
  提示文案雖然提到「平手請再打一球」，那只是**顯示文字**，不涉及任何比分驗證或場次狀態的
  程式邏輯變更——`round.ts` 的比分驗證與完成流程本 change 完全不動。
- **自動結束場次**：時間到不會把任何 `RoundMatch.status` 自動改為 `completed`，也不會鎖住
  比分輸入欄位；`prd.md` 第 15 章已否決「系統代為判定勝負」的方向（人為爭議需要主持人現場
  裁決），本 change 延續同一立場。
  - PRD 第 15 章亦已否決「每場獨立計時」（逐場地各自倒數）——本 change 的計時器是**整輪**
    共用同一個倒數，不是逐場地。
- **每場獨立計時**：本輪所有場地共用同一個倒數，不提供逐場地各自的計時器（`prd.md` 6.3.1
  「同一輪的所有場地共用」的既有精神，計時比照目標分數）。
- **音檔資產**：提示音一律由 Web Audio API 即時產生，不新增任何 `.mp3`／`.wav` 等音檔資產，
  也不引入任何音效相關的 npm 套件。
- **PWA／背景通知**：計時器只在頁面開啟時倒數，不做 Service Worker 通知、不做背景喚醒。
  `prd.md` 12.1 的常態情境是主持人手機開著頁面站在場邊，背景通知不在本版範圍。
- **計時器的暫停／恢復**：只提供「開始計時」，不提供暫停、恢復或延長；需要重新起算時走
  「重設／再排」或「產生新一輪」既有入口。

## Capabilities

### Modified Capabilities

- `round-lifecycle`：MODIFIED「回合資料模型」（新增 `timer` 欄位）；ADDED「回合計時器」
  （計時設定的鎖定與變更、開始計時、倒數與時間到的純函式判定、持久化與重排／新一輪時的
  重置語意）。
- `match-stage`：MODIFIED「本輪設定控制項的預設值與範圍」（新增計時選項的預設值與範圍）；
  ADDED「計時器顯示與時間到提示」（開始計時按鈕、倒數顯示、時間到的視覺與音效提示、
  不自動結束場次的行為保證）。
- `pickleball-guide-page`：MODIFIED「互動行為由三支 hooks 提供且各有 smoke test」——
  hooks 歸屬清單新增一行 `useRoundTimer` → `round-lifecycle`。

> 未列入 Modified 的 capability 與理由：
> - `data-transfer`：`JSON 完整備份的匯出內容` Requirement 對 `currentRound` 只描述為
>   「目前回合；不存在時為 `null`」，未逐欄列舉 `Round` 的欄位，`timer` 欄位隨 `currentRound`
>   整份物件自然一併備份與還原，不需要修改本 capability 的任何 Requirement 或
>   `lib/matchmaker/backup.ts` 的程式碼。
> - `match-allocation`／`match-history`／`player-roster`：本 change 不改動分配邏輯、
>   不寫入歷史紀錄的任何欄位、不觸碰名單資料，三者皆為唯讀消費或完全無關。
> - `scoreboard`：計時鎖定判定重用既有的 `isTargetScoreLocked`（其輸入已含計分板槽
>   `MatchSlots`），本 change 不修改 `lib/scoreboard/**` 的任何檔案，也不新增 `scoreboard`
>   的任何 Requirement。

## Impact

- **新增**：
  - `nextjs-pickball/lib/matchmaker/round-timer.ts`（倒數與時間到的純函式）與
    `round-timer.test.ts`
  - `nextjs-pickball/lib/matchmaker/round-timer-sound.ts`（Web Audio 提示音，**例外層**，
    以 E2E 驗收）
  - `nextjs-pickball/hooks/useRoundTimer.ts`（每秒 tick）與 `useRoundTimer.test.ts`
  - `nextjs-pickball/components/matchmaker/RoundTimerBanner.tsx`（倒數與時間到顯示）與
    `RoundTimerBanner.test.tsx`
  - `nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`
- **修改**：
  - `nextjs-pickball/lib/matchmaker/round-types.ts`（`RoundTimerDurationMinutesSchema`、
    `RoundTimerSchema`、`Round.timer` 欄位、`ROUND_TIMER_DURATION_OPTIONS`）與其測試
  - `nextjs-pickball/lib/matchmaker/round-settings.ts`（`RoundSettings.timerDurationMinutes`、
    `createRoundSettings()` 預設 `null`）與其測試
  - `nextjs-pickball/lib/matchmaker/round.ts`（`CreateRoundInput.timerDurationMinutes`、
    `createRound()` 寫入 `timer`、新增 `setTimerDuration()`／`startTimer()` 兩個入口）與其測試
  - `nextjs-pickball/lib/matchmaker/labels.ts`（新增計時相關文案常數）
  - `nextjs-pickball/hooks/useRoundStore.ts`（新增 `setTimerDuration`／`startTimer` 兩個
    store 動作）與其測試
  - `nextjs-pickball/components/matchmaker/RoundControls.tsx`（新增計時選項的
    radiogroup 與「開始計時」按鈕）與其測試
  - `nextjs-pickball/app/matchmaker/page.tsx`（掛入 `RoundTimerBanner`，把
    `setTimerDuration`／`startTimer` 傳給 `RoundControls`）
  - `openspec/specs/pickleball-guide-page/spec.md` 的 hooks 歸屬清單（`useRoundTimer` →
    `round-lifecycle`）
- **重用（唯讀，不修改）**：`lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked`
  （計時設定的鎖定判定直接沿用，不新增第二個判定函式）
- **無外部相依**：**不新增任何 npm 套件**。提示音走瀏覽器內建 Web Audio API。
- **不動**：`hono-pickball/**`（matchmaker 依 `prd.md` 為 LocalStorage-only 純前端功能）、
  `lib/matchmaker/scoreboard-binding.ts` 的程式碼本體（只讀取其既有匯出）、
  `components/matchmaker/MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx`（計時顯示
  獨立掛載於 `page.tsx`，不進場地卡片）、`app/globals.css`（時間到的視覺呈現為靜態文字，
  不需要新增任何 CSS 規則）、`lib/matchmaker/backup.ts`／`transfer-types.ts`（`data-transfer`
  不受影響）
