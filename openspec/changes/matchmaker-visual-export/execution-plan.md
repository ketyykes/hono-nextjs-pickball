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
3. **相關的 spec.md 片段**：只貼本 task 觸及的那一個 Requirement 及其 Scenario（含「驗收」
   錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本 task 的 Decision 與 Risk 條目。對照表：
   - §2（`export-scene.ts`）→ Decision 2（共用 scene）、Decision 8（找不到球員）、
     Decision 9（不透明白底）與「手繪版面與畫面版面是兩份呈現」的 Risk
   - §3（`export-filename.ts`）→ Decision 6（與 M8 對齊但各自實作，含 UTC 日期的已知取捨）
   - §4（`print-guard.ts`）→ Decision 4（注入式判定、`afterprint` 為何被否決）
   - §5（`ExportActions`）→ Decision 5（disabled 不隱藏）、Decision 7（瀏覽器 I/O 分層）
   - §6（`PrintSheet`）→ Decision 3（列印版為文字為主、不重現色塊）
   - §7（canvas 與頁面組裝）→ Decision 1（選型與四個被否決的替代方案）、Decision 9
     （2 倍縮放、品質 0.92、`document.fonts.ready`）
   - §8（print CSS）→ Decision 3 的 CSS 區塊與 `body:has()` 的收斂理由
5. **明確的「不給你」清單**：其他 task 的內容、其他 capability 的 spec、`prd.md` 全文、
   本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT`
   而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-visual-export`。
   所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path>`；webServer 會自動起前後端。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`（`tsconfig.json` 的 `types` 不含
     `vitest/globals`，省略時 vitest 跑得過但 `tsc --noEmit` 會失敗）。
   - **SHALL NOT 新增任何 npm 相依**（design Decision 1）。需要新套件時一律回報 `BLOCKED`，
     由人類決定，SHALL NOT 自行 `pnpm add`。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

## Roles

### Implementer

- **default_model**: `haiku`
- **rationale**: §2～§6 的多數 task 是「照著 test-plan 寫一個純函式或一段 JSX」，規則已由
  spec 與 design 定死，屬執行而非設計。用最便宜的模型跑最多的量。
- **upgrade_to_sonnet_when**:
  - task 觸及 §7（canvas 繪製與頁面組裝）——那裡要把 scene、canvas API、Blob 下載與 M5 的
    `page.tsx` 接在一起，是本 change 唯一需要跨檔案推理的地方。
  - task 觸及 E2E（`visual-export.spec.ts`）——`waitForEvent("download")` 的時序、
    `emulateMedia` 的作用範圍、`addInitScript` 覆寫 `window.print` 的時機都容易寫出假綠。
  - task 觸及 §8 的 `@media print` CSS——`body:has()`、`!important` 與 Tailwind utility 的
    優先序互動不是照抄就會對。
  - 同一 task 被同一個 reviewer 退回 2 次。
- **upgrade_to_opus_when**:
  - 同一 task 被同一個 reviewer 退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非 task 過大）。
