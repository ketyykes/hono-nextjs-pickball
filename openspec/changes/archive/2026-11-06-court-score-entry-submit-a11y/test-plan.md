# Test Plan: court-score-entry-submit-a11y

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，Vitest＋happy-dom＋Testing Library＋`user-event`，沿用檔內既有 `buildProps`／`buildMatch` helper）；
> `e2e`（`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，五個 browser project，訪客模式）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **fixture 的共同要求**：Enter 一律以 `user.type(<欄位>, "{Enter}")` 或聚焦後 `user.keyboard("{Enter}")` 觸發，SHALL NOT 以 `fireEvent.submit` 直接送出 form（那會繞過隱式送出，測不到 Enter）；
> 欄位一律以既有名稱 `getByLabelText("第一隊比分")`／`("第二隊比分")` 定位；群組以 `getByRole("group", { name: "第 2 場地比分" })` 定位並以 `within` 查其子控制項。
>
> **E2E 的共同要求**：沿用 `match-stage.spec.ts` 既有 `seedRoster` helper 與「送出比分失敗時 role=alert…」test 的兩場地建立方式（`seedRoster(page, 4)`、「增加場地數」、「產生本輪對戰」、`[data-testid$="-grid"]` 數量 2 為同步點）；不另寫 helper；SHALL NOT 使用 `waitForTimeout`；Enter 以 `locator.press("Enter")` 觸發。

## match-stage

### Requirement: 手動比分輸入的鍵盤送出與場地區分（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 在比分欄位按 Enter 會以場次識別與兩隊分數送出一次 | 在比分欄位按 Enter 送出 | `buildMatch({ id: "match-42" })`；第一隊輸入「11」、第二隊輸入「7{Enter}」→ `onSubmitScore` 呼叫 1 次、參數 `("match-42", "11", "7")` | golden path；現行無 form，Enter 無作用 → **真紅** | unit |
| 只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串 | 按 Enter 與按送出按鈕同樣原樣上傳空白欄位 | 第一隊輸入「11{Enter}」、第二隊不填 → `onSubmitScore` 以 `("match-42", "11", "")` 呼叫 1 次 | 守住 Enter 路徑也不 `Number()` 轉換；現行 → **真紅** | unit |
| 已完成場次的比分欄位按 Enter 不會送出 | 已完成場次按 Enter 不送出 | 已完成場次（沿用既有「已完成場次的比分欄位與送出按鈕皆為 disabled」的 fixture）；`user.click(第一隊比分)` 後 `user.keyboard("{Enter}")` → `onSubmitScore` 未被呼叫 | 防止改成 form 後 disabled 被繞過；現行 Enter 本就無作用 → **regression guard**（RED 時點名） | unit |
| 比分欄位與送出按鈕包在以場地編號命名的群組內 | 比分控制項包在以場地編號命名的群組內 | `buildMatch({ courtNumber: 2 })`；`getByRole("group", { name: "第 2 場地比分" })` 存在；`within(group)` 可取得 `getByLabelText("第一隊比分")`、`getByLabelText("第二隊比分")`、`getByRole("button", { name: "送出比分" })`；三者名稱完全相等（不含場地字樣） | 區分場地的核心；現行無 group → **真紅** | unit |
| 多場地時可依場地群組定位比分欄位並以 Enter 送出 | E2E 多場地時依場地群組定位並以 Enter 送出 | 兩場地就緒 → `page.getByRole("group", { name: "第 2 場地比分" })` 內 `getByLabel("第一隊比分").fill("11")`、`getByLabel("第二隊比分").fill("7")`、`.press("Enter")` → 該 group 內兩欄位與按鈕 `toBeDisabled()`；`page.getByRole("group", { name: "第 1 場地比分" }).getByLabel("第一隊比分")` `toBeEnabled()`；`expect(page).toHaveURL(/\/matchmaker$/)`（未發生原生送出導覽） | 端到端證據（真實瀏覽器隱式送出＋group 定位）；現行 group 不存在 → **真紅**（失敗於定位） | e2e |
| （既有）比分欄位為 inputMode numeric 並標示所屬隊伍；送出比分會以場次識別與兩隊分數呼叫回合送出函式一次；只填一欄比分送出時傳遞原始空字串，不靜默補成 0；送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息；已完成場次的比分欄位與送出按鈕皆為 disabled；兩隊比分相同時 UI 仍照常委派送出而不自行攔截；其餘 `CourtCard.test.tsx` 以名稱定位的 it | `match-stage`「手動輸入比分與送出」（未 MODIFIED） | 原樣通過（名稱未改、點擊按鈕仍經 submit 送出） | regression guard（方案 (a) 的零修改承諾） | unit |
| （既有）`match-stage.spec.ts`「完成一輪…」「送出比分失敗時 role=alert 只出現在對應的場地卡片…」「對戰頁所有互動控制皆具備可存取名稱」「手機斷點觸控目標不小於 44px 且不橫向溢出」；`round-timer`／`scoreboard-binding`／`visual-export`／`user-data` 各檔以名稱定位比分控制項的 test | `match-stage` 既有 Scenario | 原樣通過 | regression guard（名稱、觸控尺寸、手動送出路徑） | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir <repo> -r exec tsc --noEmit`；`pnpm --dir <repo>/hono-pickball typecheck`；`pnpm --dir <repo>/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir <repo> lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir <repo> test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋4；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir <repo> build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 雙鎖、前後清殘留：① `pnpm --dir <repo>/nextjs-pickball exec playwright test --workers=1 --project=<p> tests/e2e/specs/match-stage.spec.ts`（chromium、firefox、webkit、mobile-chrome、mobile-safari 各一次）；② `--project=chromium` 全套一次；③ `--project=user-data tests/e2e/user-data/round-sync.spec.ts` | ① 每個 project 該檔數量＝基線＋1、0 failed（skip 只限既有瀏覽器條件）；② chromium 全套＝基線＋1、全 passed；③ 全 passed、0 skipped |
| C6 | （範圍） | `git -C <repo> diff main --stat -- nextjs-pickball/hooks nextjs-pickball/app nextjs-pickball/lib hono-pickball packages`；`git -C <repo> diff main --stat -- nextjs-pickball/components` | 前者輸出為空；後者只含 `ScoreEntry.tsx`、`CourtCard.tsx`、`CourtCard.test.tsx` |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate court-score-entry-submit-a11y --strict`（repo root） | valid |

## Checklist

- [x] 每個 Requirement 至少一列（本 change 只 ADDED 一個 Requirement）
- [x] 每個 Scenario（新增 5）至少一列
- [x] 每列皆有 Tier（unit | e2e）
- [x] 授權修改的既有測試：無
- [x] 範圍守門有指令驗收（C6）
