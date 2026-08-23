# Execution Plan — matchmaker-round-lifecycle（M4）

## Mode

`group-driven`

派工單位是 tasks.md 的 `§` 群組（章節）：**一個群組派出一個全新的 Implementer subagent**，不共用對話脈絡，一次做完該組所有 task。

- **組內仍逐 task 依序執行 TDD**：每個 task 先寫失敗測試並在 shell 實際看到紅燈，再寫最小實作至綠，再 refactor。紅燈誠實條款不變——加入時立即全綠者 MUST 如實標註為 regression guard，**SHALL NOT 用 mutation check（改斷言看紅再改回）偽造紅燈**。
- **兩階段審查改為逐組**：整組所有 task 完成後才跑 Stage 1（spec 合規，審整組）→ Stage 2（程式碼品質，審整組），不再每個 task 各跑一輪。
- **群組之間仍嚴格序列**，SHALL NOT 平行派工；同一時間只有一個 Implementer 在跑（並行會在同一個 worktree 互相踩）。
- **全部群組完成後的 Final Code Review 完全不變**（見下方 Final Code Reviewer）。

> 出處：2026-08-23 依使用者決定由逐 task 派工改為逐組派工以加速；M3（`matchmaker-rating-engine`）不適用，仍依原逐 task 制執行。

### 不派工的章節

tasks.md 共 10 個 `§` 章節，其中**只有 §1～§8 這 8 組會派出 Implementer**。另兩個章節不產生程式碼，處理方式如下：

- **§0 前置（準備，不產生任何程式碼）**：0.1～0.3 是「讀出 M3 評分 API 的實際簽章」、「把 `pickleball-guide-page` 的 delta 對齊為 union」、「依 environment.md 建立 worktree 並回填 baseline」三件事。這些**由 orchestrator（leader）自己執行**，SHALL NOT 派 Implementer；**不適用 TDD 三步、不跑 Stage 1／Stage 2 兩階段審查**。§0 全部完成並回填後才能派出第一個群組（§1）——0.1 的結果是 §6 的實作依據，0.3 的 worktree 是所有群組的工作場所。
- **§9 收尾驗證（純驗證，不產生程式碼）**：9.1～9.8 是錨點逐字核對、spec 重複檢查、`pnpm lint`／`typecheck`／`test`／`test:e2e`、`openspec validate --strict` 與改動檔案清單核對，內容與下方 Final Code Reviewer 的檢查清單重疊。因此 **§9 不另派工**，由 Final Code Reviewer 在其單次執行中一併完成，並回填 §9 各項的打勾與輸出。Final Code Reviewer「時機」一項所稱的「全部 checkbox 打勾」指的是 **§1～§8 的實作項目**。

## Per-group contract

Subagent **不繼承主對話的任何脈絡**，以下就是它拿到的全部內容。缺任何一項就必須由 orchestrator 補齊後重派，不要讓 subagent 自己去讀計畫檔（會讀到不屬於本群組的 task 而擴大改動範圍）——每一項都 MUST 貼出全文，**不可只給路徑要它自己讀**。

派工時 MUST 提供：

1. **tasks.md 中該群組所有 task 的完整原文**——該組每一組 RED 與 GREEN 成對貼出，一字不改（含 it 名稱與括號內的註記），並保留原本的先後順序。
2. **test-plan.md 中該組所有相關的列**——每一列的 `Test name` / `Scenario` / `Assertion` / `Why first` / `Tier` 五欄全給。`Test name` 就是要寫進 `it(...)` 的字串，逐字使用。
3. **相關的 spec.md 段落**——該群組觸及的**所有** Requirement 與其 Scenario 全文，不給整份 spec，也不給該組沒觸及的 capability。
4. **相關的 design.md 段落**——影響該群組任一 task 的 Decision 與 Risk 原文。例如所有涉及 `restCount` 的群組必附 Decision 1；涉及重排的必附 Decision 5；涉及 `submitScore` 的必附 Decision 6；涉及 `useRoundStore` 的必附 Decision 7 與 9。
5. **worktree 絕對路徑**：`/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-round-lifecycle`。subagent 在**這個既有的 worktree 內**工作，SHALL NOT 自己 `git worktree add`。
6. **可動檔案清單**——該群組允許新增或修改的檔案，明確列舉（涵蓋該組所有 task 的合計範圍）。清單外的檔案一律不得改動；需要改才做得到時回報 `NEEDS_CONTEXT` 或 `BLOCKED`，不要自行擴權。
7. **單檔測試指令原文**：`pnpm --filter ./nextjs-pickball test --run <path>`。**`--run` 前不可加 `--`**——加了 vitest 會收不到路徑而跑完整套，紅燈證據會被既有綠燈淹沒。
8. **明確的「不給」清單**（見下）。

明確**不給**：

