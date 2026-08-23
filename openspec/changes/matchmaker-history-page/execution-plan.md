## Mode

`group-driven`

派工單位是 tasks.md 的 `§` 群組（章節）：**一個群組派一個全新的 Implementer subagent**，由它一次做完該組所有 task。所有 subagent 共用 [environment.md](./environment.md) 宣告的**同一個 worktree**，SHALL NOT 各自另開 worktree。

- **組內仍逐 task 依序跑 TDD**：每個 task 先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor，完成一個才進下一個。紅燈誠實條款不變——測試加入後直接是綠的，MUST 誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**（root `CLAUDE.md` 明令禁止）。
- **兩階段審查改為逐組**：整組所有 task 完成後才依序跑 Stage 1（spec 合規，**審整組**）與 Stage 2（程式品質，**審整組**），不在組內逐 task 審。
- **群組之間仍嚴格序列**：依 tasks.md 的 `Depends on` 鏈 §1 → §2 → §3 → §4 → §5 → §6 逐組派工，**禁止平行派工**——各組都寫同一批檔案（`history-range.ts`、`matchmaker-history.spec.ts`），同檔案平行必衝突。
- **全部群組完成後的 Final Code Review 不變**（見 Roles 的 Final Code Reviewer）。

> 出處：2026-08-23 依使用者決定由逐 task 派工改為逐組派工以加速；M3（`matchmaker-rating-engine`）不適用，仍依原逐 task 制執行。

## Per-group contract

subagent **不繼承主對話的上下文**，以下是它拿到的全部資訊。派工時一律**貼全文**，SHALL NOT 只給檔案路徑要它自己去讀計畫檔。派工範圍為**整組**，以下七項都須涵蓋該組的**所有** task。

派工必附：

1. **tasks.md 該組章節的完整文字**——該組**每一個** task 逐字貼上，RED 與 GREEN 成對給（REFACTOR 則單獨給，見下方 REFACTOR 契約）。不得只給其中一半，也不得只挑該組的部分 task。
2. **test-plan.md 中該組對應的所有列**——每列的 Test name／Scenario／Assertion／Why first／Tier 五欄逐字貼上。Tier 決定測試要寫在哪：`unit` → `nextjs-pickball/lib/matchmaker/history-range.test.ts`；`e2e` → `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`。
3. **spec.md 的相關段落**——`specs/match-history/spec.md` 中該組所有 task 觸及的**每一條** `### Requirement:` 全文，含其下所有 `#### Scenario:`。只給這幾條，不給整份。
4. **design.md 的相關決策**——影響該組的 Decision 與 Risk 全文。對照表：
   - §1／§2 → Decision 1、2、3、8；Risk「DST 時區下不存在的午夜」
   - §3 → Decision 4；Risk「M4 的紀錄欄位識別字尚未定案」
   - §4 → Decision 5、7；Risk「E2E 需要能控制現在」「8.2 欄位很多，單筆卡片容易在窄螢幕爆版」
   - §5 → Decision 5、6、7；Risk「並行 milestone 同時在 M5 導覽加入口」
5. **worktree 絕對路徑**——`/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-history-page`。明確告知：在此目錄工作，**不要**自行 `git worktree add`。
6. **執行指令**——單檔 unit：`pnpm --filter ./nextjs-pickball test --run lib/matchmaker/history-range.test.ts`；e2e：`pnpm --filter ./nextjs-pickball test:e2e --grep "matchmaker-history"`。並附註 **`--run` 前不可加 `--`**。
7. **TDD 三步的明確指示**——組內**逐 task 依序**執行：先寫 RED 測試 → 在 shell 實際跑到紅燈並**貼出輸出** → 寫最小 GREEN 實作 → 重跑至綠 → 自我審查 → commit（每個 task 各自 commit），完成一個 task 才進下一個，SHALL NOT 把整組合併成一次紅燈。若測試加入後**直接是綠的**，MUST 在回報中誠實標註為 regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈（root `CLAUDE.md` 明令禁止）。

