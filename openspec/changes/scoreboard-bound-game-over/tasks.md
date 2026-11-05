# Tasks: scoreboard-bound-game-over

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run components/scoreboard/GameOverDialog.test.tsx`（**`--run` 前不可加 `--`**，免鎖）。
> 單檔 E2E（雙鎖）：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-binding.spec.ts [-g <test 名稱>]`，前後清殘留 dev server。
> 雙鎖寫法：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際跑過），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C7）。
>
> **範圍**：產品程式碼只改 `nextjs-pickball/components/scoreboard/GameOverDialog.tsx` 與 `nextjs-pickball/components/scoreboard/Scoreboard.tsx`（後者只改傳給 `GameOverDialog` 的 props）。**不新增相依、無 migration、不動後端與核心套件、不動 reducer 與分槽儲存、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **既有 it／test 一行不改**（含 `GameOverDialog.test.tsx` 既有 it 的 `render` 呼叫、`scoreboard.spec.ts` 全檔、`scoreboard-binding.spec.ts` 既有 test）。
>
> **tsc 紅燈**：2.1 對 `GameOverDialog` 傳入尚不存在的 `matchId` prop，RED commit 時 `pnpm -r exec tsc --noEmit` 預期失敗；2.1～2.3 MUST 在同一張派工單內完成（主 repo Stop hook 會擋）。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/scoreboard-bound-game-over`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；
  雙鎖下跑 `pnpm test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm lint`（errors／warnings 數）、`pnpm --filter ./nextjs-pickball exec playwright test --list`（六個 project 各自數量，另記 C5 ② 三檔在四個 browser project、C5 ③ 兩檔在 user-data 的數量）；回填 environment.md Verification 並 commit（`chore:`）
- [x] 1.2 對齊 main：確認 `GameOverDialog.tsx`、`GameOverDialog.test.tsx`、`Scoreboard.tsx`、`scoreboard-binding.spec.ts` 與 propose 時（`main` `38b6ae8`）內容一致；
  以 python difflib 比對本 change MODIFIED「賽前設定與階段鎖定」與目前主 spec，除 RESET 那一句外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate scoreboard-bound-game-over --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另確認 `scoreboard-binding.spec.ts` 若已被並行 change（如 `target-score-lock-current-round`）新增 test，新 test 仍加在 `/matchmaker 對戰頁的計分板接線` describe 內、不與其衝突
  - 紀錄（1.1）：基線數字見 environment.md Verification（前端 109／1085、後端 26／215、核心 10／27；lint 0 errors／3 warnings；chromium 147、user-data 47；C5 ② 各 38、C5 ③ 15）。
  - 紀錄（1.2）：四個檔案與主 spec `scoreboard` 在 `38b6ae8..c4b18a7` 間零變動；difflib 比對 MODIFIED「賽前設定與階段鎖定」與主 spec 皆 121 行、只有 RESET 那一句不同；主 spec 未被他人改動，無需重新套用、無 commit。`scoreboard-binding.spec.ts` 未被並行 change 新增 test。

## 2. 比賽結束對話框依綁定模式切換動作

Depends on: §1

- [x] 2.1 RED（TDD）：`GameOverDialog.test.tsx` 新增三個 it——「綁定模式顯示返回對戰連結且不顯示再來一局」、「綁定模式按關閉後對話框關閉且不呼叫 onPlayAgain」、「獨立模式顯示再來一局且點擊即呼叫 onPlayAgain 而不經二次確認」（斷言依 test-plan，查詢限定在 `getByRole("dialog")` 內）。
  單檔 vitest 確認「綁定模式顯示返回對戰連結且不顯示再來一局」為紅並貼出輸出；另兩個 it 預期先綠，**逐一點名標 regression guard**（若實際為紅，照實記錄原因）。記錄此時 `pnpm -r exec tsc --noEmit` 的失敗訊息（excess property `matchId`，預期）
  - 紀錄：RED commit `e545621`（2.1＋2.2 同一 commit）。單檔 vitest `Test Files 1 failed (1)`／`Tests 1 failed | 3 passed (4)`，失敗為「綁定模式顯示返回對戰連結且不顯示再來一局」（對話框內找不到 `link「返回對戰」`）＝**真紅**。
    **regression guard**（加入即綠）：「綁定模式按關閉後對話框關閉且不呼叫 onPlayAgain」、「獨立模式顯示再來一局且點擊即呼叫 onPlayAgain 而不經二次確認」。
    RED 時 `pnpm -r exec tsc --noEmit` exit 2：TS2322 `Property 'matchId' does not exist on type 'IntrinsicAttributes & GameOverDialogProps'`（測試檔兩處，預期）。
    leader 機械複驗（`git show e545621^:<path>`）：`GameOverDialog.tsx`、`Scoreboard.tsx` 在 RED 前後相同；三個新 it 名稱在 RED 前出現 0 次、RED 後各 1 次；測試檔唯一刪除行為 import 擴充 `within`。
- [x] 2.2 RED（TDD，E2E）：`scoreboard-binding.spec.ts` 的 `/matchmaker 對戰頁的計分板接線` describe 新增兩條 test——「綁定場次比賽結束時對話框以返回對戰取代再來一局且返回後比分已回填」、「專注模式下綁定場次比賽結束後可由對話框返回對戰」（沿用 `seedRoster`、`generateRound`、`courtMatchId`、`clickWin`；對話框內元素以 `page.getByRole("dialog")` 為範圍）。
  雙鎖下以單檔 E2E（chromium，`-g` 篩兩條）確認兩條皆紅並貼出輸出（預期：前者在「再來一局」`toHaveCount(0)` 失敗、後者在對話框內找不到「返回對戰」）
  - 紀錄：同 `e545621`。雙鎖下單檔 E2E（chromium、`-g` 篩兩條）`2 failed`：前者在對話框內「再來一局」`toHaveCount(0)`（Expected 0、Received 1）、後者 `dialog.getByRole("link", { name: "返回對戰" }).click()` 逾時（專注模式前提斷言已先通過）＝兩條皆**真紅**。leader 機械複驗：兩個 test 名稱在 RED 前 0 次、RED 後各 1 次；`scoreboard-binding.spec.ts` 無刪除行。
- [x] 2.3 GREEN（TDD）：`GameOverDialog.tsx` 新增可選 prop `matchId?: string | null`（預設 `null`），綁定模式 footer 為「關閉」＋「返回對戰」（`<Button asChild><Link href={MATCHMAKER_ROUTE}>返回對戰</Link></Button>`，無 `onClick`、無 `transitionTypes`），獨立模式 footer 不變；更新檔頭註解；
  `Scoreboard.tsx` 把既有 `matchId` prop 傳給 `GameOverDialog`（design Decision 1、2、4）。
  2.1 三個 it 與既有 it 全綠；雙鎖下 `scoreboard-binding.spec.ts` 全檔（chromium）綠，含 2.2 兩條與既有「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；
  依 execution-plan 派工單必帶 b 跑 mutation 並列出結果
  - 紀錄：GREEN commit `9ea099d`。單檔 vitest `Tests 4 passed (4)`；雙鎖下 `scoreboard-binding.spec.ts` chromium 全檔 `22 passed`（含既有「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」，無 strict mode violation）；`pnpm -r exec tsc --noEmit` exit 0；四個改動檔 ESLint 0 errors。
    mutation（Implementer 自跑，Stage 2 獨立重做，結果一致）：元件層 6 條必做（綁定判斷反轉、綁定仍渲染再來一局、href 改 `/matchmaker/players`、綁定移除關閉、獨立也渲染返回對戰、再來一局不呼叫 onPlayAgain）全轉紅；接線層「`Scoreboard` 不傳 `matchId`」兩條新 test 皆紅、「返回對戰加 `onClick={onPlayAgain}`」在 `toHaveText("11:0")` 轉紅。
    **存活**（皆為預期的等價變異，非缺口）：調換互斥條件書寫順序（`!isBound ? … : …`）、`Scoreboard` 改傳 `state.matchId`。
    Stage 1（sonnet）：PASS，無必修。Stage 2（opus）：PASS，無必修；可選建議（不採納，維持最小改動）：`finishedState` 可挪到 describe 開頭、兩條 E2E 前半段重複（test-plan 規定不另寫 helper）。
- [x] 2.4 REFACTOR：綁定判斷是否以具名變數（如 `isBound`）表達、footer 分支有無巢狀三元運算、與 `ScoreboardSetup` 的「返回對戰」寫法是否一致；無壞味道則註記 skipped
  - 紀錄：skipped——綁定判斷已為具名變數 `isBound`，footer 只有一層三元、無巢狀，「返回對戰」與 `ScoreboardSetup` 同為 `Button asChild` ＋ `Link` ＋ `MATCHMAKER_ROUTE`（依 Decision 2 不帶 `variant`／`size`）。Stage 2 確認無壞味道。

## 3. 文件與指令驗收

Depends on: §2

- [x] 3.1 設定層（文件）：複查 `nextjs-pickball/CLAUDE.md` 是否有描述 `GameOverDialog`、比賽結束後動線或「再來一局」的段落；propose 時查無（只有「進入計分板」入口與球員姓名色塊的敘述，與本 change 無關），預期**不修改**，於本 task 後方記錄複查結果；若 apply 時已有相關段落則同步一句並 commit（`docs:`）
  - 紀錄：`grep -E "GameOverDialog|再來一局|比賽結束|返回對戰" nextjs-pickball/CLAUDE.md` 無命中；與本 change 無關，**不修改**、無 commit。
- [x] 3.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄（HEAD `9ea099d`）：`pnpm -r exec tsc --noEmit`、`pnpm --dir hono-pickball typecheck`、`pnpm --dir packages/pickball-core typecheck` 皆 exit 0。
    註：本環境 `pnpm --dir <root> --filter ./hono-pickball typecheck` 回 "No projects matched the filters" 且 exit 0（未實際檢查），§1.1 基線那兩段因此無效；本次改以 workspace 目錄為 `--dir` 實跑兩段 `tsc --noEmit && tsc --noEmit -p test/tsconfig.json`，皆 exit 0。
- [x] 3.3 驗收（指令）C2：雙鎖下 `pnpm lint` 0 errors、warning 不多於基線
  - 紀錄：雙鎖下 `pnpm lint` exit 0，`0 errors, 3 warnings`（＝基線）。
- [x] 3.4 驗收（指令）C3：雙鎖下 `pnpm test` 全綠；前端檔數不變、測試數＝基線＋3，後端與核心與基線相同
  - 紀錄：雙鎖下 `pnpm test` exit 0：前端 109 檔／1088 tests（基線 1085＋3）、後端 26／215、核心 10／27（皆＝基線）。
- [ ] 3.5 驗收（指令）C4：雙鎖下 `pnpm build` exit 0；建置後 `git status --porcelain` 為空
  - 紀錄（未完成）：02:11 雙鎖下 `pnpm build` exit 1，後端 `wrangler deploy --dry-run` 成功，前端 `next build` 失敗於 `next/font/google` 抓 Noto Sans TC 時 `Connection timed out when requesting https://fonts.gstatic.com/...`（Turbopack 報 5 個 `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`）。屬建置機對外網路逾時、非本 change 程式碼；建置後 `git status --porcelain` 為空。重跑排在 C5 之後，因重負載鎖被占用而未執行（見 design.md Open Questions），**待 coordinator 重跑**。
