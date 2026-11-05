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

- [ ] 1.1 確認分支 `change/court-score-entry-submit-a11y`、工作樹乾淨；`pnpm --dir <repo> install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir <repo> test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（C1）、`pnpm --dir <repo> lint`（errors／warnings 數）、`pnpm --dir <repo>/nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
- [ ] 1.2 對齊 main：確認 `ScoreEntry.tsx`、`CourtCard.tsx`、`CourtCard.test.tsx`、`match-stage.spec.ts` 與 propose 時（`main` `2bd7176`）一致（`git -C <repo> diff --stat 2bd7176 main -- <四檔>`）；
  若並行 change（`round-settings-follow-round`、`round-timer-clear`）已合併並改動其中任一檔，確認 `CourtCard.tsx` 的 `<ScoreEntry>` 呼叫段（propose 時 :309-315）與 `match-stage.spec.ts` 的 `seedRoster` helper 及「送出比分失敗時 role=alert…」test 的兩場地建立方式未變；
  再 grep `nextjs-pickball/{components,app,tests}` 是否有以寬鬆正規式（例：`getByLabel(/場地/)`、`getByRole("group")` 無 name）定位的測試會多命中新群組（design Risks 1）；
  確認 `openspec/specs/match-stage/spec.md` 尚無同名 Requirement「手動比分輸入的鍵盤送出與場地區分」；任何差異記入 design.md Open Questions 並 commit（`docs(openspec):`）

## 2. 比分輸入可按 Enter 送出並以場地群組區分

Depends on: §1

- [ ] 2.1 RED（TDD）：`CourtCard.test.tsx` 新增四個 it——「在比分欄位按 Enter 會以場次識別與兩隊分數送出一次」、「只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串」、
  「已完成場次的比分欄位按 Enter 不會送出」、「比分欄位與送出按鈕包在以場地編號命名的群組內」（輸入與斷言依 test-plan，沿用 `buildProps`／`buildMatch`）。
  單檔 vitest 確認三個 it 紅、「已完成場次的比分欄位按 Enter 不會送出」綠（**regression guard，點名**）並貼出輸出；commit（`test:`）
- [ ] 2.2 RED（TDD，E2E）：`match-stage.spec.ts` 新增 test「多場地時可依場地群組定位比分欄位並以 Enter 送出」（步驟依 test-plan）。
  雙鎖下以單檔 E2E（chromium、`-g` 篩此 test）確認紅燈（預期失敗於 group 定位逾時，而非兩場地同步點）並貼出輸出；commit（`test:`）
- [ ] 2.3 GREEN（TDD）：`ScoreEntry.tsx` 依 design Decision 1～3 改為 `<form onSubmit>`（`preventDefault` 後呼叫既有 `onSubmitScore`）、按鈕 `type="submit"` 並移除 `onClick`、兩欄位與按鈕包進 `<div role="group" aria-label={groupLabel}>`、新增必填 prop `groupLabel`（JSDoc／註解說明為何群組不放在 form 上）；
  `CourtCard.tsx` 傳入 `groupLabel={`第 ${match.courtNumber} 場地比分`}`。版面 className 原樣保留。
  2.1 的 it、2.2 的 E2E 全綠；`CourtCard.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `match-stage.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b）；commit（`feat:`）
- [ ] 2.4 REFACTOR：檔頭註解是否需補 Enter 送出與群組的理由、`handleSubmit` 命名是否仍貼切、是否殘留 `onClick`；無壞味道則註記 skipped

## 3. 文件與指令驗收

Depends on: §2

- [ ] 3.1 設定層（文件）：`grep -n 'ScoreEntry\|比分輸入\|送出比分' nextjs-pickball/CLAUDE.md`；若有描述手動比分輸入結構的段落，補一句「比分輸入為 form（Enter 送出）且以『第 N 場地比分』具名群組區分場地」並 commit（`docs:`）；否則記錄查核結果、不 commit
- [ ] 3.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 3.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
- [ ] 3.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋4，後端與核心與基線相同
- [ ] 3.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 3.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 3.7 驗收（指令）C6：test-plan C6 兩條 `git diff main --stat` 符合期望
- [ ] 3.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate court-score-entry-submit-a11y --strict` 通過

## Final Code Review

- [ ] Final Code Reviewer（opus）一次審完全部 commit，結果記於此
