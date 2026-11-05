# Tasks: court-score-entry-submit-a11y

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run components/matchmaker/CourtCard.test.tsx`（**`--run` 前不可加 `--`**）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/match-stage.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/components/matchmaker/ScoreEntry.tsx` 與 `nextjs-pickball/components/matchmaker/CourtCard.tsx`（傳入 `groupLabel` 一處）。
> **不改版面與尺寸、不改送出資料流與驗證、不動 hooks／lib／app、不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **授權修改的既有測試：無**。既有 it／test 的名稱與斷言一律不得修改（design Decision 2 方案 (a) 的零修改承諾）；若任何既有測試因本 change 轉紅，停止並上報，不得改測試遷就。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/court-score-entry-submit-a11y`、工作樹乾淨；`pnpm --dir <repo> install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir <repo> test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（C1）、`pnpm --dir <repo> lint`（errors／warnings 數）、`pnpm --dir <repo>/nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 紀錄：依 coordinator 今晚裁定精簡執行。分支與工作樹乾淨已確認（HEAD `96d384a`）；`pnpm -r exec tsc --noEmit` exit 0；未跑 install／全套 test／lint／`playwright --list`，基線數字取自 coordinator 於前一個 change 合併前實跑，已回填 environment.md。
- [x] 1.2 對齊 main：確認 `ScoreEntry.tsx`、`CourtCard.tsx`、`CourtCard.test.tsx`、`match-stage.spec.ts` 與 propose 時（`main` `2bd7176`）一致（`git -C <repo> diff --stat 2bd7176 main -- <四檔>`）；
  若並行 change（`round-settings-follow-round`、`round-timer-clear`）已合併並改動其中任一檔，確認 `CourtCard.tsx` 的 `<ScoreEntry>` 呼叫段（propose 時 :309-315）與 `match-stage.spec.ts` 的 `seedRoster` helper 及「送出比分失敗時 role=alert…」test 的兩場地建立方式未變；
  再 grep `nextjs-pickball/{components,app,tests}` 是否有以寬鬆正規式（例：`getByLabel(/場地/)`、`getByRole("group")` 無 name）定位的測試會多命中新群組（design Risks 1）；
  確認 `openspec/specs/match-stage/spec.md` 尚無同名 Requirement「手動比分輸入的鍵盤送出與場地區分」；任何差異記入 design.md Open Questions 並 commit（`docs(openspec):`）
  - 紀錄：`git diff --stat 2bd7176 main -- <四檔>` 輸出為空（四檔與 propose 時一致，並行 change 未合併）；grep `getByLabel(/場地` 與無 name 的 `getByRole("group")` 於 components／app／tests 皆無命中；主 spec 無同名 Requirement（計數 0）。無差異，未另 commit。

## 2. 比分輸入可按 Enter 送出並以場地群組區分

Depends on: §1

- [x] 2.1 RED（TDD）：`CourtCard.test.tsx` 新增四個 it——「在比分欄位按 Enter 會以場次識別與兩隊分數送出一次」、「只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串」、
  「已完成場次的比分欄位按 Enter 不會送出」、「比分欄位與送出按鈕包在以場地編號命名的群組內」（輸入與斷言依 test-plan，沿用 `buildProps`／`buildMatch`）。
  單檔 vitest 確認三個 it 紅、「已完成場次的比分欄位按 Enter 不會送出」綠（**regression guard，點名**）並貼出輸出；commit（`test:`）
  - 紀錄：`7572d7d`（test）。單檔 vitest 3 failed／24 passed：紅＝「在比分欄位按 Enter…」「只填一欄…」「比分欄位與送出按鈕包在…群組內」；綠＝「已完成場次的比分欄位按 Enter 不會送出」（**regression guard**）。leader 機械複驗：`7572d7d^` 的測試檔不含新 it 名稱，`96d384a..92cd5dc` 間產品檔零差異 → 真紅。
- [x] 2.2 RED（TDD，E2E）：`match-stage.spec.ts` 新增 test「多場地時可依場地群組定位比分欄位並以 Enter 送出」（步驟依 test-plan）。
  雙鎖下以單檔 E2E（chromium、`-g` 篩此 test）確認紅燈（預期失敗於 group 定位逾時，而非兩場地同步點）並貼出輸出；commit（`test:`）
  - 紀錄：`92cd5dc`（test）。雙鎖下 chromium `-g` 單條：失敗於 `match-stage.spec.ts:349` 第 2 場地 group 內 `fill("11")` 逾時 30 秒（定位不到 `getByRole(group, 第 2 場地比分)`），兩場地同步點已通過 → 真紅（`92cd5dc^` 測試檔不含新 test 名稱，已機械複驗）。
- [x] 2.3 GREEN（TDD）：`ScoreEntry.tsx` 依 design Decision 1～3 改為 `<form onSubmit>`（`preventDefault` 後呼叫既有 `onSubmitScore`）、按鈕 `type="submit"` 並移除 `onClick`、兩欄位與按鈕包進 `<div role="group" aria-label={groupLabel}>`、新增必填 prop `groupLabel`（JSDoc／註解說明為何群組不放在 form 上）；
  `CourtCard.tsx` 傳入 `groupLabel={`第 ${match.courtNumber} 場地比分`}`。版面 className 原樣保留。
  2.1 的 it、2.2 的 E2E 全綠；`CourtCard.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `match-stage.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b）；commit（`feat:`）
  - 紀錄：`889866b`（feat）。`CourtCard.test.tsx` 27/27 綠；雙鎖下 chromium `match-stage.spec.ts` 全檔 23 passed；tsc exit 0；四個改動檔 ESLint 0 errors。
  - Implementer mutation（6 次，皆還原）：按鈕改 `type="button"` → 6 條紅（含既有「送出比分會以場次識別…」）；只傳第一欄 → 4 條紅；`String(Number(teamBValue))` → 2 條紅；CourtCard 傳固定「第 1 場地比分」→ 群組 it 紅；移除 teamA Input disabled → 「已完成場次…按 Enter」**存活**（送出按鈕仍 disabled 擋住隱式送出）；移除 `preventDefault()` → E2E 單條**存活**（headless 下未見導覽，`toHaveURL` 無鑑別力）。對照組等價變異：時間不足未做。
  - Stage 1／Stage 2：Stage 1（sonnet）PASS 無必修（首輪單檔 6 failed 係與 Stage 2 的 `type="button"` mutation 同時執行所致，重跑兩次 27/27）；Stage 2（opus）PASS 無必修，獨立 mutation 3 條（`type="button"` 6 紅、固定「第 1 場地比分」群組 it 紅、移除兩 Input disabled 僅既有 disabled it 紅），存活項 (a) 接受（按鈕 disabled 擋隱式送出，行為等價）、(b) `preventDefault` 存活為建議補強、不擋合併（見 design Open Questions）。
- [x] 2.4 REFACTOR：檔頭註解是否需補 Enter 送出與群組的理由、`handleSubmit` 命名是否仍貼切、是否殘留 `onClick`；無壞味道則註記 skipped
  - 紀錄：skipped。檔頭註解已於 GREEN 補 Enter 送出與群組不放在 form 上的理由；`handleSubmit` 命名仍貼切；無殘留 `onClick`。

## 3. 文件與指令驗收

Depends on: §2

- [x] 3.1 設定層（文件）：`grep -n 'ScoreEntry\|比分輸入\|送出比分' nextjs-pickball/CLAUDE.md`；若有描述手動比分輸入結構的段落，補一句「比分輸入為 form（Enter 送出）且以『第 N 場地比分』具名群組區分場地」並 commit（`docs:`）；否則記錄查核結果、不 commit
  - 紀錄：grep 命中 :28、:62、:110、:112、:119，皆為路由摘要或雲端送出資料流，無描述手動比分輸入 DOM 結構的段落 → 不補文字、不 commit。
- [x] 3.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：GREEN 後 `pnpm -r exec tsc --noEmit`、`hono-pickball typecheck`、`pickball-core typecheck` 皆 exit 0。
- [ ] 3.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行。
- [ ] 3.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋4，後端與核心與基線相同
  - 由 coordinator 於合併前執行。
- [ ] 3.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
  - 由 coordinator 於合併前執行。
- [ ] 3.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 由 coordinator 於合併前執行。
- [x] 3.7 驗收（指令）C6：test-plan C6 兩條 `git diff main --stat` 符合期望
  - 紀錄：前者（hooks／app／lib／hono-pickball／packages）輸出為空；components 只含 `CourtCard.test.tsx`、`CourtCard.tsx`、`ScoreEntry.tsx`。
- [x] 3.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate court-score-entry-submit-a11y --strict` 通過
  - 紀錄：`Change 'court-score-entry-submit-a11y' is valid`。

## Final Code Review

- [ ] Final Code Reviewer（opus）一次審完全部 commit，結果記於此
  - 未執行（04:58 硬停，依 coordinator 安排留給下一個 session 或 coordinator）。
