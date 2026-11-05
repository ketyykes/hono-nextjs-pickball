# Tasks: round-settings-follow-round

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/match-stage.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
> **不用 `pnpm --dir <root> --filter ./<ws>`**：filter 以 shell cwd 解析，cwd 不在 repo root 時 "No projects matched" 且 exit 0。
> 雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`（`/tmp` 腳本重開機會消失，不存在時由 coordinator 重建）。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> §2 的單元 RED 會 import 尚不存在的 `resolveRoundSettings`（型別錯誤＋執行期紅）；主 repo 的 Stop hook 會擋 tsc 紅燈，**RED 與 GREEN MUST 在同一張派工單內完成**。
>
> **標註**：`TDD`；`regression guard`；`接線`（`app/**/page.tsx`，TDD 例外層，以 E2E 驗收）；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/lib/matchmaker/round-settings.ts`（新增 `resolveRoundSettings`）、`nextjs-pickball/app/matchmaker/page.tsx`（設定狀態改為 `draft` 並解析）、`nextjs-pickball/components/matchmaker/RoundControls.tsx`（目標分數方向鍵起算值一行）。
> **不新增儲存 key、不加 effect、不處理「不計時」缺口、不加確認對話框、不新增相依、無 migration、不動 `hooks/**`／後端／核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **授權修改的既有測試**：**無**。propose 時查核過既有 E2E 與單元測試，沒有斷言依賴「回到對戰頁後設定為預設值」（design Risk 4）；任何既有 it／test 轉紅一律停止上報。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/round-settings-follow-round`、工作樹乾淨；確認 `/tmp/lock-fast.sh`、`/tmp/heavy-lock.sh` 存在（不存在則請 coordinator 重建）；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm --dir <repo> test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm --dir <repo> lint`（errors／warnings 數）、`pnpm --dir <repo>/nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `match-stage.spec.ts`＋`scoreboard-binding.spec.ts`＋`round-timer.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification（含分出點 commit）並 commit（`chore:`）
- [x] 1.2 對齊 main：確認 `round-settings.ts`、`round-settings.test.ts`、`page.tsx`、`RoundControls.tsx`、`RoundControls.test.tsx`、`match-stage.spec.ts` 與 propose 時（`main` `cb9b585`）一致（`git -C <repo> diff --stat cb9b585 main -- <六檔>`）；
  若有差異，確認：① `page.tsx` 的設定仍為單一 `useState(createRoundSettings())`；② `RoundControls.tsx` :143 仍以 `settings.targetScore` 起算；③ 區段導覽連結名稱仍為「參賽者」「對戰」、`match-stage.spec.ts` 的 `seedRoster`／`beforeEach` 未變；
  ④ 重跑 design Risk 4 的查核（列出同一條 test 內產生兩次以上或導覽兩次以上的 E2E，確認無依賴預設值重置的斷言）。主 spec `match-stage` 若已新增同名或涵蓋本 Requirement 的規則，停止並上報。差異與查核結果記入本 task；需調整 delta 時 `DO_NOT_TRACK=1 openspec validate round-settings-follow-round --strict` 通過後 commit（`docs(openspec):`）

  - 紀錄（1.1）：分支 `change/round-settings-follow-round`、工作樹乾淨、分出點 `bc96661`；`/tmp/lock-fast.sh`、`/tmp/heavy-lock.sh` 皆存在；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0。
    依今晚特別安排第 2 點，`pnpm install`、`db:migrate:local`、全套 test／lint／`playwright --list` 不重跑，基線數字採 coordinator 於前一個 change 合併前實跑結果，已回填 environment.md。
  - 紀錄（1.2）：`git diff --stat cb9b585 main` 六檔中只有 `match-stage.spec.ts` 有差異（+25，`court-score-entry-submit-a11y` 新增 test「多場地時可依場地群組定位比分欄位並以 Enter 送出」，同一次掛載內只產生一次，不依賴預設值重置）。
    ① `page.tsx` :88 仍為 `useState<RoundSettings>(() => createRoundSettings())`；② `RoundControls.tsx` :143 仍以 `settings.targetScore` 起算；③ `MatchmakerTabs` 的 `nav[aria-label="對戰分配區段導覽"]` 與連結名稱「參賽者」「對戰」未變，`seedRoster`／`beforeEach` 未變；
    ④ Risk 4 重查：導覽離開對戰頁的 E2E（`match-stage` 區段導覽 test、`matchmaker-history`、`matchmaker-data-transfer`、`navbar-*`）皆未在返回後產生回合並斷言預設值。主 spec `match-stage` 無同名或涵蓋本 Requirement 的規則。delta 不需調整。

