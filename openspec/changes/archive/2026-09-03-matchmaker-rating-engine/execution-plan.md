# execution-plan（matchmaker-rating-engine / M3）

## Mode

`subagent-driven`

每個 task 派一個**全新的 subagent**執行，執行完依序走 Stage 1（spec 合規）與 Stage 2（程式碼品質）兩段審查，全部 task 完成後再跑一次 Final Code Review。**禁止平行派工 Implementer**——本 change 的 20 個 task 幾乎全部寫入同一個 `rating.ts` 與同一個 `rating.test.ts`，平行必衝突。

## Per-task contract

Subagent **不繼承主對話的任何脈絡**，以下就是它拿到的全部。每一項都要**貼完整原文**，不可只給檔案路徑要它自己去讀（schema apply 的 Forbidden 明列此點）。

| 項目 | 內容 | 來源 |
|---|---|---|
| 1. Task 全文 | tasks.md 中該編號的 **RED + GREEN 配對全文**（含所有 ⚠️ 標註）。REFACTOR task 則貼該行全文 | `tasks.md` |
| 2. test-plan 對應列 | 該 task 要寫的每個 it 在 test-plan 的整列：Test name／Scenario／Assertion／Why first／Tier，以及檔頭的「測試檔與 Tier 慣例」全段 | `test-plan.md` |
| 3. spec 段落 | 該 task 觸及的 Requirement 全文（含其所有 `#### Scenario` 與「驗收」錨點）。**只給觸及的那幾條**，不給整份 spec | `specs/match-rating/spec.md` |
| 4. design 段落 | 影響該 task 的 Decision 與 Risk 全文（例如 clamp 相關 task 要給 Decision 5、6、7 與「觸界者 delta 為 0」那條 Risk） | `design.md` |
| 5. Worktree path | `/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-rating-engine`，並明確指示「在這個既有 worktree 內工作，**不要另開 worktree**」 | `environment.md` |
| 6. 專案硬規則 | ① TDD 三步：先寫失敗測試並在 shell **實際看到紅燈**（貼出輸出）→ 最小實作至綠 → refactor ② 單檔測試指令 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/rating.test.ts`，**`--run` 前不可加 `--`** ③ it 名稱必須與 spec 的「驗收」錨點**逐字一致** ④ 測試檔必須顯式 `import { describe, it, expect } from "vitest"`（`tsconfig` 的 `types` 不含 `vitest/globals`） ⑤ `verbatimModuleSyntax` 已開啟，型別匯入用 `import type` ⑥ 註解與錯誤訊息用繁體中文 | root `CLAUDE.md`、`nextjs-pickball/CLAUDE.md` |
| 7. 紅燈誠實條款 | 若該 task 的 it 在寫入當下就是綠燈，**如實回報並在 tasks.md 該行標註 regression guard**。**嚴禁**用「先改斷言看紅、再改回」偽造紅燈 | root `CLAUDE.md` |

**明確告知「不給」的東西**（避免 subagent 自行擴權或猜測）：

- 其他 task 的內容與進度
- `player-roster`、`match-allocation`、`scoreboard` 等其他 capability 的 spec 全文（只在該 task 需要時給 `PLAYERS_PER_MATCH`、`PlayerSchema` 的相關片段）
- `proposal.md` 與 `overview.md`（動機與人類摘要，實作用不到）
- 修改 `openspec/specs/` 下主 spec 的權限——**任何 subagent 都不得改主 spec**
- 修改 `rating-math.ts`、`types.ts`、`allocation-types.ts` 等既有檔案的權限——本 change 對它們**唯讀**（proposal Impact 已列）

## Roles

模型選擇原則：**用能勝任該角色的最弱模型**，以節省成本並加快速度。`haiku` / `sonnet` / `opus` 為 Claude 的階層名稱，在沒有這些名稱的 host 上請對應到最快 / 平衡 / 最強的等價模型。

### Implementer

- **default_model**: `haiku`
- **rationale**: 本 change 的每個 task 都很窄——寫 2～6 個 it、再寫一段十幾行的純函式，沒有跨檔重構、沒有非同步、沒有框架 API。數學公式已在 spec 與 design 寫成可直接照抄的形式（連期望數值都寫死了），不需要模型自行推導。
- **upgrade_to_sonnet_when**:
  - 同一個 task 被 Stage 1 或 Stage 2 連續退回 2 次
  - task 涉及浮點與四捨五入的交互（§6 clamp 群組）而回報數值對不上 spec 寫死的期望值
  - 回報 `NEEDS_CONTEXT` 兩次以上，且補脈絡後仍卡住
- **upgrade_to_opus_when**:
  - 連續退回 3 次（見 Escalation）
  - 回報 spec 與 design 之間有矛盾，且該矛盾無法用「照 spec 寫」解決
- **self-review checklist**（交件前自己先過一遍）:
  - [ ] 紅燈輸出已貼進回報（或明確標註為 regression guard 並說明原因）
  - [ ] 綠燈輸出已貼進回報，且是**整個 `rating.test.ts`** 的結果而非單一 it
  - [ ] it 名稱與收到的 spec「驗收」錨點逐字一致（含全形逗號、波浪號）
  - [ ] 沒有動到 task 範圍外的檔案
  - [ ] 沒有為了讓測試變綠而放寬斷言

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**: 需要逐條比對「程式碼行為 vs Requirement 文字」並判斷是否有 scope creep，這是理解型工作但不需要最強推理；`haiku` 容易把「大致有做」判成通過，`opus` 在此屬過度配置。
- **required first action**: 先**複述**自己收到的 spec／test-plan 段落標題。若與被審的 task 對不上，回報 `NEEDS_CONTEXT`，**不要**開始審查。
- **checklist**:
  - [ ] task 涉及的每個 `#### Scenario` 都有對應的 it，且 it 名稱與「驗收」錨點逐字一致
  - [ ] 斷言的期望值與 spec 寫死的數字一致（例如 `4.15`／`3.85`、`0.20`／`0.02`、`8.00` 且 delta `0.05`）
  - [ ] 沒有實作 spec 沒要求的東西（scope creep）——特別注意：**不得**出現任何 LocalStorage 讀寫、`gamesPlayed` 累加、比分驗證、平局路徑
  - [ ] 非法輸入是 `throw` 而非夾值或回傳預設值
  - [ ] 標為 regression guard 的 it，其「立即綠燈」的說明合理（是前一個 GREEN 的必然結果），而非掩飾漏寫實作
