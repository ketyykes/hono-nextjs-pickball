# Test Plan: target-score-lock-current-round

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，Vitest＋happy-dom，純函式直接呼叫，沿用檔內既有 `makeRound`／`makeMatch`／`makeSlot` helper）；
> `e2e`（`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，五個 browser project，訪客模式）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **fixture 的共同要求**：槽集合的**鍵**與槽內容的 `matchId` 欄位在一般 it 中保持一致（`makeSlot({ matchId: <同鍵> })`），只有「以槽集合的鍵比對」的 it 刻意讓兩者不同；
> 非本輪的鍵一律用 `old`（不得與本輪任何場次 id 相同）。斷言 `locked` 的同時斷言 `reason`（未鎖定為 `null`、已鎖定為「本輪已開始計分，目標分數不可更改。」）。
>
> **E2E 的共同要求**：沿用 describe「/matchmaker 對戰頁的計分板接線」既有的 `beforeEach`（清五個 key）與 `seedRoster`／`generateRound`／`courtMatchId` helper，不另寫 helper；
> 第二次產生直接點「產生本輪對戰」按鈕；新一輪就緒的同步點為 `court-<舊 id>-grid` 數量 0 且場地網格數量 1；SHALL NOT 使用 `waitForTimeout`；不斷言 LocalStorage 內殘留槽是否存在（design Decision 5）。

## round-lifecycle

### Requirement: 開始計分後鎖定本輪目標分數（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 前一輪殘留的計分板槽不鎖定新一輪的目標分數 | 前一輪殘留的計分板槽不鎖定新一輪的目標分數 | 本輪 `[m1 pending]`；slots `{ old: makeSlot({ matchId: "old", status: "playing", scores: { us: 4, them: 2 } }) }` → `locked === false`、`reason === null` | golden path（使用者回報的 bug 本身）；現行第二條掃全部槽 → **真紅** | unit |
| 本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定 | 本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定 | 本輪 `[m1 pending]`；slots `{ m1: setup 0-0, old: finished 11-5 }` → `locked === false`、`reason === null` | 「非 setup」含 `finished`，且本輪槽存在不得讓過濾被略過；現行 → **真紅** | unit |
| 本輪場次的槽已開始時仍鎖定且不受殘留槽影響 | 本輪場次的槽已開始時仍鎖定且不受殘留槽影響 | 本輪 `[m1 pending, m2 pending]`；slots `{ m2: playing, old: playing }` → `locked === true`、`reason` 為鎖定原因 | 守住「過濾後仍要鎖」與「不只比對第一場」；現行已鎖 → **regression guard**（RED 時點名） | unit |
| 鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId | 以槽集合的鍵判定是否屬於本輪 | 本輪 `[m1 pending]`；① slots `{ old: makeSlot({ matchId: "m1", status: "playing" }) }` → `locked === false`；② slots `{ m1: makeSlot({ matchId: "other", status: "playing" }) }` → `locked === true` | 與回填條件同一來源（鍵）；①在現行 → **真紅**（②現行已鎖，同一 it 內） | unit |
| 前一輪殘留的計分板進度不鎖定新一輪的目標分數與計時設定 | E2E 前一輪殘留的計分板進度不鎖定新一輪的設定 | `seedRoster(4)`、`generateRound(1)`、記下舊 id → 「進入計分板」→ 我方贏一球 →「返回對戰」→ 前置斷言「本輪已開始計分，目標分數不可更改。」可見 → 點「產生本輪對戰」→ `court-<舊 id>-grid` 數量 0、網格數量 1 → radiogroup「目標分數」3 顆 radio 與「計時」4 顆 radio 皆 `toBeEnabled()`；兩段鎖定說明皆 `toHaveCount(0)` | 端到端證據（含 `page.tsx` 重讀槽與 `RoundControls` 委派）；現行新一輪仍鎖 → **真紅** | e2e |
| （既有）無任何場次完成且無計分板槽時目標分數未鎖定；任一場次的計分板槽非 setup 時目標分數鎖定；槽存在但仍為 setup 時不視為已開始計分；已有場次完成時目標分數鎖定，不論比分來源 | 尚未開始計分時可更改目標分數／有場次的計分板已開打時鎖定／槽存在但一球未打時不鎖定／手動輸入完成一場後亦鎖定 | 原樣通過（槽鍵皆為本輪場次 id） | regression guard；MODIFIED 帶入的既有 Scenario | unit |
| （既有）鎖定判定掃描全部場次與全部槽而非只看第一筆；場次為 scoring 時目標分數鎖定 | 有場次的計分板已開打時鎖定（補洞 it） | 原樣通過；其「finished 槽同樣要鎖」一段守住第二條仍為 `!== "setup"` | regression guard | unit |
| （既有，授權刪除）槽已不在回合中但非 setup 時仍判定為鎖定 | （無；被本 change 推翻的測試層取捨） | 連同上方說明註解整段刪除；同組輸入的相反期望由「前一輪殘留的計分板槽不鎖定新一輪的目標分數」承接 | 與新規範矛盾（design Decision 2） | unit |
| （既有）本輪開始計分後目標分數控制項停用並說明原因 | 鎖定時 UI 停用並說明原因 | 原樣通過 | regression guard（E2E 層的本輪槽鎖定） | e2e |
| （既有）本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因；本輪已開始計分時計時控制項 disabled 並顯示鎖定原因；計時鎖定時方向鍵不得呼叫 setTimerDuration 或 onSettingsChange…；其餘 `RoundControls.test.tsx` 鎖定 it | `match-stage`「目標分數選擇器」「本輪已開始計分時計時設定鎖定」（未 MODIFIED） | 原樣通過（fixture 槽鍵 `match-1` 即 `buildRound` 預設場次 id） | regression guard（`RoundControls` 委派不變） | unit |
| （既有）`match-stage.spec.ts` 目標分數鍵盤導覽 test 的鎖定段；`user-data/round-sync.spec.ts` 雲端分槽鎖定斷言 | `match-stage`／`round-lifecycle` 既有 Scenario | 原樣通過 | regression guard（手動送出路徑與雲端路徑） | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋3（新增 4、刪除 1）；後端、核心與基線相同 |
| C4 | （建置） | `pnpm build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 雙鎖、前後清殘留：① `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> tests/e2e/specs/scoreboard-binding.spec.ts tests/e2e/specs/match-stage.spec.ts`（chromium、firefox、webkit、mobile-chrome、mobile-safari 各一次）；② `--project=chromium` 全套一次；③ `--project=user-data tests/e2e/user-data/round-sync.spec.ts` | ① 每個 project 該兩檔數量＝基線＋1、0 failed（skip 只限既有瀏覽器條件）；② chromium 全套＝基線＋1、全 passed；③ 全 passed、0 skipped |
| C6 | （範圍） | `git diff main --stat -- nextjs-pickball/components nextjs-pickball/hooks nextjs-pickball/app nextjs-pickball/lib/scoreboard hono-pickball packages` | 輸出為空（產品碼只動 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`） |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate target-score-lock-current-round --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列（本 change 只 MODIFIED 一個 Requirement）
- [x] 每個 Scenario（新增 5、MODIFIED 帶入的既有 5 以「（既有）」列合併）至少一列
- [x] 每列皆有 Tier（unit | e2e）
- [x] 授權修改的既有測試只有一處（刪除一個 it），標明原因
- [x] 範圍守門有指令驗收（C6）
