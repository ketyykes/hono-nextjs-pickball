## Mode

`subagent-driven`

派工單位採**「逐組制」**（M4 起的既有做法，見 `matchmaker-runbook.md`「執行模式（兩制並存）」）：tasks.md 的 `§` 群組為派工單位，**一組一個全新 Implementer** 做完整組——組內仍**逐 task 依序**走 TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor；紅燈誠實條款不變（加入即綠者 MUST 誠實標註為 regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈）。

兩階段審查改為**逐組**：整組所有 task 完成後才跑 Stage 1（規格符合，審整組）→ Stage 2（程式品質，審整組），SHALL NOT 在組內逐 task 送審。全部群組完成後再跑一次 Final Code Reviewer 檢查跨群組一致性。

群組之間**仍嚴格序列**。SHALL NOT 並行派發多個 Implementer——它們共用同一個 worktree，並行必然互相覆寫。

> ⚠️ **本 change 全段落在 `nextjs-pickball/CLAUDE.md` 的 TDD 例外層**：三項工作皆為純呈現型元件與 Playwright E2E，沒有任何 `lib/matchmaker/**` 的行為邏輯異動。下方「Per-task contract」與「Roles」的 mutation 測試要求因此**調整適用範圍**——不是對著一個新的純函式做工具化 mutation testing（本 change沒有新增任何純函式），而是對著「這組產生的 GREEN diff」做**人工等效 mutation**：暫時撤銷／破壞剛寫的最小實作（例如把 `EmptyMatches` 的條件式改回無條件不渲染、把 `droppedCount > 0` 的判斷式改成永遠 `false`），確認對應的 E2E test 真的會轉紅，再復原。這與 mutation testing 的精神相同（驗證測試本身有沒有偵測力），只是手段從自動化工具改為人工，因為本 change 沒有可供工具化 mutation 的純函式標的。

## Per-task contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST 逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN（+ REFACTOR）配對全文，依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first / Tier 五欄，一字不改。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含「驗收」錨點）。§4（重設／再排）**沒有**對應的新 spec 片段可貼——改貼 design Decision 3 全文，說明為何如此。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision 與 Risk 條目。對照表：
   - §2（`EmptyMatches.tsx` + `MatchStage.tsx`）→ Decision 1（為何放在 `MatchStage.tsx`、為何新增獨立元件）、Context 的候選池追蹤段落
   - §3（`HistoryView.tsx`）→ Decision 2（各自持有一份、不抽共用元件）、Context 的「SHALL NOT import useRoundStore」段落
   - §4（重設／再排 E2E）→ Decision 3（為何不修改任何 Requirement）、Decision 4（用「設為暫停」重現候選池不足）
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、本 change 以外的 openspec 檔案、`matchmaker-runbook.md`（那是 coordinator 專用的跨 change 記憶，不是本 change 的規格來源）。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT` 而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：`/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-stage-gaps`。所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加 `--`**。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path>`；webServer 會自動起前後端。**一律帶 `--workers=1`**。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點（或 test-plan 指定名稱）**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定，SHALL NOT 自行 `pnpm add`。
   - **SHALL NOT 新增任何 hook**、**SHALL NOT 修改 `lib/matchmaker/**` 任何檔案**——三項工作的底層邏輯皆已正確（design Context），本 change 只碰呈現層與測試。若發現底層邏輯真的有缺陷，MUST 回報 `BLOCKED` 而非順手修正。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，SHALL NOT 用「改斷言看紅再改回」偽造紅燈。

**派工單必帶（來自跨 change 的派工經驗，逐條寫入每張派工單）**：

