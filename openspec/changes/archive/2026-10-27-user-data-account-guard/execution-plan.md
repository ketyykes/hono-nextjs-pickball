# Execution Plan: user-data-account-guard

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；`refactor:`；設定層與例外層 `chore:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md「apply §1 查證紀錄」並 commit。

**本批在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：
- 每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
- **§6、§7、§8 MUST 派給同一位 Implementer、以同一張派工單連續完成**（`requestJson` 簽章改動後，所有 hook 與元件呼叫處補完之前前端 tsc 為紅）；Stage 1／Stage 2 在 §8 完成後對三組一起審。
- §5 守衛上線後到 §8 完成前，既有 `user-data` E2E 必紅（前端尚未帶標頭）——這段期間 SHALL NOT 以 user-data E2E 判讀任何事；E2E 只在 §4（加標頭後照綠、換帳號 spec 的驗收型 RED，皆在守衛上線前）與 §9 跑。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「訪客路徑零迴歸」、允許修改的既有測試清單與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；後端組另貼「後端 API 授權覆蓋表」；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2 → `user-data-sync`「使用者資料請求的預期帳號守衛」中錯誤碼與標頭常數兩段及其兩個 Scenario；主 spec `pickball-core`「共用核心套件的位置、名稱與匯出方式」
   - §3 → `user-data-sync` MODIFIED「使用者資料 API 的路由、授權與停用閘門」全文
   - §4 → `auth`「換帳號用的衍生測試帳號」全文；`dev-workflow`「換帳號 E2E 夾具」全文；`user-data-sync`「另一分頁換帳號時本分頁不寫入新帳號」全文；主 spec `auth`「測試帳號以 seed 寫入本機 D1」、`dev-workflow`「E2E 登入夾具」
   - §5 → `user-data-sync` MODIFIED 全文與「使用者資料請求的預期帳號守衛」全文；主 spec `user-data-sync`「使用者資料表的命名與欄位慣例」；主 spec `round-lifecycle`「回合與送出比分的雲端 API」的端點表
   - §6～§8 → `user-data-sync`「前端使用者資料請求帶預期帳號」與「雲端 store 以登入帳號為界」全文；主 spec `user-data-sync`「前端依 session 選擇儲存模式」「前端 API 請求的結果分類」「最新優先的雲端儲存與自動重試」；
     主 spec `scoreboard`「登入時獨立計分板以雲端為準」（含分槽 hook 段落）、`player-roster`「登入時名單以雲端為準」、`round-lifecycle`「登入時回合與場次分槽以雲端為準」、`data-transfer`「登入時的資料工具頁」
   - §9 → `user-data-sync`「另一分頁換帳號時本分頁不寫入新帳號」全文；`dev-workflow`「換帳號 E2E 夾具」全文
4. **相關 design 片段**（對照表）：
   - §2 → Decision 2
   - §3 → Decision 10
   - §4 → Decision 9；Open Questions 2
   - §5 → Decision 1、2、3、4；Risks 第 4 條
   - §6 → Decision 5、6
   - §7 → Decision 5、7；Risks 第 1 條
   - §8 → Decision 7、8；Open Questions 1、3
   - §9 → Migration Plan、「交接給 B8／B9」全文；Risks 第 7 條（WebKit）
5. **既有介面**：§3、§5 貼 `src/routes/{scoreboard,matchmaker}.ts`、`src/auth/require-session.ts`、`src/index.ts`、`test/helpers/{session,matchmaker-fixtures}.ts` 全文，
   以及 `test/scoreboard-current.test.ts`、`test/matchmaker-players.test.ts` 的本地 helper 段與 §1.2 盤點出的 inline 請求清單；
   §4 貼 `src/db/seed/test-account.ts`、`scripts/seed-test-account.ts`、`tests/e2e/helpers/{test-account,user-data,storage-state}.ts`、`tests/e2e/global-setup.ts` 全文、`roster-sync.spec.ts`／`round-sync.spec.ts` 的直接 API 呼叫段；
   §6～§8 貼 `lib/sync/{api-client,roster-api,round-api,round-command-queue}.ts`、`lib/matchmaker/remote-transfer.ts`、四支 `hooks/useRemote*Store.ts`、三個選擇器、`components/matchmaker/{CourtCard,JsonBackupSection,RosterCsvImportSection}.tsx` 全文與 `lib/auth/session-store.ts`、`hooks/useSession.ts` 的匯出簽章。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B7 的 artifact、B8／B9 的 artifact、本 change 未修改的 capability spec（`match-history`、`player-stats` 等）。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/user-data-account-guard`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：`ACCOUNT_MISMATCH` 的值改為其他字串；`EXPECTED_USER_ID_HEADER` 改大小寫或拼字。
   - §5：守衛的比較改為 `startsWith`／`trim()` 後比較；缺標頭時放行；空字串時放行；回 403 或 409 而非 401；錯誤碼改 `UNAUTHORIZED`；守衛移到 `requireSession` 之前（應使「未登入回 UNAUTHORIZED」轉紅）；
     任一 sub-app 拿掉 `requireExpectedUser`（scoreboard、matchmaker 各一次）；守衛只套用非 GET 方法；樣本表刪一條（應使列舉 it 轉紅）；allowlist 多排除一條使用者資料路由。
   - §4：`deriveSwitchAccountEmail` 回傳原值；對含 `+` 的輸入回傳原值；結果不恆定（附加時間）。
   - §6：`requestJson` 不帶標頭；只在有 body 時帶；標頭值改讀 session store；任一包裝傳錯或漏傳 `expectedUserId`。
   - §7：主 effect 依賴拿掉 `userId`（四支各一次）；cleanup 不 dispose saver／佇列；render 期擁有者判斷拿掉；`userId` 為 null 時仍載入；舊世代結果仍呼叫 `applyRemotePlayers`；
     saver 的 `send` 改讀最新 props 的 userId 而非世代閉包；命令佇列的綁定函式改讀 ref 的最新 userId。
   - §8：選擇器傳固定字串或 `undefined`；`remote-transfer` 的未授權欄位在 `failed` 時也為真；`CourtCard` 未授權時不 refresh、或仍導向；`importRemoteRoster` 的 POST 改用不同 id。
   - **每個分支、每個 HTTP 狀態碼分支、每支 hook 的世代轉換、每條使用者資料路由都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」「預期帳號缺少／不符 401」四類測試（test-plan 授權覆蓋表）；以迴圈涵蓋多端點的 it，Reviewer MUST 確認迴圈內每個端點各自斷言（不是只斷言最後一個）。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。E2E 的驗收型 RED 以 §4 的實跑輸出為證，§9 再貼轉綠輸出。
