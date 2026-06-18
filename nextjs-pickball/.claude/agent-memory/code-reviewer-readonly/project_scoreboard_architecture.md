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
- 已知測試缺口：無 `writeScoreboard` quota 失敗案例、無 SSR guard 驗證、無 `clearScoreboard` localStorage.removeItem 拋例外測試。

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
