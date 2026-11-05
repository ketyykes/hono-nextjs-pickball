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

- [x] 2.1 RED（TDD）：`round-settings.test.ts` 新增四個 it——「回合存在且未變更過設定時取回合的對戰方式、場地數、目標分數與計時」、「回合不計時時解析出的計時為不計時，不論變更過的設定為何」、
  「變更過設定時對戰方式與場地數取變更值，目標分數與計時仍取回合」、「沒有回合時取變更過的設定，未變更過則為預設值」（輸入與斷言依 test-plan；`resolveRoundSettings` 自 `./round-settings` 匯入）。
  單檔 vitest 確認四個 it 皆紅（預期為 `resolveRoundSettings is not a function` 或匯入失敗）並貼出輸出
- [x] 2.2 RED（TDD，E2E）：`match-stage.spec.ts` 的 describe「/matchmaker 對戰頁」末尾新增兩條 test——「離開對戰頁再回來時本輪設定與目前回合一致」、「回合存在時變更的目標分數與計時沿用到下一輪」（步驟依 test-plan 與 design Decision 6）。
  雙鎖下以單檔 E2E（chromium、`-g` 分別篩兩條）確認紅燈：第一條預期失敗於回來後「雙打」`aria-checked` 斷言、第二條預期失敗於新一輪「21」`aria-checked` 斷言（而非前置步驟或同步點）並貼出輸出。兩條可在同一個鎖時段內連續跑
