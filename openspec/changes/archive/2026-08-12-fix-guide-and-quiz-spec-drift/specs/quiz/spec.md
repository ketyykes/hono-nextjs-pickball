## MODIFIED Requirements

### Requirement: 題庫資料結構

系統 SHALL 提供位於 `nextjs-pickball/data/quiz/questions.ts` 的 readonly 題庫，以 named export `QUESTION_BANK` 匯出，包含至少 25 題、混合 `multiple-choice` 與 `true-false` 兩種題型。每題 MUST 具備唯一 `id`、非空 `text`（題目文字）、非空 `explanation`（解說），並依題型提供 `options`+`correctIndex`（單選）或 `correct`（是非）。

題庫的不變量 MUST 有直接的自動化驗收，SHALL NOT 只倚賴 `useQuiz` 抽題測試的間接觸及 —— 後者驗的是抽出的 10 題，不等於題庫本身的完整性。

#### Scenario: 題庫提供足夠題目且 id 唯一

- **WHEN** 讀取 `QUESTION_BANK` 常數
- **THEN** 長度至少 25；所有 `id` 全域唯一
- **驗收**：`nextjs-pickball/data/quiz/questions.test.ts`，it 名稱「題庫至少提供 25 題」與「所有題目 id 全域唯一」

#### Scenario: 單選題選項與正解索引合法

- **WHEN** 走訪 `QUESTION_BANK` 中所有 `type === 'multiple-choice'` 的題目
- **THEN** 每題 `options.length >= 2`，且 `0 <= correctIndex < options.length`
- **驗收**：`nextjs-pickball/data/quiz/questions.test.ts`，it 名稱「multiple-choice 題目的 options 至少 2 個且 correctIndex 落在範圍內」

#### Scenario: 兩種題型皆存在且欄位完整

- **WHEN** 走訪 `QUESTION_BANK`
- **THEN** 同時存在 `multiple-choice` 與 `true-false` 兩種題型；`true-false` 題的 `correct` 為 boolean；每題 `text` 與 `explanation` 皆非空字串
- **驗收**：`nextjs-pickball/data/quiz/questions.test.ts`，it 名稱「題庫同時包含 multiple-choice 與 true-false 兩種題型」、「true-false 題目的 correct 為 boolean」、「每題都有非空的 text 與 explanation」

#### Scenario: serve-04 採用 2021 後新規

- **WHEN** 讀取 id 為 `serve-04` 的題目
- **THEN** 題目／解說反映「Let serve 已廢除」之最新規則，不得回退為舊規
- **驗收**：`nextjs-pickball/data/quiz/questions.test.ts`，it 名稱「serve-04 反映 2021 年後廢除 Let serve 的新規」

### Requirement: 抽題與洗牌

`useQuiz` hook MUST 於初始化時從 `QUESTION_BANK` 隨機抽 10 題；單選題的 `options` MUST 經洗牌後輸出，並提供洗牌後的 `shuffledCorrectIndex`。

是非題的 `ShuffledQuestion` MUST NOT 攜帶 `options` 欄位；其 `shuffledCorrectIndex` 為 `correct ? 0 : 1`。顯示用的兩個固定選項由 `nextjs-pickball/components/quiz/QuestionCard.tsx` 的 `getDisplayOptions` 於渲染時提供，SHALL NOT 由 hook 產生 —— 那是呈現層的文案，不是題目資料。

#### Scenario: 初始化抽出 10 題且不重複

- **WHEN** 呼叫 `useQuiz()`
- **THEN** `questions.length === 10`、無重複 id、且每題皆來自 `QUESTION_BANK`
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「初始化時從題庫隨機抽出 10 題」、「初始化時不重複抽題」、「初始化時所有題目都來自題庫」

#### Scenario: 單選題選項已洗牌且 shuffledCorrectIndex 正確

- **WHEN** 渲染當前單選題
- **THEN** `questions[i].options` 順序與原題庫不必相同；`options[shuffledCorrectIndex]` 等於原題正解選項的文字
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「洗牌後 options[shuffledCorrectIndex] 等於原題正解選項」

#### Scenario: 是非題正解索引依 correct 決定且不帶 options

- **WHEN** 抽出的題目為 `true-false`
- **THEN** 該題物件不含 `options` 欄位；`correct === true` 時 `shuffledCorrectIndex === 0`、`correct === false` 時為 `1`
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「true-false 題的 shuffledCorrectIndex 依 correct 決定」

### Requirement: 作答狀態機

`useQuiz` MUST 維護 `phase: 'answering' | 'revealed' | 'finished'` 狀態：

- 初始與每題重置為 `answering`
- 呼叫 `selectOption(index)` 後轉為 `revealed` 並鎖定 `selectedOption`
- 在 `revealed` 呼叫 `nextQuestion()`：若仍有下一題則回到 `answering`，否則進入 `finished`
- 重複呼叫 `selectOption` 或在錯誤 phase 呼叫 `nextQuestion` MUST 為 no-op（guard）

對外回傳的欄位名為 `selectedOption: number | null` 與 `answers: boolean[]`；**不存在 `selectedIndex`，也不存在 `score`**。

#### Scenario: 選擇選項進入 revealed

- **WHEN** `phase === 'answering'` 時呼叫 `selectOption(2)`
- **THEN** `phase` 變為 `'revealed'`、`selectedOption === 2`
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「selectOption 後 phase 變為 revealed」

#### Scenario: 答題後再次點擊不可改

- **WHEN** `phase === 'revealed'` 時再呼叫 `selectOption(0)`
- **THEN** state 不變
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「revealed phase 呼叫 selectOption 不產生副作用」

#### Scenario: 完成最後一題進入 finished

- **WHEN** 第 10 題已 `revealed` 後呼叫 `nextQuestion()`
- **THEN** `phase === 'finished'`；答對數量為 `answers` 中 `true` 的筆數
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「最後一題 nextQuestion 後 phase 變為 finished」

### Requirement: 計分與重玩

`useQuiz` MUST 於每次 `selectOption` 時依 `shuffledCorrectIndex` 判定正誤，並 push 一筆 boolean 至 `answers`；`restart()` MUST 重新抽題與洗牌、清空 `answers`、歸零 `currentIndex`、重置 `phase`。

分數 MUST NOT 由 hook 維護，而由 UI 層自 `answers` 推導（`nextjs-pickball/components/quiz/QuizShell.tsx` 的 `answers.filter(Boolean).length`）—— 單一事實來源為 `answers`，避免兩份狀態不同步。

#### Scenario: 答對時 answers 新增 true

- **WHEN** `selectOption(shuffledCorrectIndex)`
- **THEN** `answers` 新增一筆 `true`
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「selectOption 選擇正確答案時 answers 新增 true」

#### Scenario: 答錯時 answers 新增 false

- **WHEN** `selectOption` 傳入非 `shuffledCorrectIndex` 的索引
- **THEN** `answers` 新增一筆 `false`
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「selectOption 選擇錯誤答案時 answers 新增 false」

#### Scenario: 分數由 UI 層自 answers 推導

- **WHEN** `QuizShell` 準備傳給 `ResultScreen` 的分數
- **THEN** 其值為 `answers.filter(Boolean).length`，`useQuiz` 本身不回傳分數欄位

#### Scenario: 重新開始

- **WHEN** 在 `finished` 階段呼叫 `restart()`
- **THEN** `phase === 'answering'`、`currentIndex === 0`、`answers` 長度為 0、`questions` 重新抽題
- **驗收**：`nextjs-pickball/hooks/useQuiz.test.ts`，it 名稱「restart 後 currentIndex 歸零、answers 清空、phase 為 answering」
