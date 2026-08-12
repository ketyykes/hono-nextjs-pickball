## Why

`pickleball-guide-page` 與 `quiz` 兩份 spec 描述的是舊實作。目前的狀態不只是「不精確」，而是**會主動誤導實作者**：

| spec 說 | 實際是 | 後果 |
|---|---|---|
| 提供 `useFadeInOnView` hook 與 `hooks/useFadeInOnView.test.ts`（五處） | 該 hook 已於 commit `17ce6c6` 刪除，改用 motion `whileInView`；全 repo 原始碼零命中 | 照 spec 做的人會去實作一個幽靈檔案 |
| `useQuiz` 對外有 `selectedIndex` 與 `score`（六處） | 實際是 `selectedOption` 與 `answers: boolean[]`，分數由 UI 層推導 | 照 spec 寫的程式碼直接 undefined |
| `globals.css` 須有 `@keyframes fadeUp` 與 `.animate-fade-up` | 零命中；Hero 進場已由 motion `staggerChildren` 接手 | spec 要求補一套重複機制 |
| 題庫常數名為 `questions` | named export 是 `QUESTION_BANK` | import 會失敗 |
| 兩個 `it` 名稱可作為驗收錨點 | 那兩個字串在測試檔零命中 | `-t` 過濾抓不到任何案例 |

同一份 spec 內部還自相矛盾：Requirement 標題寫「三支 hooks」、內文寫「四支」；TocBar 透明態一處寫 `/30` 一處寫 `/20`。

另有兩類結構性問題：

- **脆弱的數量斷言**：spec 兩處要求 `components/guide/` 頂層「恰好 15 個檔」，實際 16 個（多 `HeroTourCta.tsx`，其行為由 tour-experience 規範）。同目錄被兩個 capability 共用時，「恰好 N 個」必然誤報。
- **不可能通過的驗收**：spec 同時要求 `docs/pickleball-guide.html` **存在**且被 `.gitignore` **忽略**。乾淨 clone 上必然失敗。

## What Changes

### spec 修正

- `pickleball-guide-page`：6 條 Requirement 修正 + 1 條新增
  - 清除全部 `useFadeInOnView` 引用，改以新 Requirement「section 捲入視窗時以 motion whileInView 淡入」承接
  - `keyframes` Requirement 改為「只定義實際被使用的動畫」，移除 `fadeUp` 要求（決策 **D1**）
  - hooks 統一為三支，並註明同目錄其餘 6 支的 capability 歸屬
  - 數量斷言改為「必要檔案存在」，不再寫「恰好 N 個」
  - TocBar 樣式對齊實作（`shadow-sm`、透明態 `/30`）
  - 原型 HTML 改為「本機選配資產，不得作為驗收條件」
  - 比較表 3 張 → 4 張
- `quiz`：4 條 Requirement 修正
  - `selectedIndex` → `selectedOption`、`score` → `answers`（六處）
  - `questions` → `QUESTION_BANK`
  - 失效的 it 錨點全部換成實際存在的名稱
  - 明寫「分數由 UI 層自 `answers` 推導，hook 不維護分數」

### 程式碼變更

- **新增** `data/quiz/questions.test.ts`：題庫不變量（25 題、id 唯一、選項與索引合法、兩種題型、非空欄位、serve-04 新規）
- **新增** `components/guide/shared/Section.test.tsx` 並修改 `Section.tsx`：加上 reduced-motion 降級（**唯一的真 red-first**）
- **新增** `components/guide/TocBar.test.tsx`：spec 早有三條完整 className Scenario 卻無測試檔
- **新增** `data/guide/tocItems.test.ts`：TOC id ↔ section id 的跨檔耦合守衛
- **擴充** `hooks/useQuiz.test.ts`：補洗牌相關 2 條斷言
- **刪除** `globals.css` 的 `.animate-fade-in` / `.animate-slide-up` / `.animate-scale-in` 與對應 `@keyframes`（三者零使用）
- **同步** `nextjs-pickball/CLAUDE.md` 與 `README.md` 的元件／hook 數量

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `pickleball-guide-page`：6 條 MODIFIED + 1 條 ADDED（動畫機制、hooks 數量與歸屬、TocBar 樣式、拆檔結構驗收方式、原型 HTML 定位、比較表數量）
- `quiz`：4 條 MODIFIED（題庫常數名與不變量驗收、抽題洗牌錨點、狀態機欄位名、計分機制）

## Impact

- **受影響檔案**
  - spec：`openspec/specs/pickleball-guide-page/spec.md`、`openspec/specs/quiz/spec.md`（archive 時由 delta 套用）
  - 新增測試：`data/quiz/questions.test.ts`、`components/guide/shared/Section.test.tsx`、`components/guide/TocBar.test.tsx`、`data/guide/tocItems.test.ts`
  - 修改實作：`components/guide/shared/Section.tsx`（reduced-motion）、`app/globals.css`（刪死碼）
  - 擴充測試：`hooks/useQuiz.test.ts`
  - 文件：`nextjs-pickball/CLAUDE.md`、`nextjs-pickball/README.md`
- **測試影響**：測試檔 15 → 19；測試數 77 → 約 95
- **風險**
  - `Section.tsx` 是全部 10 個 guide section 的容器，改動會影響整頁進場觀感 → 以 E2E 視覺確認
  - 刪除 `globals.css` 三個 utility 前已確認 `app/**` 與 `components/**` 零使用；若有遺漏由 `pnpm lint` 與 E2E 攔截
- **明確不做**：`spec.md:38` 的 577 字 Requirement 拆分（strict 下只是 `[INFO]`，拆它是為了討好 linter 而非清規格債）
