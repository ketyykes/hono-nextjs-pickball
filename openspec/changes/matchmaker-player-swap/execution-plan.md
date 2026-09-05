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

> 出處：`matchmaker-runbook.md`「執行模式（兩制並存）」——M4 起由「逐 task」制改為「逐組」制
> 以加速；本 change（M13）沿用同一制度。

## Per-group contract

subagent **不繼承主對話的任何 context**。每次派工（單位為一個 `§` 群組）時，下列項目 MUST
逐字貼進 prompt，SHALL NOT 只給檔案路徑要對方自己去讀：

1. **tasks.md 該組的完整 task 文字**：該組**所有** task 的 RED + GREEN（＋ REFACTOR）配對
   全文，依組內原順序排列。
2. **test-plan.md 該組對應的所有表格列**：Test name / Scenario / Assertion / Why first / Tier
   五欄，一字不改。Tier 決定測試放哪一層與用哪個指令跑，不可省略。
3. **相關的 spec.md 片段**：貼本組觸及的**每一個** Requirement 全文及其 Scenario（含「驗收」
   錨點）。SHALL NOT 貼整份 spec。
4. **相關的 design.md 片段**：影響本組的 Decision、Context 事實與 Risk 條目。對照表：
   - §2（`swapMatchPlayer` 純函式）→ Context 的隊伍分數/`labelDoublesComposition`/
     `isTargetScoreLocked` 三段事實、Decision 1（放 `round.ts`）、Decision 2（總和非平均）、
     Decision 3（重用已匯出的 `labelDoublesComposition`）、Decision 8（休息名單附加於尾端）、
     Decision 9（隊友缺失時維持舊 `doublesComposition`）、Non-Goals 的「不重算基準」段
   - §3（`useRoundStore` 接線）→ Context 的 `round.ts` Result 型別家族段、Open Questions 4
   - §4（`CourtCard` 換人操作）→ Decision 4（UI 層額外收斂 `matchSlot`）、Decision 5（不改
     `PlayerTile.tsx`）、Decision 6（候選人由既有 props 衍生，不新增 prop）、Decision 7
     （文案擺放）、Open Questions 1、2
   - §5（`MatchStage`／`page.tsx`／`labels.ts` 接線）→ Decision 6、Decision 7、Open
     Questions 1
   - §6（E2E）→ spec 的「換人操作具備可存取名稱且可由鍵盤操作」Scenario、Risks 的
     「換人與計分板槽的判定分散在兩處」段
5. **明確的「不給你」清單**：其他群組的 task 內容、其他 capability 的 spec、`prd.md` 全文、
   本 change 以外的 openspec 檔案。若 subagent 認為缺 context，MUST 回報 `NEEDS_CONTEXT`
   而不是自行去翻。
6. **worktree 絕對路徑**（見 environment.md）：
   `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-player-swap`。
   所有 subagent 共用**同一個** worktree，SHALL NOT 自行 `git worktree add`。
7. **本 repo 的固定紀律**（每次都貼，不假設對方記得）：
   - TDD 三步（組內**每個 task 各走一輪**，不可整組先寫測試再一次實作）：先寫失敗測試並在
     shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor。
   - 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加
     `--`**（加了會跑完整套，紅燈證據被既有綠燈淹沒）。
   - E2E 指令 `pnpm --filter ./nextjs-pickball test:e2e <path> --workers=1`；webServer 會
     自動起前後端。
   - `it`／`test` 名稱 MUST 與 spec 的「驗收」錨點**逐字一致**，否則 verify 無法機械核對。
   - 註解與說明用繁體中文（台灣用語），程式碼命名用英文。
   - `verbatimModuleSyntax` 已開啟，純型別匯入一律 `import type`；`describe`／`it`／`expect`／
     `vi` MUST 顯式 `import ... from "vitest"`。
   - **SHALL NOT 新增任何 npm 相依**。需要新套件時一律回報 `BLOCKED`，由人類決定。
   - 若某項行為早已實作使新測試立即全綠，MUST 在 tasks.md **誠實標註為 regression guard**，
     SHALL NOT 用「改斷言看紅再改回」偽造紅燈。
