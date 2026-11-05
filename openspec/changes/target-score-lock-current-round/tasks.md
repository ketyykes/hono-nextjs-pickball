# Tasks: target-score-lock-current-round

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run lib/matchmaker/scoreboard-binding.test.ts`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-binding.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的 `isTargetScoreLocked`（含 JSDoc）。**不清除任何計分板槽、不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **授權修改的既有測試（僅此一處，為本 change 行為的必然結果；其餘既有 it／test 的名稱與斷言一律不得修改）**：
> ① `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts` 的 it「槽已不在回合中但非 setup 時仍判定為鎖定」：連同其上方四行說明註解（「collectFinishedSubmissions 會略過…需先回到 spec 討論。」）**整段刪除**；同組輸入的相反期望由新 it「前一輪殘留的計分板槽不鎖定新一輪的目標分數」承接（design Decision 2）。

## 1. 對齊與基線（不寫產品程式碼）

- [ ] 1.1 確認分支 `change/target-score-lock-current-round`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm lint`（errors／warnings 數）、`pnpm --filter ./nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `scoreboard-binding.spec.ts`＋`match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
- [ ] 1.2 對齊 main：確認 `scoreboard-binding.ts`、`scoreboard-binding.test.ts`、`scoreboard-binding.spec.ts` 與 propose 時（`main` `38b6ae8`）一致（`git diff --stat 38b6ae8 main -- <三檔>`）；
  若 `scoreboard-binding.spec.ts` 已被並行 change 改動，確認 describe「/matchmaker 對戰頁的計分板接線」的 helper 與 `beforeEach` 未變；
  以 python difflib 比對本 change MODIFIED 的「開始計分後鎖定本輪目標分數」與目前主 spec，除本 change 刻意增修（第二條補述、「不屬於本輪場次的計分板槽」段落、五個新 Scenario）外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate target-score-lock-current-round --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions

## 2. 鎖定判定只計入本輪場次的計分板槽

Depends on: §1

- [ ] 2.1 RED（TDD）：`scoreboard-binding.test.ts` 新增四個 it——「前一輪殘留的計分板槽不鎖定新一輪的目標分數」、「本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定」、
  「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」、「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」（輸入與斷言依 test-plan，沿用 `makeRound`／`makeMatch`／`makeSlot`）；
  同一 commit 依檔頭例外 ① 刪除既有 it。單檔 vitest 確認三個新 it 紅、「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」綠（**regression guard，點名**）並貼出輸出
- [ ] 2.2 RED（TDD，E2E）：`scoreboard-binding.spec.ts` 的 describe「/matchmaker 對戰頁的計分板接線」末尾新增 test「前一輪殘留的計分板進度不鎖定新一輪的目標分數與計時設定」
  （步驟依 test-plan 與 design Decision 5：前置斷言第一輪已鎖定 → 直接點「產生本輪對戰」→ 以舊 grid 消失、網格數量 1 為同步點 → 兩個 radiogroup 全 enabled、兩段鎖定說明 `toHaveCount(0)`）。
  雙鎖下以單檔 E2E（chromium、`-g` 篩此 test）確認紅燈（預期在 `toBeEnabled` 失敗，而非前置斷言或同步點）並貼出輸出
- [ ] 2.3 GREEN（TDD）：改 `isTargetScoreLocked` 第二條為「只計入鍵屬於 `round.matches` 某場 `id` 的槽且 `status !== "setup"`」，第一條與回傳形狀不變；JSDoc 改寫為本輪場次的槽並說明以鍵比對的理由（design Decision 1、2）。
  2.1 的 it、2.2 的 E2E 全綠；`scoreboard-binding.test.ts` 與 `components/matchmaker/RoundControls.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `scoreboard-binding.spec.ts`、`match-stage.spec.ts` 全檔綠；
  `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b）
- [ ] 2.4 REFACTOR：過濾是否以具名變數表達、JSDoc 是否仍殘留「任一計分板槽」字樣、與 `collectFinishedSubmissions` 的比對寫法是否值得共用（兩個使用端、一個找場次一個只判存在，預期不抽）；無壞味道則註記 skipped

## 3. 文件與指令驗收

Depends on: §2

- [ ] 3.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否有描述鎖定判定條件的段落；propose 時唯一提及處為雲端段「回填與鎖定判定以 `remoteMatchSlots` 為來源」，仍正確、**不改**。
  若 apply 時已有其他段落描述「任一計分板槽」之類的鎖定條件，則同步為「本輪場次的槽」並 commit（`docs:`）；否則在本 task 下記錄查核結果、不 commit
- [ ] 3.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 3.3 驗收（指令）C2：雙鎖下 `pnpm lint` 0 errors、warning 不多於基線
- [ ] 3.4 驗收（指令）C3：雙鎖下 `pnpm test` 全綠；前端檔數不變、測試數＝基線＋3，後端與核心與基線相同
- [ ] 3.5 驗收（指令）C4：雙鎖下 `pnpm build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 3.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 3.7 驗收（指令）C6：test-plan C6 的 `git diff main --stat -- …` 輸出為空
- [ ] 3.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate target-score-lock-current-round --strict` 通過