a. Implementer 交件前 MUST 自行驗證測試的偵測力（見上方「本 change 全段落在 TDD 例外層」的調整說明——人工等效 mutation：暫時破壞剛寫的最小實作，確認對應 test 轉紅，再復原），並在回報中列出「破壞了什麼、test 是否轉紅」。
b. Stage 2 Reviewer MUST 獨立再做一次同等驗證（自己想一種破壞剛實作行為的方式，不採信 Implementer 想的那一種），並檢查斷言是否恆真（例如拿常數本身組出查詢字串再拿同一個常數斷言，等於同義反覆——`matchmaker-visual-export` §6 曾抓到這個具體案例）。
c. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過就更正為 regression guard 並補上等效 mutation 驗證。
d. **逐 task commit**（`test:` 一個、`feat:` 一個），不要一組一個 commit——§4 只有 RED、沒有對應 GREEN 產品程式碼時，允許只有一個 `test:` commit。
e. 註解只寫「為什麼」，不重述函式名、不誤植 milestone 編號（本 change 為 M10，SHALL NOT 誤寫成其他編號）。
f. worktree 內編輯器／IDE 診斷不可信，一律以 `pnpm -r exec tsc --noEmit` 的 exit code 為準；唯一可信的例外是「單一新檔的單一 import 解不到」（那是 TDD 紅燈，是真的）。
g. 跑 E2E 前先 `lsof -i :3005 -i :8787` **並且** `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對殘留 process 並全數 kill，確認 port 釋放後再起單一組；跑完立刻清掉自己起的 process。E2E 一律帶 `--workers=1`。
h. 派出 subagent 之後**不可結束回合**；脈絡將盡就在派下一組**之前**乾淨停止，把狀態寫進 `design.md` 的 `## Open Questions`（格式照既有條目）並 commit 後回報。「派工後無法審查」比停下來更糟。
i. 授權 Stage 2 直接修小東西（例如補一句缺漏的中文註解、修正誤植的常數名），但要在回報的「偏離」欄如實記載；**不授權** Stage 2 修改任何 `lib/matchmaker/**` 檔案或新增測試斷言以外的產品邏輯——那已超出「小東西」的範圍，MUST 退回給 Implementer 或升級。

commit 訊息一律 Conventional Commits、繁體中文，footer 一行 `Claude-Session: <該次 apply session 的 id>`（不得編造 URL），不得加 `Generated`／`Co-Authored-By`。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**: **這是使用者硬性規定**（`matchmaker-runbook.md`「模型規定」：Implementer 一律 `sonnet`，不用 `haiku`——M4 §1 的 `haiku` 連續兩輪被 Stage 2 退回，每次退回都要多付一次 opus 審查成本，`sonnet` 起跳反而更省）。本 change 三組任務雖各自不大，但橫跨「新元件＋既有元件改寫」「既有元件改寫＋既有樣式比照」「多步驟 E2E 重現＋LocalStorage 斷言」，複雜度不是最簡單的複製貼上，`sonnet` 是合理起點。
- **upgrade_to_opus_when**:
  - 同一群組被同一 reviewer 連續退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（例如 §4 的候選池重現步驟怎麼排都無法讓 `round.matches` 變空，需要重新推導）。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，且失敗訊息是「找不到元素」或「斷言不符」，不是打錯字或選錯 port。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點（或 test-plan 指定名稱）逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是 **沒有修改任何 `lib/matchmaker/**` 檔案**。
  - [ ] `package.json`／`hooks/` 皆無異動（`git diff --stat package.json hooks/` 為空）。
  - [ ] 已完成「派工單必帶」a 項的人工等效 mutation 驗證並列出結果。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂中文規格的細微差異（例如「不顯示空白的場地網格」與「網格還在只是空的」是否算違反）。
- **required first action**: 覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組對不上，回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同（§4 除外——它沒有對應的新 Scenario，改核對是否確實映射到 design Decision 3 所述的既有 Scenario）。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] 沒有 scope creep：沒有修改分配演算法（`lib/matchmaker/allocation.ts`／`candidates.ts`）、沒有新增歷史紀錄修復或匯出功能、沒有改動 `useRoundStore` 的介面、沒有新增 hook 或 storage key（proposal Non-goals）。
  - [ ] §2、§3 沒有把「本輪場次為空」與「空白球場狀態」、或「損毀歷史提示」與 `player-roster` 既有提示的邊界混淆（design Decision 1、2）。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 品質判斷需要對本 repo 既有慣例的整體感（`EmptyStage.tsx`／`EmptyRoster.tsx` 的既有形狀、`player-roster` 損毀提示的既有樣式、`match-stage.spec.ts`／`matchmaker-history.spec.ts` 既有 helper 的使用慣例），且本 change 特別容易在「兩個空狀態元件該不該共用」「兩份損毀提示該不該抽共用元件」這類邊界上放水。
