## Purpose

定義 `/quiz` 匹克球規則測驗功能的規格，涵蓋題庫資料結構、抽題與洗牌邏輯、`useQuiz` 作答狀態機、計分與重玩流程、測驗 UI 呈現，以及避免 hydration mismatch 的 client-only 渲染策略。

## Requirements

### Requirement: 題庫資料結構

系統 SHALL 提供位於 `data/quiz/questions.ts` 的 readonly 題庫，包含至少 25 題、混合 `multiple-choice` 與 `true-false` 兩種題型。每題 MUST 具備唯一 `id`、`text`（題目文字）、`explanation`（解說），並依題型提供 `options`+`correctIndex`（單選）或 `correct`（是非）。

#### Scenario: 題庫提供足夠題目

- **WHEN** 讀取 `questions` 常數
- **THEN** 至少有 25 題；每題 `id` 不重複；型別正確（單選題含 `options.length ≥ 2`、`correctIndex` 在範圍內）

#### Scenario: serve-04 採用 2021 後新規

- **WHEN** 讀取 id 為 `serve-04` 的題目
- **THEN** 題目／解說反映「Let serve 已廢除」之最新規則，不得回退為舊規

### Requirement: 抽題與洗牌

`useQuiz` hook MUST 於初始化時從題庫隨機抽 10 題；單選題的 `options` MUST 經洗牌後輸出，並提供洗牌後的 `shuffledCorrectIndex`。是非題以「正確」恆置於索引 0（`shuffledCorrectIndex = 0` 當 `correct === true`）。

#### Scenario: 初始化抽出 10 題

- **WHEN** 呼叫 `useQuiz()`
- **THEN** `questions.length === 10`、無重複 id（對應 `hooks/useQuiz.test.ts` 之「應抽出 10 題且不重複」）

#### Scenario: 單選題選項已洗牌且 shuffledCorrectIndex 正確

- **WHEN** 渲染當前單選題
- **THEN** `questions[i].options` 順序與原題庫不必相同；`shuffledCorrectIndex` 指向 `options` 中正確答案的位置

### Requirement: 作答狀態機

`useQuiz` MUST 維護 `phase: 'answering' | 'revealed' | 'finished'` 狀態：

- 初始與每題重置為 `answering`
- 呼叫 `selectOption(index)` 後轉為 `revealed` 並鎖定 `selectedIndex`
- 在 `revealed` 呼叫 `nextQuestion()`：若仍有下一題則回到 `answering`，否則進入 `finished`
- 重複呼叫 `selectOption` 或在錯誤 phase 呼叫 `nextQuestion` MUST 為 no-op（guard）

#### Scenario: 選擇選項進入 revealed

- **WHEN** `phase === 'answering'` 時呼叫 `selectOption(2)`
- **THEN** `phase` 變為 `'revealed'`、`selectedIndex === 2`

#### Scenario: 答題後再次點擊不可改

- **WHEN** `phase === 'revealed'` 時再呼叫 `selectOption(0)`
- **THEN** state 不變（對應 useQuiz.test 「revealed 階段 selectOption 應為 no-op」）

#### Scenario: 完成最後一題進入 finished

- **WHEN** 第 10 題已 `revealed` 後呼叫 `nextQuestion()`
- **THEN** `phase === 'finished'`、`score` 為答對數量

### Requirement: 計分與重玩

`useQuiz` MUST 於每次 `selectOption` 時依 `shuffledCorrectIndex` 累計 `score`；`restart()` MUST 重新抽題與洗牌、歸零 `score`、`currentIndex`、`phase`。

#### Scenario: 答對加分

- **WHEN** `selectOption(shuffledCorrectIndex)`
- **THEN** `score` +1

#### Scenario: 重新開始

- **WHEN** 在 `finished` 階段呼叫 `restart()`
- **THEN** `phase === 'answering'`、`currentIndex === 0`、`score === 0`、`questions` 重新抽題

### Requirement: 測驗 UI 呈現

`/quiz` 路由 MUST 顯示進度條（目前題號 / 總題數）與當前題目。`QuestionCard` MUST 提供 `answering` 與 `revealed` 兩種視覺態：`revealed` 時正確選項以綠色標示、所選錯誤選項以紅色標示，並顯示 `explanation`。`ResultScreen` MUST 顯示最終分數、依分數區間的鼓勵文字，及「再試一次」「回到指南」兩個行動按鈕。

#### Scenario: 顯示進度

- **WHEN** 使用者位於第 3 題
- **THEN** 進度條顯示 `3 / 10`

#### Scenario: 答題後顯示對錯與解說

- **WHEN** 使用者點擊任一選項
- **THEN** 該選項與正確選項以對應顏色標示；`explanation` 文字顯示於選項區下方

#### Scenario: 結果頁按鈕

- **WHEN** 完成全部 10 題
- **THEN** 畫面顯示分數、鼓勵文字、以及「再試一次」（觸發 restart）與「回到指南」（連回 `/`）兩按鈕

### Requirement: Client-only 渲染避免 hydration mismatch

`/quiz` 之 QuizShell MUST 以 `dynamic(import(...), { ssr: false })` 載入，且該 `dynamic` 呼叫 MUST 位於 Client Component。E2E 測試 MUST 包含 hydration error 為 0 的斷言以防退化。

#### Scenario: 進入 /quiz 無 hydration error

- **WHEN** Playwright 開啟 `/quiz` 並監聽 console
- **THEN** 收集到的 hydration 相關錯誤陣列長度為 0（對應 `tests/e2e/specs/quiz.spec.ts`）
