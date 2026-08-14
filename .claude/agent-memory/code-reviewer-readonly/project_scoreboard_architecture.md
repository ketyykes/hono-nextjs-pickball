---
name: Scoreboard Architecture Notes
description: Key design decisions and patterns in lib/scoreboard/ (Tasks 1-9+)
type: project
---

`lib/scoreboard/` 採 pure-function TDD 架構：types.ts（zod schema + inferred types）→ rules.ts（純邏輯：getServeSide / isGameWon / applyRallyResult）→ reducer.ts（createInitialState + scoreboardReducer）。

**Why:** spec-driven TDD plan（docs/superpowers/plans/2026-05-11-scoreboard.md）明確要求純邏輯層先行，再接 hooks → UI。

**firstServer 欄位：** Task 9 暴露 UNDO 無法推回原始先發方的問題（servingTeam 已被 rally 改變），設計決策是把 `firstServer: TeamSchema` 永久鎖入 ScoreboardStateSchema，讓 UNDO replay 時直接使用 `state.firstServer`，避免用 servingTeam 代理。

**UNDO 策略：** `state.history.slice(0, -1)` 去掉最後一個 RALLY_WON event，從 `createInitialState({ mode, firstServer })` 重建後以 for-of 逐一 replay。空 history 直接 return state（reference equality 保留，允許 React bailout）。

**`history` 只儲存 RALLY_WON：** `ScoreEventSchema` 僅含 `{ type: "RALLY_WON", winner: Team }`，setup actions（SET_MODE / SET_FIRST_SERVER）不記錄，因為 mode 與 firstServer 已持久化在 state 頂層欄位。

**Task 11 storage.ts 設計決策：**
- `STORAGE_KEY = "scoreboard:current:v1"`，key 含版本號方便日後 migration。
- `hasLocalStorage()` 以 try/catch + `typeof window` 雙重 guard，同時防 SSR 與 Firefox 私密模式。
- `readScoreboard`：`JSON.parse` 失敗與 `safeParse` 失敗都走相同路徑：`removeItem` + warn + return null。`safeParse` 是在 try 區塊內呼叫，因此 schema 驗證失敗以 `!result.success` 分支處理，不走 catch（正確）。
- `writeScoreboard` warn on quota，`clearScoreboard` 靜默（設計刻意區分）。
- 已知測試缺口：無 SSR guard 驗證、無 `clearScoreboard` localStorage.removeItem 拋例外測試。
  （修正：`writeScoreboard` quota 失敗案例其實在 655514a 就已存在——見下方 Task 1 條目，先前記錯為缺口）

**How to apply:** 審查後續 hooks（useScoreboard）時，確認 HYDRATE action 在 `readScoreboard()` 回 non-null 時才 dispatch，並且 write 呼叫時機應在每次 reducer dispatch 後（side-effect hook 層）；storage.ts 本身不應依賴 reducer，保持單向依賴。

**Tasks 16-19 UI 元件設計決策（commits 202ba36–00192b4）：**
- `ServeIndicator` 沒有 `"use client"`，是純展示元件（無 hooks/events），正確。呼叫了 `getServeSide` 純函式，業務邏輯未漏入元件。
- `TeamPanel` 接受整個 `ScoreboardState` 而非只接需要的欄位（score、servingTeam、serverNumber、mode），導致 prop surface 偏大，需留意父層變更時不必要的重新渲染。
- `ActionBar` 的 `confirmOpen` 以 local `useState` 管理，合理（AlertDialog 開關為 UI-only 狀態，不需全域）。`AlertDialogAction` 的 `onClick` 中有一個多餘的 `setConfirmOpen(false)`：`AlertDialogPrimitive.Action` 本身會觸發 `onOpenChange(false)`，因此此呼叫雖無害但冗餘。
- `font-bebas-neue`（`TeamPanel` 使用）：Tailwind 工具類別為 `font-bebas`（`globals.css` `@theme inline` 中 key 為 `--font-bebas`），`font-bebas-neue` 是不存在的 utility class，為 Critical bug。既有 guide 元件一律用 `font-bebas`。
- `ScoreboardSetup` 全螢幕按鈕的 `aria-pressed` 屬於 toggle button 用法，符合 ARIA 規範；Select disabled 狀態靠 `locked` 傳入，正確對應 spec §7.3。

