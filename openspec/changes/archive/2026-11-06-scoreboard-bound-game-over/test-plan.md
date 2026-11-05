# Test Plan: scoreboard-bound-game-over

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端元件測試，Vitest＋happy-dom，`GameOverDialog` 直接渲染、不 mock 任何模組，`next/link` 用真元件）；
> `e2e`（`tests/e2e/specs/scoreboard-binding.spec.ts`，五個 browser project，訪客模式）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **元件測試的共同要求**：
> - 狀態一律以 `{ ...createInitialState(), status: "finished", winner: "us", scores: { us: 11, them: 0 } }` 建立（同既有 it）；`onPlayAgain` 用 `vi.fn()`。
> - 按鈕與連結的查詢範圍限定在 `screen.getByRole("dialog")` 之內（`within(dialog)`），避免日後對話框外有同名元素時假綠。
> - `href` 以 `link.getAttribute("href")` 斷言為 `"/matchmaker"`（同 `components/auth/LoginForm.test.tsx` 寫法）；**不點擊**「返回對戰」連結（happy-dom 無 app router context，`next/link` 的點擊行為不可靠，且「不 RESET」由 E2E 守住）。
> - 點擊用 `@testing-library/user-event` 14（`userEvent.setup()`），關閉後以 `waitFor` 或直接斷言 `queryByRole("dialog")` 為 `null`。
> - 「不存在」一律用 `queryByRole(...)` 為 `null`，不用 `queryByText`（按鈕名稱可能與標題、說明文字重疊）。
>
> **E2E 的共同要求**：
> - 放在 `/matchmaker 對戰頁的計分板接線` describe 內，沿用其 `seedRoster`、`generateRound`、`courtMatchId`、`clickWin` 與 `beforeEach` 清 key，不另寫 helper、不改既有 test。
> - 對話框內的元素一律以 `page.getByRole("dialog")` 為範圍查詢；對話框出現的等待以 `expect(dialog).toBeVisible()`，SHALL NOT 使用 `waitForTimeout`。
> - 「比分已回填」以既有 test 的同一組斷言表達：`court-<id>-score` 為 `11:0`、`court-<id>-team-a` 為 `第一隊勝`（11 分制、我方連贏 11 球、side-out 下對方全程未發球）。

## scoreboard

### Requirement: 比賽結束對話框的動作（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 綁定模式顯示返回對戰連結且不顯示再來一局 | 綁定模式的比賽結束對話框提供返回對戰且不提供再來一局 | `finished` 狀態、`matchId="m1"` → 對話框內 `getByRole("link", { name: "返回對戰" })` 存在且 `href === "/matchmaker"`；`button「關閉」` 存在；`button「再來一局」` 為 `null` | 本 change 的核心；現行程式碼無此連結且恆顯示「再來一局」→ **真紅** | unit |
| 綁定模式按關閉後對話框關閉且不呼叫 onPlayAgain | 綁定模式按關閉後對話框關閉且不重置 | `finished` 狀態、`matchId="m1"` → 點「關閉」→ `queryByRole("dialog")` 為 `null`；`onPlayAgain` 呼叫次數為 0 | 現行程式碼已是此行為（多出的 prop 在執行期被忽略）→ 預期 **regression guard**（RED 紀錄須點名）；守住「綁定模式保留關閉」 | unit |
| 獨立模式顯示再來一局且點擊即呼叫 onPlayAgain 而不經二次確認 | 獨立模式維持關閉與再來一局且再來一局不經二次確認 | `finished` 狀態、**不傳** `matchId` → `button「關閉」`、`button「再來一局」` 存在；`link「返回對戰」` 為 `null`；點「再來一局」→ `onPlayAgain` 恰被呼叫 1 次；`queryByRole("alertdialog")` 為 `null` | 現行程式碼即如此 → 預期 **regression guard**（RED 紀錄須點名）；守住「獨立模式零變更」與 Decision 1「預設 null」 | unit |
| 綁定場次比賽結束時對話框以返回對戰取代再來一局且返回後比分已回填 | 綁定場次打到結束後由對話框返回對戰且比分已回填 | 名單四位、`generateRound` 預設 1 個場地 → 該場「進入計分板」→ URL 為 `/scoreboard?match=<id>` → 我方連贏 11 球 → `dialog` 可見；`dialog` 內 `button「再來一局」` `toHaveCount(0)`；點 `dialog` 內 `link「返回對戰」` → URL 為 `/matchmaker$`；該場 `11:0`、`第一隊勝`；該場「進入計分板」「繼續計分」皆 `toHaveCount(0)` | 端到端證據：`Scoreboard` 有把 `matchId` 接到對話框、按下不 RESET；現行程式碼對話框有「再來一局」→ **真紅** | e2e |
| 專注模式下綁定場次比賽結束後可由對話框返回對戰 | 專注模式下綁定場次結束後可由對話框返回對戰 | 同上進入綁定場次 → 點「進入專注模式」→ 設定列的 `link「返回對戰」` `toHaveCount(0)`（確認前提）→ 我方連贏 11 球 → 點 `dialog` 內 `link「返回對戰」` → URL 為 `/matchmaker$`；該場 `11:0`、`第一隊勝` | 專注模式下唯一的返回入口；現行程式碼對話框內無此連結 → **真紅** | e2e |
| （既有）獲勝標題以 lucide 獎盃圖示搭配勝方文字 | （`emoji-free-ui`「比賽結束對話框標題搭配獎盃圖示」） | 原樣通過（`render` 呼叫不變，`matchId` 為可選 prop） | regression guard；守住「既有 it 一行不改」 | unit |

