# Tasks: round-timer-clear

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/round-timer.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
> 雙鎖：`/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`（不得在 heavy.py 內再包 heavy.py）。
> **不要用 `pnpm --dir <root> --filter ./<ws>`**：filter 以 shell cwd 解析，cwd 不在 repo root 時 "No projects matched" 且 exit 0。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> RED 以 `null` 呼叫 `setTimerDuration`，GREEN 前為型別錯誤——**RED 與 GREEN 必須在同一張派工單內完成**（主 repo Stop hook 擋 tsc 紅燈）。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `packages/pickball-core/src/matchmaker/round.ts`（`setTimerDuration`）、`nextjs-pickball/hooks/useRoundStore.ts`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`（參數型別）、`nextjs-pickball/components/matchmaker/RoundControls.tsx`。
> **不新增相依、無 migration、不動後端與 `app/**`、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **授權修改的既有測試**：無。既有 it／test 的名稱與斷言一律不得修改。

## 1. 對齊與基線（不寫產品程式碼）

- [ ] 1.1 確認分支 `change/round-timer-clear`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；
  雙鎖下跑 `pnpm --dir <repo> test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm --dir <repo> lint`（errors／warnings 數）、`pnpm --dir <repo>/nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `round-timer.spec.ts`＋`match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
- [ ] 1.2 **相依對齊**：確認 `main` 已含 `round-settings-follow-round` 的合併 commit（`git -C <repo> log --oneline main | grep round-settings-follow-round`，且 `nextjs-pickball/lib/matchmaker/round-settings.ts` 已有 `resolveRoundSettings`）。
  **未合併 → 停止並上報 coordinator，不得開工、不得自行實作設定列跟隨、不得刪改 E2E「取消本輪計時後產生下一輪仍為不計時」迴避相依**。
  已合併 → 確認 `RoundControls.tsx` 的 `handleTimerDurationChange` 暫行處置（`if (durationMinutes === null) return;`）仍在、`setTimerDuration` 簽章仍只接受 `RoundTimerDurationMinutes`；
  以 python difflib 比對本 change MODIFIED 的「回合計時器」與目前主 spec，除本 change 刻意增修（取消計時規範段、七個新 Scenario）外應無差異；**若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**，`DO_NOT_TRACK=1 openspec validate round-timer-clear --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions
- [ ] 1.3 讀碼確認 design Decision 2 的收尾：`hooks/useRoundTimer.ts`、`lib/matchmaker/round-timer-sound.ts` 及其在對戰頁的使用端，對 `round.timer` 由非 `null` 變 `null` 不殘留倒數或提示音狀態；結果記在本 task 下方。若有殘留 → 停止上報（範圍變更）

## 2. 核心 `setTimerDuration` 接受 null（含兩個 store）

Depends on: §1

- [ ] 2.1 RED（TDD）：`nextjs-pickball/lib/matchmaker/round.test.ts` 的 `describe("setTimerDuration")` 新增 it「setTimerDuration 傳入 null 時把本輪改回不計時，計時已開始亦同」與「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合」（依 test-plan）；
  單檔 vitest 確認前者紅、後者綠（**regression guard，點名**）並貼出輸出
- [ ] 2.2 RED（TDD）：`hooks/useRoundStore.test.tsx` 新增 it「訪客模式 setTimerDuration(null) 取消本輪計時並寫回儲存」、`hooks/useRemoteRoundStore.test.tsx` 新增 it「雲端回合 setTimerDuration(null) 以 timer 為 null 寫入回合」（沿用各檔既有 fixture 與 fetch mock）；單檔 vitest 各自確認紅燈並貼出輸出
- [ ] 2.3 GREEN（TDD）：`setTimerDuration` 參數型別放寬為 `RoundTimerDurationMinutes | null`，鎖定檢查之後 `null` 回傳 `{ ...round, timer: null }`、其餘維持現行；JSDoc 補 `null` 語意與「倒數已開始仍允許取消」理由（design Decision 1、2）。
  兩個 store 的 `setTimerDuration` 參數型別（含介面宣告）同步放寬，邏輯不變。2.1、2.2 的 it 全綠；四個測試檔其餘既有 it 原樣綠；兩段 typecheck exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b §2）
- [ ] 2.4 REFACTOR：`null` 分支是否以 if／else 清楚表達（避免巢狀三元）、JSDoc 是否仍說「只接受 10／15／20」；無壞味道則註記 skipped

## 3. 對戰頁「不計時」委派取消計時

Depends on: §2

- [ ] 3.1 RED（TDD）：`components/matchmaker/RoundControls.test.tsx` 新增 it「回合存在且未鎖定時點選不計時委派 setTimerDuration(null)」與「回合存在且未鎖定時方向鍵移到不計時亦委派 setTimerDuration(null)」（沿用 `buildProps`／`buildRound`）；單檔 vitest 確認兩者紅並貼出輸出
- [ ] 3.2 RED（TDD，E2E）：`tests/e2e/specs/round-timer.spec.ts` 新增 test「回合存在時選不計時可取消已開始的本輪計時」與「取消本輪計時後產生下一輪仍為不計時」（步驟依 test-plan）；
  雙鎖下以單檔 E2E（chromium、`-g` 各篩一次）確認紅燈（預期失敗於「不計時」的 `aria-checked`，而非前置步驟）並貼出輸出
- [ ] 3.3 GREEN（TDD）：`RoundControls.tsx` 的 `setTimerDuration` prop 型別放寬；`handleTimerDurationChange` 回合存在時一律委派 `commitTimerDuration(durationMinutes)`；刪除 ⚠️ 暫行處置註解並改寫為一句「`null` 代表取消本輪計時」的說明（design Decision 3）。
  3.1、3.2 全綠；`RoundControls.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `round-timer.spec.ts`、`match-stage.spec.ts` 全檔綠；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b §3）
- [ ] 3.4 REFACTOR：handler 是否還有多餘分支、上方註解是否殘留「尚未定案」「SHALL NOT 在此自行決定」字樣；無壞味道則註記 skipped

## 4. 文件與指令驗收

Depends on: §3

- [ ] 4.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否描述「回合存在時不計時無作用」或計時設定的變更方式；有則同步並 commit（`docs:`），否則在本 task 下記錄查核結果、不 commit
- [ ] 4.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 4.3 驗收（指令）C2：雙鎖下 `pnpm --dir <repo> lint` 0 errors、warning 不多於基線
- [ ] 4.4 驗收（指令）C3：雙鎖下 `pnpm --dir <repo> test` 全綠；前端檔數不變、測試數＝基線＋6，後端與核心與基線相同
- [ ] 4.5 驗收（指令）C4：雙鎖下 `pnpm --dir <repo> build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 4.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 4.7 驗收（指令）C6：test-plan C6 的 ① 輸出為空、② 恰為四個產品檔
- [ ] 4.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate round-timer-clear --strict` 通過

> `<repo>` 一律為 `/Users/m2_24gb/Desktop/project/nextjs-pickball`。