- [x] 2.3 GREEN（TDD）：`round-settings.ts` 新增 `resolveRoundSettings(draft: RoundSettings | null, round: Round | null): RoundSettings`（規則依 delta spec，含 JSDoc 說明為何目標分數與計時一律取回合、`draft` 為 `null` 的意義）；2.1 的四個 it 與檔內既有 it 全綠
- [x] 2.4 GREEN（接線）：`page.tsx` 把 `useState<RoundSettings>(() => createRoundSettings())` 改為 `useState<RoundSettings | null>(null)` 的 `draft`，以 `const settings = resolveRoundSettings(draft, round)` 取得設定，`RoundControls` 的 `onSettingsChange` 改接 `draft` 的 setter；`EmptyStage` 與 `RoundControls` 皆收 `settings`。
  不加 effect、不讀寫 LocalStorage。2.2 的兩條 E2E 在 chromium 轉綠；雙鎖下 chromium 的 `match-stage.spec.ts`、`scoreboard-binding.spec.ts`、`round-timer.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b 的 §2 兩段）
- [x] 2.5 REFACTOR：`resolveRoundSettings` 是否有巢狀三元（改 if/else）、`page.tsx` 的 `draft`／`settings` 命名與註解是否清楚、`createRoundSettings` 是否被重複呼叫可接受（純函式，每次 render 一次）；無壞味道則註記 skipped

  - 紀錄（§2，Implementer sonnet）：
    - 2.1 RED `71348fe`：單檔 vitest `Tests 4 failed | 5 passed (9)`，四個新 it 皆 `TypeError: resolveRoundSettings is not a function`。真紅（leader 機械複驗：`git show 71348fe^:…/round-settings.test.ts` 與 `…/round-settings.ts` 皆不含 `resolveRoundSettings`；RED 前後產品檔無差異）。
    - 2.2 RED `9a45484`：chromium `-g` 分別跑；第一條失敗於 :852「雙打」`aria-checked` Expected "true" Received "false"（導覽、`match-stage-region`、網格 2 皆已通過）；第二條失敗於 :884 新一輪「21」`aria-checked`（舊 testid 消失同步點已通過）。真紅（`git show 9a45484^` 不含兩條 test 名稱；RED 前後 app／lib 無差異）。
    - 2.3 GREEN `d2a5c90`：`Tests 9 passed (9)`。
    - 2.4 GREEN `32167b7`：`draft`＋`resolveRoundSettings(draft, round)`，無 effect、無 LocalStorage。雙鎖下 chromium 三檔 50 passed（match-stage 25＝基線 23＋2、scoreboard-binding 23、round-timer 2）；`tsc` exit 0；改動檔 ESLint 0 errors。
    - mutation（Implementer）：M1～M5 皆轉紅、等價對照組維持綠；E2E 接線變異（`settings = draft ?? createRoundSettings()`）兩條新 test 皆紅。
    - 2.5 REFACTOR：skipped（無巢狀三元、命名與註解清楚、`createRoundSettings` 只在無 draft 且無回合時呼叫）。
    - Stage 1（sonnet）：PASS（名稱逐字、真紅、無 scope creep、`RoundControls`／`EmptyStage` 皆收解析值、範圍 C6 符合）。
    - Stage 2（opus）：PASS。獨立 mutation 以 verbose reporter 逐條比對 it 名稱：M1（3 紅含預期）、M2／M2a／M2b、M3、M4、M5 皆轉紅於預期 it；等價對照 C1（timer 映射）、C2（`draft !== null ? … : …`）9/9 綠。推演：送出比分、`setTargetScore`／`setTimerDuration`、計時開始、雲端 LOADED／衝突重載、訪客 HYDRATE 皆只改 `round` 不寫 `draft`，使用者改過的對戰方式／場地數不會被蓋回；產生新一輪不清 `draft`，新回合由解析值產生故一致；雲端載入中 `SyncStatusNotice` 取代整頁，不會以預設值送出；回合不計時時送出 `timerDurationMinutes: null`（M4／M2b 證明 it 鎖住）。
      Minor（不修）：① 第一條 E2E 以「減少場地數」enabled 代理場地數 2——此為 design Decision 6 的明確選擇，且後續「再產生仍為 2 個網格」已驗送出值；② 換帳號時頁面不 remount，前一帳號的 draft 對戰方式／場地數會沿用——符合「本次進入對戰頁後變更過的設定」字面意義，記入 design Open Questions 供後續參考。

## 3. 目標分數方向鍵以畫面選中值起算

Depends on: §2

- [x] 3.1 RED（TDD）：`RoundControls.test.tsx` 新增 it「目標分數方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」（輸入與斷言依 test-plan，比照既有 it「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」的寫法與註解精神）。單檔 vitest 確認紅燈（預期 `setTargetScore` 以 `15` 被呼叫）並貼出輸出
- [x] 3.2 GREEN（TDD）：`RoundControls.tsx` 的 `handleTargetScoreKeyDown` 起算值改為 `displayedTargetScore`；新 it 與 `RoundControls.test.tsx` 既有 it 全綠；`tsc` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b 的 §3）
- [x] 3.3 REFACTOR：兩個方向鍵 handler 的起算註解是否一致（既有註解刻意不抽共用 helper，維持）；無壞味道則註記 skipped

  - 紀錄（§3，Implementer sonnet）：
    - 3.1 RED `3bbf0b2`：`Tests 1 failed | 23 passed (24)`，失敗為 `setTargetScore` 預期以 `21` 呼叫、實際以 `15` 呼叫一次；前提斷言（15 為 `aria-checked="true"`）通過。真紅（leader 機械複驗：`git show 3bbf0b2^:…/RoundControls.test.tsx` 不含新 it 名稱；RED commit 只改測試檔）。
    - 3.2 GREEN `ac6db09`：`handleTargetScoreKeyDown` 起算值改為 `displayedTargetScore`（一行）；`Tests 24 passed (24)`；`tsc` exit 0；兩檔 ESLint 0 errors。
    - mutation（Implementer）：起算值改回 `settings.targetScore` → 新 it 轉紅；`round?.targetScore ?? settings.targetScore`（等價對照）→ 24 綠。
    - Stage 1（sonnet）：PASS。
    - Stage 2（opus）：PASS。獨立 mutation（verbose 逐條比對）：M1 改回 `settings.targetScore` → 只紅新 it（Received 15）；M2 等價對照 24 綠；額外 M3 focus 索引改 `currentIndex` → 只紅新 it（新 it 是目標分數 focus 的唯一防線）；M4 呼叫參數改 `currentIndex` → 紅新 it 與「目標分數未鎖定時方向鍵呼叫 onSettingsChange…」；M5 刪回合存在時委派分支 → 紅新 it 與「回合存在但尚未開始計分時…委派 setTargetScore」。
      Minor ①：兩個方向鍵 handler 註解不對稱（目標分數 handler 缺起算來源說明）→ 屬 3.3 範圍，已處理（見下）。Minor ②：既有 it「計時方向鍵以畫面選中值起算…」上方註解「page.tsx 只在無回合時才寫回 settings」在 Decision 2 後已過時；本 change 無授權修改既有測試，保留不改，留待後續 change。
    - 3.3 REFACTOR `a020a3b`：依 Stage 2 Minor ①，派全新 Implementer（sonnet）在 `handleTargetScoreKeyDown` 上方補三行起算來源註解（比照計時 handler，只增註解、不動程式碼；24 綠、tsc exit 0）。註解-only 變更未另跑 Stage 1／2，由 Final Code Review 一併涵蓋（leader 裁量）。

## 4. 文件與指令驗收

Depends on: §3

- [x] 4.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否有描述本輪設定保存方式的段落（propose 時 :28 只列「本輪設定」為對戰頁內容，無保存方式描述）；有則同步為「由目前回合與本次變更解析、不持久化」並 commit（`docs:`），否則記錄查核結果、不 commit。
  另在本 task 紀錄後續事項：「回合存在時無法改回不計時，且本 change 後計時會逐輪沿用」建議下一個 change 優先處理（design Risk 1）
  - 紀錄（4.1）：查核 `nextjs-pickball/CLAUDE.md`，:28 只列「本輪設定」為對戰頁內容，無保存方式描述，不需同步，不 commit。
    **後續事項**：回合存在時無法改回「不計時」（`RoundControls.tsx` 的 ⚠️ 暫行處置），且本 change 後計時會逐輪沿用——一旦某輪設了計時，之後每一輪都沿用，只有重置名單才能回到不計時；建議下一個 change 優先處理（design Risk 1；已有 proposal `round-timer-clear` 排在本 change 之後）。
- [x] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：leader 於 `a020a3b` 實跑 `pnpm --dir <repo> -r exec tsc --noEmit`、`pnpm --dir <repo>/hono-pickball typecheck`、`pnpm --dir <repo>/packages/pickball-core typecheck` 皆 exit 0。
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行（今晚特別安排第 4 點）。
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋5，後端與核心與基線相同
  - 由 coordinator 於合併前執行（今晚特別安排第 4 點）。
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
  - 由 coordinator 於合併前執行（今晚特別安排第 4 點）。
- [ ] 4.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 由 coordinator 於合併前執行（今晚特別安排第 4 點）。
- [x] 4.7 驗收（指令）C6：test-plan C6 兩條 `git diff` 輸出符合期望
  - 紀錄：前者輸出為空；後者恰為 `app/matchmaker/page.tsx`、`components/matchmaker/RoundControls.test.tsx`、`components/matchmaker/RoundControls.tsx`、`lib/matchmaker/round-settings.test.ts`、`lib/matchmaker/round-settings.ts`。
- [x] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate round-settings-follow-round --strict` 通過
  - 紀錄：`Change 'round-settings-follow-round' is valid`。

## Final Code Review

- [ ] Final Code Review（opus）：依 execution-plan Final Code Reviewer checklist；結果記於此
