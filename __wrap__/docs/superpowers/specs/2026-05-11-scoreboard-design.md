# Pickleball Scoreboard 設計文件

- 日期：2026-05-11
- 分支：（待開）
- 目標讀者：實作者（後續 writing-plans 會以此為輸入）

## 1. 目標與範圍

在現有匹克球指南單頁應用之上，新增一個獨立的計分器頁面 `/scoreboard`，並導入專案至今缺少的**全域 Navbar**作為跨頁導航入口。計分器目標是讓使用者在打球現場（手機橫向為主、桌機/直向也可）能用最少操作完成一場比賽計分。

### 範圍內

- **新建全域 Navbar 元件**：`components/layout/SiteNavbar.tsx`，掛在 `app/layout.tsx`，提供 Logo + 「首頁 / 完整體驗 / 計分板」三個頁面連結。
- **新建 `/scoreboard` 路由**：`app/scoreboard/page.tsx` + `components/scoreboard/*` 整組元件。
- **匹克球 Traditional（side-out）計分規則完整實作**：依 2026 USA Pickleball 官方規則。
- **單打 + 雙打都支援**：透過頂部 toggle 切換。
- **比賽制固定 1 局到 11 分（贏 2 分）**。
- **0-0-2 雙打開賽起手規則**：忠實實作。
- **Undo 機制**：以事件流 replay 實作，可一路退回開賽。
- **localStorage 自動保存**：頁面重整可回復當前比賽；schema 損壞或舊版自動 fallback。
- **橫直式各自最佳化排版**：橫式左右排、直式上下排。
- **直式提示橫向使用**：可關閉的提示橫幅，狀態存 sessionStorage。
- **全螢幕模式**：呼叫 Fullscreen API，不支援的環境隱藏按鈕。
- **比賽結束 Dialog**：到達勝利條件後彈出，提供「再來一局」/「關閉」。

### 範圍外

- 不支援 Rally Scoring（2026 新規）。
- 不支援錦標賽多局制（best of 3／5）。
- 不支援目標分數選擇（固定 11）。
- 隊伍名稱固定「我方／對方」，不可自訂。
- 玩家粒度命名／個人姓名輸入。
- 計時器、音效、震動回饋。
- 多場歷史紀錄、勝率統計、後端同步。
- i18n、深色模式切換（沿用既有 token 系統）。
- 螢幕方向強制鎖定（不呼叫 `screen.orientation.lock`）。

## 2. 需求總結（決策表）

| # | 決策 | 內容 |
|---|---|---|
| 1 | 入口架構 | 新建全域 Navbar |
| 2 | 計分制 | 僅 Traditional（side-out） |
| 3 | 賽事型態 | 單打 + 雙打都支援 |
| 4 | 比賽制 | 1 局到 11 分，贏 2 分 |
| 5 | 橫直式 | 各自最佳化排版（橫式左右、直式上下） |
| 6 | 狀態保存 | localStorage 自動保存當前比賽 |
| 7 | Undo | 支援，可退到開賽 |
| 8 | 隊伍名稱 | 固定「我方／對方」 |
| 9 | 進階輔助 | 只做全螢幕模式 |
| 10 | 路由 | `/scoreboard` |
| 11 | Navbar 連結 | Logo + 首頁 + 完整體驗（Tour）+ 計分板 |
| 12 | 開賽流程 | 計分板直開 0-0；頂部 toggle 單/雙打、誰先發；首次「贏這球+」後鎖 toggle |
| 13 | 0-0-2 規則 | 忠實實作 |
| 14 | 發球位置標示 | ● 指示 + 「Server #N · 左/右場」說明 |

## 3. 匹克球 Traditional 計分規則（實作依據）

### 3.1 共通

- 僅發球方能得分。
- 發球位置由**發球方當局分數**決定：偶數 → 從右場發；奇數 → 從左場發。
- 勝利條件：先到 11 分且差距 ≥ 2。

### 3.2 單打

- 只有一位發球員。
- 發球方贏 rally：分數 +1，繼續發球（位置依新分數奇偶切換）。
- 接發方贏 rally：side-out，雙方分數不變、發球權交給接發方。

### 3.3 雙打

- 兩位發球員，編號 #1、#2。
- 發球方贏 rally：分數 +1，**同一位**繼續發球（左右場由分數奇偶推導）。
- 發球方輸 rally：
  - 若目前是 #1 → 同隊 #2 接手發球（serverNumber 1→2），同方繼續持球。
  - 若目前是 #2 → side-out，對方變發球方，serverNumber 重置為 1。

