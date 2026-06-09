# 修正派遣 prompt 骨架

當 reviewer 抓出「高」或「中」問題時，派 `nextjs-expert` 修正。**Fix prompt 與 implementer prompt 結構不同**：fix 著重「就事論事改某幾處」，不要走整個 TDD 流程（測試已存在）。

```
你是 Task {{N}} 的修正者。Code review 抓到 {{N1}} 個 Critical + {{N2}} 個 Important + {{N3}} 個 polish。

## 修正項目（明確列出每一處要動的檔案與改法）

### 1. ({{等級}}) {{簡述問題}}

**檔案：** `{{file path}}`
**位置：** L{{line}}（或函式/變數名）

**問題：** {{reviewer 的原話或精煉描述}}

**改法：**

把：
```ts
{{原本程式碼}}
```

改為：
```ts
{{修正後程式碼}}
```

### 2. ({{等級}}) {{簡述問題}}

{{...同上格式}}

---

## 哪些 reviewer 建議**不要動**（給 agent 看的明確邊界）

- {{某項 reviewer 提的 nice-to-have，你決定略過——告訴 fix agent 不要做}}
- {{某項超出本 task 範圍的建議——告訴 fix agent 留給後續 task}}

## 驗證

1. 跑相關 unit test 確認無 regression：
   ```bash
   pnpm test -- --run {{path}}
   ```
2. Lint：
   ```bash
   pnpm lint {{path}}
   ```
3. （若改了型別）TypeCheck：
   ```bash
   pnpm tsc --noEmit
   ```

## Commit

```bash
git add {{file paths}}
git commit -m "{{type(scope): message}}"
```

commit message type 選用：
- `fix(scope): ...` — 修正 bug
- `test(scope): ...` — 補測試覆蓋
- `refactor(scope): ...` — 重構、API 簡化
- `style(scope): ...` — 純格式（罕用，通常 ESLint 自動處理）

## 回報

- DONE + commit SHA
- 測試 / lint / tsc 結果
- 每一處變更摘要

## 重要

- **不要動其他檔案**（即使你看到別處可改善）
- **不要做沒被列在「修正項目」的事**
- 如果改法不確定或 reviewer 描述模糊，回報 NEEDS_CONTEXT 並提問
```

## 為什麼 fix prompt 不走完整 TDD？

實作 task 已建立紅綠循環，測試已存在。Fix 通常是：
- 修正 bug → 跑既有測試確認 PASS
- 補測試覆蓋 → 測試本來就會 PASS（實作已涵蓋），補上是為 regression 保護
- 重構 → 行為等價，既有測試應全綠

走完整紅綠循環會浪費 cycle。但仍要跑既有測試確認**無 regression**。

## 主 orchestrator 在 fix 後該做什麼

```
fix agent 回報 DONE 後：

1. 不要直接信任「行為一致」聲明——快速 sanity check（git log + diff 看實際改了什麼）
2. 重派 code-reviewer-readonly 做 re-review
3. 依新的 reviewer 結果決定：
   - 連續第二次「只剩低/無 issues」→ APPROVED，進下個 task
   - 仍有高/中 → 再派 fix（累計次數 +1）
   - 累計達 3 次仍有高/中 → **產生 escalation markdown**（見 [escalation-template](escalation-template.md)）寫到 `docs/superpowers/review-escalations/`，主對話通知使用者後標記 DONE_WITH_CONCERNS 並進下個 task。不要硬撐第 4 輪，也不要默默吞掉問題。
```

## 常見誤用

**❌ Fix prompt 沒列「不要動什麼」：** 沒邊界的話 agent 容易順手「順便」改其他東西，造成 commit 變雜、re-review 範圍變大、可能引入新問題。

**❌ 同時 fix 太多項（5+ 個 issue 一次處理）：** 拆兩輪 fix 比較好——第一輪只動「高」，第二輪處理「中」。可以分階段 commit 也更好 review。

**❌ Fix agent 自行決定 reviewer 建議的優先順序：** Fix prompt 要明確列出做哪些、不做哪些——這是 orchestrator 的判斷，不該下放給 fix agent。

**❌ Fix 後跳過 re-review：** Fix 引入新問題的機率不低（特別是大改動）。re-review 是 pipeline 設計核心，不要省。