- **required first action**: 同 Stage 1，先覆述收到的片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `components/matchmaker/` 的慣例一致（`EmptyMatches` 與 `EmptyStage`／`EmptyRoster`／`EmptyHistory` 同一套形狀）。
  - [ ] 獨立完成上方「派工單必帶」b 項的人工等效 mutation 驗證，不採信 Implementer 的自述。
  - [ ] 分層沒有被打破：`EmptyMatches.tsx`／`MatchStage.tsx`／`HistoryView.tsx` 皆為零邏輯分支之外的純呈現（唯一的分支是「要不要渲染」），沒有把任何原本屬於 `lib/` 的判斷邏輯搬進元件。
  - [ ] §3 的提示樣式與文案確實比照 `app/matchmaker/players/page.tsx`（design Decision 2），沒有創造第二種視覺語彙；同時確認**沒有**修改 `player-roster` capability 的任何檔案。
  - [ ] §4 的斷言鎖定在「可觀察的結果」（design Decision 4 所述），沒有依賴分配演算法的內部實作細節（例如寫死排序後的球員 id）。
  - [ ] 錯誤／說明文字為繁體中文，不含未轉譯的技術錯誤碼。
  - [ ] 註解說明「為什麼」而非「做什麼」，且 milestone 編號一律為 M10。
  - [ ] 沒有引入新的 npm 相依或新的 hook。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，**既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 本 change 有 4 個實作群組，橫跨兩個 capability 與三個既有檔案的修改，跨組的重複（例如兩份損毀提示的文案是否不小心逐字相同、兩個空狀態元件是否不小心共用了同一個 `data-testid`）只有全部完成後、一次看完整份 diff 才看得出來。
- **when**: 所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] `EmptyMatches.tsx` 與 `EmptyStage.tsx` 的 `data-testid`、觸發條件確實不同（design Risks 第一條）。
  - [ ] `HistoryView.tsx` 的損毀提示與 `app/matchmaker/players/page.tsx` 的既有提示樣式一致但各自獨立持有一份（`grep` 機械確認兩處 class 字串），且**沒有**修改後者。
  - [ ] `git diff --stat` 確認：`package.json`／`pnpm-lock.yaml`／`hooks/**`／`lib/matchmaker/**` 全數零改動。
  - [ ] §4 的 E2E test 確實不對應任何被修改的 spec Scenario（`git diff` `openspec/specs/match-stage/spec.md` 與 `openspec/specs/round-lifecycle/spec.md` 應皆為空——這兩份是主 spec，本 change 的 delta 只新增在 `openspec/changes/matchmaker-stage-gaps/specs/` 底下，不動主 spec）。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes 範圍內，沒有混進本批其他棒（M11～M15）的東西。
  - [ ] 全套測試（`pnpm test`、`pnpm -r exec tsc --noEmit`、`pnpm --filter ./nextjs-pickball lint`、`pnpm --filter ./nextjs-pickball test:e2e --workers=1`）在最終狀態下全綠。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`sonnet` → `opus`）後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試。
- **Spec Reviewer 自身判斷前後不一致** → 代表規格本身有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由 reviewer 自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「§4 的重現步驟（設為暫停後重排）無法讓 `round.matches` 變空，實際行為與 design Decision 4 的追蹤不符」→ **立即停止該群組**，升級給人類；design Context／Decision 4 的可達性論證已逐層追蹤 `main` 上的實際程式碼，若不符代表 `main` 已變動或本文件有誤，SHALL NOT 自行改寫重現步驟去遷就一個沒有核實過的新假設。
  - Implementer 回報「損毀提示或空場次說明需要修改 `lib/matchmaker/**` 才能實作」→ 依 Per-task contract 的固定紀律，回報 `BLOCKED` 而非自行修改；design Context 已確認三項缺口的底層邏輯皆已正確，若真的發現需要動 `lib/`，代表本文件的前提有誤，MUST 升級給人類重新評估範圍。
  - §4 的 E2E 重現步驟在某個 browser project 上不穩定（例如 `AlertDialog` 或表單 focus 在 WebKit／Mobile Safari 上的既有已知差異）→ 先比照 `match-stage.spec.ts`、`matchmaker-history.spec.ts` 既有的 `KNOWN_DEV_ONLY_NOISE` 慣例判斷是否為已知噪音；SHALL NOT 以 `test.skip` 靜默跳過，要跳過 MUST 在 tasks.md 記明是哪個 project、為什麼、以及改用什麼方式驗證。
  - 出現 `Worker "hono-pickball" not found` → 依 environment.md 的注意事項處理殘留 process，SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間——但 Implementer 的預設值 `sonnet` 是本專案的硬性規定（見上方 rationale），不因這條原則而降回 `haiku`。`haiku`／`sonnet`／`opus` 是 Claude 的層級名稱，僅作為範例；在沒有這些層級的環境上，對應到最接近的「快速／均衡／最強」三檔。