### 3.4 0-0-2 起手規則（雙打第一局）

- 比賽開始時：`isFirstServiceOfGame=true, serverNumber=2`。
- 開賽方贏 rally：照常 +1，`isFirstServiceOfGame` 變 false。
- 開賽方輸 rally：**直接 side-out**（不給該隊 #1 機會），`isFirstServiceOfGame` 變 false。

## 4. 路由與檔案結構

```
app/
├── layout.tsx                        # 既有；在 <body> 內、<ViewTransition> 外加掛 <SiteNavbar />
├── page.tsx                          # 不動；TocBar 的 top 偏移加上 Navbar 高度
├── tour/page.tsx                     # 不動
└── scoreboard/
    └── page.tsx                      # 新增；client component，掛 <Scoreboard />

components/
├── layout/
│   └── SiteNavbar.tsx                # 新增；全域 navbar
├── scoreboard/
│   ├── Scoreboard.tsx                # 主容器（state + reducer + 子元件組合）
│   ├── ScoreboardSetup.tsx           # 頂部 toggle 列（單/雙打、誰先發、全螢幕）
│   ├── TeamPanel.tsx                 # 單隊面板（分數、發球指示、贏這球按鈕）
│   ├── ServeIndicator.tsx            # ● 發球指示 + 左/右場文字
│   ├── ActionBar.tsx                 # 底部按鈕列（Undo、Reset）
│   ├── OrientationHint.tsx           # 直式提示橫幅
│   └── GameOverDialog.tsx            # 比賽結束 dialog
└── ui/
    ├── dialog.tsx                    # shadcn 新增
    ├── alert-dialog.tsx              # shadcn 新增
    └── select.tsx                    # shadcn 新增

hooks/
├── useFullscreen.ts                  # Fullscreen API 封裝
├── useOrientation.ts                 # portrait/landscape 偵測
└── useScoreboardStore.ts             # useReducer + localStorage 整合

lib/
└── scoreboard/
    ├── reducer.ts                    # pure reducer：所有狀態轉換
    ├── rules.ts                      # 規則純函式：發球輪換、勝利判定、左右場
    ├── storage.ts                    # localStorage read/write + schema 驗證
    └── types.ts                      # ScoreboardState、ScoreEvent、Action 等型別
```

## 5. 狀態模型

### 5.1 型別

zod schema 為單一事實來源；TS 型別以 `z.infer` 推導，避免 schema 與 interface 雙重維護。

```ts
// lib/scoreboard/types.ts
import { z } from 'zod';

export const ModeSchema = z.enum(['singles', 'doubles']);
export const TeamSchema = z.enum(['us', 'them']);
export const StatusSchema = z.enum(['setup', 'playing', 'finished']);
export const ServerNumberSchema = z.union([z.literal(1), z.literal(2)]);
export const ServeSideSchema = z.enum(['right', 'left']);

export const ScoreEventSchema = z.object({
  type: z.literal('RALLY_WON'),
  winner: TeamSchema,
});

export const ScoreboardStateSchema = z.object({
  mode: ModeSchema,
  scores: z.object({ us: z.number().int().nonnegative(), them: z.number().int().nonnegative() }),
  servingTeam: TeamSchema,
  serverNumber: ServerNumberSchema,           // 雙打有意義；單打恒 1
  isFirstServiceOfGame: z.boolean(),          // 0-0-2 起手規則
  history: z.array(ScoreEventSchema),         // for undo
  status: StatusSchema,
  winner: TeamSchema.nullable(),
});

export type Mode = z.infer<typeof ModeSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type ServerNumber = z.infer<typeof ServerNumberSchema>;
export type ServeSide = z.infer<typeof ServeSideSchema>;
export type ScoreEvent = z.infer<typeof ScoreEventSchema>;
export type ScoreboardState = z.infer<typeof ScoreboardStateSchema>;

// Action 不需驗證（純記憶體型別，不會落 localStorage）
export type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_FIRST_SERVER'; team: Team }
  | { type: 'RALLY_WON'; winner: Team }
  | { type: 'UNDO' }
  | { type: 'RESET' };
```

### 5.2 Initial state

```ts
// 雙打預設、我方先發、開賽起手 0-0-2
{
  mode: 'doubles',
  scores: { us: 0, them: 0 },
  servingTeam: 'us',
  serverNumber: 2,                   // 0-0-2 起手
  isFirstServiceOfGame: true,
  history: [],
  status: 'setup',
  winner: null,
}
```

### 5.3 Reducer 邏輯（虛擬碼）

