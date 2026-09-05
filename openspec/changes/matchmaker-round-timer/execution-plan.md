# Execution Plan: matchmaker-round-timer

## Mode

`subagent-driven`

派工單位是 tasks.md 的 `§` 群組（章節）：**一個群組派一個全新的 Implementer subagent**，
由它一次做完該組所有 task。組內仍**逐 task 依序**走 TDD 三步——每個 task 先寫失敗測試並在
shell 實際看到紅燈，再最小實作至綠，再 refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實
標註為 regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查為**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2
（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code
Reviewer 檢查跨群組的一致性。群組之間**嚴格序列**——SHALL NOT 並行派發多個 Implementer，
它們共用同一個主 repo 工作目錄與同一條分支（本批不用 git worktree，見 environment.md），
並行必然互相覆寫（沿用 M4 起確立、M6～M13 延用的「逐組」制）。

## Per-task contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀（`schema.yaml` 的 Forbidden 明文禁止
讓 subagent 直接讀計畫檔）：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN 配對全文
   （REFACTOR task 則貼該項全文），依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first /
   Tier 五欄，一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含
   「驗收」錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §2（`round-types.ts`）→ Decision 1（比照目標分數的四層模式）
   - §3（`round-settings.ts`）→ Decision 1
   - §4（`round.ts`：`createRound`／`setTimerDuration`／`startTimer`）→ Decision 1、
     Decision 3（變更長度必重置 startedAt）、Decision 4（createRound 逐欄列舉 vs
     resetIncompleteMatches 物件展開）
   - §5（`round-timer.ts`）→ Decision 5（型別簽章不接受 matches，物理上無法自動結束場次）
   - §6（`round-timer-sound.ts`）→ Decision 6（例外層分層理由）
   - §7（`useRoundTimer.ts`）→ Decision 5、Decision 6（與 6 的分工邊界）
   - §8（`pickleball-guide-page` hooks 清單同步）→ 無獨立 Decision，純粹是既有守衛測試的
     機械修復（§7 新增檔案後既有 `hooksInventory.test.ts` 會真的轉紅）
   - §9（`useRoundStore.ts` 接線）→ Decision 1（比照 setTargetScore 的接線形態）
   - §10（`RoundControls.tsx`）→ Decision 2（重用 `isTargetScoreLocked` 但不重用其
     `reason`）、Decision 3
   - §11（`RoundTimerBanner.tsx`）→ Decision 5、Decision 6、Decision 7（靜態文字不加動畫）
   - §12（`page.tsx` 掛載 + E2E）→ Decision 8（獨立掛載，不進 M5 元件檔）、Risks 的
     `page.clock` 相容性殘留風險
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md`
   全文、本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報
   `NEEDS_CONTEXT` 而不是自行去翻。
6. **工作路徑**（見 environment.md；本批不用 git worktree，值為主 repo 絕對路徑）：
   `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/matchmaker-round-timer`。
   所有 subagent 共用**同一個**主 repo 工作目錄與同一條分支，SHALL NOT 自行
   `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在
     shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path> --workers=1`；webServer
     會自動起前後端。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／
     `expect`／`vi` MUST 顯式 `import ... from "vitest"`。
   - **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定，
     SHALL NOT 自行 `pnpm add`。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression
     guard**，SHALL NOT 用「改斷言看紅再改回」偽造紅燈。
   - **每次交件前 MUST 自己先跑一輪 mutation 測試**，列出「做了幾次、每次改什麼、是否
     轉紅」，有任何一次存活就先補斷言再交件（見「累積下來的派工經驗」第 0 條）。
   - **Bash 指令禁止 `cd`，一律絕對路徑**（auto mode 遇到 `cd` 後接相對路徑會跳權限
     提示，會打斷派工節奏）。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：`nextjs-pickball/CLAUDE.md` 與 root `CLAUDE.md` 未對 execution-plan 的
  預設模型另作規定，但 `matchmaker-runbook.md`「模型規定（使用者硬性要求）」已為 M4～M13
  全系列訂為**常設覆寫**：Implementer 一律用 `sonnet`，不用計畫預設的 `haiku`——理由是
  M4 §1 的 haiku 曾連續兩輪被退回（失效的假測試、複述式註解），每次退回要多付一次 opus
  審查成本，換算下來反而更貴。本 change 直接把這條硬性規定寫進 `default_model`，不再
  另留 `haiku` 起點與升級路徑，避免每次派工都要記得手動覆寫。
- **upgrade_to_opus_when**:
  - 同一群組被同一 reviewer 連續退回 3 次（見 Escalation）。
  - 群組觸及 §10（`RoundControls.tsx`：新增計時 radiogroup 並重用既有 `isTargetScoreLocked`
    的 `locked` 但不重用其 `reason`）——這是本 change 唯一需要精確複製既有元件的鎖定
    委派模式、同時刻意不完全複製其顯示邏輯的地方，容易寫錯成「連 reason 一起搬過來」。
  - 群組觸及 §12（`page.tsx` 掛載 + E2E）——`page.clock` 快轉與 `addInitScript` stub
    `AudioContext` 是本 repo第一次使用，時序容易寫出假綠（見 design Open Questions 2）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非群組過大）。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式／檔案
        不存在」，不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是 **§10／§12 沒有修改
        `MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx`**（design Decision 8）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `round-timer.ts` 內零 `window`／`document`／`AudioContext`／`setInterval`／
        `new Date()`／`Date.now()`。
  - [ ] `round-timer-sound.ts` 之外，本 change 沒有第二個地方呼叫 `AudioContext`；
        `useRoundTimer.ts` 之外，本 change 沒有第二個地方呼叫 `setInterval`。
  - [ ] 自跑一輪 mutation 並列出「幾次／改什麼／是否轉紅」，存活先補斷言再交件。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂
  中文規格的細微差異（例如「不顯示」與「顯示但 disabled」的差別，本 change 兩者都有出現
  在不同 Scenario 裡，容易被寫鬆的斷言矇混過去）。
- **required first action**：覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組
  對不上，回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過
        的斷言。
  - [ ] 沒有 scope creep：沒有做平局判定（M15）、沒有做暫停／恢復／延長、沒有加音檔
        資產或第三方音效套件、沒有做每場獨立計時（design Non-Goals）。
  - [ ] 沒有 MODIFY `round-lifecycle`／`match-stage`／`pickleball-guide-page` 以外的
        任何 capability，也沒有新增或修改 `scoreboard-binding.ts` 的程式碼（唯讀重用）。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**：評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：品質判斷需要對本 repo 既有慣例的整體感（`round.ts` 既有函式的失敗代碼
  結構、`RoundControls.tsx` 目標分數選擇器的鎖定委派模式、`labels.ts` 的文案集中慣例），
  本 change 又特別容易在「重用既有函式但不重用其全部回傳值」的邊界上放水（design
  Decision 2）。
- **required first action**：同 Stage 1，先覆述收到的片段標題；對不上就回報
  `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `lib/matchmaker/`、`hooks/`、`components/matchmaker/` 的慣例一致
        （尤其 `setTimerDuration`／`startTimer` 與 `setTargetScore` 的失敗代碼結構、
        訊息常數命名是否對稱）。
  - [ ] 分層沒有被打破：`round-timer.ts` 零 I/O；`setInterval`／`new Date()` 只出現在
        `useRoundTimer.ts`；`AudioContext` 只出現在 `round-timer-sound.ts`。
  - [ ] 沒有重複邏輯：計時文案、鎖定原因、幾何常數各只有一份具名來源；`RoundControls.tsx`
        沒有重新推導一次「是否已開始計分」（必須委派 `isTargetScoreLocked`）。
  - [ ] 邊界處理：`timer` 為 `null`、`durationMinutes` 三種值、`startedAt` 為 `null`／
        非 `null`、剩餘秒數恰為 0、超過設定長度後不為負。
  - [ ] 錯誤訊息為繁體中文且說明可採取的修正方式，不含未轉譯的技術錯誤碼。
  - [ ] 無障礙：計時控制項與開始計時按鈕有可存取名稱、`disabled` 用屬性表達、時間到提示
        帶 `role="alert"`、視覺呈現無任何動畫（design Decision 7）。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 `round-timer-sound.ts` 的檔頭要寫清楚它
        為何是例外層、`round.ts` 的 `setTimerDuration` 要寫清楚「變更長度必重置
        startedAt」的取捨（design Decision 3）。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**：重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：本 change 有 13 個 task 群、4 個檔案新增與 6 個檔案修改，橫跨純函式、
  hook、瀏覽器 API、元件與 E2E 五種性質；跨 task 的重複與分層破口只有在全部完成後、
  一次看完整份 diff 才看得出來。
