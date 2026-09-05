## Mode

`subagent-driven`

派工單位採「逐組制」（沿用 M4 起的既定做法，見 `matchmaker-runbook.md`「執行模式（兩制並存）」）：
tasks.md 的每個 `§` 群組派一個全新的 Implementer subagent，由它一次做完該組所有 task。組內
仍**逐 task 依序**走 TDD 三步——每個 task 先寫失敗測試並在 shell 實際看到紅燈（貼出輸出），
再最小實作至綠，再 refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實標註為 regression guard，
SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查採**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2
（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code
Reviewer 檢查跨群組的一致性。

群組之間**嚴格序列**。SHALL NOT 並行派發多個 Implementer——它們共用主 repo 的同一個分支，並行
必然互相覆寫。

## Per-task contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN 配對全文
   （REFACTOR task 則貼該項全文），依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first / Tier
   五欄，一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含「驗收」
   錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §2（schema／reducer 擴充）→ Decision 6（`TeamPlayersSchema` 形狀）、Migration Plan
     （向後相容策略）
   - §3（`scoreboard-binding.ts` 擴充與 `CourtCard.tsx` 接線）→ Decision 1（前景色預先算好）、
     Decision 2（快照語意）、Decision 3（替代文字）、Decision 4（`players` 必填）
   - §4（`TeamPanel.tsx` 渲染與 E2E）→ Decision 5（顯示位置、零捲動再驗證）、Risks 的
     「加入球員姓名色塊可能壓縮既有零捲動安全餘量」與「姓名沒有長度上限」兩條
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、
   本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT`
   而不是自行去翻。
6. **工作路徑（主 repo）與分支名**（取自 environment.md）：
   `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支
   `change/matchmaker-scoreboard-team-labels`。所有 subagent 共用**同一個**分支，SHALL NOT
   自行切換分支、SHALL NOT `git worktree add`、SHALL NOT `git merge`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在
     shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path> --workers=1`；webServer 會自動
     起前後端。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`（`tsconfig.json` 的 `types` 不含
     `vitest/globals`，省略時 vitest 跑得過但 `tsc --noEmit` 會失敗）。
   - **SHALL NOT 新增任何 npm 相依**（proposal Impact）。需要新套件時一律回報 `BLOCKED`，
     由人類決定，SHALL NOT 自行 `pnpm add`。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。
8. **派工單必帶的九項紀律**（來自 `matchmaker-runbook.md` 累積的派工經驗，逐條寫進派工單，
   不得省略）：
   a. **Implementer 交件前 MUST 自己先跑一輪 mutation 測試**，並在回報中列出「做了幾次、
      每次改什麼、是否轉紅」；有任何一次存活就先補斷言再交件。
   b. **Stage 2 Reviewer MUST 獨立再做一次 mutation**（不採信 Implementer 的自述）、
      **逐分支逐欄位機械盤點覆蓋率**（不只是加強既有斷言），並檢查是否存在恆真斷言
      （例如 `toEqual` 兩邊實際上是同一物件參考）。回報存活數，**不採信 Implementer 自述**。
   c. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗**，不憑信任放行；查核不過的
      一律改標為 regression guard 並補 mutation 驗證。
   d. **逐 task commit**：`test:` 一個、`feat:` 一個；不要一組一個 commit——每次紅燈才能
      獨立留在版控裡，供之後用 `git show <commit>^:<path>` 直接複驗。
   e. **註解只寫「為什麼」**，不重述函式名、不誤植 milestone 編號（本 change 為 M12）。
   f. **編輯器診斷不可信**，一律以 `pnpm -r exec tsc --noEmit` 的 exit code 為準；
      唯一可信的例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，是真的。
   g. **跑 E2E／preview 前先 `lsof -i :3005 -i :8787` 並且
      `ps aux | grep -E "next-server|wrangler|workerd|playwright"`** 交叉核對殘留 process
      並全數 kill；跑完立刻清掉自己起的 process。E2E 一律帶 `--workers=1`。
   h. **派出 subagent 之後不可結束回合**；脈絡將盡就在派工**之前**乾淨停止、把狀態寫進
      design.md 的 `## Open Questions` 並 commit 後回報。
   i. **授權 Stage 2 直接修小東西**（dead export、補斷言），但要在回報的「偏離」欄如實記載。
   j. **Bash 指令裡禁止 `cd`，一律絕對路徑**（auto mode 遇到 `cd` 後接相對路徑會跳權限提示，
      見 environment.md 注意事項）。

commit 訊息一律 Conventional Commits、繁體中文，footer 一行 `Claude-Session: <該次 apply
session 的 id>`（不得編造 URL），不得加 `Generated`／`Co-Authored-By`。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：這是使用者硬性規定，不用 execution-plan schema 預設的 `haiku`。理由見
  `matchmaker-runbook.md`「累積下來的派工經驗」第 4 條——M4 §1 的 haiku 連續兩輪被退回
  （失效的假測試、複述式註解），每次退回要付一次 opus 審查成本，反而更貴。
- **upgrade_to_opus_when**:
  - 同一群組被同一 reviewer 連續退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非群組過大）。
  - §3（`scoreboard-binding.ts`）觸及單向相依的邊界判斷（Decision 1／3）時，若 Implementer
    對「為何不能 import `lib/matchmaker/`」的理由回報不一致，先確認是否已收到完整的 design
    片段，仍不一致才升級。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）：
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，
        不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是 §3 **沒有**讓 `lib/scoreboard/` 出現任何
        `import ... from "@/lib/matchmaker/..."`（或相對路徑等價寫法）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。
  - [ ] 已依上方第 8 項 a 執行過一輪 mutation 自測並列出結果。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷，但要能讀懂中文
  規格的細微差異。