```
reduce(state, action):
  case SET_MODE / SET_FIRST_SERVER:
    if state.status === 'playing' or 'finished': ignore (toggle 應為 disabled)
    更新對應欄位
    若 mode 變為 singles：serverNumber=1, isFirstServiceOfGame=false
    若 mode 變為 doubles：serverNumber=2, isFirstServiceOfGame=true

  case RALLY_WON winner=X:
    if state.status === 'finished': ignore
    state.history.push(action)
    next = rules.applyRallyResult(state, X)
    next.status, next.winner = rules.checkGameEnd(next)
    // 若還沒結束且原本是 setup，轉成 playing；finished 由 checkGameEnd 決定
    if next.status !== 'finished' and state.status === 'setup':
      next.status = 'playing'
    return next

  case UNDO:
    if history empty: ignore
    new history = history.slice(0, -1)
    return replay(initialFromCurrentSetup, new history)
      // 用 mode + servingTeam（setup 時設定）重建初始 state，然後 replay 剩餘事件

  case RESET:
    return initial state (帶入目前 mode 與 firstServer 設定)
```

### 5.4 規則純函式（`rules.ts`）

```ts
getServeSide(servingTeamScore: number): ServeSide
  // 偶 → right, 奇 → left

isGameWon(scores: { us, them }): { won: boolean; winner: Team | null }
  // 任一方 >= 11 且差距 >= 2 → won

applyRallyResult(state, rallyWinner: Team): ScoreboardState
  // 若 rallyWinner === servingTeam：scores[servingTeam] += 1, server 不變
  // 若 rallyWinner !== servingTeam：
  //   if singles or doubles serverNumber=2 or isFirstServiceOfGame:
  //     side-out（servingTeam=rallyWinner, serverNumber=1, isFirst=false）
  //   else:  // doubles, serverNumber=1
  //     serverNumber=2（同隊）

checkGameEnd(state): { status, winner }
  // 依 isGameWon 決定 status='finished'/'playing'
```

## 6. 互動模型

### 6.1 開賽流程

1. 進入 `/scoreboard`，預設雙打 + 我方先發 + 狀態 setup。
2. 使用者可改 toggle（mode、firstServer）。
3. 任一按下「贏這球 +」→ status 進入 playing → toggle 變 disabled。
4. 重複按到任一方達勝利條件 → status=finished → GameOverDialog 彈出。
5. 「再來一局」→ RESET，回到 setup（保留目前 mode 與 firstServer 設定）。

### 6.2 按鈕行為矩陣

| 元件 | setup | playing | finished |
|---|---|---|---|
| mode toggle | enabled | disabled | disabled |
| firstServer toggle | enabled | disabled | disabled |
| 「贏這球 +」(my team) | enabled | enabled | disabled |
| 「贏這球 +」(opponent) | enabled | enabled | disabled |
| Undo | disabled（無 history） | enabled if history.length > 0 | enabled |
| Reset | enabled | enabled（彈 AlertDialog 二次確認）| enabled |
| 全螢幕 | enabled if API supported | 同左 | 同左 |

### 6.3 Undo 實作

- `state.history` 為 `ScoreEvent[]`（只記錄 RALLY_WON）。
- Undo：把 history 最後一筆 pop，從 initial state（依當前 mode + firstServer）replay 剩餘事件，重建整個 state。
- 比 reverse-rule 簡單且不易出錯。

## 7. UI 排版

### 7.1 橫式（landscape；桌機與手機橫向）

```
┌──────────────────────────────────────────────────────────────────────┐
│ [單打|雙打▼]  [先發：我方|對方▼]                         [↗ 全螢幕] │
├──────────────────────────────────────────────────────────────────────┤
│              我方           │            對方                         │
│                             │                                        │
│              3              │              5  ●                      │
│                             │           Server #2 · 左場              │
│                             │                                        │
│          ┌─────────┐        │        ┌─────────┐                     │
│          │ 贏這球 +│        │        │ 贏這球 +│                     │
│          └─────────┘        │        └─────────┘                     │
├──────────────────────────────────────────────────────────────────────┤
│                    [↶ Undo]    [↻ 重置]                              │
└──────────────────────────────────────────────────────────────────────┘
```

- 分數字級 `text-[12rem]` 以上、`font-bebas-neue`。
- 發球方顯示 ● + 「Server #N · 左/右場」。
- 中央分隔線。
- 配色：lime/slate 沿用既有 token。

### 7.2 直式（portrait；手機豎向）

