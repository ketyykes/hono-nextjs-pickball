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

- [x] 1.1 確認分支 `change/target-score-lock-current-round`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm lint`（errors／warnings 數）、`pnpm --filter ./nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 `scoreboard-binding.spec.ts`＋`match-stage.spec.ts` 在五個 browser project 的數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 紀錄：分支正確、工作樹乾淨（分出點 `main` `46b68c1`）；`pnpm --dir <repo> -r exec tsc --noEmit` exit 0。依 coordinator 裁定未重跑 `pnpm install`（lockfile 未變）、`db:migrate:local`、全套 `pnpm test`／`pnpm lint`／`playwright --list`，
    基線數字採 coordinator 於前一個 change 合併前實跑的結果，已回填 environment.md。
- [x] 1.2 對齊 main：確認 `scoreboard-binding.ts`、`scoreboard-binding.test.ts`、`scoreboard-binding.spec.ts` 與 propose 時（`main` `38b6ae8`）一致（`git diff --stat 38b6ae8 main -- <三檔>`）；
  若 `scoreboard-binding.spec.ts` 已被並行 change 改動，確認 describe「/matchmaker 對戰頁的計分板接線」的 helper 與 `beforeEach` 未變；
  以 python difflib 比對本 change MODIFIED 的「開始計分後鎖定本輪目標分數」與目前主 spec，除本 change 刻意增修（第二條補述、「不屬於本輪場次的計分板槽」段落、五個新 Scenario）外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate target-score-lock-current-round --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions
  - 紀錄：`git diff --stat 38b6ae8 main` 對 `scoreboard-binding.ts`、`scoreboard-binding.test.ts` 無差異；`scoreboard-binding.spec.ts` 由並行 change `scoreboard-bound-game-over` 在 describe「/matchmaker 對戰頁的計分板接線」中段新增兩條 test（+44 行），
    helper 與 `beforeEach` 未變。`openspec/specs/round-lifecycle` 自 `38b6ae8` 起無改動；difflib 比對「開始計分後鎖定本輪目標分數」只見本 change 刻意增修（第二條補述、「不屬於本輪場次的計分板槽」段落、五個新 Scenario），delta 不需重套。

## 2. 鎖定判定只計入本輪場次的計分板槽

Depends on: §1

- [x] 2.1 RED（TDD）：`scoreboard-binding.test.ts` 新增四個 it——「前一輪殘留的計分板槽不鎖定新一輪的目標分數」、「本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定」、
  「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」、「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」（輸入與斷言依 test-plan，沿用 `makeRound`／`makeMatch`／`makeSlot`）；
  同一 commit 依檔頭例外 ① 刪除既有 it。單檔 vitest 確認三個新 it 紅、「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」綠（**regression guard，點名**）並貼出輸出
  - 紀錄：RED commit `9bc491d`（`test:`）。單檔 vitest 3 failed | 31 passed (34)：紅＝「前一輪殘留的計分板槽不鎖定新一輪的目標分數」「本輪場次的槽仍為 setup 時非本輪的 finished 槽不使其鎖定」「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」；
    **regression guard**＝「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」（寫入即綠）。同一 commit 刪除授權的既有 it 與其上方四行註解。leader 機械複驗：`git diff 9bc491d^ 9bc491d -- scoreboard-binding.ts` 為空、`git show 9bc491d^:…test.ts` 不含四個新 it 名稱（計數 0）→ 真紅。
- [x] 2.2 RED（TDD，E2E）：`scoreboard-binding.spec.ts` 的 describe「/matchmaker 對戰頁的計分板接線」末尾新增 test「前一輪殘留的計分板進度不鎖定新一輪的目標分數與計時設定」
  （步驟依 test-plan 與 design Decision 5：前置斷言第一輪已鎖定 → 直接點「產生本輪對戰」→ 以舊 grid 消失、網格數量 1 為同步點 → 兩個 radiogroup 全 enabled、兩段鎖定說明 `toHaveCount(0)`）。
  雙鎖下以單檔 E2E（chromium、`-g` 篩此 test）確認紅燈（預期在 `toBeEnabled` 失敗，而非前置斷言或同步點）並貼出輸出
  - 紀錄：RED commit `c61e909`（`test:`）。取鎖 03:19:09、release 約 03:19:20（鎖時段內只跑此一條）；chromium `-g` 單檔 1 failed（6.5s），失敗於 `scoreboard-binding.spec.ts:875` 目標分數第一顆 radio 的 `toBeEnabled`（`unexpected value "disabled"`），
    前置斷言與同步點皆通過 → 真紅（產品檔在 `c61e909` 前後相同）。紅燈於 GREEN 前實跑，未用 stash 或還原產品檔。
