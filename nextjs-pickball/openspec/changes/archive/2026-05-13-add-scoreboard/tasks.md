## 1. 純邏輯層 — Types / Rules / Reducer / Storage

- [x] 1.1 建立 `lib/scoreboard/types.ts`：zod schemas（ModeSchema、TeamSchema 等）+ z.infer 推導 TS 型別 + Action union
- [x] 1.2 TDD：`lib/scoreboard/rules.ts` — `getServeSide`（偶→right、奇→left）
- [x] 1.3 TDD：`lib/scoreboard/rules.ts` — `isGameWon`（11 分 + 贏 2 分判定）
- [x] 1.4 TDD：`lib/scoreboard/rules.ts` — `applyRallyResult` 單打分支
- [x] 1.5 TDD：`lib/scoreboard/rules.ts` — `applyRallyResult` 雙打標準輪換（#1→#2、#2→side-out）
- [x] 1.6 TDD：`lib/scoreboard/rules.ts` — 0-0-2 起手規則覆蓋測試
- [x] 1.7 TDD：`lib/scoreboard/reducer.ts` — `createInitialState` + `SET_MODE` / `SET_FIRST_SERVER`
- [x] 1.8 TDD：`lib/scoreboard/reducer.ts` — `RALLY_WON`（含狀態轉換 setup→playing、勝利判定）
- [x] 1.9 TDD：`lib/scoreboard/reducer.ts` — `UNDO`（事件流 replay + `firstServer` 持久化進 state）
- [x] 1.10 TDD：`lib/scoreboard/reducer.ts` — `RESET` + `HYDRATE`
- [x] 1.11 TDD：`lib/scoreboard/storage.ts` — read/write/clear + zod schema 驗證 + 損壞資料 fallback

## 2. React Hooks

- [x] 2.1 TDD：`hooks/useScoreboardStore.ts` — useReducer + localStorage 整合（含 StrictMode-safe 競態修正）
- [x] 2.2 TDD：`hooks/useOrientation.ts` — useSyncExternalStore，偵測 portrait/landscape
- [x] 2.3 TDD：`hooks/useFullscreen.ts` — useSyncExternalStore，Fullscreen API + 跨瀏覽器降級

## 3. shadcn 元件

- [x] 3.1 安裝 shadcn dialog、alert-dialog、select（`pnpm dlx shadcn@latest add ...`）

## 4. UI 元件

- [x] 4.1 `components/scoreboard/ServeIndicator.tsx` — ● + 左/右場文字（呼叫 getServeSide）
- [x] 4.2 `components/scoreboard/TeamPanel.tsx` — 分數、ServeIndicator、「贏這球+」按鈕（invisible 佔位避免位移）
- [x] 4.3 `components/scoreboard/ScoreboardSetup.tsx` — mode/firstServer toggle + 全螢幕按鈕
- [x] 4.4 `components/scoreboard/ActionBar.tsx` — Undo + Reset（AlertDialog 二次確認）
- [x] 4.5 `components/scoreboard/OrientationHint.tsx` — useSyncExternalStore + sessionStorage dismiss
- [x] 4.6 `components/scoreboard/GameOverDialog.tsx` — 再來一局/關閉（previous render state pattern）
- [x] 4.7 `components/scoreboard/Scoreboard.tsx` — 主容器，組合子元件，side-out toast 視覺回饋

## 5. 路由 + 全域 Navbar

- [x] 5.1 `app/scoreboard/page.tsx` — 路由入口，metadata
- [x] 5.2 `components/layout/SiteNavbar.tsx` — fixed top，useScrolledPast 雙態樣式，view transition 連結
- [x] 5.3 `app/layout.tsx` — 掛載 SiteNavbar（在 ViewTransition 外）
- [x] 5.4 `components/guide/TocBar.tsx` — `top-0` 改 `top-14`

## 6. CSS

- [x] 6.1 `app/globals.css` — 加入 `@keyframes rallyFeedback` + `.animate-rally-feedback` utility

## 7. E2E 測試

- [x] 7.1 `tests/e2e/specs/scoreboard.spec.ts` — 6 個場景：Navbar 進入、完整比賽 11-0、Undo、Reset 二次確認、localStorage 持久化、直式提示橫幅

## 8. Bug Fixes（實作過程中發現）

- [x] 8.1 `useScoreboardStore` — 修正 effect 順序競態：write effect 前置 + ref 守門 + StrictMode cleanup
- [x] 8.2 `useFullscreen` — 改 useSyncExternalStore 解 hydration mismatch
- [x] 8.3 `OrientationHint` — 改 useSyncExternalStore 解 SSR/client 初始值不一致
- [x] 8.4 `GameOverDialog` — previous render state pattern 解「ActionBar Reset 後新局 dialog 不開」
- [x] 8.5 `TeamPanel` — ServeIndicator invisible 佔位，防止「贏這球+」位移
