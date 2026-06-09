---
name: subagent-tdd-flow
description: 用 subagent-driven 流程逐項執行實作 plan，每個 task 派 nextjs-expert 走 TDD（測試先行），再派 code-reviewer-readonly 按低/中/高分級審查，必要時派 nextjs-expert 修正（連續兩次只剩「低」或累計 3 次修正即停），最後派 playwright-e2e-runner 跑 E2E。當使用者說「用這個 workflow 執行 plan」、「subagent driven 走 TDD」、「跑完 plan 並做 review 與 E2E」、「按 plan 分派 nextjs-expert 並 code review」等情境時觸發。也適用於已有 docs/superpowers/plans/ 下的 plan 檔、想用既定 multi-agent pipeline 推進實作的情境。
disable-model-invocation: true
---

# Subagent-Driven TDD Workflow

## 用途

把一份「實作 plan」交給一條固定的 multi-agent 流水線跑完：每個 task 都先測試後實作，由 reviewer 把關品質，最後跑 E2E。流程由你（主 agent）orchestrate，呼叫三個專責 sub-agent：

- **nextjs-expert** — 實作者（TDD red → green → refactor → commit）
- **code-reviewer-readonly** — 審查者（只讀、只給意見，不動 code）
- **playwright-e2e-runner** — 全部 task 完成後跑跨瀏覽器 E2E

## 何時使用

當以下任一情境出現：

- 使用者已準備好 plan 檔（例如 `docs/superpowers/plans/<date>-<feature>.md`）並要求「執行」、「按 plan 跑」、「完成這些 task」
- 使用者明確說「用這個 workflow / subagent driven / TDD pipeline 跑」
- 使用者剛跑完 `writing-plans` 或 `superpowers:subagent-driven-development`，要進入實作階段
- 使用者想要「先測後實作 + code review + E2E」的完整流程，但不想每次都打字描述細節

## 前置確認

開跑前先確認：

1. **有 plan 檔**。如果沒有，先請使用者建立或指定路徑，不要硬上。
2. **三個 sub-agent 都存在**：
   - `nextjs-expert`（通常在 `~/.claude/agents/` 或 `.claude/agents/`）
   - `.claude/agents/code-reviewer-readonly.md`
   - `.claude/agents/playwright-e2e-runner.md`
3. **目前在哪個 branch**。直接做在 `main` 還是需要新建 feature branch — 若使用者沒明說、且專案歷史顯示是 main-trunk 工作流（看 git log），延續沿用即可，但**至少回報一句**告知。

## 流程總覽

```
讀 plan → 抽出全部 task → 依序執行：
  ┌────────────────────────┐
  │ 每個 task：             │
  │  ① nextjs-expert 實作  │  ← 嚴格 TDD：先紅燈、再實作、commit
  │  ② code-reviewer 審查  │  ← 必須分級：低 / 中 / 高
  │  ③ Fix loop（如需要）  │
  │     - 中或高 → 派 fix  │
  │     - 連續兩次「只剩低」→ 停
  │     - 累計 3 次修正 → 停
  └────────────────────────┘
所有 task 完成 → playwright-e2e-runner 跑 E2E → 總結回報
```

## Step-by-step 操作

### 0. 讀 plan、抽 task 清單

讀 plan 檔一次，把每個 task 的「標題 + Files + 完整 step 清單（含完整程式碼）」抽到記憶中。**不要讓 sub-agent 自己去讀 plan**——你 inline 把每個 task 的 full text 餵給它（這是 subagent-driven 的關鍵，避免它讀整份 plan 浪費 context）。

可選：用 TaskCreate 建立追蹤 task（phase-level 即可，避免 1:1 對應產生過多 noise）。

### 1. 派 nextjs-expert（TDD 實作）

每個 task 的 dispatch prompt 必須含：

- **Task 標題**與 plan 出處
- **Full text**：plan 中該 task 的完整 step 程式碼（測試碼 + 實作碼）
- **Context**：當前 branch、前一步 commit SHA、依賴模組是否已就位、規格檔路徑
- **慣例**：抽取自 codebase（縮排、quote 風格、`import type`、`"use client"` 規則等）
- **TDD 紀律**：① 先建立失敗測試並貼出紅燈輸出 ② 最小實作至綠燈並貼輸出 ③ commit
- **回報格式**：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + commit SHA + 紅綠燈輸出
- **邊界**：明確說「不要動 X / 不要實作 Y（那是 Task N+1）」避免越界