**Task 12 useScoreboardStore 已知設計決策（Task 12, commit 77eb1dd）：**
- 返回型別宣告為 `Dispatch<Action>`，但 React 19 的 `useReducer` 實際回傳 `ActionDispatch<[Action]>`（即 `(value: Action) => void`）。兩者結構相容，`tsc --noEmit` 無報錯，因為 `Dispatch<A> = (value: A) => void` 是 `ActionDispatch<[A]>` 的子集。可接受，但嚴格來說宣告型別應配合 React 19 新型別。
- `(_arg: undefined) => createInitialState()` 包裝的原因：plan 範本用 `createInitialState` 直接傳，但 `createInitialState(overrides?)` 簽名接收 optional 物件參數，不接受 `undefined` arg；包裝後型別完整。
- 兩個 useEffect 的執行順序（test 環境 happy-dom）：mount → effect[state]（寫入預設值）→ effect[]（HYDRATE）→ effect[state]（寫入 hydrated 值）。實際無競態，因兩者都在同一 microtask flush 內依序執行，且 writeScoreboard 是純 side-effect，不影響正確性。
- 測試缺口：缺少 localStorage 不可用（SSR guard）、儲存損壞 schema、UNDO 後 localStorage 同步等邊界案例。

**scoreboard-target-score change（2026-08，655514a→c277ef1）Task 1 審查記錄：**
- Task 1 範圍：`types.ts` 加 `targetScore`（zod `.union([11,15,21]).default(11)`）+ `SET_TARGET_SCORE` action 型別，**刻意不做行為邏輯**（isGameWon 改參數是 Task 2、reducer 加 case 是 Task 3）。
- `ScoreboardStateSchema` 的 output type（`z.infer`）在加了 `.default()` 欄位後變成必填，導致 `reducer.ts` 的 `createInitialState` 回傳字面量物件編譯不過——因此本 task 的 diff **必然外溢到 `reducer.ts`**（硬編 `targetScore: 11` 並附註解「Task 3 會改為可由 overrides 設定」）。這是型別系統逼出的必要漣漪，不算越界：`overrides` 參數簽名沒吃 `targetScore`、switch 沒加 `SET_TARGET_SCORE` case。日後若某欄位從 optional 改 required（或反向），預期同樣會外溢到所有建構該型別字面量的呼叫點，審查時不要誤判為範圍蔓延。
- `reducer.test.ts` 完全沒被這次 diff 動到，是因為它的 fixture 用 `{ ...createInitialState(), ... }` 展開寫法（只有 `rules.test.ts` 的 4 個 fixture 是逐欄位字面量，才需要手動補 `targetScore: 11`）——之後看到「改了 schema 卻只有部分 test 檔跟著改」不要直接當漏改，先看 fixture 是 spread 還是逐欄位字面量。
- 已用 `node -e` 現場驗證 zod `.default()` 行為（缺欄位→補值成功；不合法值如 13→驗證失敗清除；`.optional()` 若誤用會讓缺欄位驗證失敗）：新增的 storage 測試「舊版資料缺 targetScore 時補為 11 且不清除 key」是有效的 regression guard，非誤通過測試。
- 該 change 的 `tasks.md` checkbox 即使程式碼已完成仍全部 `[ ]` 未勾——若被要求審查其他 task，先看 checkbox 別直接信，要對照 diff／git log。

**scoreboard-target-score change（2026-08，e979cfe→9f690c3）Task 2 審查記錄：**
- Task 2 範圍：`isGameWon(scores, targetScore)` 改必填第二參數（無預設值）、`reducer.ts` 唯一呼叫點改傳 `afterRally.targetScore`。實測 `applyRallyResult` 三個分支皆以 `...state` 展開，`targetScore` 必然原樣透傳，呼叫點無邊界風險。
- 範圍界線守得乾淨：`createInitialState` 的 `overrides` 簽名仍是 `{ mode?: Mode; firstServer?: Team }`（沒吃 targetScore）、reducer switch 沒有 `SET_TARGET_SCORE` case、`UNDO`／`RESET` 的重建路徑（`createInitialState({ mode, firstServer })`）未被觸碰——這些都是 Task 3 才會動的，Task 2 沒有越界。
- 既有 5 個 `it` 全部維持名稱與期望值不變，只補第二參數 `11`；新增的兩個 it（15 分制、21 分制）名稱與資料點都與 delta spec「15 分制與 21 分制的勝利判定」Scenario 逐字對齊。
- 發現的測試覆蓋缺口（Medium）：新增的「21 分制」it 只測了我方勝／延長／未達標三種，**沒有測對方（them）獲勝的對稱情況**；相對地「15 分制」it 有多加一筆 `{us:13,them:15}→them 勝`。兩個新 it 的覆蓋深度不對稱，21 分制那個應補一筆 them 獲勝的斷言。
- `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/`（39 tests）與 `tsc --noEmit` 皆已現場驗證全綠，`isGameWon` 全 repo 唯一呼叫點是 `reducer.ts`（grep 確認過，rules.test.ts 之外無他處）。
- `tasks.md` 第 2 節（2.1–2.4）checkbox 依然全部 `[ ]` 未勾，即使程式碼與測試皆已完成並通過——與 Task 1 同樣的 checkbox 落後模式，非本次新發現，但再次確認為此 change 的固定模式，審查後續 Task 3 時比照辦理（先看 diff/測試結果，不看 checkbox）。

