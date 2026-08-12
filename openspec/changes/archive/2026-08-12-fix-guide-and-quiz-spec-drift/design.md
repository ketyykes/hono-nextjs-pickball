## Context

本 change 修的是「spec 落後於實作」的漂移。絕大多數 task 是規格文字修正，
但其中夾雜四組要補的測試，性質**各不相同**。把它們混為一談會導致偽造紅燈，
因此設計的第一件事就是把它們分類清楚。

## TDD 分層判定（依 `openspec/config.yaml:12-16`）

| 項目 | 分類 | 依據 |
|---|---|---|
| `openspec/specs/**` 的 spec 文字 | **例外層** | 非程式碼 |
| `nextjs-pickball/CLAUDE.md`、`README.md` | **例外層** | 純文件 |
| `app/globals.css` 刪除死碼 utility | **例外層** | `config.yaml:13` 純樣式檔 |
| `data/quiz/questions.test.ts` | **行為邏輯**（`data/**`） | 走三步，但紅燈性質特殊，見 D-②-1 |
| `components/guide/shared/Section.tsx` | **行為邏輯**（`components/**`） | 走三步，真 red-first |
| `components/guide/TocBar.test.tsx` | **補測試，非 TDD** | 見 D-②-2 |
| `data/guide/tocItems.test.ts` | **補測試，非 TDD** | 見 D-②-2 |
| `hooks/useQuiz.test.ts` 擴充 | **補測試，非 TDD** | 見 D-②-2 |

## 關鍵決策

### D-②-1｜題庫測試的紅燈只來自「檔案不存在」，必須誠實標註

`data/quiz/questions.test.ts` 屬 `data/**`，落在必 TDD 範圍。但實測資料**已全數符合**
即將寫下的斷言（25 題、id 全唯一、14 單選 + 11 是非、`serve-04` 已是廢除 Let serve 的新規）。

因此：
- 唯一合法的紅燈是 `No test files found, exiting with code 1`（EXIT=1）
- **禁止用 mutation check 偽造紅燈**（把 `>= 25` 改成 `>= 26` 看紅再改回）。
  那不是 TDD，是為了讓紀錄好看而說謊，比誠實承認「這是回歸測試」更糟
- tasks.md 逐條標明此性質，紅燈輸出原文貼上

同樣的誠實標準適用於 `⑤` 之後每一個「補測試」的 change。

### D-②-2｜三組補測試明確標為 regression guard，不套三步

TocBar、tocItems、useQuiz 洗牌這三項的行為**早已實作且正確**，先寫測試會直接綠燈。
依 `config.yaml:28`「例外層 task 不強制三步拆分，但至少要指定驗收方式」處理，
在 tasks.md 記為「性質：regression guard，實作已存在，驗收＝指令 EXIT=0」。

它們仍然值得補，理由各不相同：
- **TocBar**：spec `:158-172` 早有三條含 className 斷言的完整 Scenario，卻沒有任何測試檔 ——
  直接違反 `config.yaml:22`「行為邏輯情境須可直接對應到 Vitest test case」
- **tocItems**：`data/guide/tocItems.ts` 的 10 個 id 與 section 元件的 `id` 屬性是跨檔耦合，
  改單邊會靜默壞掉（TOC 點了跳不到），是典型「沒測試就會回歸」的形狀
- **useQuiz 洗牌**：spec 的「單選題選項已洗牌且 shuffledCorrectIndex 正確」Scenario
  在既有 15 條 it 中無對應

### D-②-3｜Section 的 reduced-motion 是本 change 唯一的真 red-first

`Section.tsx:20-23` 的 `initial` / `whileInView` / `viewport` / `transition` 全是寫死常數，
未讀任何 reduced-motion 判定。`app/globals.css` 的 `@media (prefers-reduced-motion: reduce)`
只作用於 `::view-transition-*`，**管不到 motion 打在元素上的 inline transform**。
先寫測試必紅。

**實作要點與已知的坑**：
- mock 手法沿用本 repo 既有 precedent：`components/tour/shared/ScrollTimelineProvider.test.tsx`
  用 Proxy 把 `motion.*` 換成記錄 props 的假元件
- ⚠️ mock 掉 `motion/react` 之後，`useReducedMotion` **必須**從 `@/hooks/useReducedMotion`
  匯入（repo 自己那支），不能用 `motion/react` 的同名 export，否則會被 Proxy 吞成 `undefined`。
  測試裡另外 `vi.mock("@/hooks/useReducedMotion")`
- 測試檔路徑用完整的 `components/guide/shared/Section.test.tsx`。
  不要用 `Section.test.tsx` 當過濾參數 —— `Section` 是共用元件名，
  未來出現 `XxxSection.test.tsx` 會撞子字串

### D-②-4｜數量斷言改為存在性斷言

spec 原本兩處寫「恰好 15 個檔」。問題不在數字錯（實際 16），而在**斷言形式本身是錯的**：
`components/guide/` 被 pickleball-guide-page 與 tour-experience 兩個 capability 共用
（`HeroTourCta.tsx` 由後者規範，見 `openspec/specs/tour-experience/spec.md:120`），
任何「恰好 N 個」都會在另一個 capability 新增檔案時誤報。

改為列舉必要檔案並斷言其存在。`shared/` 維持「恰好六個」—— 該目錄目前確實由本 capability 獨佔。

### D-②-5｜Purpose 過短要直接改主 spec

`openspec validate --strict` 對 `pickleball-guide-page` 的 Purpose 報 `[WARNING] too brief`（48 字）。
Purpose 不是 Requirement，delta 機制無法承載，必須直接編輯 `openspec/specs/pickleball-guide-page/spec.md`
的 Purpose 段落。這是本 change 唯一直接動主 spec 的地方，tasks.md 需明確標示。

## 不做的事

- **不拆 `spec.md:38` 的長 Requirement**：strict 下是 `[INFO]` 不是 ERROR。該條描述 Hero 浮球
  與主內容避開 fixed nav 的偏移計算，內容本身完整且互相依賴，拆開反而更難讀。
  為了讓 linter 好看而拆規格是本末倒置
- **不補 scoreboard / tour-experience 的任何東西** → 各歸 ③ 與既有 spec
- **不動 `components/ui/` 的 shadcn 數量描述**（`CLAUDE.md` 寫 8 個、實際 11 個）
  → 該處與本 change 的 guide 元件數量無關，但同屬「文件數字漂移」，一併在本 change 的
  文件同步 task 處理，避免留下半修狀態