8. **派工單必帶的九項紀律**（來自跨 milestone 累積的派工經驗，逐條貼給每一組）：
   1. **Implementer 交件前 MUST 自跑 mutation** 並在回報中列出「幾次／改了什麼／是否轉紅」，
      有任何一次存活先補斷言再交件。
   2. **Stage 2 Reviewer MUST 獨立再做一次 mutation**（不採信 Implementer 的自述數字），
      並**逐分支逐欄位機械盤點覆蓋率**、檢查是否有恆真斷言（`toEqual` 兩邊為同一物件
      參考、比較永遠為真的斷言），回報存活數。
   3. **紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗**——查該檔在紅燈 commit 的
      前一個 commit 是否真的沒有這段實作。查核不過的一律更正為 regression guard 並補
      mutation 驗證，不得維持「宣稱為真紅燈」的紀錄。
   4. **逐 task commit**：一個 RED 一個 `test:` commit、一個 GREEN 一個 `feat:` commit，
      REFACTOR 若有改動另開一個 `refactor:` commit。SHALL NOT 一組打包成一個 commit。
   5. **註解只寫「為什麼」**：不重述函式名、不誤植 milestone 編號（本 change 為 M13）。
   6. **worktree 內的編輯器／IDE 診斷不可信**：一律以實跑 `pnpm -r exec tsc --noEmit` 的
      exit code 為準；唯一可信的例外是「單一新檔的單一 import 解不到」——那是 TDD 紅燈，
      是真的。
   7. **跑 E2E 前先查殘留 process**：`lsof -i :3005 -i :8787` **並且**
      `ps aux | grep -E "next-server|wrangler|workerd|playwright"` 交叉核對，找出所有
      殘留 process 全數 kill、確認 port 釋放後再起單一組；跑完立刻清掉自己起的 process。
      **E2E 一律帶 `--workers=1`**。
   8. **派出 subagent 之後不可結束回合**。leader 自己的脈絡將盡時，MUST 在派下一組
      **之前**乾淨停止：把目前狀態（已完成到哪、下一步是什麼、任何已知偏差）寫進
      `design.md` 的 `## Open Questions` 並 commit 後再回報，SHALL NOT 派工後直接結束。
   9. **Stage 2 Reviewer 被授權直接修小東西**（dead export、補斷言之類），但 MUST 在回報的
      「偏離」欄如實記載改了什麼、為什麼不退回 Implementer。

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：**使用者硬性規定**——`matchmaker-runbook.md`「模型規定」明訂 Implementer
  一律用 `sonnet`，不用 execution-plan 曾經預設的 `haiku`：M4 §1 的 haiku 連續兩輪被退回
  （失效的假測試、複述式註解），每次退回都要多付一次 opus 審查成本，反而更貴。本 change
  延續此規定，不重新討論。
- **upgrade_to_opus_when**:
  - 同一群組被同一個 reviewer 連續退回 3 次（見 Escalation）。
  - Implementer 回報 `BLOCKED` 且原因為推理不足（非 context 不足、非群組過大）。
  - §2（`swapMatchPlayer`）的雙打組成標示重算或隊友缺失 fallback 兩個分支寫不出正確的
    4 元素 tuple 組裝順序時——這是本 change 唯一需要跨模組型別推理的地方
    （`RoundTeam.playerIds` → 解析為 `Player` → `labelDoublesComposition` 的固定 tuple 型別）。