**Task 2 re-review（9f690c3→c8063d6）：** 第一輪抓到的「21 分制缺對方獲勝對稱案例」已修正，fix 只新增一行 `expect(isGameWon({ us: 19, them: 21 }, 21)).toEqual({ won: true, winner: "them" })`，範圍乾淨（只動 rules.test.ts，未碰 rules.ts/reducer.ts/openspec/），既有斷言與 it 名稱未被動。手算驗證新斷言數值正確（max=21≥21, diff=2≥2, them>us）且非假防護。`pnpm --filter ./nextjs-pickball test --run lib/scoreboard/rules.test.ts`（17 tests）與 `tsc --noEmit` 皆現場驗證全綠。最終結論 APPROVE，無殘留 Issues。

**scoreboard-target-score change（2026-08，fb69080→71db9d1）Task 3 審查記錄：**
- Task 3 範圍：reducer 加 `SET_TARGET_SCORE` case、三個 `SET_*` 重建點與 `UNDO`／`RESET` 重建點統一保留三項賽前設定、`71db9d1` refactor 收斂為 `MatchSettings` + `settingsOf(state)` helper（與上方 firstServer 段落的既有設計同一模式，本次擴充到 targetScore）。
- 三個 commit 本身是一次完整且誠實的 TDD 示範，用 `git show dfd8f22 -- reducer.ts` 現場核對過：commit 1（`dfd8f22`）新增 `SET_TARGET_SCORE` 時**尚未**動到 `UNDO`／`RESET` 的重建點，該版本的 UNDO 確實會把 `targetScore` 靜默退回 11；commit 2（`53dd01d`）才補上這兩處，屬於真紅燈轉綠，非 mutation check 偽造。日後審查同一 change 拆多個 commit 的 task 時，可比照這個方法逐 commit `git show` 驗證紅燈真偽，而不只看最終 diff。
- 全 repo `grep -rn "createInitialState("` 找到的呼叫點：reducer.ts 內 5 個重建點（`SET_MODE`／`SET_FIRST_SERVER`／`SET_TARGET_SCORE`／`UNDO`／`RESET`）皆用 `settingsOf(state)` 或 `{ ...settingsOf(state), <override> }`；`useScoreboardStore.ts:31` 與 `storage.test.ts` 的無參數呼叫是有意的「全新初始狀態」情境（非重建保留語意），不算遺漏。**這是本類 task 的核心驗收方法**——「遺漏任一 createInitialState 呼叫點」是最容易靜默出錯的地方，全 repo grep 是唯一可靠的涵蓋率確認方式。
- refactor（`71db9d1`）等價性已手算驗證：三個 `SET_*` case 的 `{ ...settingsOf(state), <欄位>: action.xxx }` 展開順序讓 action 值正確覆蓋 spread 值（JS object literal 後面的 key 覆蓋前面），與 refactor 前逐欄位列舉的寫法逐字元等價；`applyRallyResult`（rules.ts）三個分支皆 `...state` 展開，確認 RALLY_WON replay 過程不會意外重設 `targetScore`。
- `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/`（43 tests，3 檔）與 `tsc --noEmit`、`eslint lib/scoreboard/reducer.ts lib/scoreboard/types.ts` 皆現場驗證全綠/無輸出。最終結論 APPROVE，無 High/Medium Issues，僅有 import 排序未字母序的極小 nitpick（eslint 未強制，未列為正式 Issue）。
- `tasks.md` 第 3 節（3.1–3.7）checkbox 依然全部 `[ ]` 未勾，與 Task 1／Task 2 相同的固定模式（此 change 的 orchestrator 習慣在審查通過後才統一勾選，不代表未完成）。

**How to apply:**
