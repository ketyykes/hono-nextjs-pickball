# Tasks: round-put-completed-immutable

> **TDD 三步**（root `CLAUDE.md`）：
> 1. RED：先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出。
> 2. GREEN：最小實作至綠。
> 3. REFACTOR：沒有壞味道就註記 skipped。
>
> 單檔指令：`pnpm --filter ./hono-pickball test --run test/matchmaker-round.test.ts`。**`--run` 前不可加 `--`**。單檔免鎖；全套 vitest、build、E2E 一律雙鎖（execution-plan j）。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 新 it 一律寫在 `hono-pickball/test/matchmaker-round.test.ts` 的 `describe("/api/matchmaker/round")` 內；每個 it 使用各自的測試帳號 email（同檔共用一份 D1）。
>
> **標註**：`TDD`、`regression guard`、`設定層`（文件）、`驗收（指令）`（test-plan C1～C5）。
>
> **前提**：
> - `main` 乾淨，本 change 分支已由 coordinator 建立（environment.md）。
> - **不新增任何第三方相依**、**沒有 migration**、**禁止任何遠端 CF 操作**、不 push。
>
> **訪客路徑零迴歸**：
> - `nextjs-pickball/**`、`packages/pickball-core/**`、`hono-pickball/src/routes/**`、`src/db/**`、`drizzle/**` 一行都不改。
> - 只改 `hono-pickball/src/matchmaker/round-repository.ts`、`test/matchmaker-round.test.ts`、`hono-pickball/CLAUDE.md`。
> - **既有 it 的名稱與斷言一律不得修改**（沒有例外）。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 驗收（指令）：
  - 確認分支為 `change/round-put-completed-immutable`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功。
  - 持鎖跑以下基線：`pnpm test:api`（記錄檔數與 it 數）、兩段 typecheck、`pnpm --filter ./hono-pickball build`、E2E `--project=user-data`（記錄 passed／skipped 數）。
  - 結果回填 environment.md「Verification」並 commit（`docs:`）。
- [x] 1.2 對齊：
  - 重讀 `round-repository.ts`，確認 design Context 引用的行號與行為仍成立；`grep -rln "putRemoteRound\|putRound" nextjs-pickball/{lib,hooks,components,app}` 的非測試命中仍只有 design 所列的檔案。
  - 比對 delta 的 MODIFIED「回合與送出比分的雲端 API」與目前主 spec：**若主 spec 已被其他 change 改過，就以主 spec 為底重新套用本 change 的增修**。
  - `DO_NOT_TRACK=1 openspec validate round-put-completed-immutable --strict` 通過後 commit（`docs:`；沒有差異就在本行註記「無差異」）。
  - **結果（2026-11-01）：無差異**。`round-repository.ts` 行號（`:58-64`、`:80-118`、`:86`、`:87-89`、`:112`）與路由 `:77-87` 皆成立；前端非測試命中仍只有 `lib/sync/round-api.ts`、`lib/sync/round-command-queue.ts`、`hooks/useRemoteRoundStore.ts`。delta 的 MODIFIED 以目前主 spec（`1d31563` 後）為底，差異只有本 change 的增修。Context7 查證 D1：`batch()` 為循序執行的 SQL transaction、失敗整批回滾；未使用 Sessions API（repo 無 `withSession`）時所有查詢都在主庫執行，與 design Decision 3「D1 單一主庫讀寫強一致」的假設一致。`openspec validate --strict` 通過。

## 2. 反向完成狀態規則

Depends on: §1

- [x] 2.1 regression guard（寫入即綠）：新增三個 it，各自對應 test-plan 的同名列：
  - 「回合 PUT 整輪替換時前一輪的已完成場次可不出現在新資料」
  - 「回合 PUT 只移除部分已完成場次時接受」
  - 「版本過期的回合 PUT 把已完成場次改回未完成時回 409 而非 400」

  在 GREEN 之前寫入，守住 GREEN 不擋下整輪替換、部分移除，也不讓版本過期的請求退化成 400。貼出三者在 main 程式碼上皆綠的輸出，並在紀錄中逐一點名標 regression guard（`test:`）。
  - **紀錄**：`2fdacf9`（只動測試檔）。三個 it 在未改實作的程式碼上寫入即綠（單檔 18 passed），逐一標 **regression guard**：整輪替換、只移除部分已完成場次、版本過期回 409。Stage 2 以 `git show 28a3770^:…/round-repository.ts` 複驗三者在舊實作下皆綠。
