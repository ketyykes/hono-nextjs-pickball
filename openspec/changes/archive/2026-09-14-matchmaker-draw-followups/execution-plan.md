## Mode

`group-driven`

派工單位是 tasks.md 的 `§` 群組（章節）：**一個群組派一個全新的 subagent**，由它一次做完
該組所有 task。組內仍**逐 task 依序**走 TDD 三步——每個 task 先寫失敗測試並在 shell 實際
看到紅燈，再最小實作至綠，再 refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實標註為
regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查改為**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2
（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code
Reviewer 檢查跨群組的一致性。

群組之間**仍嚴格序列**。SHALL NOT 並行派發多個 Implementer——它們共用同一個工作樹，
並行必然互相覆寫。

> 出處：自 M4（`matchmaker-round-lifecycle`）起本 repo 一律採「逐組」制以加速；
> `matchmaker-runbook-m10-m15.md` 與各已 archive change 的 `execution-plan.md` 皆為此制的
> 既有先例，本 change 沿用不重新討論。

> **本 change 的規模例外**：實作群組只有三組（§2／§3／§4），每組各一個實作檔。
> §4 與 §2／§3 分屬不同 capability、不同缺陷，**可以合併成一次派工**以節省一輪審查成本——
> 但合併時 MUST 把兩份 spec 片段都貼齊，且 Stage 1 MUST 分別確認兩個 capability 的
> Scenario。若採合併，tasks.md 的群組編號與勾選粒度不變。

## Per-group contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN 配對全文
   （REFACTOR task 則貼該項全文），依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first / Tier
   五欄，一字不改，**含本檔開頭的 ⚠️「加入即綠」提醒**。Tier 決定測試放哪一層與用哪個指令跑。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含「驗收」
   錨點），來自 `openspec/changes/matchmaker-draw-followups/specs/<capability>/spec.md`。
   SHALL NOT 貼整份主 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §1（前置確認）→ Context 四項證據全文（本組的工作就是把這四項在 `main` 上重新核對）
   - §2（`player-stats.ts` 的和局計數）→ Decision 1（新增 `draws`、和局仍計入出場數）、
     Decision 2（勝率公式不變）、Risks「`draws` 是新必填欄位」
   - §3（`PlayerStatsTable` 的勝負和欄）→ Decision 3（不新增第十欄）、Decision 4（三個數字
     恆常顯示）、Decision 6（E2E 子字串比對無法承擔改名的證明責任）、
     Risks「390px 溢出」與「既有 E2E 的子字串比對會遮蔽退化」
   - §4（到期提示文案）→ Decision 5（只換字串值的三項約束：保留「時間到：」前綴、
     SHALL NOT 以 `DRAW_LABEL` 拼接、第二子句維持指示句）、Decision 6（既有斷言 import
     常數本身，是恆真斷言）、Risks「文案斷言用語意片段」
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、
   `matchmaker-runbook-m10-m15.md`、本 change 以外的 openspec 檔案。若 subagent 認為缺
   context，MUST 回報 `NEEDS_CONTEXT` 而不是自行去翻。
6. **工作樹絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/nextjs-pickball`。**本批不使用 git worktree**，
   所有 subagent 共用主 repo 的 `change/matchmaker-draw-followups` 分支，
   SHALL NOT `git worktree add`、SHALL NOT 切換分支、SHALL NOT `git merge`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在
     shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 MUST 為
     `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 <files...>`，
     **SHALL NOT** 用 `pnpm --filter ./nextjs-pickball test:e2e -- --workers=1`——後者在
     帶檔案參數時會靜默吞掉 `--workers=1`，不帶參數時則回報 "No tests found"
     （`matchmaker-runbook-m10-m15.md` 教訓 #20）。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文；註解只寫「為什麼」，不重述函式名。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`。
   - **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定，
     SHALL NOT 自行 `pnpm add`。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

### 派工單必帶（來自 `matchmaker-runbook-m10-m15.md` 累積下來的派工經驗，逐條寫入每張派工單）

a. **Implementer 交件前 MUST 自跑一輪 mutation 測試**，回報「幾次／改了什麼／是否轉紅」；
   有任何一次存活先自行補斷言再交件，不留給 Stage 2 才發現。
b. **Stage 2 Reviewer MUST 獨立再做一次 mutation**（不採信 Implementer 自述）、
   **逐分支逐欄位機械盤點覆蓋率**（不是只加強既有斷言），並檢查是否有**恆真斷言**
   ——本 change 特別要查這一項：`RoundTimerBanner.test.tsx` 既有的
   `getByText(ROUND_TIMER_EXPIRED_MESSAGE)` 就是一個現成的恆真斷言範例（design Context
   證據四），reviewer MUST 確認新增的測試沒有重蹈覆轍。
c. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗**，不採信「我有看到紅燈」的口頭
   回報；查核不過（例如實作在更早的 commit 就已提交）改標為 regression guard 並補 mutation
   驗證。
d. **逐 task commit**：`test:` 一個、`feat:`／`fix:` 一個，不要一組一個大 commit——每次紅燈
   都要獨立留在版控裡，讓 coordinator 能用 (c) 的方式直接複驗。
e. **註解只寫「為什麼」**，不重述函式名、不誤植 milestone 編號——**本 change 不是 M16，
   它是 M15 的收尾修正**，註解內若要標示出處請寫 `matchmaker-draw-followups`，
   SHALL NOT 自行編一個 M 編號。
f. **編輯器／IDE 診斷不可信**，常整批謊報 `Cannot find module` 之類的錯誤。一律以實跑
   `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import
   解不到」——那是 TDD 紅燈，是真的。
g. **跑 E2E／preview 前先 `lsof -i :3005 -i :8787` 並且
   `ps aux | grep -E "next-server|wrangler|workerd|playwright"`** 交叉核對殘留 process，
   **以完整 repo 路徑過濾後逐一 `kill <PID>`**，SHALL NOT 用無差別的 `pkill -f`
   （曾誤殺其他專案的 Playwright）。確認 port 釋放後才起單一組，跑完**立刻清掉自己起的
   process**。E2E 一律帶 `--workers=1`。§3 是本 change 唯一需要起前後端 server 的群組。
h. **派出 subagent 之後不可以結束回合**；脈絡將盡就在派工**之前**乾淨停止，把狀態寫進
   `design.md` 的 `## Open Questions` 並 commit 後回報。
i. **授權 Stage 2 直接修小東西**（dead export、補斷言之類），但要在回報的「偏離」欄如實記載，
   SHALL NOT 悄悄改動後不留痕跡。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：**不使用 execution-plan schema 預設的 `haiku`，直接指定 `sonnet`**。這是
  使用者的硬性規定（`matchmaker-runbook-m10-m15.md` 的派工經驗第 4 條）：M4 §1 曾用 `haiku`
  派工，連續兩輪被 Stage 2 退回（失效的假測試、複述式註解），每次退回都要多付一次 opus
  審查成本。本 change 額外的理由是：三個群組都涉及「**判斷既有測試是不是恆真斷言**」這種
  後設推理（design Decision 6），不是照抄骨架的機械工作。