- 其他群組的內容（避免順手實作下一組而讓 Stage 1 判為 scope creep）。
- 與本群組無關的 capability spec（例如寫 `history.ts` 的群組不給 `round-lifecycle` 的持久化 Requirement）。
- `overview.md`（人類用摘要，apply 階段不需要，且其 ASCII 圖容易被誤讀為實作規格）。
- `proposal.md` 的完整內容（只在群組需要判斷範圍邊界時，節錄「不在本次範圍」那一段）。
- 主 spec `openspec/specs/**` 的檔案——**唯一例外**是含「同步 hooks 歸屬清單」那個 task（8.2）的群組，也就是 **§8 store hook（useRoundStore）**，該群組 MUST 額外附上 `specs/pickleball-guide-page/spec.md` delta 全文與 design Decision 9，並明確界定「只准新增 `useRoundStore` → round-lifecycle 這一項，其他文字一個字都不准動」。

## Roles

### Implementer

- **default_model**: `haiku`
- **rationale**：多數 task 是「照著 test-plan 的斷言寫一個 it，再寫最小實作」，模式重複、輸入完整、判斷空間小。用最便宜的模型跑最多的 task，成本與速度都最好，且 Stage 1／Stage 2 兩道 review 會擋下品質問題。
- **upgrade_to_sonnet_when**：
  - 群組涉及**跨模組整合**——`submitScore`（§6 比分驗證與送出流程）、`useRoundStore`（§8 store hook）：需要同時抓住回合、名單、歷史三份資料的一致性。
  - 群組需要**接住既有模組的例外或轉換型別**——`Set` ↔ `string[]`（§4 的 4.1～4.2，以及 §5 的 5.7 把該轉換抽為共用輔助）、接住 `allocateRound` 對場地數拋出的 `Error`（§4 的 4.8～4.9）。
  - 同一個群組被同一個 reviewer 連續 2 次退回。
- **upgrade_to_opus_when**：
  - 同一個群組被同一個 reviewer 連續 3 次退回（見 Escalation）。
  - 群組被判定為「plan 本身有誤」而非實作有誤（例如 spec 的兩條 Scenario 互相矛盾）。
  - `resetIncompleteMatches`（§5 目標分數與重排未完成場次，見 5.3～5.6）：候選池重算、場地數扣除與基準合併三件事交纏，是本 change 邏輯密度最高的一段。
- **必做流程**：組內**逐 task 依序**跑完——寫 RED 測試 → 在 shell 實際跑單檔看到紅燈並**貼出輸出** → 寫最小 GREEN 實作 → 再跑看到綠燈 → 自我檢查 → commit；一個 task 收尾後才進下一個，SHALL NOT 把整組測試一次寫完再一次實作。
- **紅燈誠實規則**：若某條測試加入時**立即全綠**（regression guard），MUST 在回報中如實說明，並在 tasks.md 該項旁註記，**SHALL NOT 用 mutation check（改斷言看紅再改回）偽造紅燈**。真正需要驗證這類測試有沒有殺傷力時，用 mutation 驗證（改壞實作看紅、還原看綠）並附輸出——那是「證明改壞會紅」，與偽造紅燈是兩回事。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：只做「程式是否符合 spec」的比對，不需要架構判斷，但需要穩定的閱讀理解與抗「差不多就好」的定力。haiku 在這類任務上容易放行近似值；opus 是浪費。
- **必做的第一個動作**：複述它收到的 spec / test-plan 節錄的**標題**。若與被審的群組對不上，回報 `NEEDS_CONTEXT`，**不要**開始審——由 orchestrator 重組脈絡後重派。
- **檢查清單**（審整組，逐 task 檢過）：
  - [ ] 該群組宣稱覆蓋的 Scenario，其 WHEN／THEN 是否逐句都能在測試斷言中找到對應？
  - [ ] `it(...)` 的字串是否與 spec 的 `**驗收**` 錨點**逐字相同**（含全形括號與標點）？
  - [ ] 有沒有實作 spec 沒要求的東西（scope creep）？特別注意：有沒有偷跑 UI、有沒有實作 M6 的 `scoring` 產生時機、有沒有做歷史排序或篩選。
  - [ ] 有沒有漏掉 Requirement 正文裡的 `MUST` / `SHALL NOT`（那些不一定有對應 Scenario，但一樣是規格）？
  - [ ] 組內**每個** RED 的紅燈證據是否存在？若標為 regression guard，理由是否成立（被守護的行為在此之前是否真的已成立）？
  - [ ] 改動範圍是否落在該群組給的可動檔案清單內？
