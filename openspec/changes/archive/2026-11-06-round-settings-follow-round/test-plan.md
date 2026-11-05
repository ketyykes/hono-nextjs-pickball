# Test Plan: round-settings-follow-round

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，純函式直接呼叫；`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，Vitest＋happy-dom＋RTL，沿用檔內 `buildProps`／`buildSettings`／`buildRound`／`buildMatch`）；
> `e2e`（`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，五個 browser project，訪客模式）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **fixture 的共同要求（round-settings.test.ts）**：回合以檔內新增的最小 helper 或物件字面量建立，只需 `format`／`courtCount`／`targetScore`／`timer` 四欄正確（其餘欄位滿足 `Round` 型別即可，可由 `@pickball/core` 的 `RoundSchema` 推得）；
> 不得以 `as Round` 略過型別。`draft` 以完整的 `RoundSettings` 物件字面量表達。斷言一律 `toEqual` 整個物件，不只斷言單一欄位。
>
> **E2E 的共同要求**：沿用 describe「/matchmaker 對戰頁」既有的 `beforeEach`（清三個 key）與 `seedRoster`，不另寫 helper；區段導覽以 `page.getByRole("navigation", { name: "對戰分配區段導覽" })` 內的連結名稱「參賽者」「對戰」（`exact: true`）定位；
> 新一輪就緒的同步點為「舊網格 `data-testid` 數量 0 且網格數量符合」；SHALL NOT 使用 `waitForTimeout`；不讀寫 LocalStorage 斷言設定（設定不持久化，design Decision 3）。

## match-stage