- [x] 2.2 RED（TDD）：新增 it「回合 PUT 把已完成場次改回未完成時回 400 且不寫入」，斷言依 test-plan：三個 PUT（改回 pending、改為 scoring、重複 id）皆 400；回合不變；`m1`、`m3` 分槽保留；無下限列。
  確認紅燈並貼出輸出（現況第一個 PUT 回 200，之後兩個因版本已遞增回 409）（`test:`）。
  - **紀錄**：`59e8116`（不含 src 變更；`git diff 59e8116^ 59e8116 -- hono-pickball/src` 為空，src 與 main `c5eafcc` 相同）。leader 以 main 的 `round-repository.ts` 機械複驗：`1 failed | 18 passed (19)`，`AssertionError: expected 200 to be 400`（第一個 PUT），**真紅**。
- [x] 2.3 GREEN（TDD）：在 `round-repository.ts` 加入反向規則（design Decision 1、3、4）：
  - 只看目前回合中 completed 的場次；以 id 對應，新資料中每一場同 id 的場次都以 `isDeepEqual` 比較。
  - 只在 `current !== null && current.version === expectedVersion` 時檢查；違反時在 batch 之前回 `{ kind: "invalid" }`。
  - 正向規則的程式碼與位置不變。
  - 更新 `keepsCompletedMatches`／`putRound` 的 JSDoc，寫明兩個方向的規則與判定順序。

  驗收：2.2 轉綠；2.1 與 `test/matchmaker-round.test.ts` 全綠；`test/matchmaker-slots.test.ts`、`test/matchmaker-score.test.ts`、`test/version-floor.test.ts` 單檔各跑一次全綠。
  依 test-plan 跑 M1～M14 與 C1、C2，在紀錄中列出結果（`feat:`）。
  - **紀錄**：`28a3770`，新增私有函式 `keepsCompletedMatchesUnchanged`，`putRound` 在正向規則之後以 `current !== null && current.version === expectedVersion` 閘門呼叫；JSDoc 寫明兩方向與判定順序。單檔：matchmaker-round 19、matchmaker-slots 7、matchmaker-score 18、version-floor 13，全綠；兩段 typecheck exit 0。
  - Mutation：Implementer 與 Stage 2（opus，自寫 harness）各自獨立跑 M1～M14 全數轉紅、C1／C2 存活；Stage 2 另追加 M7c～e（分槽、下限列、回合三項斷言各自有效）、M15（`current === null` 側有覆蓋）、M17、M18 皆轉紅。追加的 M16（外層 `every` 改為 `length === 0 || some`）存活，見 design Open Questions 6。
  - Stage 1（sonnet）PASS；Stage 2（opus）PASS，無必修。
- [x] 2.4 REFACTOR：檢視正向與反向規則的命名與拆分，是否讓「哪個方向、為何看版本」一眼可辨；新 it 之間若有重複的種子步驟，可抽成檔內 helper（不動既有 it）。
  沒有壞味道就註記 skipped（`refactor:` 或 skipped）。
  - **skipped**：兩方向已拆成 `keepsCompletedMatches`（正向）與 `keepsCompletedMatchesUnchanged`（反向），共用同一份 `isDeepEqual`；版本閘門的理由在 `putRound` JSDoc；新 it 的種子步驟與既有 it 同一寫法，抽 helper 反而偏離風格。Stage 2 評估 skipped 合理。

## 3. 文件與指令驗收

Depends on: §2

- [ ] 3.1 設定層（文件）：更新 `hono-pickball/CLAUDE.md`「matchmaker 回合、場次分槽與送出比分 API」第一個子項目的**判定順序**，改為三段：
  1. 正向規則（新資料的已完成場次 MUST 已存在於目前回合且內容相同）不論版本，違反回 400。
  2. 反向規則（目前回合的已完成場次若 id 出現在新資料，MUST 不變；不出現則允許）只在讀到的 version 等於請求的 version 時檢查，違反回 400、不送 batch。
  3. 其餘送出帶版本條件的 batch，版本不符回 409。

  保留「正向規則先於版本比對，舊回合裝置重排時會先得到 400 而非 409，不要自行對調」的警語；再補一句「反向規則不得移到版本比對之前，否則另一裝置送出比分後，舊裝置的任何操作都會變成 400 且不重新載入」（`docs:`）。
- [ ] 3.2 驗收（指令）C1：`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck` 皆 exit 0。
- [ ] 3.3 驗收（指令）C2～C4：持鎖依序跑以下三項，數字記錄於此：
  - `pnpm test:api`：全綠，檔數與基線相同、it 數 = 基線 + 4。
  - `pnpm --filter ./hono-pickball build`：exit 0。
  - E2E `--project=user-data`：數量與 1.1 基線一致且全數 passed，不得因缺帳密而 skip。
- [ ] 3.4 驗收（指令）C5：`DO_NOT_TRACK=1 openspec validate round-put-completed-immutable --strict` 通過。