- [x] 2.3 GREEN（TDD）：改 `isTargetScoreLocked` 第二條為「只計入鍵屬於 `round.matches` 某場 `id` 的槽且 `status !== "setup"`」，第一條與回傳形狀不變；JSDoc 改寫為本輪場次的槽並說明以鍵比對的理由（design Decision 1、2）。
  2.1 的 it、2.2 的 E2E 全綠；`scoreboard-binding.test.ts` 與 `components/matchmaker/RoundControls.test.tsx` 其餘既有 it 原樣綠；雙鎖下 chromium 的 `scoreboard-binding.spec.ts`、`match-stage.spec.ts` 全檔綠；
  `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；交件附 mutation 紀錄（execution-plan b）
  - 紀錄：GREEN commit `b689ec1`（`fix:`）：以 `currentMatchIds`（`Set`）過濾 `Object.entries(slots)`，第一條與回傳形狀不變，JSDoc 改寫。單檔 vitest：`scoreboard-binding.test.ts` 34 passed、`RoundControls.test.tsx` 23 passed；`pnpm -r exec tsc --noEmit` exit 0；改動三檔 ESLint exit 0。
    Implementer mutation（單檔 vitest）：①移除過濾→三個真紅 it 轉紅；②改讀 `slot.matchId`→「鎖定判定以槽集合的鍵比對…」轉紅；③只比對第一場→「本輪場次的槽已開始時仍鎖定…」與「鎖定判定掃描全部場次與全部槽而非只看第一筆」轉紅；
    ④過濾反向→「任一場次的計分板槽非 setup 時目標分數鎖定」等 5 個轉紅；⑤只認 `playing`→「鎖定判定掃描全部場次…」轉紅；⑥等價對照組 `round.matches.some` 取代 `Set.has`→全綠。存活變異：無。
    **chromium 的 `scoreboard-binding.spec.ts`、`match-stage.spec.ts` 全檔綠燈：待 coordinator 於合併前執行**（鎖時段限制，coordinator 裁定由其合併前驗收一併跑）。
- [x] 2.4 REFACTOR：過濾是否以具名變數表達、JSDoc 是否仍殘留「任一計分板槽」字樣、與 `collectFinishedSubmissions` 的比對寫法是否值得共用（兩個使用端、一個找場次一個只判存在，預期不抽）；無壞味道則註記 skipped
  - Stage 1（sonnet）：PASS——五個 Scenario 名稱逐字相符、RED 機械複驗通過、GREEN 只動第二條與 JSDoc、以鍵比對、只刪授權的 it；鍵比對 it 未斷言 reason 與 test-plan 該列 Assertion 一致，不構成退件。
  - 紀錄：skipped——過濾已以具名變數 `currentMatchIds`／`anySlotStarted` 表達；JSDoc 已無「任一計分板槽」字樣；與 `collectFinishedSubmissions` 不抽共用（一個找場次、一個只判存在）。

## 3. 文件與指令驗收

Depends on: §2

- [x] 3.1 設定層（文件）：查核 `nextjs-pickball/CLAUDE.md` 是否有描述鎖定判定條件的段落；propose 時唯一提及處為雲端段「回填與鎖定判定以 `remoteMatchSlots` 為來源」，仍正確、**不改**。
  若 apply 時已有其他段落描述「任一計分板槽」之類的鎖定條件，則同步為「本輪場次的槽」並 commit（`docs:`）；否則在本 task 下記錄查核結果、不 commit
  - 紀錄：`grep -n '鎖定' nextjs-pickball/CLAUDE.md` 只有 :111 雲端段「回填與鎖定判定以 `remoteMatchSlots` 為來源」，仍正確；無描述「任一計分板槽」的段落，不改。
- [x] 3.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：GREEN 後 `pnpm --dir <repo> -r exec tsc --noEmit`、`pnpm --dir <repo>/hono-pickball typecheck`、`pnpm --dir <repo>/packages/pickball-core typecheck` 皆 exit 0。
- [ ] 3.3 驗收（指令）C2：雙鎖下 `pnpm lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行。
- [ ] 3.4 驗收（指令）C3：雙鎖下 `pnpm test` 全綠；前端檔數不變、測試數＝基線＋3，後端與核心與基線相同
  - 由 coordinator 於合併前執行。
- [ ] 3.5 驗收（指令）C4：雙鎖下 `pnpm build` exit 0；建置後 `git status --porcelain` 為空
  - 由 coordinator 於合併前執行。
- [ ] 3.6 驗收（指令）C5：依 test-plan C5 的 ①②③ 分次執行（每次雙鎖、前後清殘留）；結果寫在本 task 後方；失敗不得自行判定為雜訊
  - 由 coordinator 於合併前執行。
- [x] 3.7 驗收（指令）C6：test-plan C6 的 `git diff main --stat -- …` 輸出為空
  - 紀錄：GREEN 後實跑，輸出為空。
- [x] 3.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate target-score-lock-current-round --strict` 通過
  - 紀錄：`Change 'target-score-lock-current-round' is valid`。