### Requirement: 本輪設定跟隨目前回合（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 回合存在且未變更過設定時取回合的對戰方式、場地數、目標分數與計時 | 回合存在且未變更過設定時取回合的設定 | `resolveRoundSettings(null, round{ doubles, 3, 21, timer { 15, startedAt: null } })` `toEqual` `{ format: "doubles", courtCount: 3, targetScore: 21, timerDurationMinutes: 15 }` | golden path（離開再回來的根因）；函式尚不存在 → **真紅** | unit |
| 回合不計時時解析出的計時為不計時，不論變更過的設定為何 | 回合不計時時解析結果為不計時 | `resolveRoundSettings({ singles, 1, 11, 10 }, round{ singles, 1, 11, timer: null })` 的 `timerDurationMinutes` 為 `null`（`toEqual` 整個物件 `{ singles, 1, 11, null }`） | 守住 `timer === null` 的映射與「計時取回合不取 draft」；**真紅** | unit |
| 變更過設定時對戰方式與場地數取變更值，目標分數與計時仍取回合 | 變更過的對戰方式與場地數優先於回合 | `resolveRoundSettings({ doubles, 2, 15, null }, round{ singles, 1, 21, timer { 20, startedAt: "2026-01-01T00:00:00.000Z" } })` `toEqual` `{ doubles, 2, 21, 20 }` | 兩組欄位來源相反，任一組取錯來源即紅；計時已開始也取長度；**真紅** | unit |
| 沒有回合時取變更過的設定，未變更過則為預設值 | 沒有回合時取變更過的設定或預設值 | ① `resolveRoundSettings(null, null)` `toEqual` `createRoundSettings()`；② `resolveRoundSettings({ doubles, 2, 15, 10 }, null)` `toEqual` 同一物件 | 無回合路徑；**真紅** | unit |
| 目標分數方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算 | 目標分數方向鍵以畫面選中值起算 | `round`（`targetScore: 15`、一場 `pending`）、`matchSlots: {}`、`settings: buildSettings({ targetScore: 11 })`；前提斷言 15 為 `aria-checked="true"`；`fireEvent.keyDown(目標分數 radiogroup, { key: "ArrowRight" })` → `setTargetScore` 呼叫 1 次且參數 `21`；`document.activeElement?.textContent === "21"` | 元件契約層的起算來源；現行以 11 起算會呼叫 `15` → **真紅** | unit |
| 離開對戰頁再回來時本輪設定與目前回合一致 | E2E 離開對戰頁再回來時設定列與目前回合一致 | `seedRoster(page, 8)` → 雙打、場地 +1、目標 15 → 產生（網格 2）→ 導覽「參賽者」→「對戰」→ `match-stage-region` 可見、網格 2 →「雙打」`aria-checked="true"`、「減少場地數」`toBeEnabled()`、「15」`aria-checked="true"` → 記下第一個網格 testid → 產生 → 舊 testid `toHaveCount(0)`、網格 2 | 端到端證據（`page.tsx` 接線）；現行回來後為單打、減少場地數 disabled → **真紅**（預期失敗在「雙打」斷言） | e2e |
| 回合存在時變更的目標分數與計時沿用到下一輪 | E2E 回合存在時變更的目標分數與計時沿用到下一輪 | `seedRoster(page, 4)` → 產生（網格 1）→ 點「21」「10 分鐘」並各斷言選中 → 記下網格 testid → 產生 → 舊 testid `toHaveCount(0)`、網格 1 →「21」「10 分鐘」`aria-checked="true"`、「開始計時」按鈕 `toBeVisible()` | 現行產生時送出設定內的 11／不計時 → **真紅**（預期失敗在新一輪「21」斷言） | e2e |
| （既有）`round-settings.test.ts` 全部 it；`RoundControls.test.tsx` 全部 it（含「按下產生本輪對戰會以目前設定呼叫回合產生函式一次」「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」「目標分數未鎖定時方向鍵呼叫 onSettingsChange 並移動到下一個選項」） | `match-stage` 既有 Scenario（未 MODIFIED） | 原樣通過；後者在尚無回合時 `displayedTargetScore === settings.targetScore`，起算值不變 | regression guard | unit |
| （既有）`match-stage.spec.ts`「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」「區段導覽可在對戰頁與參賽者名單頁之間來回切換」；`scoreboard-binding.spec.ts`、`round-timer.spec.ts`、`visual-export.spec.ts` 全檔；`user-data/round-sync.spec.ts` | `match-stage`／`round-lifecycle` 既有 Scenario | 原樣通過（每條 test 的第二次產生皆在同一次頁面掛載內，design Risk 4） | regression guard（含雲端回合路徑） | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋5；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 雙鎖、前後清殘留：① `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> tests/e2e/specs/match-stage.spec.ts tests/e2e/specs/scoreboard-binding.spec.ts tests/e2e/specs/round-timer.spec.ts`（chromium、firefox、webkit、mobile-chrome、mobile-safari 各一次）；② `--project=chromium` 全套一次；③ `--project=user-data tests/e2e/user-data/round-sync.spec.ts` | ① 每個 project 該三檔數量＝基線＋2、0 failed（skip 只限既有瀏覽器條件）；② chromium 全套＝基線＋2、全 passed；③ 全 passed、0 skipped |
| C6 | （範圍） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat -- nextjs-pickball/hooks nextjs-pickball/lib/scoreboard nextjs-pickball/lib/sync hono-pickball packages`；另 `git … diff main --name-only -- nextjs-pickball/app nextjs-pickball/components nextjs-pickball/lib` | 前者輸出為空；後者只含 `app/matchmaker/page.tsx`、`components/matchmaker/RoundControls.tsx`、`components/matchmaker/RoundControls.test.tsx`、`lib/matchmaker/round-settings.ts`、`lib/matchmaker/round-settings.test.ts` |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate round-settings-follow-round --strict`（repo root） | valid |

## Checklist

- [x] 每個 Requirement 至少一列（本 change 只 ADDED 一個 Requirement）
- [x] 每個 Scenario（7 個：unit 5、e2e 2）至少一列
- [x] 每列皆有 Tier（unit | e2e）
- [x] 無授權修改的既有測試（design Risk 4）
- [x] 範圍守門有指令驗收（C6）