- **不看**：命名、結構、重複、可讀性——那是 Stage 2 的事，在 Stage 1 提出只會讓修正循環互相打架。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：本 change 的產出會被 M5～M8 四個 milestone 直接消費，schema 與函式簽章一旦定案就難改。邊界條件（`null` 的傳播、`Set`／陣列轉換、原子性的失敗路徑）也是最容易寫出「測試會過但實際會壞」的地方，值得用最強的模型。
- **必做的第一個動作**：同 Stage 1，先複述收到的節錄標題；對不上就回報 `NEEDS_CONTEXT`。
- **檢查清單**（審整組的合計 diff）：
  - [ ] 命名是否與既有 `lib/matchmaker/**` 一致（動詞開頭的純函式、`readXxx`／`writeXxx`／`clearXxx` 的儲存層命名）？
  - [ ] 有沒有與既有模組重複的邏輯？特別注意 `roundRating`（`rating-math.ts`）、`hasLocalStorage`（`storage-keys.ts`）——重寫一份就是 M2 踩過的同一個坑。
  - [ ] 邊界：空陣列、`null` 回合、`undefined` 欄位、`0` 比分、剛好一場的人數、`scoring` 狀態，是否都有明確處理而非靠巧合？
  - [ ] 錯誤處理：失敗路徑是否回傳可判讀的結果而非拋例外？訊息是否為繁體中文且說明修正方式（`prd.md` 第 11 節）？
  - [ ] 不可變性：是否有就地修改傳入的陣列或物件？（`sort` 前是否 `slice()`？）
  - [ ] 型別：`import type` 是否用於純型別匯入（`verbatimModuleSyntax`）？測試檔是否顯式 `import { describe, it, expect } from "vitest"`？
  - [ ] 註解是否為繁體中文，且解釋「為什麼」而非複述程式碼？
- **不看**：spec 對不對、要不要做這件事——Stage 1 已經處理過，在此重開會讓群組永遠收不了尾。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：跨群組的整合問題（同一概念兩個名字、兩個模組各寫一份同樣的轉換、合計 diff 超出 proposal 範圍）在單一群組視角下**看不見**，只有把全部 commit 攤開才會顯現。這正是 M2 第 4～6 批 review 抓到 `roundRating` 重複與死碼場地編號的那一類問題。
- **時機**：所有群組都完成、全部 checkbox 打勾之後，跑一次。
- **檢查清單**：
  - [ ] 命名與模式在 §1～§8（tasks.md 的全部實作群組，不含純前置的 §0 與純收尾驗證的 §9）之間是否一致？（例如失敗結果的形狀是否每個函式都用同一個 discriminated union？）
  - [ ] 有沒有兩個群組各自引入了同一段邏輯（`Set` ↔ 陣列的轉換、比分字串的 parse、勝方判定）？
  - [ ] 合計 diff 是否仍在 proposal 的 Impact 清單內？有沒有多出未申報的檔案？
  - [ ] `openspec/specs/pickleball-guide-page/spec.md` 的改動是否**只有**歸屬清單那一項？
  - [ ] 完整跑一次 `pnpm lint`、`pnpm typecheck`、`pnpm test`，輸出貼出。
  - [ ] delta spec 的每一個 `**驗收**` 錨點是否都能在實際測試檔中逐字對上（**以腳本比對，不靠目視**）？
- **不看**：單一群組內的細節——Stage 1／2 已經逐組審過。

## 模型選擇原則

用**能勝任該角色的最弱模型**，以節省成本並提高速度。`haiku` / `sonnet` / `opus` 是 Claude 的層級名稱，僅作為例子；在沒有這些型號的 host 上，對應到最接近的 fast / balanced / strongest 等價物即可。

## Escalation

- **同一個群組的 Implementer 被同一個 reviewer 連續退回 3 次** → 升級模型（haiku → sonnet → opus）後**整組重派**。**SHALL NOT 以相同模型、相同條件重派**——同樣的輸入只會得到同樣的輸出。
- **Spec Reviewer 自己的判斷前後不一致**（例如先放行再以同一理由退回）→ 這是 spec 本身有歧義的訊號，升級給人類做規格澄清，並把結論補進 design.md 的 `## Open Questions`。
- **Code-Quality Reviewer 與 Implementer 的風格分歧** → **既有 codebase 風格勝出**。本 change 的參照對象依序為：`lib/matchmaker/storage.ts`（儲存層）、`hooks/useRosterStore.ts`（store）、`lib/matchmaker/allocation.ts`（純函式入口）。
- **任一階段 BLOCKED 超過 30 分鐘** → 停下來，把 blocker 寫進 design.md 的 `## Open Questions`，回報人類。**SHALL NOT** 為了推進而簡化測試或跳過驗證。
- **M3 的評分 API 與本 change 的假設不符**（簽章或語意）→ 這不是 Implementer 能自行決定的事，一律回報 `BLOCKED` 並升級給人類：可能需要調整本 change 的 spec，也可能需要 M3 補一個 adapter。
- **`pickleball-guide-page` 的 delta 與當時的 `main` 已不一致**（別的 change 先合併並新增了 hook）→ 停下，依 design Decision 9 的緩解方式把 delta 全文重新對齊為 union（只加不刪）後再繼續，並在 tasks.md §0 註記實際對齊的內容。
