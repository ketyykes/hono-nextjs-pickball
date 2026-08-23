# execution-plan（quick-rating-spec-backfill）

## Mode

`subagent-driven`

每個 task 派一個**全新的 subagent** 執行，執行完依序走 Stage 1（spec 合規）與 Stage 2（程式碼品質）兩段審查，全部 task 完成後再跑一次 Final Code Review。**禁止平行派工 Implementer**——§1 的四個 task 全部寫入同一個 `PlayerForm.test.tsx`，§2 全部寫入同一個 `player-roster.spec.ts`，平行必衝突。

本 change 只有 6 個 task，且全部是 regression guard，但**兩段審查一個都不能省**（schema apply 的 Forbidden 明列）——恰恰因為沒有真紅燈把關，審查是唯一能發現「測試寫得太寬鬆、其實什麼都沒守到」的環節。

## Per-task contract

Subagent **不繼承主對話的任何脈絡**，以下就是它拿到的全部。每一項都要**貼完整原文**，不可只給檔案路徑要它自己去讀（schema apply 的 Forbidden 明列此點）。

| 項目 | 內容 | 來源 |
|---|---|---|
| 1. Task 全文 | tasks.md 中該編號的 **RED + GREEN 配對全文**（含所有 ⚠️ 標註與該群組檔頭的說明段） | `tasks.md` |
| 2. test-plan 對應列 | 該 task 要寫的每個 it／test 在 test-plan 的整列：Test name／Scenario／Assertion／Why first／Tier，**以及檔頭的「⚠️ 本 change 的 5 個測試全部是 regression guard」與「測試檔與 Tier 慣例」兩段全文** | `test-plan.md` |
| 3. spec 段落 | `### Requirement: 快速帶入強度分數` 全文（含全部 5 個 `#### Scenario` 與「驗收」錨點）。本 change 只有這一條 Requirement，整條給滿 | `specs/player-roster/spec.md` |
| 4. design 段落 | Decision 2（測試放元件層的理由）、Decision 3（紅燈誠實處理）、Decision 4（用 user-event 不用 fireEvent）、Decision 5（E2E helper 選填參數）全文，以及 Risks 的第 1 項（happy-dom + Radix `Select`）與第 6 項（斷言必須寫死字面值） | `design.md` |
| 5. 被測元件原文 | `nextjs-pickball/components/matchmaker/PlayerForm.tsx` 的**完整原始碼**（本 change 對它唯讀，但測試必須依它的實際 DOM 結構、`aria-label`、`Label`／`htmlFor` 關係撰寫）。§2 的 task 另加 `tests/e2e/specs/player-roster.spec.ts` 全文與 `PlayerCard.tsx` 顯示強度那一行 | 程式碼 |
| 6. Worktree path | `/Users/m2_24gb/Desktop/project/pickball-worktrees/quick-rating-spec-backfill`，並明確指示「在這個既有 worktree 內工作，**不要另開 worktree**」 | `environment.md` |
| 7. 專案硬規則 | ① TDD 三步：先寫測試 → 在 shell **實際執行** → 最小實作至綠 → refactor ② 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run components/matchmaker/PlayerForm.test.tsx`，**`--run` 前不可加 `--`** ③ it／test 名稱必須與 spec 的「驗收」錨點**逐字一致**（含全形逗號、波浪號） ④ 測試檔必須顯式 `import { describe, it, expect, vi } from "vitest"`（`tsconfig` 的 `types` 不含 `vitest/globals`，省略會讓 root Stop hook 的 `tsc --noEmit` 擋下） ⑤ repo **沒有** `@testing-library/jest-dom`，不可用 `toBeInTheDocument()` ⑥ `verbatimModuleSyntax` 已開啟，型別匯入用 `import type` ⑦ 註解用繁體中文 ⑧ 編輯前端檔會觸發 root 的逐檔 ESLint hook，錯誤以 exit 2 擋下——被擋時先讀 lint 輸出，不是工具故障 | root `CLAUDE.md`、`nextjs-pickball/CLAUDE.md` |
| 8. **紅燈誠實條款（本 change 的核心）** | 本 change 的 5 個測試**全部預期直接綠燈**（行為早在 M1 實作完成）。請如實回報實測輸出並在 tasks.md 該行標註 `regression guard`。**嚴禁**用「先改斷言看紅、再改回」偽造紅燈，**也嚴禁**先刪掉 `RATING_PRESETS` 製造紅燈再加回來。若實測**意外為紅燈**，代表實作與 spec 有出入——以 spec 為準修正 `PlayerForm.tsx`，並在回報中明確指出落差 | root `CLAUDE.md`、`design.md` Decision 3 |

**明確告知「不給」的東西**（避免 subagent 自行擴權或猜測）：

- 其他 task 的內容與進度。
- `player-roster` 的其餘 7 條既有 Requirement 全文（本 change 不碰它們；`rating` 的 1.00～8.00 定義域只在需要時給那一行）。
- 其他 capability（`match-rating`、`match-allocation`、`round-lifecycle`、`scoreboard` 等）的 spec。
- `proposal.md` 與 `overview.md`（動機與人類摘要，寫測試用不到）。
- **修改 `nextjs-pickball/components/matchmaker/PlayerForm.tsx` 的權限**——本 change 對它**唯讀**（唯一例外：RED 實測意外紅燈時，依條款 8 以 spec 為準修正，且必須在回報中明說）。
- **修改 `openspec/specs/` 下主 spec 的權限**——任何 subagent 都不得改主 spec。
- 修改 `tests/setup.ts`、`vitest.config.ts`、`package.json` 的權限——本 change 不動測試基礎建設，也不新增依賴（design Risks 第 1 項已給出「stub 寫在測試檔內」的替代路徑）。
- 修改 `components/matchmaker/` 其餘元件、`lib/**`、`hooks/**`、`app/**` 的權限。

## Roles

模型選擇原則：**用能勝任該角色的最弱模型**，以節省成本並加快速度。`haiku` / `sonnet` / `opus` 為 Claude 的階層名稱，在沒有這些名稱的 host 上請對應到最快 / 平衡 / 最強的等價模型。

### Implementer

- **default_model**: `haiku`
- **rationale**: 每個 task 只是「用 `@testing-library/react` 掛載一個元件、點幾顆按鈕、斷言輸入框的值」。沒有演算法、沒有新產品程式碼、沒有非同步協調；被測元件的完整原始碼會隨 contract 附上，DOM 結構不需要模型自行推導。斷言的期望值（`"1.00"`／`"3.00"`／`"5.00"`／`4.25`）在 spec 與 test-plan 已寫死。
- **upgrade_to_sonnet_when**:
  - 同一個 task 被 Stage 1 或 Stage 2 連續退回 2 次。
  - 回報「元件在 happy-dom 掛載即拋錯」（Radix `Select` 相關，見 design Risks 第 1 項）——這需要判斷 stub 的最小範圍，`haiku` 容易直接去改 `tests/setup.ts`（越權）。
  - 回報 `NEEDS_CONTEXT` 兩次以上，且補脈絡後仍卡住。
- **upgrade_to_opus_when**:
  - 連續退回 3 次（見 Escalation）。
  - 回報 spec 與實作有出入且無法判斷該改哪一邊。
- **self-review checklist**（交件前自己先過一遍）:
  - [ ] 實測輸出已貼進回報，**且如實標明是綠燈還是紅燈**（本 change 預期全綠）
  - [ ] 綠燈輸出是**整個測試檔**的結果，不是單一 it
  - [ ] it／test 名稱與收到的 spec「驗收」錨點逐字一致
  - [ ] **沒有動到 `PlayerForm.tsx`**（`git diff --stat` 確認）
  - [ ] 沒有為了讓測試變綠而放寬斷言；期望值是寫死的字面值，不是從 `RATING_PRESETS` 反查
  - [ ] 沒有用任何方式偽造紅燈

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 需要逐條比對「測試斷言 vs Requirement 文字」，並判斷 regression guard 的標註是否誠實。這是理解型工作但不需最強推理；`haiku` 容易把「有 render 有斷言」判成通過，`opus` 在此屬過度配置。
- **required first action**: 先**複述**自己收到的 spec／test-plan 段落標題。若與被審的 task 對不上，回報 `NEEDS_CONTEXT`，**不要**開始審查。
- **checklist**:
  - [ ] task 涉及的每個 `#### Scenario` 都有對應的 it／test，且名稱與「驗收」錨點逐字一致
  - [ ] 斷言涵蓋 Scenario 的 **THEN 與 AND 兩段**（例如「連點三顆、後點者覆蓋」不能只點一顆就算數）
  - [ ] **標為 regression guard 的每一列都有實測輸出**，且輸出確實是綠燈；沒有出現「改斷言看紅再改回」或「暫時刪掉 `RATING_PRESETS`」的痕跡（檢查回報敘述與 git log）
  - [ ] 沒有測 spec 沒要求的東西（scope creep）——特別注意：**不得**出現對姓名／性別／漸層／`colorCustomized`／zod 錯誤訊息文案的斷言，那些屬其他 Requirement
  - [ ] **`PlayerForm.tsx` 未被修改**；若確有修改，必須附「RED 實測為紅燈」的證據與落差說明
- **不看**：命名、檔案結構、重複、可讀性——那是 Stage 2 的事。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 本 change 最容易出的錯是**測試看起來有寫、其實什麼都沒守到**——用 `getByRole("button")` 抓到錯的按鈕（Dialog 內「新增參賽者」送出鈕與頁首同名，`PlayerForm` 內也有「取消」）、斷言 `input.value` 抓到 `type="color"` 那兩個 input、或把期望值寫成 `preset.value.toFixed(2)` 讓實作與測試共用同一個真相來源。這些都不會讓測試變紅，需要最強模型獨立檢視選取器與斷言的實際效力。
- **required first action**: 同 Stage 1，先複述收到的段落標題，對不上就回報 `NEEDS_CONTEXT`。
- **checklist**:
  - [ ] **選取器精確**：強度分數輸入框以 `Label`「強度分數」的關聯取得（`getByLabelText`），不是 `container.querySelector("input")`；按鈕以可及名稱取得
  - [ ] **期望值為寫死的字面值**（`"3.00"`、`4.25`），**不是**從 `RATING_PRESETS` 或元件內部常數推導（design Risks 第 6 項）
  - [ ] `onSubmit` 用 `vi.fn()`，並斷言**呼叫次數**與**收到的參數**，不是只斷言「有被呼叫」
  - [ ] 互動用 `@testing-library/user-event` 且 `await`；沒有殘留手動 `act(...)` 包裝（design Decision 4）
  - [ ] 沒有動 `tests/setup.ts`／`vitest.config.ts`／`package.json`；若加了 Radix 相關 stub，確認它寫在測試檔內並有繁中註解說明原因
  - [ ] 測試資料由**單一** fixture／helper 產生，四個 it 不各造一份 props
  - [ ] 註解用繁體中文，且解釋「為什麼」而非重述程式碼；風格對齊既有的 `components/guide/shared/PriceStars.test.tsx` 與 `tests/e2e/specs/player-roster.spec.ts`
  - [ ] E2E task：helper 的新參數為**選填**且預設值為 `"新手 1.00"`，既有 4 個 test 的呼叫端一字未改
- **不看**：spec 本身對不對——Stage 1 已審過，不重新開庭。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: task 數少，但本 change 的成敗完全取決於「這 5 個測試是否真的讓三種改壞方式變紅」。這個判斷只能在看完整組 commit 後做一次整體檢視——而且它是**唯一**會實際去驗證「測試有效性」的環節（本 change 沒有真紅燈可以當證據）。
- **timing**: 所有 task 的 checkbox 都打勾之後，跑一次。
- **checklist**:
  - [ ] 全套前端測試綠燈：`pnpm --filter ./nextjs-pickball test --run`
  - [ ] 型別檢查綠燈：`pnpm -r exec tsc --noEmit`
  - [ ] ESLint 綠燈：`pnpm --filter ./nextjs-pickball lint`
  - [ ] E2E 綠燈：`pnpm test:e2e`（五個 browser project；前後端 webServer 會自動帶起。若沙箱擋住 workerd 的 `listen EPERM`，放行後重跑，那不是設定錯誤）
  - [ ] **測試有效性的思想實驗**（只用讀的，**不要**真的去改產品程式碼）：逐一設想 ① `RATING_PRESETS` 砍成兩組 ② `toFixed(2)` 換成 `String(value)` ③ 拿掉 `type="button"`——確認每一種都至少有一個 it 會失敗，並在回報中指名是哪一個
  - [ ] 跨 task 命名與風格一致（四個 it 的 render helper、props fixture 共用同一份）
  - [ ] `git diff --stat` 只顯示兩個檔案：`components/matchmaker/PlayerForm.test.tsx`（新增）、`tests/e2e/specs/player-roster.spec.ts`（修改）
  - [ ] `openspec/specs/` 下的主 spec 完全未被修改
  - [ ] tasks.md 中所有 regression guard 標註都有對應的實測紀錄，沒有「說要標註但沒標」的空頭承諾
  - [ ] 標為 `skipped` 的 GREEN task，其理由是「RED 實測為綠、無事可做」，而非掩飾漏做
- **不看**：單一 task 的細節——Stage 1／2 已覆蓋。

## Escalation

- **同一個 reviewer 連續退回 3 次**（N = 3）→ 升級 Implementer 的模型（`haiku` → `sonnet` → `opus`）並重新派工。**禁止**在條件不變的情況下用同一個模型重派。
- **Spec Reviewer 自我判斷不一致**（同一段程式碼兩次審查給出相反結論）→ 停下來，把矛盾寫進 `design.md` 的 `## Open Questions`，交給人類澄清 spec，不要讓 Implementer 猜。
- **Code-Quality Reviewer 與 Implementer 的風格分歧** → **既有 codebase 風格獲勝**。本 change 的參照對象依序為：`components/guide/shared/PriceStars.test.tsx`（元件測試的斷言風格與中文 it 名稱）、`tests/e2e/specs/player-roster.spec.ts`（E2E 結構與註解密度）、`hooks/useRosterStore.test.tsx`（matchmaker 領域的測試資料寫法）。
- **任一階段 BLOCKED 超過 30 分鐘** → 停止，記錄阻塞原因到 `design.md` 的 `## Open Questions`，回報人類。
- **Implementer 回報「測試在寫入當下就是綠燈」** → **這是預期結果，不是阻塞**。要求它貼出綠燈輸出、在 tasks.md 該行標註 `regression guard`，直接進 Stage 1。**不得**要求它「想辦法弄出紅燈」。
- **Implementer 回報「RED 實測是紅燈」** → 這代表實作與 spec 有出入。先人工比對 `PlayerForm.tsx` 與 delta spec：若是 spec 寫錯（例如把級別分數寫錯），走人類澄清路徑並修 spec；若是實作確有缺口，授權該 task 修改 `PlayerForm.tsx`（此時 GREEN 是真的 GREEN），並回頭更新 `proposal.md` 的「產品程式碼預期 0 行 diff」。
- **Implementer 要求修改 `tests/setup.ts`／`vitest.config.ts`／`package.json`** → 一律拒絕。happy-dom 缺 API 的緩解方式是「stub 寫在 `PlayerForm.test.tsx` 檔內」（design Risks 第 1 項）。
- **任何 subagent 要求修改 `openspec/specs/` 下的主 spec、或要求修改本 change 以外的其他 change** → 一律拒絕並回報人類。主 spec 只在 archive 階段更新（root `CLAUDE.md` 的不可省略規則）。
