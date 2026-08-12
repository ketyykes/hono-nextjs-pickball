# 規則隨堂測驗 設計文件

**日期：** 2026-05-13
**狀態：** 已確認，待實作

---

## 功能概述

在 `/quiz` 新增一個獨立的匹克球規則隨堂測驗頁面。使用者可從題庫（25 題）中隨機抽取 10 題，一題一題作答，立即獲得對錯回饋與說明，最後看到總成績。

---

## 架構

### 檔案結構

```
app/quiz/page.tsx                   ← 路由入口（Server Component，含 metadata）
components/quiz/
  QuizShell.tsx                     ← "use client"，主控邏輯與畫面切換
  QuestionCard.tsx                  ← 顯示單一題目與選項（answering / revealed 兩態）
  ResultScreen.tsx                  ← 答完 10 題後的成績頁
hooks/
  useQuiz.ts                        ← 管理 QuizState，含洗牌邏輯
  useQuiz.test.ts
data/quiz/
  questions.ts                      ← 題庫（25 題）與型別定義
```

### 導航

SiteNavbar 加入「測驗」連結指向 `/quiz`。

---

## 狀態設計

### QuizPhase

```ts
type QuizPhase = 'answering' | 'revealed' | 'finished'
```

### QuizState

```ts
interface QuizState {
  questions: ShuffledQuestion[]   // 本輪抽出的 10 題（選項已打亂）
  currentIndex: number            // 0–9
  phase: QuizPhase
  selectedOption: number | null   // 使用者本次選擇的選項 index
  answers: boolean[]              // 每題是否答對
}
```

### 流程

```
answering → (selectOption) → revealed → (nextQuestion) → answering（下一題）
                                                       └→ finished（第 10 題後）
finished → (restart) → answering（重新洗牌，從第 1 題開始）
```

---

## 資料結構（題庫）

```ts
type MultipleChoiceQuestion = {
  id: string
  type: 'multiple-choice'
  text: string
  options: string[]       // 原始選項順序
  correctIndex: number    // 原始正確選項 index
  explanation: string
}

type TrueFalseQuestion = {
  id: string
  type: 'true-false'
  text: string
  correct: boolean
  explanation: string
}

type Question = MultipleChoiceQuestion | TrueFalseQuestion

// 洗牌後的版本（選項已重排，correctIndex 已同步更新）
type ShuffledQuestion = Question & { shuffledCorrectIndex: number }
```

### 隨機化策略

- 啟動 / 重啟測驗時，從 25 題題庫隨機抽 10 題（Fisher-Yates shuffle）
- 每道多選題的選項順序各自打亂，`shuffledCorrectIndex` 同步更新為打亂後正確答案的位置
- 是非題選項固定（「正確 / 錯誤」），不打亂
- 打亂在初始化階段一次完成，答題過程中不再變動

### 題庫章節分佈（共 25 題）

| 章節 | 題數 |
|------|------|
| 球場規則 | 4 |
| 發球規則 | 5 |
| 計分規則 | 4 |
| 違規與犯規 | 5 |
| 球拍與器材 | 4 |
| 兩跳規則 | 3 |

---

## 元件設計

### QuizShell

- 呼叫 `useQuiz()` 取得狀態與操作方法
- 顯示頂部進度條（第 X / 10 題）
- `phase === 'finished'` → 渲染 `ResultScreen`
- 其他 → 渲染 `QuestionCard`

### QuestionCard

Props：`question`、`phase`、`selectedOption`、`onSelect`、`onNext`

- **answering 態**：顯示題目文字 + 選項按鈕，可點選
- **revealed 態**：
  - 正確選項按鈕變綠色
  - 答錯時：使用者選的按鈕變紅色
  - 顯示說明文字（`explanation`）
  - 所有選項 disabled，防止重選
  - 顯示「下一題」按鈕（最後一題顯示「看結果」）

### ResultScreen

Props：`correctCount`、`total`（固定 10）、`onRestart`

- 顯示 `x / 10 題答對`
- 依分數段顯示不同鼓勵文字：
  - 0–4：「繼續加油，再讀一次指南吧！」
  - 5–7：「不錯！再練習幾次就能掌握規則」
  - 8–10：「太強了！你已經是規則達人了」
- 「再試一次」按鈕 → `onRestart`（重新洗牌）
- 「回到指南」連結 → `/`

---

## 測試策略

### useQuiz.test.ts（TDD，先寫 failing test）

| 測試情境 | 驗證內容 |
|----------|----------|
| 初始化 | 從 25 題中抽出恰好 10 題 |
| 初始化 | 多選題選項已打亂（shuffledCorrectIndex 與原始 correctIndex 對應正確） |
| selectOption | phase 由 `answering` → `revealed` |
| selectOption（答對） | answers 陣列新增 `true` |
| selectOption（答錯） | answers 陣列新增 `false` |
| nextQuestion（非最後題） | currentIndex +1，phase → `answering` |
| nextQuestion（最後一題） | phase → `finished` |
| restart | currentIndex 歸零，answers 清空，重新抽題 |

### E2E smoke（Playwright）

- 進入 `/quiz` → 看到第一題
- 完整答完 10 題 → 看到成績頁
- 點「再試一次」→ 回到第一題

---

## 排除範圍（不在本次實作內）

- 答題歷史紀錄 / 統計
- 登入與個人化
- 題目難易度分級
- 分享成績功能