- **required first action**：覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組對不上，
  回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）：
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] 沒有 scope creep：沒有做跨分頁同步、沒有改 `firstServer` 決定方式、沒有改計分規則
        ／Undo 還原邏輯／專注模式的觸發條件、沒有回溯補上舊分槽資料（design Non-Goals）。
  - [ ] 沒有 MODIFY 本 change 未列出的既有 Requirement，也沒有修改
        `components/matchmaker/CourtCard.tsx` 色塊本身的姓名／顏色呈現邏輯。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**：評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：品質判斷需要對本 repo 既有慣例的整體感（`lib/scoreboard/` 與
  `lib/matchmaker/` 的分層界線、既有 `matchId`／`courtNumber` 的向後相容寫法、
  `export-scene.ts` 對「找不到球員」的既有判斷），這是最需要廣度的一環；本 change 又特別容易
  在單向相依的邊界上放水。
- **required first action**：同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] **單向相依機械確認**：`grep -rn "lib/matchmaker" nextjs-pickball/lib/scoreboard/` 與
        `grep -rn "lib/matchmaker" nextjs-pickball/components/scoreboard/` 皆為空（design
        Decision 1、Context）。
  - [ ] 前景色只在 `buildMatchSlotSeed`（或其呼叫的私有函式）算一次，`TeamPanel.tsx` 內沒有
        任何亮度／對比計算邏輯。
  - [ ] 命名與既有 `lib/scoreboard/`、`lib/matchmaker/scoreboard-binding.ts` 的慣例一致
        （如 `us`／`them` 的隊伍索引語彙、`PascalCase` 型別、`camelCase` 函式）。
  - [ ] 替代文字與中性色的具名常數只在 `scoreboard-binding.ts` 內宣告一份，沒有裸字串散在
        別處；且**沒有** import `lib/matchmaker/export-scene.ts` 的任何符號（design
        Decision 3：各自實作，不跨 capability import）。
  - [ ] 邊界處理：單打（1 人）、雙打（2 人）、名單中找不到球員（含兩隊都找不到、只有一隊找
        不到）、姓名極長、`teamPlayers` 為 `null`（獨立模式與舊分槽）。
  - [ ] `TeamPanel.tsx` 的既有名稱行結構沒有被破壞：`teamPlayers` 為 `null` 時渲染結果與
        本 change 之前逐字相同（可用 `git diff` 確認該路徑的 JSX 分支未被改動）。
  - [ ] 無障礙：姓名色塊 MUST 顯示姓名文字而非只有色塊，截斷（`truncate`）不影響 DOM 內的
        完整文字內容。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 `scoreboard-binding.ts` 的替代文字邏輯要寫清楚
        為何與 `visual-export` 的判斷同構但不共用程式碼。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**：重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：本 change 橫跨兩個 capability、三個既有模組與一個既有元件，跨 task 的重複與
  單向相依破口只有在全部完成後、一次看完整份 diff 才看得出來。
- **when**：所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）：
  - [ ] `grep -rn "lib/matchmaker" nextjs-pickball/lib/scoreboard/ nextjs-pickball/components/scoreboard/`
        全程為空（跨群組再次機械確認單向相依）。
  - [ ] `git diff --stat` 確認：`package.json` 未變、`hooks/` 零新增、
        `components/matchmaker/CourtCard.tsx` 只有 `buildMatchSlotSeed` 呼叫處補參數，
        該檔其餘部分（色塊姓名／顏色呈現邏輯）零改動。
  - [ ] `teamPlayers` 的欄位形狀（`PlayerBadgeSchema`／`TeamPlayersSchema`）在
        `lib/scoreboard/types.ts` 只定義一次，沒有第二份重複定義散落在別處。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進 M11 或 M13 的東西。
  - [ ] `pnpm test`、`pnpm -r exec tsc --noEmit`、`pnpm --filter ./nextjs-pickball lint` 於
        最終狀態下全數通過。
- **SHALL NOT**：重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型
  （`sonnet` → `opus`）後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試——那只會得到
  同樣的結果。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表規格本身
  有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由 reviewer
  自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「§3 需要 import `lib/matchmaker/` 才能算出前景色」→ **立即停止該群組**，
    升級給人類。單向相依是 design Decision 1 的核心結論，SHALL NOT 由 subagent 自行放寬。
  - Implementer 回報「M11（`matchmaker-player-stats`）合併後的 `main` 上，`Player`、
    `RoundTeam`、`CourtCard` 的 props 與 design.md 假設不符」→ 依 design Open Questions
    第 1 條，先把實際簽章補記進 design.md 後再繼續；若差異大到需要改動 `match-stage` 既有
    元件介面，**升級給人類**。
  - 加入球員姓名色塊後，零捲動 E2E 在某個 viewport 下失敗 → 先確認是否為姓名色塊本身的
    padding／字級需要調整（design Decision 5 已預留此為 Stage 1／2 審查範圍），
    SHALL NOT 為了讓測試過而放寬既有的零捲動或安全餘量門檻本身。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間，但 Implementer 一律 `sonnet`
（見上方 Roles 的使用者硬性規定）。`sonnet`／`opus` 是 Claude 的層級名稱，僅作為範例；在沒有
這些層級的環境上，對應到最接近的「均衡／最強」兩檔。