### Requirement: 賽前設定與階段鎖定（MODIFIED：只改 RESET 二次確認那一句）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）重置含二次確認；確認後 mode toggle 解鎖（enabled） | 重置需二次確認且解除鎖定 | 原樣通過：ActionBar「重置」仍先出現「確定要重置比賽？」AlertDialog | regression guard；MODIFIED 新增的例外只限比賽結束對話框，ActionBar 的二次確認不得被波及 | e2e |
| （既有）RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup；UNDO 與 RESET 後保留 matchId，不退回 null；setup 階段可切換 mode…；setup 階段可切換 firstServer；setup 階段可切換 targetScore 且保留 mode 與 firstServer；綁定場次時 setup 階段 ignore SET_TARGET_SCORE；playing／finished 階段 ignore SET_MODE／SET_FIRST_SERVER／SET_TARGET_SCORE；UNDO 後保留 targetScore，不退回預設 11 | 其餘 MODIFIED 帶入的既有 Scenario（reducer 層） | 原樣通過（本 change 不動 reducer） | regression guard；C3 全套守住 | unit |
| （既有）綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉；下拉選單展開時不被 navbar 遮擋；目標分數 radiogroup 支援方向鍵導覽與 roving tabindex；比賽開始後三個賽前設定控制項皆為 disabled | 其餘 MODIFIED 帶入的既有 Scenario（UI 層） | 原樣通過（本 change 不動 `ScoreboardSetup`） | regression guard；C5 守住 | e2e |

### 既有 E2E 的回歸（不屬單一 Scenario，C5 必跑）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）由計分板判定勝負後返回，比分自動回填且該場轉為已完成 | `match-stage` 既有回填 Scenario | 原樣通過：按「關閉」後立刻點設定列「返回對戰」不得出現 strict mode violation | regression guard；design Risks 第 1 條（對話框淡出期間同名連結） | e2e |
| （既有）`user-data/round-sync.spec.ts` 中「按『關閉』→ 設定列『返回對戰』」的 test | `round-lifecycle`／`match-stage` 雲端回填 Scenario | 原樣通過 | regression guard；同上，雲端模式 | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋3；後端、核心與基線相同 |
| C4 | （建置） | `pnpm build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 每次雙鎖、前後清殘留：① `--project=chromium` 全套；② `--project=firefox`、`webkit`、`mobile-chrome`、`mobile-safari` 各跑 `tests/e2e/specs/scoreboard-binding.spec.ts tests/e2e/specs/scoreboard.spec.ts tests/e2e/specs/scoreboard-local-mode.spec.ts`；③ `--project=user-data` 跑 `tests/e2e/user-data/round-sync.spec.ts tests/e2e/user-data/scoreboard-sync.spec.ts`。指令形如 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> [<files>]` | chromium＝基線＋2 全 passed；其餘四個 browser project 在這三檔的數量＝基線＋2、0 failed（skip 只限既有瀏覽器條件）；user-data 兩檔數量與基線相同、全 passed、0 skipped |
| C6 | （範圍） | `git diff main --stat` | 只含 `nextjs-pickball/components/scoreboard/GameOverDialog.tsx`、`GameOverDialog.test.tsx`、`Scoreboard.tsx`、`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts` 與 `openspec/changes/scoreboard-bound-game-over/**`；`Scoreboard.tsx` 的 diff 只有傳 `matchId` 給 `GameOverDialog` 那一處 |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate scoreboard-bound-game-over --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列（ADDED 1、MODIFIED 1）
- [x] 每個 Scenario（新增 5；MODIFIED 帶入的既有 14 個以「（既有）」列合併）至少一列
- [x] 每列皆有 Tier（unit | e2e）
- [x] 會寫入即綠的 it 已預先標為 regression guard（2 個），不得以改斷言偽造紅燈
- [x] 既有 it／test 一行不改
