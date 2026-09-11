## Mode

`group-driven`

派工單位是 tasks.md 的 `§` 群組（章節）：**一個群組派一個全新的 subagent**，由它一次做完
該組所有 task。組內仍**逐 task 依序**走 TDD 三步——每個 task 先寫失敗測試並在 shell 實際
看到紅燈，再最小實作至綠，再 refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實標註為
regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查改為**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2
（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code
Reviewer 檢查跨群組的一致性，該階段的內容與時機完全不變。

群組之間**仍嚴格序列**。SHALL NOT 並行派發多個 Implementer——它們共用同一個 worktree，
並行必然互相覆寫。

> 出處：自 M4（`matchmaker-round-lifecycle`）起本 repo 一律採「逐組」制以加速；
> `matchmaker-runbook.md`「執行模式（兩制並存）」與各已 archive change 的
> `execution-plan.md` 皆為此制的既有先例，本 change 沿用不重新討論。

## Per-group contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN 配對全文
   （REFACTOR task 則貼該項全文），依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first / Tier
   五欄，一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含「驗收」
   錨點），來自 `openspec/changes/matchmaker-timed-draw/specs/<capability>/spec.md`。
   SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §1（前置確認）→ Open Questions 第 1 條（M14 `round.timer` 的重新對齊要求）
   - §2（`round-types.ts` 的 `winner` 擴增）→ Decision 3（各自獨立擴增，不抽共用 schema）
   - §3（`rating-types.ts`／`rating.ts` 的 `winnerIndex`）→ Decision 1（字面量擴增而非另加
     旗標或判別聯集的理由）、Risks「平局的 `S = 0.5` 使觸界標示語意組合是全新的」
   - §4（`history.ts` 的 `winner` 擴增）→ Decision 3
   - §5（`round.ts` 的 `validateScoreInput`／`submitScore`／`toHistoryEntry`）→ Decision 2
     （新增 `isTimedRound` 參數的理由與否決的替代方案）、Decision 4（TIE 訊息更新、代碼
     不變）、Decision 6（UI 層零改動的分層原則，本組驗證這條原則不需要在 `round.ts` 以外做
     任何事）——**本組同時消費 §2／§3／§4 三者的型別擴增**，貼給 Implementer 的 spec／
     design 片段 MUST 含三者
   - §6（`export-scene.ts` 的 `buildStatusText`）→ Decision 7、Risks「`TEAM_LABELS_BY_KEY`
     型別在擴增後不相容」（**這是刻意的編譯期安全網，不是要規避的錯誤**）
   - §7（`CourtCard.tsx` 的平手標籤與 UI pass-through 驗證）→ Decision 6、Decision 7
   - §8（`HistoryRecordCard.tsx` 的平手顯示）→ Decision 7（`DRAW_LABEL` 具名常數）
   - §9（`history-csv.ts` 的勝方欄、`backup.ts` 的回歸保護）→ Decision 5（`backup.ts` 零
     修改的完整論證）、Decision 7
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、
   `matchmaker-runbook.md`、本 change 以外的 openspec 檔案。若 subagent 認為缺 context，
   MUST 回報 `NEEDS_CONTEXT` 而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-timed-draw`。
   所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在
     shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文；註解只寫「為什麼」，不重述函式名、
     不誤植 milestone 編號（見下方「派工單必帶」e）。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`。
   - **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定，
     SHALL NOT 自行 `pnpm add`。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

### 派工單必帶（來自 `matchmaker-runbook.md` 累積下來的派工經驗，逐條寫入每張派工單）

a. **Implementer 交件前 MUST 自跑一輪 mutation 測試**，回報「幾次／改了什麼／是否轉紅」；
   有任何一次存活先自行補斷言再交件，不留給 Stage 2 才發現。
b. **Stage 2 Reviewer MUST 獨立再做一次 mutation**（不採信 Implementer 自述）、
   **逐分支逐欄位機械盤點覆蓋率**（不是只加強既有斷言），並檢查是否有**恆真斷言**
   （例如 `toEqual` 兩邊其實是同一個物件參考、或測試斷言的常數本身就是實作抄來的字面量），
   回報存活數與存活率。
c. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗**，不採信「我有看到紅燈」的口頭
   回報；查核不過（例如實作在更早的 commit 就已提交）改標為 regression guard 並補 mutation
   驗證。
d. **逐 task commit**：`test:` 一個、`feat:` 一個，不要一組一個大 commit——每次紅燈都要獨立
   留在版控裡，讓 coordinator 能用 (c) 的方式直接複驗。
