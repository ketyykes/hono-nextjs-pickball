# Escalation Markdown 模板

當 task 跑滿 3 次 fix 仍有「中」或「高」reviewer issues 未解時，orchestrator 必須產生這份文件給人類審查，**不可默默吞掉問題**。

## 路徑

`docs/superpowers/review-escalations/YYYY-MM-DD-<feature-name>-task-<N>.md`

例：
- `docs/superpowers/review-escalations/2026-05-12-scoreboard-task-12.md`
- `docs/superpowers/review-escalations/2026-05-12-checkout-task-04.md`

如目錄不存在直接 `mkdir -p`。

## 模板（Markdown）

```markdown
# Task {{N}}: {{Task 標題}} — Review Escalation

> **狀態：** Fix loop 達上限（3 次）仍有未解 issues，需要人類介入決定。Task 已標記為 `DONE_WITH_CONCERNS`，pipeline 繼續推進到下個 task。

## 基本資訊

- **日期：** {{YYYY-MM-DD}}
- **Feature：** {{feature-name}}
- **Plan：** `docs/superpowers/plans/{{plan-file}}.md`
- **Spec：** `docs/superpowers/specs/{{spec-file}}.md`（§{{section}}）
- **SHA 範圍：** `{{base SHA}}..{{最後 commit SHA}}`
- **改動檔案：**
  - `{{file path 1}}`
  - `{{file path 2}}`

## Fix 三輪歷程

### Fix Round 1 — `{{commit SHA}}`

**Reviewer 抓到的 issues（fix 前）：**
- 高：{{N1}} 項 — {{簡述}}
- 中：{{N2}} 項 — {{簡述}}
- 低：{{N3}} 項

**派 fix 處理：**
- {{修了哪幾項，commit message}}

**Fix 後 re-review：**
- 高：{{剩餘 N}} 項
- 中：{{剩餘 N}} 項
- 低：{{剩餘 N}} 項

### Fix Round 2 — `{{commit SHA}}`

{{同上格式}}

### Fix Round 3 — `{{commit SHA}}`

{{同上格式}}

## 未解 Issues（中以上）

### 1. ({{等級：高 / 中}}) {{簡題}}

- **位置：** `{{file}}` L{{line}}（或函式名）
- **Reviewer 原話摘要：**

  > {{貼 reviewer 報告的相關片段}}

- **為何沒修：**
  - {{試過什麼方案、為何失敗 / 棄用}}
  - {{是否有 trade-off？例如 A 修法會引入其他 regression、B 修法需要重構超出 task 範圍}}

- **建議下一步（給人類）：**
  - [ ] {{選項 A：接受現狀進下個 task，後續另開 task 處理}}
  - [ ] {{選項 B：revert 整個 task 重新設計}}
  - [ ] {{選項 C：人類手動微調此處後 commit}}

### 2. ({{等級}}) {{簡題}}

{{...同上格式}}

## 影響範圍評估

- **是否會影響其他 task？** {{是 / 否，原因}}
- **是否會在 E2E 階段暴露？** {{推測 + 哪個情境}}
- **如果先放行，最壞情況？** {{描述）

## 建議

{{給人類的整體建議。例如：}}

- 此 task 的「中」issue 是測試覆蓋缺口（非 bug），可接受先進下個 task，等 Phase 結束後一併補上。
- 此 task 的「高」issue 是 SSR hydration mismatch，建議**先停下**讓人類決定要 revert 還是接受 dev warning。

---

_本檔由 `subagent-tdd-flow` skill 自動產生。修改後請保留歷史，新狀態追加在底部「人類決議」段。_

## 人類決議（待填）

- [ ] 接受現狀
- [ ] Revert task
- [ ] 手動修正後 commit `{{SHA}}`
- [ ] 其他：

決議日期：
決議人：
```

## 寫作要點

### 必含的「為何沒修」

最重要的欄位。沒寫的話人類看不出來「是 agent 沒能力修，還是這真的是設計取捨」。例如：

**寫得不好：**

> 為何沒修：第三輪 fix 後仍未解。

**寫得好：**

> 為何沒修：reviewer 建議用 `useSyncExternalStore` 重寫整個 hook，但這會需要連動修改 storage.ts 的 subscribe 機制，超出本 task 範圍。已試 ref + cleanup 方案兩次，仍有 StrictMode 下競態（見 round 2 / round 3）。

### 「建議下一步」要可勾選

讓人類能直接 check 一個 option 表達意見，而不是回信寫一段文字。

### 不要塞太多細節

每個 issue 控制在 200 字內。Reviewer 完整報告可以連結到 commit message 或單獨 dump 到附錄。Escalation 是「能 5 分鐘看完做決定」的文件，不是完整事故報告。

### 路徑命名建議

- 日期用 ISO `YYYY-MM-DD`（同 spec/plan 慣例）
- feature-name 用 kebab-case
- task-{N} 用兩位數補零比較好排序（`task-04` 而非 `task-4`），尤其當 plan 有 27 個 task

## 範例（虛構）

```markdown
# Task 22: Scoreboard 主容器 — Review Escalation

> **狀態：** Fix loop 達上限（3 次）仍有未解 issues...

## 未解 Issues（中以上）

### 1. (中) TeamPanel 接受整個 ScoreboardState，prop surface 過大

- **位置：** `components/scoreboard/TeamPanel.tsx` L11
- **Reviewer 原話摘要：**

  > state: ScoreboardState 這個 prop 實際只用到 4 個欄位...重新渲染浪費。

- **為何沒修：**
  - Plan Task 22 範本就指定 `state={state}` 整包傳入
  - 拆 props 需要連動修 Scoreboard.tsx 的計算邏輯（isServing、score 推導）
  - 三輪 fix 都選擇優先處理「高」issues，「中」沒輪到

- **建議下一步：**
  - [ ] 接受現狀（性能影響極小，每場比賽最多幾十次 re-render）
  - [ ] 後續開「TeamPanel 重構」task 處理
  - [ ] 立刻 revert 並 redesign TeamPanel props 介面
```
