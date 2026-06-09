## Why

匹克球指南過去僅提供單向閱讀，缺乏讓使用者驗證學習成效的互動。新增規則隨堂測驗可讓讀者在閱讀完規則後立即自我檢驗，並透過題目解說補足易混淆的細節（例如 2021 後 Let serve 已廢除等規則更新）。

## What Changes

- 新增 `/quiz` 路由：從 25 題題庫隨機抽 10 題、一題一頁翻頁式作答
- 答題後立即顯示對錯與解說（綠／紅兩態）；十題完成後顯示分數、鼓勵文字與「再試一次 / 回到指南」按鈕
- 支援單選題（multiple-choice）與是非題（true-false）兩種題型；單選題選項順序洗牌
- `SiteNavbar` 增加「測驗」導航連結
- 採用 `dynamic ssr:false`（落在 Client Component 內）避免 `Math.random` 造成 hydration mismatch
- E2E 加入 hydration 防退化斷言，避免日後改回 SSR 退化

## Capabilities

### New Capabilities
- `quiz`: 規則隨堂測驗的題庫資料、抽題與洗牌邏輯、作答狀態機與結果畫面

### Modified Capabilities
- `site-navbar`: 導覽列新增「測驗」連結指向 `/quiz`

## Impact

- 新增程式碼：`app/quiz/`、`components/quiz/`、`hooks/useQuiz.ts`、`data/quiz/questions.ts`、`tests/e2e/specs/quiz.spec.ts`
- 修改程式碼：`components/layout/SiteNavbar.tsx`
- 依賴：沿用既有 React 19 / Next.js 16 / Tailwind v4 / shadcn/ui，無新增套件
- 測試：新增 12 個 useQuiz 單元測試、4 個 Playwright smoke 情境
- 效能：`/quiz` 為靜態預渲染頁面，QuizShell 以 dynamic import 動態載入