- [ ] 3.6 驗收（指令）C5：`.dev.vars` 齊備下依 test-plan C5 的 ①②③ 分次跑 E2E，每次雙鎖、前後清殘留；數量與結果寫在本 task 後方，失敗不得自行判定為雜訊
  - 紀錄（未執行）：`.dev.vars` 齊備（`TEST_ACCOUNT_*`、`ENVIRONMENT` 共 4 行）。02:15 起排隊取得重負載鎖，至 02:47 鎖持續由 mini4wd 連續占用（多個 blender 工作接力 acquire），leader 為守 03:00 期限中止排隊，①②③ 皆**未跑**，**待 coordinator 執行**。
    期望：① chromium 149（基線 147＋2）全 passed；② firefox／webkit／mobile-chrome／mobile-safari 三檔各 40（基線 38＋2）、0 failed；③ user-data 兩檔 15、全 passed、0 skipped。
    已有的 E2E 證據（皆 chromium、雙鎖）：Implementer GREEN 後 `scoreboard-binding.spec.ts` 全檔 22 passed；Stage 2 未變異下 `-g` 三條（兩條新 test＋既有「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」）3 passed，無 strict mode violation。`round-sync.spec.ts` 尚無本 change 之後的執行紀錄。
- [x] 3.7 驗收（指令）C6：`git diff main --stat` 只含 test-plan C6 所列檔案
  - 紀錄：`git diff main --stat` 只含 `GameOverDialog.tsx`、`GameOverDialog.test.tsx`、`Scoreboard.tsx`、`scoreboard-binding.spec.ts` 與 `openspec/changes/scoreboard-bound-game-over/{environment,tasks,design}.md`；`Scoreboard.tsx` diff 只有 `<GameOverDialog>` 那一處（改為多行並加 `matchId={matchId}`）；`openspec/specs/` 零變動。
- [x] 3.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate scoreboard-bound-game-over --strict` 通過
  - 紀錄：`DO_NOT_TRACK=1 openspec validate scoreboard-bound-game-over --strict` → `Change 'scoreboard-bound-game-over' is valid`。