- **upgrade_to_opus_when**:
  - 同一群組被同一個 reviewer 連續退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非群組過大）。
  - §2 的 `draws` 欄位擴增在 `tsc --noEmit` 點出超過 5 個需要跟進的建構點——代表實際牽動面
    大於 design Risks 的預估，需要更強的模型一次看完。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，
        不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案。特別是：§2 **沒有**改 `PlayerStatsTable.tsx`，
        §3 **沒有**改 `player-stats.ts` 的計算邏輯，§4 **沒有**改 `RoundTimerBanner.tsx`。
  - [ ] `wins + losses + draws === gamesPlayed` 這條不變式在新測試中被實際斷言到（§2）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。§2 完成後若 §3 尚未跟進，
        `PlayerStatsTable.tsx` 端**不會**報錯（新增欄位不影響既有讀取），因此本 change
        **沒有**跨群組的刻意編譯期紅燈——`tsc` 在每一組結束時都 MUST 是綠的。
  - [ ] 已完成 (a) 的 mutation 自測並列出結果。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂中文
  規格的細微差異（例如「和局計入分母、不計入分子」與「和局不計入」只差三個字但語意完全
  相反），`haiku` 容易放行寫鬆的斷言。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組對不上，
  回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] **勝率與名次的既有行為完全不變**：`winRateOf` 與 `comparePlayerStatsForRanking`
        的 `git diff` MUST 為空。這是本 change 最容易因為「順手改一下」而破壞的一條線
        （design Decision 2 明訂勝率公式不變）。
  - [ ] 沒有 scope creep：沒有新增第十欄、沒有改勝率公式、沒有動 `round-lifecycle`／
        `match-rating`／`scoreboard`、沒有處理 M14 的 Open Questions 第 7／11 條。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註（本 change 預期**恰有一
        項**：§3 的 E2E 欄名陣列更新）。
  - [ ] （§4 專屬）新文案逐字為「時間到：領先者勝，同分可直接送出平手」，保留「時間到：」
        前綴，且**沒有**用樣板字串拼接 `DRAW_LABEL`（design Decision 5）。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：本 change 的核心風險是「測試看起來有覆蓋、其實是恆真斷言」（design
  Context 證據四已在既有測試中發現一例）。判斷一條斷言是不是恆真，需要同時看實作、測試與
  import 關係，是最需要推理深度的一環。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `lib/matchmaker/`、`components/matchmaker/` 的慣例一致；`draws` 的
        命名與既有 `wins`／`losses` 同一形狀（複數、無前綴）。
  - [ ] 執行 (b) 的獨立 mutation 測試。**本 change 的指定 mutation**：
        ① 把 `tallyGamesAndResults` 的和局分支改回 `stat.losses += 1`；
        ② 把 `PlayerStatsTable.tsx` 的標題改回「勝負」；
        ③ 把 `ROUND_TIMER_EXPIRED_MESSAGE` 改回舊文案。
        三者 MUST 各自讓至少一條測試轉紅；任一存活即代表該處只有恆真斷言。
  - [ ] 逐分支逐欄位盤點：`winner` 的三個值各有測試命中，且 `draws` 欄位在
        `buildRosterUnion` 的**兩個**建構分支（名單分支與歷史分支）都被初始化。
  - [ ] 邊界處理：出場數為 0 者的 `draws` 為 0 且不產生 `NaN`；全部場次皆為平局的球員
        `wins`／`losses` 皆為 0、`winRate` 為 0。
  - [ ] 分層沒有被打破：`lib/matchmaker/` 的純函式模組零 `window`／`document`／
        `localStorage`；`PlayerStatsTable.tsx` 沒有把計算邏輯（例如「和局為 0 就不顯示」）
        搬進呈現層（design Decision 4 明訂恆常顯示，不做條件渲染）。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 §2 要交代清楚為何和局仍計入 `gamesPlayed`
        （design Decision 1），§4 要交代為何不用 `DRAW_LABEL` 拼接（design Decision 5）。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：本 change 雖小，但跨兩個 capability 且**修的是「上一個 change 漏掉的橫向
  盤點」**。同樣的疏漏很容易在本 change 內重演——必須有人在全部完成後，一次看完整份 diff，
  重跑一次「還有沒有其他地方對 `winner` 做二元判斷」的機械盤點。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] 重跑
        `grep -rn 'winner === \|winner !== ' nextjs-pickball --include="*.ts" --include="*.tsx"`，
        確認 production 程式碼中**不再有**任何未處理 `"draw"` 的二元判斷
        （design Context 證據一是本 change 前的基準，逐條比對）。
  - [ ] 重跑 `grep -rn "再打一球" nextjs-pickball openspec` 確認舊文案在**實作與 delta
        spec 中皆已絕跡**；`openspec/changes/archive/**` 與
        `matchmaker-runbook-m10-m15.md` 的歷史命中屬正常，SHALL NOT 修改歷史檔。
  - [ ] `git diff --stat` 確認：`package.json`／`pnpm-lock.yaml` 未變、`hooks/` 零改動、
        `lib/matchmaker/round.ts`／`rating.ts`／`history.ts`、`lib/scoreboard/**`、
        `hono-pickball/**` 零改動。
  - [ ] `wins + losses + draws === gamesPlayed` 在實作與測試中一致；沒有任何一處把和局
        同時計進 `losses`（雙重計數）。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有動到 `openspec/specs/`
        下的主 spec。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`sonnet` → `opus`）
  後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試。
- **Spec Reviewer 自身判斷前後不一致** → 代表規格本身有歧義，升級給人類澄清並把結論補進
  design.md 的 Open Questions，SHALL NOT 由 reviewer 自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - §3 完成後，390px 的既有 E2E Scenario「排行榜表格於支援寬度下限不造成整頁橫向溢出」
    **失敗** → 先縮該欄的內距或字級再重跑；若兩次調整仍溢出，**升級給人類**決定是否改用
    Open Question 1 的替代呈現，SHALL NOT 自行改回兩個數字（那等於沒修）。
  - Implementer 回報「§2 的 `draws` 欄位讓 5 個以上的既有測試 helper 編譯失敗」→ 依
    `upgrade_to_opus_when` 升級模型，不要在 `sonnet` 上硬做。
  - Implementer 回報「發現第三處對 `winner` 的二元判斷」→ **停下回報**，由人類決定要納入
    本 change 還是另開；SHALL NOT 自行擴大 proposal 的 What Changes 範圍。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間（Implementer 的 `sonnet` 為使用者硬性規定的
例外，見上方 rationale）。`sonnet`／`opus` 是 Claude 的層級名稱，僅作為範例；在沒有這些層級
的環境上，對應到最接近的「均衡／最強」兩檔。
