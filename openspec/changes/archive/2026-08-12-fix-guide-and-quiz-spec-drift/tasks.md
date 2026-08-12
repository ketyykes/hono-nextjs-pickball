# Tasks — fix-guide-and-quiz-spec-drift

> 分類依 design.md「TDD 分層判定」。**只有 A2 與 B1 走三步**，其餘為例外層或 regression guard。
> 所有指令從 repo root 執行。

## 執行中發現

1. **A2-③ refactor 判定為 `skipped`**：三個 `reduced ? A : B` 條件相同但不巢狀，
   抽成 `motionProps` 物件反而看不出哪個 prop 套用哪一邊。
   依全域規則「清晰度優先於精簡」維持現狀。
2. **delta spec 寫錯一處，已在實作時修正**：原本寫「是非題 `options` 恆為兩個固定選項」。
   實測 `hooks/useQuiz.ts:26-28` 的 true-false 分支是 `{ ...q, shuffledCorrectIndex }`，
   **不帶 `options`**；那兩個選項是 `components/quiz/QuestionCard.tsx:19` 的
   `getDisplayOptions` 在渲染時才給的。spec 已改為如實描述，並明訂
   「顯示文案屬呈現層，不由 hook 產生」。
3. 全套測試 15 檔 77 測 → **19 檔 93 測**。

## A. 三步 TDD

### A1｜`data/quiz/questions.test.ts` — 題庫不變量

> ⚠️ **紅燈性質：檔案不存在。** 實測資料已全數符合斷言（25 題、id 全唯一、14 單選 + 11 是非、
> `serve-04` 已是新規）。**禁止用 mutation check 偽造紅燈**（見 design.md D-②-1）。

- [x] **A1-①（紅）** 執行 `pnpm --filter ./nextjs-pickball test --run data/quiz/questions.test.ts`
  - 期望：`No test files found, exiting with code 1`（EXIT=1）。此輸出原文貼於下方
  - 新增測試檔，`describe("QUESTION_BANK")` 下 6 個 it：
    1. `題庫至少提供 25 題`
    2. `所有題目 id 全域唯一`
    3. `multiple-choice 題目的 options 至少 2 個且 correctIndex 落在範圍內`
    4. `true-false 題目的 correct 為 boolean`
    5. `每題都有非空的 text 與 explanation`
    6. `題庫同時包含 multiple-choice 與 true-false 兩種題型`
    7. `serve-04 反映 2021 年後廢除 Let serve 的新規`
- [x] **A1-②（綠）** `data/quiz/questions.ts` **不需任何改動**；實作動作 = 新增測試檔本身
  - 驗收：`pnpm --filter ./nextjs-pickball test --run data/quiz/questions.test.ts` → 1 檔 7 測全綠
- [x] **A1-③（refactor）** 檢視測試檔是否有重複斷言可抽 helper；若無 → 註記 `skipped`

### A2｜`components/guide/shared/Section.test.tsx` — reduced-motion 降級

> **性質：真 red-first。** `Section.tsx:20-23` 的動畫參數全寫死，未讀 `useReducedMotion`；
> `globals.css:249-256` 的 reduced-motion media query 只作用於 `::view-transition-*`，
> 管不到 motion 的 inline transform。

- [x] **A2-①（紅）** 執行 `pnpm --filter ./nextjs-pickball test --run components/guide/shared/Section.test.tsx`
  - ⚠️ 用完整路徑，不要用 `Section.test.tsx`（會撞 `XxxSection.test.tsx` 子字串）
  - 新增測試檔，3 個 it：
    1. `一般情況下以 whileInView 觸發淡入且 viewport.once 為 true`
    2. `prefers-reduced-motion 啟用時不套用 initial 位移`
    3. `渲染 id、tag 與 title，children 原樣輸出`
  - mock 手法沿用 `components/tour/shared/ScrollTimelineProvider.test.tsx` 的 Proxy 寫法
  - ⚠️ 另外 `vi.mock("@/hooks/useReducedMotion")` —— mock 掉 `motion/react` 後不能用它的同名 export
  - 期望：it 1 與 3 綠、**it 2 紅**（實作未讀 reduced motion）