範例 prompt 骨架見 [implementer-prompt-template](references/implementer-prompt-template.md)。

### 2. 派 code-reviewer-readonly（審查）

實作者回報 DONE 後，立刻派審查者。Prompt 必須含：

- **內容**：這個 task 做了什麼
- **Diff 範圍**：`BASE_SHA..HEAD_SHA`（前一步 commit → 本 task commit）
- **規格依據**：spec 章節 + plan task 編號
- **重點檢查項**（依 task 性質列 5–8 點）
- **強制分級要求**：

  > 請以 **Strengths / Issues (高 / 中 / 低) / Assessment** 三段回報。`高` = blocking（必修）；`中` = 應修但非阻擋；`低` = nice-to-have / 風格。

範例見 [reviewer-prompt-template](references/reviewer-prompt-template.md)。

### 3. Fix Loop 判斷

讀完 reviewer 回報後，依下表決定：

| Reviewer 結果  | 動作                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| 有「高」       | **必派 fix**（不論累計次數，除非已 3 次仍未解），把高列為必修、中為建議                |
| 沒高、有「中」 | 派 fix（除非累計達 3 次）                                                              |
| 只有「低」     | 看是否「連續第二次只剩低」→ 是則**停 fix**，標記 APPROVED；否則仍派一輪 fix 把低項清掉 |
| 無 issues      | 直接 APPROVED                                                                          |

**Loop 終止條件（取先到）：**

1. **連續兩次** review 結果都「**只剩低**或無 issues」
2. 累計派出 fix 次數 = 3（保護機制）
   - 若到第 3 次後 reviewer 仍報「中」或「高」issues → **必須產生 escalation markdown**（見下節），然後標記該 task 為 DONE_WITH_CONCERNS 並繼續下個 task

### 3.1 Escalation Markdown（達 3 次 fix 上限後）

當第 3 次 fix 結束、re-review 仍含「中」或「高」issues 時，**必須**把未解問題寫成 markdown 給人類審查，不能默默吞掉。

**檔案路徑：** `docs/superpowers/review-escalations/YYYY-MM-DD-<feature-name>-task-<N>.md`（如目錄不存在直接 mkdir）

**內容必含：**

1. Task 編號與標題
2. SHA 範圍（base → 最後 fix commit）
3. 三輪 fix 各自做了什麼 + 對應 commit SHA
4. **未解的「中/高」issues 清單**，每項含：
   - 等級（中 / 高）
   - 位置（檔案 + 行號）
   - reviewer 原話摘要
   - 為何沒修（如已試過某方案失敗、或 reviewer 主張間需取捨）
5. 對使用者的建議下一步（如「考慮放棄此 task 改 design」、「接受現狀進下 task」）

模板見 [escalation-template](references/escalation-template.md)。

寫完後**在主對話中明確點名告知使用者**：

> Task {{N}} 達 3 次 fix 上限仍有未解 issues，已寫到 `docs/superpowers/review-escalations/{{file}}.md`，請審閱後告知處理方式。我會先標記 DONE_WITH_CONCERNS 並繼續下個 task。

派 fix 時：

派 fix 時：

- 指明只動哪些檔案、哪幾處（避免擴大改動）
- 明確列出 reviewer 哪幾點要處理、哪幾點略過（你做的權衡告訴 fix agent）
- 要求跑相關 unit test + lint 確認無 regression
- commit 訊息用 `fix(scope): ...` 或 `test(scope): ...`、`refactor(scope): ...`

### 4. 進入下一個 task

當前 task APPROVED 或 DONE_WITH_CONCERNS（已達 3 次 fix 上限）後，繼續下個 task。`BASE_SHA` 更新為當前 HEAD。

### 5. 全部 task 完成 → 派 E2E

讀 `.claude/agents/playwright-e2e-runner.md` 上的設定後派遣。Prompt 含：

