# Execution Plan — matchmaker-scoreboard-binding

## Mode

`subagent-driven`

每個 task 由**全新** subagent 執行；subagent **不繼承**主對話的任何脈絡。因此下方「Per-task contract」列出的內容必須由 orchestrator **逐字貼入** dispatch 訊息，SHALL NOT 只給檔案路徑要 subagent 自己去讀 plan 檔（schema 的 Forbidden 明列此項）。

同一時間只派一位 Implementer，SHALL NOT 平行派工——本段的任務高度集中在 `lib/scoreboard/`、`hooks/useScoreboardStore.ts` 與 M5 的場地區塊元件，平行必然互撞。

## Per-task contract

每位 Implementer subagent 收到且**只**收到下列內容：

1. **完整的 task 文字**（tasks.md 中的 RED + GREEN 配對，含 REFACTOR 若有），逐字複製，不摘要。
2. **對應的 test-plan.md 列**：Test name（**逐字**，即 spec 的驗收錨點）／Scenario／Assertion／Why first／Tier。
3. **相關的 spec.md 段落**：**只**該 task 觸及的 capability 之該 Requirement 全文＋其 Scenarios。四個 capability 的 delta 不得整包貼給同一位。觸及 M4／M5 既有測試的兩個 task（§6.3～§6.4 的 `player-roster` 與 §8.7～§8.8 的 `match-stage`）MUST 一併附上該 Requirement 的 **MODIFIED 全文**與 design Decision 7，讓 Implementer 知道自己是在**改寫**既有行為而非追加。
4. **相關的 design.md 段落**：影響該 task 的 Decision 與 Risk（例如動 `reducer.ts` 的 task 必附 Decision 6；動 storage 的必附 Decision 4；動 `page.tsx` 的必附 Decision 3 含「先讀 `node_modules/next/dist/docs/`」那句）。
5. **worktree 絕對路徑**（見 environment.md）：`/Users/m2_24gb/Desktop/project/pickball-worktrees/matchmaker-scoreboard-binding`。所有 subagent 在**同一個** worktree 工作，SHALL NOT 自建新的 worktree。
6. **執行指令模板**：
   - 單檔測試：`pnpm --filter ./nextjs-pickball test --run <workspace 相對路徑>`（**`--run` 前不可加 `--`**）
   - E2E 單檔：`pnpm --filter ./nextjs-pickball test:e2e --grep "<關鍵字>"`
   - 型別：`pnpm --filter ./nextjs-pickball exec tsc --noEmit`
7. **TDD 三步的硬性要求**：先寫測試 → 在 shell **實際看到紅燈並貼出輸出** → 最小實作至綠 → refactor → 自我 review → commit。紅燈若無法自然出現（既有實作已滿足），MUST 誠實回報並改以 mutation 驗證證明測試有偵測力，SHALL NOT 改斷言偽造紅燈。
8. **專案硬性規範摘錄**：繁體中文註解、`import type`（`verbatimModuleSyntax`）、測試檔須顯式 `import { describe, it, expect } from "vitest"`（`tsconfig` 不含 `vitest/globals`）、`"use client"` 標註規則、`components/ui/` 不自行修改。

**明確「不給」的內容**（避免 scope creep）：

- 其他 task 的文字與其他 capability 的 delta。
- 未被該 task 觸及的 capability 主 spec（`quiz`、`tour-experience`、`pickleball-guide-page`、`match-allocation`、`site-navbar`、`api-connectivity`）。`player-roster` 只在 §6 的清除範圍 task 中給出「重置名單與二次確認」一條 Requirement，其餘 task 不給。
- 整份 `prd.md`（只給該 task 對應的節次編號與引文）。
- 本檔（execution-plan.md）與 overview.md——前者是 orchestrator 的工具，後者是給人看的摘要，apply 階段不需要。

## Roles

### Implementer

- **default_model**: `haiku`
- **Rationale**: 本段多數 task 是「在既有結構上加一個維度」——storage 分槽、reducer 多守一個欄位、hook 多一個參數。既有檔案已有清楚的既定風格可模仿，測試名稱與斷言也由 test-plan 逐字指定，屬於低歧義的執行工作。
- **upgrade_to_sonnet_when**:
  - task 觸及 `hooks/useScoreboardStore.ts` 的 effect 順序（既有的 write/read + `hasHydratedRef` + Strict Mode cleanup 是刻意設計，改壞的失敗模式是靜默競態）。
  - task 觸及 M4／M5 的既有檔案（本 worktree 對它們是唯讀理解，改動需要先讀懂上游意圖）。
  - task 為 E2E（跨頁面導覽 + LocalStorage 前置 + 五個 browser project 的差異）。
  - 同一 task 因「測試寫得不精確」被退回一次。
- **upgrade_to_opus_when**:
  - `tasks §0` 的上游契約對齊（需判斷 M4／M5 的實際命名是否滿足本段假設，並在不符時決定是回報還是調整）。
  - 連續兩次被 Stage 1 以「行為與 spec 不符」退回。
  - 出現需要修改 delta spec 才能繼續的情況（此時應先走 Escalation，不由 Implementer 自行改 spec）。
