# Test Plan: round-timer-clear

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（Vitest＋happy-dom：`nextjs-pickball/lib/matchmaker/round.test.ts`（核心 `round.ts` 的測試依慣例留在此）、`nextjs-pickball/hooks/useRoundStore.test.tsx`、`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`、`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`）；
> `e2e`（`nextjs-pickball/tests/e2e/specs/round-timer.spec.ts`，五個 browser project，訪客模式）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **fixture 的共同要求**：沿用各檔既有 helper（`round.test.ts` 的 `makeRound`／`makeRoundMatch`；store 測試檔既有的回合種子與 fetch mock；`RoundControls.test.tsx` 的 `buildProps`／`buildRound`），不另寫平行 helper。
> 傳入 `null` 的呼叫在 GREEN 前是型別錯誤也是執行期紅燈（現行實作回傳 `{ durationMinutes: null, startedAt: null }` 而非 `null`）；RED 判定以單檔 vitest 的執行期失敗為準。
>
> **E2E 的共同要求**：沿用 `round-timer.spec.ts` 既有的 `beforeEach` 與種子／產生回合 helper；以 radiogroup「計時」內 radio 的 `aria-checked` 與「開始計時」按鈕、倒數文字的可見性為斷言；SHALL NOT 使用 `waitForTimeout`；不斷言 LocalStorage 內容。

## round-lifecycle