明確告知「**沒有給你的東西**」（避免 subagent 自行擴張範圍）：

- 其他群組的內容與進度。
- `match-history` 以外的 capability spec（`player-roster`、`match-allocation`、`site-navbar`、`scoreboard` 等）。
- M4／M5／M6／M8／M9 的 change 文件。需要 M4 的紀錄型別時，讀 worktree 內 `main` 已合併的**程式碼**，不讀其他 change 的計畫檔。
- 修改 `openspec/specs/` 下主 spec 的權限——**任何情況下都不得修改主 spec**。
- 修改本 change 以外任何 openspec 檔案的權限。

REFACTOR 契約（與 RED／GREEN 不同）：只重構、**不得改變任何行為**、全套測試維持綠燈、commit 訊息為 `refactor: <描述>`；因沒有 spec 可見的行為變動，Stage 1 不審 REFACTOR 的成果，它只併入該組的 Stage 2 一起審。

## Roles

### Implementer

- **default_model**: `haiku`
- **rationale**：本 change 的實作單元都很小——`history-range.ts` 是四個純函式、元件是無狀態呈現層，且每個 task 都已被 test-plan 指定了確切的測試名稱與斷言。這種「規格已收斂到斷言層級」的工作用最快的模型即可。
- **upgrade_to_sonnet_when**：
  - 群組為 §4／§5（React 元件、Playwright 假時鐘、hydration 時序）——這些牽涉框架行為而非單純函式。
  - 同一個群組被任一 reviewer 退回 **2 次**。
  - Implementer 回報 `NEEDS_CONTEXT` 兩次仍無法收斂。
- **upgrade_to_opus_when**：
  - 同一個群組被任一 reviewer 退回 **3 次**（見 Escalation）。
  - 群組需要同時調整區間演算法與元件行為（本 change 的分組刻意避免此情況；若真的出現，代表分組有誤，應先考慮拆組）。
- **自我審查清單（commit 前自查）**：
  - 紅燈輸出已貼出；若是 regression guard 已誠實標註。
  - 測試名稱與 test-plan 的 Test name **逐字相同**（含全形標點）。
  - `import type` 用於純型別匯入（`verbatimModuleSyntax` 已開啟）。
  - 測試檔顯式 `import { describe, it, expect } from "vitest"`（本 workspace 的 `types` 不含 `vitest/globals`）。
  - 沒有新增任何 npm 相依。
  - 沒有碰 `openspec/specs/`、沒有碰其他 change 的檔案。

### Spec Reviewer (Stage 1)

- **default_model**: `sonnet`
- **rationale**：需要把程式碼與 requirement 對讀並判斷「有沒有偷偷多做／少做」，是理解取向而非生成取向的工作；`haiku` 容易漏掉語意層的偏差，`opus` 在這個粒度上是浪費。
- **必要的第一個動作**：先**複述**自己收到的 spec／test-plan 段落標題。若與待審的群組不符，回報 `NEEDS_CONTEXT` 而**不要**開始審查（由 orchestrator 重組上下文後重新派工）。
- **審查清單**（對該組**每一個** task 逐條走過）：
  - 每個 RED 測試是否確實對應 test-plan 指定的那個 `#### Scenario:`？
  - 該組觸及的每一條 requirement 中被本組涵蓋的 Scenario 是否**全部**有對應斷言？
  - 有沒有 scope creep——做了 spec 沒要求的事？特別盯：新增匯出功能（屬 M8）、寫入歷史（屬 M4）、改 `site-navbar`（屬 M5）、新增 `hooks/` 檔案（design Decision 5 明確排除）。
  - 測試名稱是否與 spec 的「驗收」錨點逐字相符？
  - 「今日上界為 `+∞`」「週起始為週一」「切點取當地時區」這三條規格承諾有沒有被實作偷偷改掉？
- **不看**：命名風格、檔案結構、重複程式碼、可讀性——那是 Stage 2 的職責。

### Code-Quality Reviewer (Stage 2)