e. **註解只寫「為什麼」**，不重述函式名、不誤植 milestone 編號（本 change 為 M15）。
f. **worktree 內的編輯器／IDE 診斷不可信**，常整批謊報 `Cannot find module` 之類的錯誤。
   一律以實跑 `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的
   單一 import 解不到」——那是 TDD 紅燈，是真的。
g. **跑 E2E／preview 前先 `lsof -i :3005 -i :8787` 並且
   `ps aux | grep -E "next-server|wrangler|workerd|playwright"`** 交叉核對殘留 process
   並全數 kill；確認 port 釋放後才起單一組。跑完**立刻清掉自己起的 process**。E2E 一律帶
   `--workers=1`。本 change 的 §8 Scenario（歷史頁平手顯示）使用 E2E tier，是本批唯一需要
   起前後端 server 的群組，須特別留意此條。
h. **派出 subagent 之後不可以結束回合**；脈絡將盡就在派工**之前**乾淨停止，把狀態寫進
   `design.md` 的 `## Open Questions` 並 commit 後回報，SHALL NOT 派工後才發現脈絡不夠而
   無法審查。
i. **授權 Stage 2 直接修小東西**（dead export、補斷言之類），但要在回報的「偏離」欄如實記載，
   SHALL NOT 悄悄改動後不留痕跡。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：**不使用 execution-plan schema 預設的 `haiku`，直接指定 `sonnet`**。這是
  使用者的硬性規定（`matchmaker-runbook.md`「累積下來的派工經驗」第 4 條）：M4 §1 曾用
  `haiku` 派工，連續兩輪被 Stage 2 退回（失效的假測試、複述式註解），每次退回都要多付一次
  opus 審查成本，反而比一開始用 `sonnet` 更貴。本 change 額外的理由是：多數群組（§5、§3、
  §7）涉及**跨模組推理**（`round.ts` 的 `isTimedRound` 推導、`rating.ts` 的 `S = 0.5`
  公式、UI 層「不能新增判斷」的消極驗證），不是「照抄一份純函式骨架」這種單一檔案的機械工作，
  `haiku` 在這類任務上的既有紀錄不理想。
