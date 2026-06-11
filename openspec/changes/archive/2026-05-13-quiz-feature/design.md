## Context

匹克球指南目前為單向閱讀型 SPA。為強化學習回饋迴路，新增 `/quiz` 路由提供隨堂測驗。題目資料純前端、無需後端，但抽題與洗牌包含 `Math.random()`，在 Next.js App Router SSR 下會造成 hydration mismatch，需要特別處理。

## Goals / Non-Goals

**Goals:**
- 隨機抽題（25 選 10）+ 選項洗牌，提供可重複的測驗體驗
- 答題即時回饋（綠／紅 + 解說文字），完整十題後顯示分數與行動按鈕
- 與既有 Navbar 整合；維持 `/quiz` 為靜態預渲染頁面
- E2E 防退化：hydration error count 必為 0

**Non-Goals:**
- 不做後端持分、排行榜、登入或成就系統
- 不支援題目編輯後台（題庫為原始碼內 readonly 常數）
- 不做計時、難度分級、錯題複習等延伸功能

## Decisions

### 1. Server Component + Client Component 拆分（`page.tsx` + `QuizClient.tsx`）
- `app/quiz/page.tsx` 為 Server Component，承載 metadata
- `app/quiz/QuizClient.tsx` 為 `"use client"`，內部以 `dynamic(() => import('@/components/quiz/QuizShell'), { ssr: false })` 載入 QuizShell
- **為何**：`dynamic({ ssr: false })` 在 Next.js 16 App Router 中只能在 Client Component 內使用；同時隔離出隨機抽題的客端執行邊界
- **替代方案**：在 Server Component 用 `next/dynamic` → 編譯期失敗；改用 `useEffect` 延遲抽題 → 首屏會閃白，UX 較差

### 2. 抽題與狀態機放在 `hooks/useQuiz.ts`（行為邏輯，必 TDD）
- 對外回傳 `{ phase, currentIndex, questions, selectedIndex, score, selectOption, nextQuestion, restart }`
- `phase` 三態：`'answering' | 'revealed' | 'finished'`
- **為何**：將純邏輯抽離至 hook 可獨立用 Vitest 測試（12 個 case 覆蓋抽題、洗牌、guard、計分、重玩）；元件層只負責呈現

### 3. 題型統一為 `ShuffledQuestion`
- 原始 `MultipleChoiceQuestion`（有 `options` + `correctIndex`）與 `TrueFalseQuestion`（`correct: boolean`）在 hook 內歸一化成帶 `shuffledCorrectIndex` 的 `ShuffledQuestion`
- 是非題以 `correct: true → shuffledCorrectIndex = 0`（「正確」永遠在前）
- **為何**：UI 層只需面對單一型別，避免在 QuestionCard 內做 type narrowing

### 4. 採用 `dynamic ssr: false` 處理 Math.random hydration mismatch
- **背景**：初版直接在 Server 端執行 `useQuiz`，伺服器與瀏覽器抽到不同題目造成 hydration mismatch
- **決策**：讓 QuizShell 完全在 client 執行
- **替代方案**：用 `useEffect` + 初始 loading state → 可行但需多寫一層 placeholder；既然 `/quiz` 是測驗頁無 SEO 內容壓力，dynamic ssr:false 更乾淨
- **防退化**：E2E `quiz.spec.ts` 內 `expect(hydrationErrors).toHaveLength(0)`，任何人改回 SSR 會被擋下

### 5. 模組分層
- 行為邏輯（必 TDD）：`hooks/useQuiz.ts`
- 資料（型別 + readonly 常數，無強制 TDD）：`data/quiz/questions.ts`
- 例外層（不強制 TDD）：`app/quiz/page.tsx`（入口）、`app/quiz/QuizClient.tsx`、`components/quiz/*`（呈現元件 + dynamic loader）
- E2E（鼓勵但不強制）：`tests/e2e/specs/quiz.spec.ts`

## Risks / Trade-offs

- **[Math.random 在 SSR 不可預期]** → 以 `dynamic ssr:false` 完全跳過 SSR；附 E2E hydration 0 errors 防退化
- **[`/quiz` 失去 SSR 字串內容]** → 接受：測驗頁無 SEO 需求；首屏可加 skeleton／loading（目前無，UX 可接受）
- **[selectOption / nextQuestion 外層 guard 從 closure 讀 state.phase]** → 已有測試覆蓋常見路徑；reviewer 評 LOW 風險，列為後續可優化項目
- **[題庫硬編於原始碼]** → 25 題尚屬可控；若未來題量爆炸再考慮抽到 JSON 或 CMS
- **[QuestionCard 缺 aria-pressed / aria-label]** → 已知無障礙缺口，列為後續優化（LOW）