- **Self-review checklist**（commit 前自查）：
  - 測試名稱與 test-plan 的 Test name **逐字**相同（含全形符號與空格）。
  - 紅燈輸出已貼出，或已明確標註為 regression guard 並附 mutation 驗證。
  - 未動到本 task 範圍外的檔案。
  - `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過。
  - 新增的註解為繁體中文（台灣用語）。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **必要的第一個動作**：複述自己收到的 spec／test-plan 摘錄之**標題**。若與待審 task 不符，回報 `NEEDS_CONTEXT` 而**不要**開始審查。
- **Rationale**: 只需比對「程式碼行為 ↔ spec 條文」，不需設計判斷；但需要讀懂 SHALL／SHALL NOT 的細微差別（例如「SHALL NOT 靜默退回獨立計分板」與「顯示說明」是兩個獨立要求），haiku 在這類否定條款上容易漏。
- **Review checklist**：
  - 該 Requirement 的每個 Scenario 是否都有對應測試，且測試名稱與 test-plan 逐字相同。
  - RED 測試的斷言是否真的對應該 Scenario 的 WHEN／THEN，而非只測了容易測的部分。
  - 是否有 scope creep：出現 spec 沒要求的行為、額外的 UI、額外的 storage key。
  - **SHALL NOT 條款是否有測試把關**（本段特別多：不寫入獨立槽、不覆蓋既有進度、不重複送出、不清 `scoreboard:current:v1`）。
  - 繁體中文錯誤訊息是否真的說明可採取的修正方式，而非只描述狀況。
- **不看**：命名、檔案結構、重複邏輯、可讀性（那是 Stage 2）。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **必要的第一個動作**：同 Stage 1，先複述收到的摘錄標題；不符即回報 `NEEDS_CONTEXT`。
- **Rationale**: 本段的品質風險集中在**靜默失效**——寫錯槽、effect 順序錯、清除範圍過寬。這些不會讓測試變紅，只會在真實使用中默默毀掉資料，需要最強的模型主動設想反例。
- **Review checklist**：
  - 與既有 `lib/scoreboard/` 風格一致（zod schema 與型別成對匯出、`hasLocalStorage()` 守門、try/catch + `console.warn`）。
  - 是否引入第二個「決定寫哪個槽」的地方（spec 要求唯一來源為 `state.matchId`）。
  - 邊界：`matchId` 為空字串、槽內容為 `null`、`localStorage` 不可用（SSR／私密模式）、寫入拋 QuotaExceededError。
  - 清除範圍是否過寬（是否可能誤刪 `scoreboard:current:v1` 或其他 capability 的 key）。
  - 測試是否**有偵測力**：斷言是否會因為實作被改壞而變紅（必要時要求補 mutation 驗證）。
  - 是否新增了 UI 節點而未重跑多 viewport 零捲動驗收。
- **不看**：spec 本身對不對（Stage 1 已審），需求範圍是否合理。

### Final Code Reviewer

- **default_model**: `opus`
- **時機**：全部 task 完成後，對整組 commits 做一次跨 task 檢視。
- **Rationale**: 本段的四個 capability 分屬數個模組但共用同一組不變式（「槽有條目 ⟺ 綁定有效」、「第一隊 ⟷ us」）。單一 task 的 reviewer 只看得到自己那一塊，不變式是否在**所有**路徑上都成立，只有整體檢視能回答。
- **Review checklist**：
  - **不變式跨 task 成立**：所有建立槽的路徑都在導向前、所有銷毀場次的路徑都清槽、所有寫入都經 `state.matchId` 推導。
  - 隊伍對應（第一隊 ⟷ `us`）是否真的只有一份定義，入口與回填都取用它。
  - 三個 task 群是否各自造了功能重疊的 helper（例如兩份「讀全部槽」）。
  - 命名一致：`matchId`、`slot`、`binding` 等詞在三個模組中語意一致。
  - 合併後的 diff 是否仍在 proposal 的範圍內（沒有偷做 M7／M8 的事、沒有動 `site-navbar`、沒有改計分規則）。
  - root `README.md` 的部署前七步是否全跑過且留有輸出。
- **不看**：單一 task 的細節（Stage 1／2 已覆蓋）。

### 模型選擇原則

在能勝任的前提下用**最弱**的模型，以節省成本與時間。`haiku`／`sonnet`／`opus` 為 Claude 的分級舉例；若執行環境沒有這些名稱，對應到該環境的「快速／均衡／最強」三檔。

## Escalation

- **同一位 reviewer 連續退回同一個 task 3 次** → 升級 Implementer 的模型（`haiku` → `sonnet` → `opus`）後重派。SHALL NOT 以相同模型、相同條件重派。
- **Spec Reviewer 自身判斷前後不一致**（同一段程式碼一次判過、一次判不過）→ 視為 spec 本身有歧義，升級給人類澄清並修訂 delta，SHALL NOT 由 Implementer 自行改 spec 讓自己通過。
- **Code-Quality Reviewer 與 Implementer 的風格爭議** → **既有 codebase 風格勝出**。本段的既有基準是 `lib/scoreboard/storage.ts`、`lib/matchmaker/storage.ts` 與 `hooks/useRosterStore.ts`。
- **任一階段 BLOCKED 超過 30 分鐘** → 升級給人類。
- **上游契約不符**（M4／M5 的實際型別、欄位或路由與本段假設不同）→ **立即停止並回報人類**，把落差記入 design.md 的 `## Open Questions`。SHALL NOT 由本段替 M4／M5 補上缺少的欄位或函式——那會讓兩個 change 對同一份契約各有一份實作。
- **BLOCKED 的分類與處置**：脈絡不足 → 補脈絡後同模型重派；推理不足 → 升級模型；task 太大 → 拆分並同步更新 tasks.md 與本檔；計畫本身錯誤 → 升級給人類。
