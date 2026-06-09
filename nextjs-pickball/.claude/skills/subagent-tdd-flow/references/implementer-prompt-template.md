# nextjs-expert 實作 prompt 骨架

派 `nextjs-expert` agent 執行單一 task 的 dispatch prompt 模板。把 `{{...}}` 換成實際內容。

```
你是 {{feature 名稱}} Task {{N}} 實作者，需用 TDD 紅綠循環{{動作描述（建立/擴充/修正）X}}。

## Task 描述（節錄自 plan）

**Files:**
- {{Create / Modify}}: `{{file path 1}}`
- {{Create / Modify}}: `{{file path 2}}`

### Step 1: {{動作，如「寫失敗測試」}}

```ts
{{完整測試碼，不要省略；直接貼 plan 中的 step block}}
```

### Step 2: Run red

Run: `pnpm test -- --run {{test path}}`
Expected: FAIL（{{預期錯誤訊息}}）

### Step 3: {{動作，如「最小實作」}}

```ts
{{完整實作碼}}
```

### Step 4: Run green

Run: `pnpm test -- --run {{test path}}`
Expected: PASS {{N}} tests

### Step 5: Commit

```bash
git add {{file paths}}
git commit -m "{{conventional commit message}}"
```

## Context

- 專案：`/path/to/project`，分支：{{branch}}
- 前一步 commit：`{{BASE_SHA}}`
- 規格：spec §{{section}} / plan Task {{N}}
- 既有依賴：{{已就位的相關模組}}
- {{其他必要 context，例如「happy-dom 提供 localStorage」、「lucide-react 已在 deps」}}

## 慣例

- Tab 縮排、雙引號
- TypeScript strict + verbatimModuleSyntax（純型別用 `import type`）
- 純客戶端互動元件須加 `"use client"`
- 中文註解、英文程式碼命名

## 你的工作（嚴格 TDD）

1. 寫測試 → 跑紅燈、貼輸出
2. 寫實作 → 跑綠燈、貼輸出
3. Commit
4. 回報 DONE + 紅燈/綠燈輸出 + commit SHA

## 重要

- 不要跳過紅燈驗證（TDD 紀律）
- 不要實作 spec 之外的東西（本 task 只有 {{範圍}}；不要動 {{下個 task 範圍}}）
- 中間遇 error 回報 BLOCKED + 詳情，不要硬撐

## 回報格式

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 紅燈輸出
- 綠燈輸出
- commit SHA
- 自我檢核發現（如有）
```

## 微調建議

- **純展示元件 / 無業務邏輯**：可省略 TDD，改為「建檔 → tsc → commit」三步，並在 prompt 中明說「本 task 無需 TDD（依 spec 規範）」
- **多檔大改動**：在 Step 區拆分為「先動 types.ts → 看到 既有 tests 紅燈 → 補實作 → 補測試 → 補其他檔案」按邏輯依賴順序
- **fix 場景**：見 [fix-prompt-template](fix-prompt-template.md)，不要用這個模板（會混淆「實作」與「修正」邊界）

## 常見問題

**Q: agent 沒貼紅燈/綠燈輸出怎辦？**
A: 在 prompt 內加一句「**請貼出 `pnpm test` 完整輸出**證明真的 FAIL/PASS」。如果還是省略，自己跑一次驗證。

**Q: agent 越界做了下個 task 的內容？**
A: prompt 中「重要」段必須明示邊界。若已發生，請使用者決定是 revert 還是接受並 skip 下一 task。

**Q: agent 抱怨找不到 plan 檔？**
A: 表示你忘了把 task full text 貼進去。**不要請 agent 自己讀**，把該 task 的步驟程式碼完整貼上。