- **upgrade_to_opus_when**:
  - 同一群組被同一個 reviewer 連續退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非群組過大）。
  - 群組觸及 §5（`round.ts` 的 `submitScore`／`validateScoreInput`）——這是本 change **唯一
    需要同時改動函式簽章＋下游三個呼叫路徑**（`validateScoreInput` 本身、`submitScore` 的
    `winner` 判定、`toHistoryEntry` 的參數型別），且**同時消費 §2／§3／§4 三者型別擴增**
    的群組，牽動面最廣。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，
        不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是 §6／§7／§8／§9 這四個「唯讀消費點」群組**沒有
        修改 `winner` 欄位本身的定義**（那是 §2／§4 的範圍）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] 沒有在 `lib/matchmaker/` 的純函式模組內新增任何 `window`／`document`／`localStorage`
        存取。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過——§2 完成後，若 §6
        （`export-scene.ts`）尚未跟進修正 `buildStatusText`，此時的 `tsc` **預期會報錯**
        （design Risks 明訂的刻意編譯期訊號），不是本群組要修的東西；§6 群組自己開工時
        才需要讓它轉綠。
  - [ ] 已完成 (a) 的 mutation 自測並列出結果。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂中文
  規格的細微差異（例如「非計時回合維持拒絕」與「一律拒絕」只差三個字但語意完全相反），
  `haiku` 容易放行寫鬆的斷言。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組對不上，
  回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] **非計時回合的既有行為完全不變**：`validateScoreInput` 在 `isTimedRound: false` 下
        對「兩隊比分相同」的拒絕邏輯、`match-rating` 對「非平局呼叫」的計算結果，MUST 與
        本 change 之前逐位元組相同——這是本 change 最容易因為「順手改一下」而破壞的一條線
        （`prd.md` 13.4 對非計時回合不變）。
  - [ ] 沒有 scope creep：沒有做「延長賽」自動流程、沒有重算既有歷史、沒有做每場獨立計時
        （design Non-Goals）、沒有修改 `scoreboard`／`player-roster` 的任何檔案。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
  - [ ] （§5 專屬）`validateScoreInput` 的既有測試呼叫點是否已補上第四個參數，而非留下
        `tsc` 錯誤未修。
  - [ ] （§9 專屬）確認 `backup.ts`／`transfer-types.ts` 的 `git diff` 確實為空——這是
        design Decision 5 的核心論證，若 Implementer 忍不住手動改了這兩個檔案，代表對
        「零修改也該有效」的假設有疑慮，MUST 退回並要求先確認是否真的不需要改。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：品質判斷需要對本 repo 既有慣例的整體感（`lib/matchmaker/` 的純函式線、
  `labels.ts` 剛收斂完成的文案單一來源慣例、既有錯誤訊息的語氣），且本 change 特別容易在
  「四個唯讀消費點是否都真的改到」這種橫向一致性上放水——這是最需要廣度的一環。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `lib/matchmaker/`、`components/matchmaker/` 的慣例一致。
  - [ ] **「平手」文案只有一份具名來源**（`labels.ts` 的 `DRAW_LABEL`），四個消費點
        （`history-csv.ts`／`export-scene.ts`／`CourtCard.tsx`／`HistoryRecordCard.tsx`）
        皆 import 同一個常數，沒有任何一處寫死「平手」字面量。
  - [ ] 分層沒有被打破：`lib/matchmaker/` 的純函式模組零 `window`／`document`／
        `localStorage`；`CourtCard.tsx`／`ScoreEntry.tsx` 沒有新增任何「兩隊比分相同時
        提前攔截」的判斷（design Decision 6）。
  - [ ] 執行 (b) 的獨立 mutation 測試並逐分支逐欄位盤點覆蓋率，尤其檢查
        `winner === "draw"` 分支是否被真正覆蓋（而非因為既有測試的斷言太寬鬆而意外通過）。
  - [ ] 邊界處理：`E = 0.5` 時平局雙方變動皆為零、`gamesPlayed` 不同時的平局、已在邊界值
        （`8.00`／`1.00`）的球員平局。
  - [ ] 錯誤訊息為繁體中文且說明可採取的修正方式，`TIE_MESSAGE` 更新後仍不含未轉譯的技術
        錯誤碼。
  - [ ] 無障礙：「平手」標籤與既有「勝」標籤一樣以文字表達，不是只調顏色或飽和度
        （`prd.md` 12.5）。
  - [ ] 註解說明「為什麼」而非「做什麼」——尤其 §5 群組要交代清楚為何選擇布林值參數而非
        傳整個 `Round`（design Decision 2 已有答案，註解不需要重述整段設計文件，但要點出
        關鍵理由）。
  - [ ] 沒有引入新的 npm 相依。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：本 change 橫跨 6 個 capability、8 個實作群組（§2～§9，不含 §1 前置確認與
  §10 收尾驗證），且「四個唯讀消費點是否都真的補上平手顯示」這種跨群組一致性問題，只有在
  全部完成、一次看完整份 diff 才看得出來。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] `DRAW_LABEL` 確實只有一份具名來源，`grep -rn "平手" nextjs-pickball/lib
        nextjs-pickball/components` 除了 `labels.ts` 本身的定義與其匯入使用外，
        不應出現任何字面量重複。
  - [ ] `git diff --stat` 確認：`package.json`／`pnpm-lock.yaml` 未變、`hooks/` 零新增、
        `lib/scoreboard/**`／`scoreboard-binding.ts`／`hono-pickball/**` 零改動。
  - [ ] `backup.ts`／`transfer-types.ts` 的 `git diff` 確實為空（design Decision 5 的
        最終機械確認）。
  - [ ] 非計時回合的既有測試（`round.test.ts`）除了「兩隊比分相同」那一條因新增第四個參數
        而**必須**改動之外，其餘既有 it 名稱與斷言內容逐位元組不變。
  - [ ] `ExportScene`／`HistoryRecordCard`／`CourtCard`／CSV 四處的平局顯示彼此用詞一致
        （皆為「平手」，不是三處「平手」一處「平局」的用詞不一致）。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進其他 M10～M14 change
        的東西，也沒有動到 `openspec/specs/` 下的主 spec。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`sonnet` → `opus`）
  後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試——那只會得到同樣的結果。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表規格本身
  有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由 reviewer
  自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「§1 前置確認發現 `main` 上 M14 的計時判定條件與 design.md 假設的
    `round.timer` 欄位名稱或型別不同」→ 依 design Open Questions 第 1 條的指示補記進
    design.md 後再繼續；若差異大到本 change 的「計時回合」判定邏輯需要整段重寫（例如 M14
    改為逐場計時而非整輪），**升級給人類**，SHALL NOT 自行擴大解讀 design 的假設。
  - Implementer 回報「`validateScoreInput` 新增第四個參數後，還有除了 `round.test.ts` 以外
    的既有呼叫點需要修改」→ 先確認是否真的只有 `round.ts` 內部一處呼叫（design Context 已
    grep 確認 `validateScoreInput` 全 repo 僅 `round.ts` 與 `round.test.ts` 兩處引用），
    若發現第三處，MUST 停下回報，SHALL NOT 自行假設「應該改」就動手。
  - Implementer 回報「`TEAM_LABELS_BY_KEY[match.winner]` 在 `export-scene.ts` 型別擴增後
    需要新增分支，但不確定要不要順手把 `TEAM_LABELS_BY_KEY` 本身也擴成三值」→ 依 design
    Decision 7 的既有裁決（獨立常數，不併入 `TEAM_LABELS_BY_KEY`）執行，不需要升級。
  - 出現 `Worker "hono-pickball" not found`（§8 的歷史頁 E2E 群組）→ 依 environment.md 的
    注意事項處理殘留 process，SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間（Implementer 的 `sonnet` 為使用者硬性規定的
例外，見上方 rationale）。`sonnet`／`opus` 是 Claude 的層級名稱，僅作為範例；在沒有這些層級
的環境上，對應到最接近的「均衡／最強」兩檔。