```
┌──────────────────────────────┐
│ 💡 建議橫向使用，體驗更好  ✕│  ← OrientationHint
├──────────────────────────────┤
│ [雙打▼] [我方▼]   [↗ 全螢幕]│
├──────────────────────────────┤
│            我方              │
│             3                │
│        ┌─────────┐           │
│        │ 贏這球 +│           │
│        └─────────┘           │
├──────────────────────────────┤
│            對方              │
│             5  ●             │
│         Server #2 · 左場     │
│        ┌─────────┐           │
│        │ 贏這球 +│           │
│        └─────────┘           │
├──────────────────────────────┤
│      [↶ Undo]   [↻ 重置]     │
└──────────────────────────────┘
```

- 兩隊上下對稱，各佔約 40% viewport 高度。
- OrientationHint 關閉狀態存 sessionStorage（分頁存活期間不再跳；關掉分頁後會再次顯示）。

### 7.3 全域 Navbar

```
┌──────────────────────────────────────────────────────────────────┐
│ 🏓 匹克球指南          首頁    完整體驗    計分板                │
└──────────────────────────────────────────────────────────────────┘
```

- `fixed top-0`，高度 `h-14`。
- 雙態背景：捲離 Hero 前透明深色、捲離後白底深字（沿用 TocBar 的雙態切換邏輯）。
- 「計分板」連結 `/scoreboard`，使用 `<Link transitionTypes={["nav-forward"]}>`。
- TocBar 與 Hero 等內容的 `top` 偏移要加上 Navbar 高度（`top-14`）。

### 7.4 比賽結束 Dialog

```
┌────────────────────────┐
│      🏆 我方獲勝       │
│       11 – 7           │
│                        │
│  [再來一局]   [關閉]   │
└────────────────────────┘
```

- 使用 shadcn `dialog`。
- 「再來一局」→ RESET action。
- 「關閉」→ 留在計分板，分數終局可繼續看。

## 8. 持久化與錯誤處理

### 8.1 localStorage 同步

- key：`scoreboard:current:v1`（含 schema 版本號方便未來 migration）。
- `useEffect` 鏡像 reducer state → 寫入 JSON.stringify(state)。
- 進頁面時 `useReducer` 的 init 參數讀取 localStorage，schema 驗證通過則 hydrate，否則用 default initial state。
- `status === 'finished'` 且按下 RESET 後清除 key（或寫入新 initial state）。
- SSR 安全：讀取放 `useEffect`（client only），避免 hydration mismatch。

### 8.2 Schema 驗證

- 用 zod 定義 `ScoreboardStateSchema` 於 `lib/scoreboard/types.ts`，TS 型別以 `z.infer` 推導，避免 schema 與型別雙重維護。
- `lib/scoreboard/storage.ts` import schema 做 `safeParse`，驗證通過才回傳 state。
- 驗證項目：頂層欄位齊全、enum 值合法（mode、status、winner）、scores 為非負整數、serverNumber ∈ {1,2}、history 為合法 ScoreEvent 陣列。
- 驗證失敗 → 清除 key + 用 default initial state；同時 `console.warn` 記錄錯誤（不阻塞使用者）。

### 8.3 邊界情境

| 情境 | 處理 |
|---|---|
| localStorage 不可用（私密瀏覽器、quota exceeded） | try/catch；fallback 為純記憶體（不寫入、不讀取，UX 不中斷） |
| 資料損壞 / 舊版 schema | 驗證失敗 → 清除 + reset |
| Fullscreen API 不支援 | 偵測 `document.fullscreenEnabled === false` → 隱藏按鈕 |
| iOS Safari Fullscreen | 同上 |
| Undo 在空 history | 按鈕 disabled |
| 比賽結束後再按贏這球 | 按鈕 disabled，不會觸發 |
| Reset 誤觸 | shadcn AlertDialog 二次確認 |
| Mode/firstServer 在 playing 中變更 | UI 上 toggle 應 disabled；若 dispatch 進來則 reducer ignore |
| Hydration | `Scoreboard` 標 `"use client"`；localStorage 讀取在 `useEffect` |

## 9. 測試策略

依專案 OpenSpec TDD 規範，行為邏輯模組必須走「紅燈 → 綠燈 → refactor」。

### 9.1 必寫單元測試（Vitest）

- `lib/scoreboard/rules.test.ts`
  - `getServeSide`：偶 → right、奇 → left
  - `isGameWon`：11-9 ✓、11-10 ✗、13-11 ✓、10-10 ✗
  - `applyRallyResult` 單打：發球方贏 +1、接發方贏 side-out
  - `applyRallyResult` 雙打 server #1 輸：同隊 #2 接手
  - `applyRallyResult` 雙打 server #2 輸：side-out
  - `applyRallyResult` 雙打 0-0-2 起手 + 發球方輸：直接 side-out（不切到 #1）