g. 逐 task commit；註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。單檔 E2E 一律 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> [樣式...]`；
   完整 E2E 依 runbook「每開一個新 change 的標準流程」第 4 步；失敗不得自行判定為雜訊，證據上報。
j. **E2E、lint、全套 `pnpm test`、build 前一律先取共用高負載鎖**：`/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，跑完 `/tmp/heavy-lock.sh release nextjspickball`；取鎖後仍要 `uptime` load < 20，否則等待。單檔測試除外。
k. **禁止任何遠端 CF 操作**；`wrangler d1` 一律帶 `--local --env local`。
l. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit；`hono-pickball/.dev.vars` 不得讀出值寫進紀錄、不得修改。
m. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
n. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
o. **既有 it／test 的名稱與斷言一律不得修改**；tasks 檔頭列出的既有測試檔只允許「呼叫處新增 `expectedUserId`／`userId` 參數」「請求加 `X-Expected-User-Id` 標頭」「新增 `vi.mock` 區塊與新 it」三種改動。本機 hook 本體一行不改。
p. Commit：Conventional Commits、繁體中文；**不得加任何 attribution／footer 行**（含 `Claude-Session`、`Co-Authored-By`、Generated；runbook 2026-10-24 起停用 footer）。
q. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
r. 禁止改動 `backend-scoring-runbook-b1-b9.md`、`openspec/specs/**`、`openspec/schemas/**` 與 `openspec/changes/` 下其他 change 的目錄。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：後端 middleware 與 helper 改動小而機械；難點集中在四支雲端 hook 的世代與擁有者判斷（React 19 Strict Mode 下的 effect 重跑、在途結果的取消）與列舉測試的樣本表。
- **upgrade_to_opus_when**:
  - §5：`app.routes` 列舉行為與 design Decision 4 不符而需改走退路。
  - §6～§8：世代切換在 Strict Mode 下出現重複請求、或「換帳號那一次 render」判斷造成既有 hook it 轉紅，且一次修正未果。
  - §9：換帳號 E2E 在同一 context 覆寫 cookie 後頁面行為不穩定。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard；E2E 的紅燈性質（design OQ2）已註明。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 本機實作零改動（`useLocalScoreboardStore`、`useLocalRosterStore`、`useLocalRoundStore` 本體、`lib/auth/session-store.ts`、`app/api/[[...route]]/route.ts` 無 diff）。
  - [ ] `requireSession` 與 `GET /api/me` 無 diff；守衛只掛在兩個 sub-app。
  - [ ] 三段 typecheck exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 授權覆蓋表 13 個端點四欄齊備（e）。
  - [ ] GET 也要求標頭；缺標頭與不符同為 401 ACCOUNT_MISMATCH；沒有新增其他錯誤碼。
  - [ ] 前端沒有任何在送出當下讀 session 決定標頭的路徑；`requestJson` 不 import session store。
  - [ ] 沒有 scope creep：沒有 BroadcastChannel／`visibilitychange`、沒有新 `SyncStatus` 或提示文案、沒有改 B8／B9 artifacts、沒有改 `.dev.vars`。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是 hook 的世代閉包與擁有者判斷、守衛的比較方式。
  - [ ] 四支 hook 的 cleanup 確實 dispose 所有 saver／命令佇列、無遺留計時器；在途結果在 `cancelled` 後不 dispatch、不呼叫 port。
  - [ ] `git diff main` 對 tasks 檔頭列出的既有測試檔只見允許的三種改動（C10）。
  - [ ] 標頭名稱只來自 `EXPECTED_USER_ID_HEADER`，沒有第二份字串常數（E2E helper 除外，Playwright 以 CJS 載入時可直接 import 核心常數者優先）。
  - [ ] E2E 沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出（B5～B7 建立的 `lib/sync` 與雲端 hook 樣式即為既有風格）。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；`openspec/specs/**` 無 diff。
  - [ ] 指令驗收 C1～C10 皆有紀錄；E2E 既有 test 數與基線一致、新增 7 條全 passed。
  - [ ] 兩份 CLAUDE.md 已更新（middleware 鏈、授權覆蓋四類、curl 帶標頭、seed 建兩個帳號、hook 的帳號世代）；「交接給 B8／B9」在 design 中完整。
  - [ ] 四支雲端 hook 的世代與擁有者判斷寫法一致（B8 的 `useRemoteHistory` 會照抄）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E（§9 時）出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - better-auth 在同一 context 以 B 登入後撤銷了 A 的 session（與 Context7 不符）→ 停止並升級，SHALL NOT 改為對共用 storage state 登出或另存 B 的 state。
  - 需要改動本機 hook 本體、`requireSession` 或前端 proxy 才能完成 → 停止並升級。

## Model selection principle

用能勝任該角色的最低成本模型：Implementer 與 Stage 1 用 `sonnet`，Stage 2 與 Final 用 `opus`；`haiku` 不用（使用者硬性規定沿用 M10～M15），`fable` 不得使用。
