# code-reviewer-readonly 審查 prompt 骨架

派 `code-reviewer-readonly` agent 對 task 變更做審查。**強制要求三段式分級回報**。

```
請審查 {{feature 名稱}} Task {{N}} 的實作。

## 內容

Task {{N}}：{{一句話描述這個 task 做了什麼，例如「用 TDD 在既有 `rules.ts` 加入 `isGameWon` 勝利判定函式」}}。

## Diff 範圍

- BASE_SHA: `{{前一步 commit}}`
- HEAD_SHA: `{{本 task 最後 commit}}`
- 用 `git diff {{BASE}}..{{HEAD}} -- {{相關目錄}}` 查看實際變更

## 規格依據

- Spec：`{{spec path}}` §{{section}}
- Plan：`{{plan path}}` Task {{N}}

## 專案慣例

- Tab 縮排、雙引號
- TypeScript strict + verbatimModuleSyntax
- 中文註解、英文程式碼命名
- {{其他相關慣例，如「zod 4.x 已安裝」、「shadcn/ui 用 v5 慣例」}}

## 審查重點

依本 task 性質列 5-8 點（範例）：

1. {{邏輯正確性 — 函式行為對應 spec 哪幾條規則}}
2. {{邊界情境 — 是否漏掉 X / Y / Z 邊界值}}
3. {{範圍邊界 — 是否實作了不該動的東西（下個 task 範圍）}}
4. {{immutability / SSR 安全 / 等橫切議題}}
5. {{accessibility 或 hydration 議題（若是 UI）}}
6. {{TypeScript 型別正確、`import type` 使用}}
7. {{測試品質 — 是否覆蓋足夠、是否真的測行為而非實作細節}}

## 回報格式（必須遵守分級）

請以以下三段式回報，**問題必須分級**：

### Strengths
（這個 task 做得好的地方）

### Issues

#### 高（Blocking / Critical）
（必修：bug、安全問題、會造成 regression、SSR/hydration mismatch、樣式 class 拼錯、明確違反 spec）

#### 中（Should Fix）
（應修：測試覆蓋缺口、API 設計小問題、文件過時、命名不清；可以接受 1-2 個但通常該修）

#### 低（Nice to Have）
（風格建議、micro-optimization、JSDoc 風格、註解文案）

### Assessment
（整體評估 + 是否建議 APPROVE，並說明理由）

---

**注意：**
- 若沒有任何 Issues，請明白寫「無 Issues」並 APPROVE
- 不要把同一個問題重複放在多個等級
- 「**高**」是用來擋住 task 通過的，請保守使用；不確定就放「中」
```

## 為什麼強制分級？

orchestrator（主 agent）依分級決定要不要派 fix、什麼時候停 fix loop。如果沒分級，主 agent 要自己猜每個 issue 的嚴重度，容易誤判：

- 把「測試 description 文案建議」當「字型 class 拼錯」一樣派 fix → 浪費 cycle
- 把「Math.abs 對稱性測試覆蓋缺口」當風格建議跳過 → 漏掉 regression 保護

reviewer 是 readonly agent，它**只給意見**——所以由它把意見分級，是最低成本的把關方式。

## 微調建議

- **多檔大改動**：列出每個檔案的核心檢查點分開審查，避免 reviewer 漏掉某個檔案
- **純測試補上的 task**：審查重點改為「測試覆蓋是否真的反映 spec 規則」「測試是否會誤通過」「helper 設計」
- **重構 task**：審查重點改為「行為等價（無 regression）」「API 變更是否合理」「向下相容」

## 主 orchestrator 該怎麼讀分級

```
拿到 reviewer 回報後：

if 有「高」:
  必派 fix（除非已達 3 次上限 → 標記 DONE_WITH_CONCERNS）
elif 有「中」:
  派 fix（除非已達 3 次上限）
elif 只有「低」:
  if 「連續兩次都只剩低或無 issues」:
    APPROVED → 進下個 task
  else:
    可選：派一輪 fix 把低項清掉
       或：標記 APPROVED 進下個 task（取決於專案品質要求）
else (無 issues):
  APPROVED → 進下個 task
```

## 常見誤用

**❌ 主 agent 自行決定 reviewer 該擔心的等級：** 例如把 reviewer 寫「Should Fix」的測試覆蓋缺口降級為「Nice to have」並跳過——這破壞分級制度的信用，違反 pipeline 設計初衷。

**❌ 重複派審查相同 commit：** 通過 reviewer 後不要再叫一輪 review「確認看看」，繼續下個 task；若需 fix 才派 fix-then-rereview。

**❌ Reviewer 自己改 code：** code-reviewer-readonly 是 read-only 設計，它**不應**用 Edit/Write 工具動 code。如果它真的改了，回報這是 agent bug，但不阻擋流程。