## 2. 本輪設定由目前回合與使用者變更解析

Depends on: §1

- [ ] 2.1 RED（TDD）：`round-settings.test.ts` 新增四個 it——「回合存在且未變更過設定時取回合的對戰方式、場地數、目標分數與計時」、「回合不計時時解析出的計時為不計時，不論變更過的設定為何」、
  「變更過設定時對戰方式與場地數取變更值，目標分數與計時仍取回合」、「沒有回合時取變更過的設定，未變更過則為預設值」（輸入與斷言依 test-plan；`resolveRoundSettings` 自 `./round-settings` 匯入）。
  單檔 vitest 確認四個 it 皆紅（預期為 `resolveRoundSettings is not a function` 或匯入失敗）並貼出輸出
- [ ] 2.2 RED（TDD，E2E）：`match-stage.spec.ts` 的 describe「/matchmaker 對戰頁」末尾新增兩條 test——「離開對戰頁再回來時本輪設定與目前回合一致」、「回合存在時變更的目標分數與計時沿用到下一輪」（步驟依 test-plan 與 design Decision 6）。
  雙鎖下以單檔 E2E（chromium、`-g` 分別篩兩條）確認紅燈：第一條預期失敗於回來後「雙打」`aria-checked` 斷言、第二條預期失敗於新一輪「21」`aria-checked` 斷言（而非前置步驟或同步點）並貼出輸出。兩條可在同一個鎖時段內連續跑
- [ ] 2.3 GREEN（TDD）：`round-settings.ts` 新增 `resolveRoundSettings(draft: RoundSettings | null, round: Round | null): RoundSettings`（規則依 delta spec，含 JSDoc 說明為何目標分數與計時一律取回合、`draft` 為 `null` 的意義）；2.1 的四個 it 與檔內既有 it 全綠
- [ ] 2.4 GREEN（接線）：`page.tsx` 把 `useState<RoundSettings>(() => createRoundSettings())` 改為 `useState<RoundSettings | null>(null)` 的 `draft`，以 `const settings = resolveRoundSettings(draft, round)` 取得設定，`RoundControls` 的 `onSettingsChange` 改接 `draft` 的 setter；`EmptyStage` 與 `RoundControls` 皆收 `settings`。
  不加 effect、不讀寫 LocalStorage。2.2 的兩條 E2E 在 chromium 轉綠；雙鎖下 chromium 的 `match-stage.spec.ts`、`scoreboard-binding.spec.ts`、`round-timer.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b 的 §2 兩段）
- [ ] 2.5 REFACTOR：`resolveRoundSettings` 是否有巢狀三元（改 if/else）、`page.tsx` 的 `draft`／`settings` 命名與註解是否清楚、`createRoundSettings` 是否被重複呼叫可接受（純函式，每次 render 一次）；無壞味道則註記 skipped

## 3. 目標分數方向鍵以畫面選中值起算

Depends on: §2

- [ ] 3.1 RED（TDD）：`RoundControls.test.tsx` 新增 it「目標分數方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」（輸入與斷言依 test-plan，比照既有 it「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」的寫法與註解精神）。單檔 vitest 確認紅燈（預期 `setTargetScore` 以 `15` 被呼叫）並貼出輸出
- [ ] 3.2 GREEN（TDD）：`RoundControls.tsx` 的 `handleTargetScoreKeyDown` 起算值改為 `displayedTargetScore`；新 it 與 `RoundControls.test.tsx` 既有 it 全綠；`tsc` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b 的 §3）
- [ ] 3.3 REFACTOR：兩個方向鍵 handler 的起算註解是否一致（既有註解刻意不抽共用 helper，維持）；無壞味道則註記 skipped

## 4. 文件與指令驗收

Depends on: §3

- [ ] 4.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否有描述本輪設定保存方式的段落（propose 時 :28 只列「本輪設定」為對戰頁內容，無保存方式描述）；有則同步為「由目前回合與本次變更解析、不持久化」並 commit（`docs:`），否則記錄查核結果、不 commit。
  另在本 task 紀錄後續事項：「回合存在時無法改回不計時，且本 change 後計時會逐輪沿用」建議下一個 change 優先處理（design Risk 1）
- [ ] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋5，後端與核心與基線相同
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 4.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 4.7 驗收（指令）C6：test-plan C6 兩條 `git diff` 輸出符合期望
- [ ] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate round-settings-follow-round --strict` 通過

## Final Code Review

- [ ] Final Code Review（opus）：依 execution-plan Final Code Reviewer checklist；結果記於此
