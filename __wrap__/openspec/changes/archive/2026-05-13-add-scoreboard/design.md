## Context

匹克球指南為 Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui 的單頁應用。此前沒有全域 Navbar，路由間只靠 Hero 內的 CTA 按鈕跳轉。`/tour` 路由已有 view transition 過場先例（`transitionTypes={["nav-forward"]}`）。

完整設計文件：`docs/superpowers/specs/2026-05-11-scoreboard-design.md`。

## Goals / Non-Goals

**Goals:**

- 全域 SiteNavbar 掛在 root layout，所有路由共享，不受 view transition 影響。
- `/scoreboard` 提供 Pickleball Traditional side-out 計分器，手機橫向與直向均可使用。
- 計分邏輯純函式化，以利 Vitest TDD 覆蓋規則行為。
- 狀態管理用 `useReducer`（不引入第三方 store），持久化用 zod-validated localStorage。
- SSR 安全：所有 browser API（localStorage、sessionStorage、Fullscreen、matchMedia）均用 `useSyncExternalStore` 或 `useEffect`（HYDRATE pattern）確保 server/client first render 一致。

**Non-Goals:**

- 不支援 Rally Scoring（2026 新規）。
- 不支援多局制、目標分數選擇。
- 不支援隊伍自訂名稱、玩家粒度記分。
- 不支援強制鎖定螢幕方向（`screen.orientation.lock` 跨瀏覽器支援不足）。

## Decisions

**狀態管理：`useReducer` + 事件流 history**

選擇 `useReducer` 而非 Zustand/Jotai：範圍小、純資料、可測試。Undo 以事件流 replay（從 `createInitialState` + 播放 `history.slice(0,-1)`）實作，比逆向推導規則更穩健。History 只記 `RALLY_WON` 事件；UNDO / RESET / HYDRATE 不入 history。

**`firstServer` 持久化進 state**

UNDO replay 需要回到開賽起手方設定。若僅靠 `servingTeam`，side-out 後就失去起手資訊。解法：`createInitialState` 時把 `firstServer` 存入 state，replay 時以 `state.mode + state.firstServer` 重建初始。

**localStorage 競態（useScoreboardStore）**

Mount 時兩個 useEffect 的執行順序造成 race：read effect 先讀出儲存值並 dispatch HYDRATE，write effect 緊接用初始 state 覆蓋 localStorage。修法：write effect 在前宣告（先執行）+ ref 守門（hydration 完成前 skip write）；read effect 在後宣告，讀完後 `ref.current = true`；StrictMode 雙掛載時 cleanup 清 ref。

**SSR-safe browser API（useSyncExternalStore pattern）**

- `useOrientation`、`useFullscreen`（isSupported、isFullscreen）、`OrientationHint`（dismissed from sessionStorage）：全部用 `useSyncExternalStore` + `getServerSnapshot = false`，確保 server 與 client first render 對齊，hydration 後才切到真實值。
- `useScoreboardStore`：初始 state 用 `createInitialState()`，mount 後 HYDRATE。

**ESLint react-hooks/set-state-in-effect**

專案 ESLint 阻止 `useEffect` 內直接呼叫 `setState`。解法：
- 外部訂閱（sessionStorage、Fullscreen）→ `useSyncExternalStore`
- Prop 驅動的 derived state（GameOverDialog `dismissed`）→ React 認可的 "previous render state" pattern（`if (prevStatus !== status) { setPrevStatus(status); setDismissed(false); }`）

**視覺回饋 toast（rally feedback）**

Side-out 或換發球員時分數不變，使用者易誤以為計分失敗。解法：在 `Scoreboard.tsx` 用 previous render state pattern 偵測 `RALLY_WON` 後的 state 轉換類型，顯示 1.6s CSS keyframe toast。feedback state 含 `key` counter，key 跳變強制 React re-mount 元素，重播動畫。

**shadcn 元件版本**

專案已有 `radix-ui: ^1.4.3` umbrella package，shadcn CLI add dialog/alert-dialog/select 不需新增個別 `@radix-ui/*` dep。

## Risks / Trade-offs

| 風險 | 處理 |
|---|---|
| 0-0-2 起手規則若 code 有誤，會影響整場雙打邏輯 | 9 個 unit test 專門覆蓋此規則，含對稱邊界 |
| zod schema 版本升級可能造成 localStorage 資料不合法 | STORAGE_KEY 含 `v1` 版本號；schema 驗證失敗時清除 key + fallback |
| StrictMode 雙掛載 + 兩個 useEffect 競態 | useRef cleanup 修正（`hasHydratedRef.current = false` in cleanup），已有 E2E 驗證 |
| iOS Safari 不支援 Fullscreen API | `useSyncExternalStore` getServerSnapshot = false，client 端偵測 `document.fullscreenEnabled`，不支援則隱藏按鈕 |
| SiteNavbar 覆蓋 TocBar | TocBar `top-0` 改 `top-14` 對應 navbar h-14 |