- **不看**：命名、檔案結構、重複、可讀性——那是 Stage 2 的事。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**: 本 change 最容易出的錯是**看起來對但數學錯**（雙打誤用總和、`E` 算反、round 與 clamp 順序顛倒、`delta` 回傳理論值），這些都不會讓測試變紅——因為測試也可能被同一個誤解寫錯。需要最強模型獨立驗算，而非只看程式碼長得漂不漂亮。
- **required first action**: 同 Stage 1，先複述收到的段落標題，對不上就回報 `NEEDS_CONTEXT`。
- **checklist**:
  - [ ] **獨立驗算**至少一組期望值（不看實作，自己用公式算一遍再比對）
  - [ ] 兩位小數規則沿用 `rating-math.ts` 的 `roundRating`，沒有另寫一份 `Math.round(x*100)/100`
  - [ ] 每隊人數由 `PLAYERS_PER_MATCH` 推導，沒有寫死 1／2
  - [ ] 常數沒有在函式內被複製成 magic number
  - [ ] 邊界處理無 off-by-one：`1` 與 `8` 本身是合法輸入（inclusive）
  - [ ] 錯誤訊息為繁體中文、說明修正方式並附實際輸入值（對齊 `allocation.ts` 既有寫法）
  - [ ] 註解用繁體中文，且解釋「為什麼」而非重述程式碼
  - [ ] 與 `lib/matchmaker/` 既有模組的風格一致（純函式、`readonly` 型別、不就地修改輸入）
- **不看**：spec 本身對不對——Stage 1 已審過，不重新開庭。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**: 20 個 task 分散在 8 個群組，跨 task 的一致性問題（同一個概念在不同 task 被取了兩個名字、驗證邏輯被複製兩份、`rating.test.ts` 的 fixture 各寫各的）只有在看完整組 commit 時才看得出來。
- **timing**: 所有 task 的 checkbox 都打勾之後，跑一次。
- **checklist**:
  - [ ] 全套測試綠燈：`pnpm --filter ./nextjs-pickball test --run`
  - [ ] 型別檢查綠燈：`pnpm -r exec tsc --noEmit`
  - [ ] ESLint 綠燈：`pnpm --filter ./nextjs-pickball lint`
  - [ ] 跨 task 命名一致（例如全程用 `winnerIndex` 而非有時 `winner`、有時 `winningTeam`）
  - [ ] 沒有兩個 task 各自引入一份重複的驗證或計算邏輯
  - [ ] `rating.test.ts` 的測試資料由**單一** fixture helper 產生，不是每個 describe 各造一份
  - [ ] 合併後的 diff 仍落在 proposal 的範圍內：只新增 `rating.ts`、`rating-types.ts`、`rating.test.ts`，**沒有動到** `rating-math.ts`、`types.ts`、`allocation-types.ts`、`roster.ts`、`storage.ts`、`colors.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`allocation.ts`、`hooks/**`、`app/**`
  - [ ] `openspec/specs/` 下的主 spec 完全未被修改
  - [ ] tasks.md 中所有 regression guard 標註都有對應的實測紀錄，沒有「說要標註但沒標」的空頭承諾
- **不看**：單一 task 的細節——Stage 1／2 已覆蓋。

## Escalation

- **同一個 reviewer 連續退回 3 次**（N = 3）→ 升級 Implementer 的模型（`haiku` → `sonnet` → `opus`）並重新派工。**禁止**在條件不變的情況下用同一個模型重派。
- **Spec Reviewer 自我判斷不一致**（同一段程式碼兩次審查給出相反結論）→ 停下來，把矛盾寫進 `design.md` 的 `## Open Questions`，交給人類澄清 spec，不要讓 Implementer 猜。
- **Code-Quality Reviewer 與 Implementer 的風格分歧** → **既有 codebase 風格獲勝**。本 change 的參照對象依序為：`lib/matchmaker/allocation.ts`（錯誤訊息與入口函式）、`lib/matchmaker/pairing.ts`（純函式與 `readonly` 型別）、`lib/matchmaker/rating-math.ts`（註解密度與「為什麼」的寫法）。
- **任一階段 BLOCKED 超過 30 分鐘** → 停止，記錄阻塞原因到 `design.md` 的 `## Open Questions`，回報人類。
- **Implementer 回報「無法在不改斷言的情況下讓測試變綠」** → **不得**改斷言。先確認 spec 寫死的期望值是否算錯（人工驗算一次）；若 spec 確實有誤，這是 spec 的問題，走上一條的人類澄清路徑，並在 `design.md` 記錄；若 spec 無誤，則是實作問題，升級模型重派。
- **任何 subagent 要求修改 `openspec/specs/` 下的主 spec、或要求修改本 change 以外的其他 change** → 一律拒絕並回報人類。主 spec 只在 archive 階段更新（root `CLAUDE.md` 的不可省略規則）。