- [x] **A2-②（綠）** 改 `components/guide/shared/Section.tsx`：`import { useReducedMotion } from "@/hooks/useReducedMotion"`，
      `initial={reduced ? false : { opacity: 0, y: 24 }}`、`whileInView={reduced ? undefined : { opacity: 1, y: 0 }}`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run components/guide/shared/Section.test.tsx` → 3 測全綠
- [x] **A2-③（refactor）** 若三元運算重複，抽 `const motionProps = reduced ? {} : {...}`；否則註記 `skipped`

## B. Regression guard（實作已存在，寫測試會直接綠燈 — 不套三步）

- [x] **B1** 新增 `components/guide/TocBar.test.tsx`，3 個 it，名稱取自 spec Scenario：
      `TocBar 在 Hero 範圍內為透明底且不帶 shadow`、`TocBar 在捲離 Hero 後為白底加 shadow-sm`、`TOC link 在對應 section 進入視窗時高亮`
  - 依據：spec 早有三條含 className 斷言的 Scenario，卻無測試檔
  - 驗收：`pnpm --filter ./nextjs-pickball test --run components/guide/TocBar.test.tsx` EXIT=0
- [x] **B2** 新增 `data/guide/tocItems.test.ts`，1 個 it：`每個 TOC item 的 id 都能在 guide section 元件中找到對應 id 屬性`
  - 依據：10 個 TOC id 與 section 元件 `id` 屬性是跨檔耦合，改單邊會靜默壞掉
  - 驗收：`pnpm --filter ./nextjs-pickball test --run data/guide/tocItems.test.ts` EXIT=0
- [x] **B3** 擴充 `hooks/useQuiz.test.ts`，補 2 個 it：
      `洗牌後 options[shuffledCorrectIndex] 等於原題正解選項`、`true-false 題的 shuffledCorrectIndex 依 correct 決定`
  - 驗收：`pnpm --filter ./nextjs-pickball test --run hooks/useQuiz.test.ts` → 16 測全綠（原 14 + 2）

## C. 純樣式（例外層）

- [x] **C1** `app/globals.css` 刪除 `.animate-fade-in`、`.animate-slide-up`、`.animate-scale-in` 三個 utility
- [x] **C2** `app/globals.css` 刪除對應的 `@keyframes fadeIn`、`slideUp`、`scaleIn`
  - 依據（實測）：三者在 `app/**` 與 `components/**` 皆 0 處使用；仍在用的是 `animate-float-ball`(1)、`animate-bounce-down`(1)、`animate-rally-feedback`(1)
  - ⚠️ 不要動 `@keyframes fade`（`:230`）與 `vt-slide`（`:239`）—— 那兩個服務 view transition，不是 utility
  - 驗收：`pnpm lint` EXIT=0；`pnpm --filter ./nextjs-pickball test --run` 全綠；E2E 視覺無異常

## D. spec 文字（例外層，delta 已寫好，此處只列需直接動主 spec 者）

- [x] **D1** 直接編輯 `openspec/specs/pickleball-guide-page/spec.md` 的 Purpose 段落補到 50 字以上
  - 依據：Purpose 不是 Requirement，delta 機制無法承載（見 design.md D-②-5）
  - 驗收：`DO_NOT_TRACK=1 openspec validate pickleball-guide-page --strict` 的 Purpose WARNING 消失

## E. 文件數量同步（例外層）

- [x] **E1** `nextjs-pickball/CLAUDE.md` shadcn 元件「共 8 個」→ 實際 11 個（補 alert-dialog、dialog、select）
- [x] **E2** `nextjs-pickball/CLAUDE.md` 「11 個 Section」→ 10 個 Section + `HeroTourCta`
- [x] **E3** `nextjs-pickball/CLAUDE.md` hooks「4 支」→ 9 支，並依 capability 分組
- [x] **E4** `nextjs-pickball/README.md` 「shadcn/ui 元件（8 個）」→ 11 個
- [x] **E5** `nextjs-pickball/README.md` 「11 個 Section」→ 10 個
- [x] **E6** `nextjs-pickball/README.md` 「4 支 scroll/observer hooks」→ 9 支
  - 驗收：數字與 `ls` 實測一致

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

# 1. spec 幽靈引用歸零
grep -c "useFadeInOnView" openspec/changes/fix-guide-and-quiz-spec-drift/specs/pickleball-guide-page/spec.md   # 期望 1（僅 ADDED 段的歷史說明）
grep -c "selectedIndex" openspec/changes/fix-guide-and-quiz-spec-drift/specs/quiz/spec.md                      # 期望 1（僅「不存在 selectedIndex」那句）

# 2. 動畫死碼歸零
grep -n "animate-fade-in\|animate-slide-up\|animate-scale-in\|fadeUp\|fade-up" nextjs-pickball/app/globals.css  # 期望無輸出

# 3. 測試
pnpm --filter ./nextjs-pickball test --run data/quiz/questions.test.ts
pnpm --filter ./nextjs-pickball test --run components/guide/shared/Section.test.tsx
pnpm --filter ./nextjs-pickball test --run components/guide/TocBar.test.tsx
pnpm --filter ./nextjs-pickball test --run data/guide/tocItems.test.ts
pnpm --filter ./nextjs-pickball test --run hooks/useQuiz.test.ts
pnpm --filter ./nextjs-pickball test --run          # 期望 19 檔、約 95 測全綠

# 4. lint 與型別
pnpm lint
pnpm -r exec tsc --noEmit

# 5. openspec
DO_NOT_TRACK=1 openspec validate --all
DO_NOT_TRACK=1 openspec validate fix-guide-and-quiz-spec-drift --strict
```
