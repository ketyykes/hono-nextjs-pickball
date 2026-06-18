---
name: project-quiz-hydration-mismatch
description: /quiz 頁面存在 hydration mismatch 產品 bug，根本原因為 useQuiz 使用 Math.random() 初始化題庫
metadata:
  type: project
---

/quiz 的 hydration mismatch 問題**已於 2026-05-13 修復**。

## 根本原因

`useQuiz` hook 在初始化時呼叫 `buildShuffledQuestions()`，內部使用 `Math.random()` 隨機抽題與洗牌選項。SSR 與 CSR 的題目不一致，觸發 React 19 `Hydration failed` pageerror。

## 修復方案

`app/quiz/page.tsx`（Server Component）不得直接使用 `dynamic(..., { ssr: false })`。

**修復方式**：建立 `app/quiz/QuizClient.tsx`（加 `"use client"` 指令），在該 Client Component 中執行 `dynamic import + ssr: false`，再由 `page.tsx` 匯入 `QuizClient`。

```
app/quiz/
  page.tsx       ← Server Component，匯入 QuizClient
  QuizClient.tsx ← Client Component，dynamic(QuizShell, { ssr: false })
```

**Why:** Next.js App Router 明確禁止在 Server Component 中對 `next/dynamic` 使用 `ssr: false`，會導致編譯錯誤：`ssr: false is not allowed with next/dynamic in Server Components`。

## E2E 測試狀態

修復後 20/20 全過（Chromium、Firefox、WebKit、Mobile Chrome、Mobile Safari），hydrationErrors 陣列為空，無任何 console.warn 輸出。

相關檔案：`hooks/useQuiz.ts`、`components/quiz/QuizShell.tsx`、`app/quiz/QuizClient.tsx`、`app/quiz/page.tsx`