- `lib/scoreboard/reducer.test.ts`
  - 各 Action 後 state 正確
  - 整場 doubles 走 0-0 → 11-x 結束流程
  - SET_MODE / SET_FIRST_SERVER 在 playing 中被 ignore
  - UNDO 在空 history 時不動 state
  - UNDO replay 後 state 與少做一次 RALLY_WON 等價
- `lib/scoreboard/storage.test.ts`
  - 寫入 / 讀取 / schema 驗證 pass
  - 損壞 JSON → 回 null + 清 key
  - localStorage 不可用時不 throw
- `hooks/useScoreboardStore.test.tsx`
  - reducer + localStorage 整合（renderHook + mock storage）
- `hooks/useOrientation.test.tsx`
  - portrait/landscape 切換偵測
- `hooks/useFullscreen.test.tsx`
  - 支援/不支援判斷、toggle 行為

### 9.2 必寫 E2E（Playwright）

`tests/e2e/specs/scoreboard.spec.ts`：

- 從 navbar 進入 `/scoreboard`，預期 URL 改變、計分板出現
- 一場完整雙打：依序按贏這球到 11-7，GameOverDialog 顯示「我方獲勝 11 – 7」
- Undo 一次能正確退回上一分
- 重置 → AlertDialog 確認 → toggle 解鎖
- 重整頁面後分數仍在（localStorage 持久化）

### 9.3 不寫測試

- `components/layout/SiteNavbar.tsx`（純連結，E2E 路由切換已涵蓋）
- `app/scoreboard/page.tsx`（純掛載元件）
- shadcn/ui 元件本身、純樣式
- Fullscreen 實際進入/退出（瀏覽器要求 user gesture，難自動化；只測按鈕點下去不噴錯）

## 10. Accessibility

- 「贏這球 +」按鈕 `aria-label="我方贏這一球，當前 X 分"`，動態更新。
- 分數區外層 `aria-live="polite"`，分數變動讀屏會通報。
- 鍵盤：Tab 順序合理，Enter/Space 觸發按鈕；toggle 用 shadcn Select（已支援鍵盤）。
- 全螢幕按鈕 `aria-pressed` 反映狀態。
- OrientationHint 提示橫幅 `role="status"`。
- GameOverDialog 用 shadcn Dialog（自帶 focus trap、Esc 關閉）。

## 11. 與既有結構的整合

- `app/layout.tsx`：在 `<body>` 內、`<ViewTransition>` 外加掛 `<SiteNavbar />`。Navbar 自身不被 view transition 動畫影響。
- `app/page.tsx`：不動。`TocBar` 為首頁專屬二級導覽。
- `components/guide/TocBar.tsx`：`top-0` 改為 `top-14`，避免被 Navbar 蓋住。
- `app/tour/page.tsx`：不動。Tour 也會自動有 Navbar。
- `components/guide/Hero.tsx`：不動（Hero 內容自會被 Navbar 蓋住一小條，視覺上可接受；如有顧慮可後續微調 padding-top）。
- 既有 `tocItems`、所有 guide section 都不動。
- `lib/utils.ts` 的 `cn()` 沿用，不新增 utility。
- 字型 token（`font-bebas-neue`、`font-outfit`）沿用於分數與按鈕。

## 12. 新增依賴

- 三個 shadcn 元件（透過 `pnpm dlx shadcn@latest add dialog alert-dialog select` 安裝）：
  - `dialog`（GameOverDialog）
  - `alert-dialog`（Reset 確認）
  - `select`（mode、firstServer toggle）
- 新增 npm 套件：`zod`（已安裝 4.4.3）— 用於 localStorage state 的 schema 驗證與 TS 型別推導。

## 13. Bundle / 效能

- 純 client、無外部請求 → 0 runtime fetch。
- `useReducer` 不引入第三方 state lib。
- 計分板路由獨立 chunk（App Router 自動 code-split）。
- localStorage 同步用 `useEffect` debounce 不需要（state 變動頻率極低）。

## 14. 未來可擴充項（不在本次範圍）

- Rally Scoring 支援（新增 SCORING_MODE，reducer 分支）
- 多局 best of 3／5
- 目標分數選擇（11/15/21）
- 隊伍/玩家姓名自訂
- 多場歷史紀錄
- 計時器、音效、震動
- PWA 化（離線可用、加裝到主畫面）