- 要驗證的場景清單（從 plan 的 E2E 章節或 spec 抽出）
- aria-label / data-testid 對照表（方便 reviewer 寫 selector）
- 要驗證的 path（首頁、新功能頁、邊界情境）
- Console error 監控要求（hydration mismatch、key warning 等都要回報）
- Commit 規範（測試檔通常 `test(scope): ...`）

E2E agent 回報後：

- 若 PASS → 跑最終 unit test + lint + build sweep 結束流程
- 若失敗或揪出產品 bug → 依嚴重度派 nextjs-expert 修正（這時不再用 review loop，直接用 E2E 結果當需求說明）

### 6. 結束回報

向使用者交付：

- 全部新增 commit 的 oneline 清單（`git log --oneline <base>..HEAD`）
- 單元測試 / E2E / lint / build 通過數
- 過程中 reviewer 抓到的問題清單（特別是 critical 等級被擋下的）
- 任何 DONE_WITH_CONCERNS 的 task + 未解原因 + 對應的 escalation markdown 路徑（若有）
- 接下來建議（如「可以開 dev server 試試」、「要不要 PR」）

## 重要原則

### 不要把 plan 路徑丟給 sub-agent

Sub-agent 沒有上下文，讓它去讀 plan 是浪費 token 又容易讀偏。**把該 task 的 full text 貼進 prompt**。

### TDD 紅綠燈輸出要驗證

實作者報告 DONE 但沒貼紅燈輸出時，不要直接相信。要嘛要求補貼，要嘛你自己跑 `pnpm test -- --run <path>` 確認。

### Reviewer 不會擅自改 code

`code-reviewer-readonly` 設計上就是 read-only。它的回報是「意見」不是「修正」。實作 fix 一律由 nextjs-expert 做。

### 三個分級的判讀

- **高**：bug、安全問題、會 regression、SSR/hydration mismatch、字型/class 名拼錯導致樣式失效——這類**必修**
- **中**：測試覆蓋缺口（會放行 regression）、API 設計小問題（命名、prop surface 過大但可重構）、文件過時——**通常該修**但需評估改動成本
- **低**：style preference、cosmetic 註解、micro-optimization、JSDoc 風格——**累計兩次只剩這類就放行**

### 累計 fix 次數 3 次是保護線

不是目標。理想是 1 次 fix 後就「只剩低」過關。3 次仍有高/中 → 通常意味設計層級問題，**必須產生 escalation markdown 給人類審查**（見 §3.1），不要默默吞掉，也不要硬撐第 4 輪。

### 別忽略 reviewer 抓到的 Critical

像「class 名拼錯」、「StrictMode 下 ref 沒重置」、「localStorage 競態」這類，reviewer 抓出來時要立刻派 fix，這是這個 pipeline 最有價值的地方。

## Anti-patterns

- ❌ 把整份 plan 路徑丟給 nextjs-expert 讓它自己讀
- ❌ 同一個 task 派多個實作 agent 並行（會撞 commit / 衝突）
- ❌ 跳過 reviewer 直接進下個 task（除非該 task 是「純測試補上、無實作改動」這類風險極低的）
- ❌ Reviewer 抓到「中/高」卻 APPROVED 跳過（這破壞 pipeline 信用）
- ❌ Fix prompt 沒有點明「只動哪幾處」、放任 agent 自由發揮
- ❌ E2E 失敗就回頭再跑 review loop（E2E 失敗該直接派 fix，不需再 review）
- ❌ **達 3 次 fix 上限卻沒寫 escalation markdown**（這是讓使用者失去信任的最快方式——他們以為過關但其實還有 critical issue）
- ❌ Escalation markdown 寫得太簡略（只寫「還有 issues」沒寫「是什麼 issues / 為何沒修」）

## 對應參考檔

- [implementer-prompt-template](references/implementer-prompt-template.md) — nextjs-expert dispatch 骨架
- [reviewer-prompt-template](references/reviewer-prompt-template.md) — code-reviewer-readonly dispatch 骨架
- [fix-prompt-template](references/fix-prompt-template.md) — 修正派遣骨架
- [e2e-prompt-template](references/e2e-prompt-template.md) — playwright-e2e-runner dispatch 骨架
- [escalation-template](references/escalation-template.md) — 達 3 次 fix 上限後的人類審查 markdown 模板