- **default_model**: `opus`
- **rationale**：日期邊界、半開區間與 hydration 時序的錯誤都**不會讓測試變紅**，只會在特定日期或特定裝置上出錯。抓這種「測試沒覆蓋到但確實是 bug」的能力需要最強的模型。
- **必要的第一個動作**：同 Stage 1——先複述收到的段落標題，不符則回報 `NEEDS_CONTEXT`。
- **審查清單**（審該組完成後的整段 diff）：
  - 日期運算是否一律走當地時區的 `getFullYear/getMonth/getDate/getDay`，沒有混入 `getUTC*` 或字串切片？
  - `sort` 前是否已 `slice()` 複製？有沒有原地改到輸入？
  - 對戰時間的取值是否集中在單一 `recordTime()`（design Decision 4）？
  - 有沒有在 render 期間呼叫 `new Date()`／`Date.now()`／`localStorage`（design Decision 7）？
  - 錯誤與空狀態文案是否為繁體中文且說明下一步（`prd.md` 11）？
  - 勝方是否只靠顏色區分（`prd.md` 12.5 禁止色彩為唯一資訊來源）？
  - 與既有 `lib/matchmaker/` 的風格是否一致（具名常數、JSDoc、`as const`）？
  - 測試斷言是否夠有殺傷力——把實作改壞後這個測試會不會變紅？必要時直接做一次 mutation 驗證。
- **不看**：spec 本身對不對（Stage 1 已審過），也不重新討論 design 的決策。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：所有 task 完成後看整份 diff，需要跨 task 的整體判斷。
- **時機**：全部 checkbox 完成後執行一次。
- **審查清單**：
  - 跨 task 的命名是否一致（區間鍵值、元件檔名、testid 命名）？
  - §1～§3 的純函式與 §4～§5 的元件之間有沒有重複實作同一段邏輯（例如元件裡又寫了一次日期比較）？
  - 合併後的 diff 是否仍落在 proposal 的範圍內——沒有偷渡匯出功能、沒有改寫入端、沒有動 `site-navbar`、沒有新增 `hooks/` 檔案？
  - 新增檔案清單是否與 proposal 的 Impact 表格一致？多出來的檔案要能解釋。
  - 全套 `pnpm test` 與 `pnpm test:e2e` 是否綠燈，且既有 capability 的測試未被影響？
- **不看**：單一 task 的細節（Stage 1／2 已覆蓋）。

## Escalation

- **同一個 reviewer 連續退回同一個群組 3 次** → 升級 Implementer 的模型（`haiku` → `sonnet` → `opus`）後重新派工該組。**SHALL NOT 以相同模型、相同上下文重複派工**。
- **Spec Reviewer 自身判斷前後不一致**（同一段程式碼兩次審查結論相反）→ 停止，交由人類釐清 spec 語意，必要時把爭點寫進 design.md 的 `## Open Questions`。
- **Code-Quality Reviewer 與 Implementer 的風格分歧** → **既有 codebase 風格勝出**。本 change 的基準是 `lib/matchmaker/` 既有模組與 `components/matchmaker/` 既有元件。
- **任一階段 BLOCKED 超過 30 分鐘** → 停止，回報人類，並把 blocker 記進 design.md 的 `## Open Questions`。
- **踩到 Open Questions 列的未定案項**（M4 欄位命名、M4 reader 是否回報損壞筆數、M5 導覽形狀、雙打組成文案）→ 依 Open Questions 的指示處理：可從 `main` 的程式碼直接確認的，確認後照做並回填該節；無法確認的，停止並回報，SHALL NOT 自行臆測後繼續實作。
- **發現分組有誤**（同一組同時要求改演算法與改元件）→ 停止並回報，由 orchestrator 拆組，不要硬做。

## 模型選擇原則

用**能勝任該角色的最弱模型**以節省成本與時間。`haiku` / `sonnet` / `opus` 是 Claude 的層級名稱，僅作為快／均衡／最強的代稱；在沒有這些模型的宿主上，對應到最接近的三個層級即可。