- **self-review checklist**（整組提交前自己先過一遍，組內每個 task 都要滿足）:
  - [ ] 每個 task 的紅燈輸出真的都貼出來了，而且失敗訊息是「斷言不符」或「函式不存在」，
        不是打錯字。
  - [ ] `it`／`test` 名稱與收到的 spec 驗收錨點逐字相同（含全形標點）。
  - [ ] 沒有動到本群組範圍外的檔案；特別是**沒有修改 `match-allocation` 的任何檔案**
        （`allocation.ts`／`pairing.ts`／`duplication.ts`／`candidates.ts`）與
        **沒有修改 `PlayerTile.tsx`**（design Decision 5）。
  - [ ] `package.json` 沒有任何新增相依（`git diff package.json` 為空）。
  - [ ] `swapMatchPlayer` 沒有觸碰 `window`／`document`／`Blob`／任何 LocalStorage 讀寫。
  - [ ] 已自跑 mutation 並在回報中列出次數／內容／是否轉紅（見上方紀律 1）。
  - [ ] `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只需比對「程式有沒有做到 spec 說的事」，不需要對品味下判斷；但要能讀懂
  中文規格的細微差異（例如「非 active 時拒絕」與「不存在時拒絕」是兩個不同的失敗代碼，
  容易被寫鬆的斷言矇混過去）。
- **required first action**：覆述收到的 spec／test-plan 片段的**標題**。若與被審的群組
  對不上，回報 `NEEDS_CONTEXT` 而**不要**開始審。
- **review checklist**（一次審整組）:
  - [ ] 這個群組對應的每一個 Scenario 都有測試覆蓋，且測試名稱與驗收錨點逐字相同。
  - [ ] 組內每個 task 的 RED 測試真的映射到 Scenario 的 WHEN／THEN，不是換個容易通過的斷言。
  - [ ] `swapMatchPlayer` 的五個失敗代碼（場次不存在／非 pending／out 不在場／in 不在休息
        名單／in 非 active）各自獨立測到，沒有兩個代碼共用同一條測試而彼此掩蓋。
  - [ ] 沒有 scope creep：沒有做跨場地互換、換人歷史記錄、換人次數限制（design Non-Goals），
        也沒有動 `restCount` 或 `seenSignatures`。
  - [ ] 沒有 MODIFY `round-lifecycle`／`match-stage` 既有的任何 Requirement——本 change
        全部是 ADDED，不應觸碰既有 Scenario 的斷言邏輯。
  - [ ] 若測試是加入即綠的 regression guard，tasks.md 有誠實標註。
- **SHALL NOT**: 評論命名、檔案結構、可讀性、重複程式碼——那是 Stage 2 的工作。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：品質判斷需要對本 repo 既有慣例的整體感（`round.ts` 既有三個同型函式的
  命名與型別家族、`labels.ts` 的收錄範圍界線、`isTargetScoreLocked` 的分層先例），這是
  最需要廣度的一環；本 change 又特別容易在「隊伍分數該用總和還是平均」「文案該放
  `labels.ts` 還是 `round.ts`」這類邊界上放水。
- **required first action**：同 Stage 1，先覆述收到的片段標題；對不上就回報
  `NEEDS_CONTEXT`。
- **review checklist**:
  - [ ] 命名與既有 `round.ts`（`SET_TARGET_SCORE_FAILURE_CODE` 等）、
        `components/matchmaker/` 的慣例一致：失敗代碼以函式名前綴命名
        （`SWAP_MATCH_PLAYER_FAILURE_CODE`），不沿用 `M3` 的舊模式教訓
        （`ROUND_FAILURE_CODE` 未以函式名命名曾被 Final Review 記為缺點）。
  - [ ] 隊伍分數重算確實呼叫 `roundRating` 且為**總和**而非平均（design Decision 2）。
  - [ ] 雙打組成標示重算確實呼叫 `pairing.ts` 已匯出的 `labelDoublesComposition`，
        SHALL NOT 另寫一套判定邏輯，也 SHALL NOT 改動 `allocation.ts`／`pairing.ts` 任何
        既有程式碼。
  - [ ] 換人操作的「是否顯示」判定確實同時看 `match.status === "pending"` 與
        `matchSlot === null`（design Decision 4），不是只看其中一個。
  - [ ] `PlayerTile.tsx` 零改動（`git diff --stat` 機械確認）。
  - [ ] 沒有重複邏輯：候選人（休息名單中的 active 球員）只在 `CourtCard` 內算一次，
        沒有在 `MatchStage` 又算一次（design Decision 6）。
  - [ ] 邊界處理：休息名單為空、候選人恰有 1 位、雙打換人時另一隊球員已被移除、
        `outPlayerId`／`inPlayerId` 為同一人這類理論上不可達但型別上可傳入的輸入。
  - [ ] 錯誤訊息為繁體中文且說明可採取的修正方式，不含未轉譯的技術錯誤碼。
  - [ ] 無障礙：換人操作的 `aria-label` 含球員姓名而彼此不同、`disabled` 用屬性而非只調
        視覺、被拒絕提示帶 `role="alert"`。
  - [ ] 換人的靜態文案（「換人」／「無可換之人」）在 `labels.ts`，五個失敗訊息在 `round.ts`
        （design Decision 7），不得互換擺放。
  - [ ] 註解說明「為什麼」而非「做什麼」，尤其 Decision 8（休息名單附加尾端）、Decision 9
        （隊友缺失時維持舊標示）這兩個容易被誤讀為「偷懶」的決定要能在程式碼旁看到理由。
  - [ ] 沒有引入新的 npm 相依。
  - [ ] 已獨立執行 mutation（不採信 Implementer 自述），回報存活數與逐分支覆蓋率盤點結果。
- **SHALL NOT**: 重新爭論規格對不對（Stage 1 已經處理）。與 Implementer 的風格分歧時，
  **既有 codebase 風格勝出**。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：本 change 橫跨純函式（`round.ts`）、hook 接線（`useRoundStore.ts`）、
  元件（`CourtCard.tsx`／`MatchStage.tsx`）、例外層頁面（`page.tsx`）與 E2E 五種性質，
  跨群組的重複與分層破口只有在全部完成後、一次看完整份 diff 才看得出來。
- **when**：所有 task 打勾之後，執行一次。
- **review checklist**（只看跨 task 的事）:
  - [ ] `swapMatchPlayer` 的產品呼叫點（非測試）唯一，確認 `grep` 只命中
        `hooks/useRoundStore.ts` 一處。
  - [ ] 換人的候選人計算邏輯（休息名單 ∩ active）確實只有一份具名來源，`CourtCard.tsx`
        內沒有第二處重寫同一條篩選條件。
  - [ ] `git diff --stat` 確認：`package.json` 未變、`hono-pickball/**` 未變、
        `lib/matchmaker/allocation.ts`／`pairing.ts`／`duplication.ts`／`candidates.ts`／
        `round-types.ts`／`components/matchmaker/PlayerTile.tsx` 皆零改動。
  - [ ] 合併後的 diff 仍在 proposal 的 What Changes／Impact 範圍內，沒有混進 M12 或 M14
        的東西。
  - [ ] `nextjs-pickball/lib/matchmaker/round.ts` 內新增的失敗代碼命名風格與既有四組
        （`SET_TARGET_SCORE_FAILURE_CODE`／`RESET_INCOMPLETE_MATCHES_FAILURE_CODE`／
        `VALIDATE_SCORE_FAILURE_CODE`／`SUBMIT_SCORE_FAILURE_CODE`）一致，皆以函式名前綴。
  - [ ] 全套 `pnpm test`／`pnpm -r exec tsc --noEmit`／`pnpm lint` 在最終狀態下皆通過。
- **SHALL NOT**: 重審單一 task 的細節（Stage 1／2 已涵蓋）。

## Escalation

- **同一群組被同一 reviewer 連續退回 3 次** → 升級 Implementer 的模型（`sonnet` → `opus`）
  後重新派工該群組。SHALL NOT 用同一個模型在同樣條件下重試——那只會得到同樣的結果。
- **Spec Reviewer 自身判斷前後不一致**（例如同一條 Scenario 這次過、下次不過）→ 代表規格
  本身有歧義，升級給人類澄清並把結論補進 design.md 的 Open Questions，SHALL NOT 由 reviewer
  自行選一個解釋繼續。
- **Code-Quality 與 Implementer 的風格分歧** → 既有 codebase 風格勝出。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **本 change 專屬的升級條件**：
  - Implementer 回報「`labelDoublesComposition` 的簽章與 design 假設不符」或「`round.ts`／
    `pairing.ts`／`CourtCard.tsx`／`MatchStage.tsx` 的實際內容與 design Context／Open
    Questions 記載不符」→ 依 design Open Questions 第 1、4 條把實際簽章與內容補記進
    design.md 後再繼續；若差異大到需要改動 `match-allocation` 的任何檔案，**升級給人類**，
    SHALL NOT 自行修改該 capability 的檔案。
  - Implementer 或 Reviewer 認為「隊伍分數該用平均而非總和」或有其他推翻 design Decision
    的主張 → **立即停止**，升級給人類。design Decision 2 是核心選型，牽動與
    `match-history` 送出比分時重算隊伍分數的一致性，SHALL NOT 由 subagent 自行改變。
  - 出現 `Worker "hono-pickball" not found` → 依 environment.md 的注意事項處理殘留 process，
    SHALL NOT 把 `~/.wrangler/registry` 不存在當成根因。

## Model selection principle

用**能勝任該角色的最弱模型**，以節省成本與時間，但 Implementer 一律 `sonnet`（見上方
Roles 的使用者硬性規定，不適用一般的「最弱模型」原則）。`sonnet`／`opus` 是 Claude 的層級
名稱，僅作為範例；在沒有這些層級的環境上，對應到最接近的「均衡／最強」兩檔。

## Commit 慣例

- Conventional Commits，繁體中文訊息。
- 逐 task commit（見上方紀律 4）：`test:` 與 `feat:` 分開，REFACTOR 有實際改動時另開
  `refactor:`。
- footer 一行 `Claude-Session: <session id>`（**不要編造 URL**），不得加 `🤖 Generated`
  或 `Co-Authored-By`。