- **when**：所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] `round-timer.ts`／`round-timer-sound.ts` 的命名風格、匯出形狀、JSDoc 密度與
        `round.ts`／既有 `lib/matchmaker/` 模組一致。
  - [ ] `RoundTimerBanner` 的 props 命名與 `ExportActions`／`PrintSheet`（M9 既有先例）
        一致（資料一律走 props、不 import store）。
  - [ ] `grep` 機械確認：`setInterval`／`new Date()` 只出現在 `useRoundTimer.ts`；
        `AudioContext` 只出現在 `round-timer-sound.ts`；`isTargetScoreLocked` 的呼叫點
        增加了 `RoundControls.tsx` 的計時區塊，但沒有出現第二個結構相同的鎖定判定函式。
  - [ ] `git diff --stat` 確認：`package.json` 未變、`app/globals.css` 未變、
        `MatchStage.tsx`／`CourtCard.tsx`／`RestingPanel.tsx`／`scoreboard-binding.ts`
        零改動。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進平局判定或其他
        milestone 的東西。
  - [ ] `pickleball-guide-page` 的 hooks 歸屬清單確實加入 `useRoundTimer` →
        `round-lifecycle`，`hooksInventory.test.ts` 兩條既有測試皆綠。
- **SHALL NOT**：重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`sonnet` →
  `opus`）後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表
  規格本身有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由
  reviewer 自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「`main` 上 M13 的 `round.ts`／`useRoundStore.ts`／`page.tsx` 與
    design 假設不符」→ 依 design Open Questions 第 1 條把實際簽章補記進 design.md 後
    再繼續；若差異大到需要改動 M13 已合併的介面本身，**升級給人類**，SHALL NOT 自行
    修改那些檔案在 M13 範圍內的既有行為。
  - `page.clock` 無法正確驅動 `useRoundTimer.ts` 的 `setInterval` tick（design Open
    Questions 2）→ **立即停止 §12**，升級給人類決定替代驗證方式，SHALL NOT 為了讓測試
    通過而放寬 `round-timer.ts` 的時間注入紀律（不得改回內部呼叫 `new Date()`）。
  - `AudioContext` 建構次數的 E2E 斷言在某個 browser project 上不穩 → SHALL NOT 以
    `test.skip` 靜默跳過，要跳過 MUST 在 tasks.md 記明是哪個 project、為什麼、以及
    改用什麼方式驗證（比照 `execution-plan` 對 M9 下載事件不穩時的既有處置原則）。
  - Implementer 回報「`isTargetScoreLocked` 的既有 `reason` 其實也適用於計時控制項，
    想直接重用」→ **停止該群組**，升級給人類——design Decision 2 已明確否決重用該
    `reason`（文字提及「目標分數」語意不通），這是需要人類確認而非 subagent 自行改變
    的設計決策。
  - 出現 `Worker "hono-pickball" not found` → 依 environment.md 的注意事項處理殘留
    process，SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間。`sonnet`／`opus` 是 Claude 的層級名稱，
僅作為範例；在沒有這些層級的環境上，對應到最接近的「均衡／最強」兩檔。