- **self-review checklist**（提交前自己先過一遍）:
  - [ ] 紅燈輸出真的貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到 task 範圍外的檔案；特別是**沒有修改 M5 的任何元件檔**
        （`MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel`）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `lib/` 內的三個純函式模組沒有觸碰 `window`／`document`／`Blob`／`canvas`。
  - [ ] 沒有在匯出路徑寫入任何 LocalStorage 或發出任何網路請求。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂中文
  規格的細微差異（例如「未完成場次 MUST 顯示可判讀狀態」與「留白」都能通過一個寫鬆的斷言），
  haiku 容易放行。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的 task 對不上，
  回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**:
  - [ ] 這個 task 對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] `prd.md` 9.4 的七項內容（App 名稱／回合編號／對戰方式／場地編號／色塊／姓名／
        比分或未完成狀態）在 `ExportScene` 裡一項不缺。
  - [ ] 沒有 scope creep：沒有做 JSON／CSV（M8）、歷史匯出（M7）、場邊計分（M6），
        也沒有加休息名單、QR code 或匯出設定（design Non-Goals）。
  - [ ] 沒有 MODIFY `match-stage`／`site-navbar`／`round-lifecycle` 的任何 requirement，
        也沒有修改 M5 的元件檔。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 品質判斷需要對本 repo 既有慣例的整體感（`lib/matchmaker/` 的純函式線、
  M8 對瀏覽器 I/O 的分層、`PlayerCard` 的漸層寫法、既有錯誤訊息的語氣），這是最需要廣度的
  一環；本 change 又特別容易在「例外層」的邊界上放水。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `lib/matchmaker/`、`components/matchmaker/` 的慣例一致。
  - [ ] 分層沒有被打破：`lib/` 的三個純函式模組零 I/O；canvas 與 `<a download>` 只出現在
        `scene-canvas.ts` 與 `ExportActions.tsx`；`window.print` 只有一個注入點。
  - [ ] 沒有重複邏輯：App 名稱、替代文字、被擋訊息、底色與尺寸常數各只有一份具名來源，
        沒有裸字串或裸數字散在元件裡。
  - [ ] 邊界處理：0 個場地、8 個場地、球員 id 不存在、`scores` 為 `null`、
        `roundNumber` 為 1、姓名極長。
  - [ ] 錯誤訊息為繁體中文且說明可採取的修正方式，不含未轉譯的技術錯誤碼。
  - [ ] 無障礙：圖示按鈕有 `aria-label`、disabled 用屬性而非只調視覺、提示帶 `role="alert"`、
        色彩不是唯一資訊來源。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 `scene-canvas.ts` 的檔頭要寫清楚它為何是
        例外層、`export-filename.ts` 要寫清楚 UTC 日期的已知取捨。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 本 change 有 10 個 task 群、8 個檔案新增與 3 個檔案修改，且橫跨純函式、
  瀏覽器 API、CSS 與 E2E 四種性質；跨 task 的重複與分層破口只有在全部完成後、一次看完整份
  diff 才看得出來。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] 三個純函式模組的命名風格、匯出形狀、JSDoc 密度彼此一致，也與 M2／M8 既有模組一致。
  - [ ] 兩個元件的 props 命名一致（一律 `onXxx`，資料一律走 props 不 import store）。
  - [ ] JPG 與列印版確實共用同一份 `ExportScene`，沒有任何一條路徑自行從 `round` 重組內容
        （`grep` 機械確認 `buildExportScene` 的呼叫點只有 `page.tsx` 一處）。
  - [ ] `git diff --stat` 確認：`package.json` 未變、`hooks/` 零新增、M5 的元件檔零改動。
  - [ ] `@media print` 的規則沒有洩漏到 matchmaker 以外的路由（`body:has()` 的收斂仍在），
        且沒有任何 `print:` utility class 散落在元件裡。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進 M6～M8 的東西。
  - [ ] `nextjs-pickball/CLAUDE.md` 的架構總覽已同步（`/matchmaker` 補記匯出能力）。
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
  - Implementer 回報「canvas 手繪做不出可接受的結果，想改用 `html-to-image` 之類的套件」
    → **立即停止該 task**，升級給人類。這是 design Decision 1 的核心選型，牽動 bundle、
    Workers 部署與整套測試策略，SHALL NOT 由 subagent 自行改變。
  - Implementer 回報「M5 的 `page.tsx` 或 `stage-layout.ts` 與 design 假設不符」→ 依
    design Open Questions 第 1、2 條把實際簽章補記進 design.md 後再繼續；若差異大到需要改
    M5 的元件介面，**升級給人類**，SHALL NOT 自行修改 M5 的檔案。
  - E2E 的 `waitForEvent("download")` 在某個 browser project 上不穩 → 先確認是否為
    WebKit／Mobile Safari 的下載行為差異；SHALL NOT 以 `test.skip` 靜默跳過，
    要跳過 MUST 在 tasks.md 記明是哪個 project、為什麼、以及改用什麼方式驗證。
  - 出現 `Worker "hono-pickball" not found` → 依 environment.md 的注意事項處理殘留 process，
    SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間。`haiku`／`sonnet`／`opus` 是 Claude 的層級
名稱，僅作為範例；在沒有這些層級的環境上，對應到最接近的「快速／均衡／最強」三檔。
