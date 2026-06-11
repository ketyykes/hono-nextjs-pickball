> 註：本變更為「事後紀錄」既有實作，所有任務皆已完成。對應 commits 範圍：`045b713` ~ `e2a4dc4`。

## 1. 題庫資料（例外層：型別 + 純資料）

- [x] 1.1 新增 `data/quiz/questions.ts`：定義 `MultipleChoiceQuestion`、`TrueFalseQuestion`、聯合 `Question`，及 25 題 readonly 常數（commit `045b713`）
- [x] 1.2 補 `ShuffledQuestion` JSDoc 並修正 `serve-04`（2021 Let serve 廢除新規）（commits `c70bba0`、`36d9e51`）
- [x] 1.3 驗收：`pnpm tsc --noEmit` 0 errors；題庫項目數 ≥ 25 且 id 唯一

## 2. useQuiz hook（行為邏輯：TDD 三步）

- [x] 2.1 ① 新增失敗測試 `hooks/useQuiz.test.ts`（12 個 case：抽 10 題、選項洗牌、selectOption 進 revealed、guard、計分、nextQuestion、finished、restart 等），執行 `pnpm test -- --run hooks/useQuiz.test.ts` 確認紅燈
- [x] 2.2 ② 最小實作 `hooks/useQuiz.ts`：抽題、洗牌、selectOption / nextQuestion / restart、phase 狀態機，跑至 green（commit `68eddaa`）
- [x] 2.3 ③ Refactor：修正 selectOption stale closure、清理 `_unused`、補 guard 測試；外層 closure guard 列為已知 LOW（commit `3d27c25`）

## 3. UI 元件（例外層：呈現）

- [x] 3.1 `components/quiz/QuestionCard.tsx`：answering / revealed 兩態，綠正確、紅錯誤 + explanation（commit `0311261`）
- [x] 3.2 `components/quiz/ResultScreen.tsx`：分數 + 三段鼓勵文字 + 「再試一次 / 回到指南」按鈕（commit `dd597e2`）
- [x] 3.3 `components/quiz/QuizShell.tsx`：進度條 + QuestionCard ↔ ResultScreen 切換（commits `f844b4c`、`e6880fd`）

## 4. 路由與入口（例外層）

- [x] 4.1 `app/quiz/page.tsx`：Server Component + metadata（commit `ac369a8`）
- [x] 4.2 `app/quiz/QuizClient.tsx`：`"use client"` + `dynamic(() => import('@/components/quiz/QuizShell'), { ssr: false })` 解決 hydration mismatch（commits `9e4b804`、`e2a4dc4`）
- [x] 4.3 驗收：`pnpm build` 成功；`/quiz` 為靜態預渲染

## 5. Navbar 整合

- [x] 5.1 `components/layout/SiteNavbar.tsx`：新增「測驗」連結指向 `/quiz`（commit `7fb4625`）
- [x] 5.2 驗收：手動／E2E 確認 active 樣式於 `/quiz` 套用

## 6. E2E（例外層，鼓勵補測）

- [x] 6.1 `tests/e2e/specs/quiz.spec.ts`：4 個 smoke 情境（Navbar 進入、答題回饋、完整 10 題、再試一次）+ `expect(hydrationErrors).toHaveLength(0)` 防退化（commit `02aeb32`、補丁 `e2a4dc4`）
- [x] 6.2 驗收：`pnpm test:e2e --project=chromium tests/e2e/specs/quiz.spec.ts` 4/4 通過、hydration 0 errors

## 7. 全面驗證

- [x] 7.1 `pnpm test --run` 全綠（70/70）
- [x] 7.2 `pnpm tsc --noEmit` 0 errors
- [x] 7.3 `pnpm lint` 0 errors（2 warnings 為既有 `_` 前綴慣例）
- [x] 7.4 `pnpm build` 成功