### Requirement: 回合計時器（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| setTimerDuration 傳入 null 時把本輪改回不計時，計時已開始亦同 | 回合存在時可把計時改回不計時 | 全 `pending` 回合，① `timer: { 10, startedAt: null }` → `setTimerDuration(r, null)` 成功、`round.timer === null`；② `startedAt` 為 ISO 字串時亦成功、`timer === null`；兩次原回合 `toEqual` 呼叫前的 `structuredClone` | golden path；現行回傳非 null 的 timer 物件 → **真紅** | unit |
| 已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合 | 已開始計分後拒絕取消計時 | 一場 `scoring`、`timer: { 10, null }` → `ok === false`、`code === "scoring-started"`；原回合 `toEqual` 快照 | 鎖定條件沿用；現行已拒絕 → **regression guard**（RED 時點名） | unit |
| 訪客模式 setTimerDuration(null) 取消本輪計時並寫回儲存 | 訪客模式取消計時寫回儲存 | 種子回合帶 `timer: { 10, null }` → `act` 呼叫 `setTimerDuration(null)` → `result.current.round?.timer === null`；讀回儲存的回合 `timer === null` | store 接線；現行寫入非 null timer → **真紅** | unit |
| 雲端回合 setTimerDuration(null) 以 timer 為 null 寫入回合 | 雲端回合取消計時以 timer 為 null 寫入 | 雲端回合帶 `timer: { 10, null }` → 呼叫後攔截的 `PUT /api/matchmaker/round` body 內回合 `timer === null`；`result.current.round?.timer === null` | 雲端路徑（後端 schema 拒絕 `durationMinutes: null`）；現行送出非 null timer → **真紅** | unit |
| 回合存在且未鎖定時點選不計時委派 setTimerDuration(null) | 對戰頁回合存在時點選不計時委派取消計時 | `buildRound` 帶 `timer: { 10, null }`、無鎖定 → 點「不計時」→ `setTimerDuration` 被呼叫一次且參數為 `null`；`onSettingsChange` 未被呼叫 | UI 缺口本身；現行 `return` → **真紅** | unit |
| 回合存在且未鎖定時方向鍵移到不計時亦委派 setTimerDuration(null) | 同上（方向鍵路徑） | 同上 fixture、focus 在「10 分鐘」→ `ArrowLeft`（或依 `nextRadioIndex` 移到索引 0 的鍵）→ `setTimerDuration` 以 `null` 被呼叫一次；`onSettingsChange` 未被呼叫 | 方向鍵走同一 handler，須獨立釘住；現行 → **真紅** | unit |
| 回合存在時選不計時可取消已開始的本輪計時 | E2E 取消已開始的本輪計時 | 種子名單 → 選 10 分鐘 → 產生本輪 → 點「開始計時」→ 倒數可見 → 點「不計時」→「不計時」`aria-checked="true"`、「開始計時」按鈕 `toHaveCount(0)`、倒數文字 `toHaveCount(0)` → `page.reload()` → 「不計時」仍 `aria-checked="true"` | 端到端（含儲存與重新掛載）；現行點擊無反應 → **真紅** | e2e |
| 取消本輪計時後產生下一輪仍為不計時 | E2E 取消計時後產生下一輪仍為不計時 | 種子名單 → 選 10 分鐘 → 產生本輪 → 點「不計時」→ 點「產生本輪對戰」→ 以舊場地網格消失為同步點 →「不計時」`aria-checked="true"`、「開始計時」按鈕 `toHaveCount(0)` | 與 `round-settings-follow-round` 的接合點；現行取消無效 → **真紅** | e2e |
| （既有）所有場次皆為 pending 時可改計時設定並重置為未開始，已有場次離開 pending 時拒絕；startTimer 相關 it | 尚未開始計分時可更改計時設定，已開始後拒絕；開始計時寫入 startedAt；未設定計時或計時已開始時拒絕再次開始 | 原樣通過 | regression guard（10／15／20 路徑不變） | unit |
| （既有）計時變更契約：尚無回合時以完整設定物件回呼 onSettingsChange，回合存在時委派 setTimerDuration；本輪已開始計分時計時控制項 disabled 並顯示鎖定原因；計時鎖定時方向鍵不得呼叫 setTimerDuration 或 onSettingsChange…；不計時或計時已開始時不顯示開始計時按鈕 | 鎖定與既有委派 | 原樣通過 | regression guard（鎖定時仍 disabled、尚無回合時仍走 onSettingsChange） | unit |
| （既有）`round-timer.spec.ts` 全部 test；store 測試檔既有 `setTimerDuration(10)` 相關 it | MODIFIED 帶入的其餘既有 Scenario | 原樣通過 | regression guard | e2e／unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir <repo> -r exec tsc --noEmit`；`pnpm --dir <repo>/hono-pickball typecheck`；`pnpm --dir <repo>/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir <repo> lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir <repo> test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋6；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir <repo> build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 雙鎖、前後清殘留：① `pnpm --dir <repo>/nextjs-pickball exec playwright test --workers=1 --project=<p> tests/e2e/specs/round-timer.spec.ts tests/e2e/specs/match-stage.spec.ts`（chromium、firefox、webkit、mobile-chrome、mobile-safari 各一次）；② `--project=chromium` 全套一次；③ `--project=user-data tests/e2e/user-data/round-sync.spec.ts` | ① 每個 project 該兩檔數量＝基線＋2、0 failed；② chromium 全套＝基線＋2、全 passed；③ 全 passed、0 skipped |
| C6 | （範圍） | ① `git -C <repo> diff main --stat -- nextjs-pickball/app hono-pickball packages/pickball-core/src/api packages/pickball-core/src/scoreboard`；② `git -C <repo> diff main --name-only -- ':!openspec' ':!*.test.ts' ':!*.test.tsx' ':!*.spec.ts'` | ① 輸出為空；② 恰為 `packages/pickball-core/src/matchmaker/round.ts`、`nextjs-pickball/hooks/useRoundStore.ts`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`、`nextjs-pickball/components/matchmaker/RoundControls.tsx`（§4 另含 `nextjs-pickball/CLAUDE.md` 若有更新） |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate round-timer-clear --strict` | valid |

> `<repo>` 一律為 `/Users/m2_24gb/Desktop/project/nextjs-pickball`。

## Checklist

- [x] 每個 Requirement 至少一列（本 change 只 MODIFIED 一個 Requirement）
- [x] 每個新增 Scenario（7 個）至少一列；MODIFIED 帶入的既有 Scenario 以「（既有）」列合併
- [x] 每列皆有 Tier（unit | e2e）
- [x] 無授權修改的既有測試
- [x] 範圍守門有指令驗收（C6）
