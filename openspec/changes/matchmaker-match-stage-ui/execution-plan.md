## Mode

`subagent-driven`

每個 task 由**全新的 subagent** 執行，逐 task 走 Implementer → Stage 1（規格符合）→ Stage 2
（程式品質）三段流程；全部 task 完成後再跑一次 Final Code Reviewer 檢查跨 task 的一致性。
SHALL NOT 並行派發多個 Implementer——它們共用同一個 worktree，並行必然互相覆寫。

## Per-task contract

subagent **不繼承主對話的任何 context**。每次派工時，下列項目 MUST 逐字貼進 prompt，
SHALL NOT 只給檔案路徑要對方自己去讀（`schema.yaml` 的 Forbidden 明文禁止讓 subagent 直接讀
計畫檔）：

1. **tasks.md 的完整 task 文字**：RED + GREEN 配對（REFACTOR task 則貼該項全文）。
2. **test-plan.md 的對應表格列**：Test name / Scenario / Assertion / Why first / Tier 五欄，
   一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：只貼本 task 觸及的那一個 capability 的那一個 Requirement 及其
   Scenario（含「驗收」錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本 task 的 Decision 與 Risk 條目。例如 §4 的 task 必須拿到
   Decision 4（雙打上下排配置），§7 的 task 必須拿到 Decision 5（目標分數鎖定）與 Decision 6
   （重用 `nextRadioIndex`）。
5. **明確的「不給你」清單**：其他 task 的內容、其他 capability 的 spec、prd.md 全文、
   本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT`
   而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-match-stage-ui`。
   所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path>`；webServer 會自動起前後端。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`（`tsconfig.json` 的 `types` 不含 `vitest/globals`，
     省略時 vitest 跑得過但 `tsc --noEmit` 會失敗）。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

## Roles

### Implementer

- **default_model**: `haiku`
- **rationale**: 本 change 的多數 task 是「照著 test-plan 寫一個純函式或一段 JSX」，
  規則已由 spec 與 design 定死，屬執行而非設計。用最便宜的模型跑最多的量。
- **upgrade_to_sonnet_when**:
  - task 觸及 §11（頁面組裝）——那裡要把八個元件、五個純函式與 M4 的介面接在一起，
    是本 change 唯一需要跨檔案推理的地方。
  - task 觸及 E2E（`match-stage.spec.ts`、`navbar-rwd.spec.ts`）——Playwright 的等待語意、
    五個 browser project 的差異、boundingBox 量測都容易寫出假綠。
  - 同一 task 被同一個 reviewer 退回 2 次。
- **upgrade_to_opus_when**:
  - 同一 task 被同一個 reviewer 退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非 task 過大）。
- **self-review checklist**（提交前自己先過一遍）:
  - [ ] 紅燈輸出真的貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，不是打錯字。
  - [ ] `it` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到 task 範圍外的檔案；特別是沒有新增任何 `hooks/` 檔案（design Decision 3）。
  - [ ] 沒有在 UI 層重新實作分配、評分或比分驗證（那些屬 M2／M3／M4）。
  - [ ] 常數取自既有匯出（`DEFAULT_FORMAT` 等），沒有新寫字面量。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂
  中文規格的細微差異（例如「上排兩格為第一隊」與「對角同隊」都滿足 2x2），haiku 容易放行。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的 task 對不上，
  回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**:
  - [ ] 這個 task 對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] 沒有 scope creep：沒有實作 M6～M9 的東西（場邊計分入口、歷史頁、匯出、JPG／PDF）。
  - [ ] 沒有把屬於 M4 的責任搬進 UI（比分驗證規則、評分計算、歷史寫入）。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 品質判斷需要對本 repo 既有慣例的整體感（`PlayerCard` 的 inline style 理由、
  `pickTextColor` 的對比取捨、scoreboard 的 radiogroup 寫法），這是最需要廣度的一環。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `components/matchmaker/`、`lib/matchmaker/` 的慣例一致。
  - [ ] 沒有重複邏輯：漸層字串、觸界判定、場地數夾值各只有一份。
  - [ ] 邊界處理：空名單、全員暫停、8 場地、非 4 的倍數人數、`rating` 恰為 1.00／8.00。
  - [ ] 錯誤訊息為繁體中文且說明可採取的修正方式，不含未轉譯的技術錯誤碼。
  - [ ] 無障礙：圖示按鈕有 `aria-label`、disabled 用屬性而非只調視覺、色彩不是唯一資訊來源。
  - [ ] 註解說明「為什麼」而非「做什麼」，符合本 repo 既有註解密度。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 本 change 有 12 個 task 群、16 個新檔（2 個路由入口、8 個元件、5 個純函式模組、
  1 份 E2E spec）加上各自的測試檔，跨 task 的重複與不一致只有在全部完成後、
  一次看完整份 diff 才看得出來。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] 五個純函式模組的命名風格、匯出形狀、JSDoc 密度彼此一致。
  - [ ] 八個元件的 props 命名一致（例如一律 `onXxx` 而非混用 `handleXxx`）。
  - [ ] 沒有兩個 task 各自造了一份等價的 helper（例如兩處各自格式化 `rating.toFixed(2)`）。
  - [ ] 對 M4 的依賴確實只出現在 `app/matchmaker/page.tsx`（design Decision 9），
        用 `grep` 機械確認，不靠印象。
  - [ ] `hooks/` 目錄確實沒有新增檔案（`git diff --stat` 機械確認，design Decision 3）。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進 M6～M9 的東西。
  - [ ] `nextjs-pickball/CLAUDE.md` 的架構總覽已同步（新增 `/matchmaker`、移除「已完成但尚未
        接 UI」的敘述）。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`haiku` → `sonnet` → `opus`）
  後重新派工。SHALL NOT 用同一個模型在同樣條件下重試——那只會得到同樣的結果。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表規格本身
  有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由 reviewer
  自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「M4 的匯出與 design 假設不符」→ **立即停止該 task**，升級給人類。
    這是 design Open Questions 第 2 條，屬跨 change 契約問題，SHALL NOT 由 subagent 自行
    發明一個介面往下做。
  - 評分界限常數（1.00／8.00）**不是待決問題**：design Open Questions 第 1 條已記錄定案結果——
    `RATING_MIN`／`RATING_MAX`，由 `nextjs-pickball/lib/matchmaker/rating-types.ts` 匯出。
    Implementer 回報「找不到該匯出」時，**先自行在 `main` 上以 `grep -rn "RATING_MAX"
    nextjs-pickball/lib/matchmaker/` 確認實際路徑**（M3 可能把常數改由 `rating.ts` 轉出），
    找到就直接調整 import 往下做，**不升級**。**僅在 `main` 上完全找不到該匯出時才升級給人類**
    ——那代表 M3 的實作與其已定案的規格不符，由 M3 補匯出。任何情況都 SHALL NOT 在
    `rating-bounds.ts` 內寫死 `1` 與 `8`。
  - 390px 下 navbar 換行的紅燈 → 依 design Decision 7 的退路（縮短連結文案），
    SHALL NOT 自行改為漢堡選單；若縮短後仍換行，升級給人類。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間。`haiku`／`sonnet`／`opus` 是 Claude 的層級
名稱，僅作為範例；在沒有這些層級的環境上，對應到最接近的「快速／均衡／最強」三檔。
