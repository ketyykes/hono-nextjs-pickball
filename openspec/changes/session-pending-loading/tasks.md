# Tasks: session-pending-loading

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`，前後清殘留 dev server。
>
> **重負載雙鎖**（E2E、eslint 全套、全套 vitest、build）：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→
> `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 紅燈宣稱一律以 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）。
>
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C9）。
>
> **範圍**：產品程式碼只改 proposal Impact 列出的 21 個檔案（含新檔 `lib/auth/session-hint.ts`）。**不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`、`afterEach` 亦同）；E2E 不得使用 `waitForTimeout`。
> UI 只新增一個文案：`DATA_PENDING_MESSAGE`「正在載入資料…」；等待中一律以 `SyncStatusNotice status="pending"` 呈現。
>
> **授權修改的既有測試（僅限下列兩處；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> ① `nextjs-pickball/lib/auth/session-store.test.ts` 既有 `describe("session-store")` 的 `beforeEach` 加一行 `localStorage.clear()`；
> ② `nextjs-pickball/hooks/useSession.test.ts` 既有 `describe("useSession")` 的 `beforeEach` 加一行 `localStorage.clear()`。
> 兩者都是測試隔離：store 會把提示寫入 localStorage，前一個 it 寫入的提示會讓後面 it 的初始快照多出 `signedInHint`。
>
> **本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成（§2.1、§3.2、§4.2 等 RED 會 import 尚不存在的模組或匯出，屬型別紅燈）。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/session-pending-loading`、工作樹乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local` 成功；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
  - 紀錄：基線見 environment.md Verification（前端 111／1130、後端 27／223、核心 10／27；C1 三段 exit 0；lint 0 errors／3 warnings；E2E list 五個 browser 各 160、user-data 47）。
- [ ] 1.2 對齊 main：確認 proposal Impact 列出的產品檔與測試檔、`tests/e2e/user-data/roster-sync.spec.ts` 與 propose 時（`main` `d371225`）內容一致（`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat d371225 HEAD -- <路徑…>` 無輸出）；
  以 python difflib 比對本 change 七個 MODIFIED Requirement（`user-data-sync`「前端依 session 選擇儲存模式」、`auth`「全頁共用的 session store 與 useSession」、`player-roster`「登入時名單以雲端為準」、`round-lifecycle`「登入時回合與場次分槽以雲端為準」、`scoreboard`「登入時獨立計分板以雲端為準」、`match-history`「歷史頁唯讀消費既有紀錄」、`data-transfer`「清除本機資料與其確認流程」）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另以 Context7 查證並記錄：React 19 `useSyncExternalStore` 在 hydration 時使用 `getServerSnapshot`、client 快照不同時於 hydration 後重新 render；`hydrateRoot` 的 `onRecoverableError`；Playwright `javaScriptEnabled`、`page.addInitScript`、`route.continue()`／`page.unrouteAll({ behavior: "ignoreErrors" })`。與 design 假設不符時停止並回報

## 2. 上次登入提示、hydration 旗標與儲存模式三態

Depends on: §1

- [ ] 2.1 RED（TDD）：新檔 `nextjs-pickball/lib/auth/session-hint.test.ts`，寫入兩個 it——「寫入後讀取為 true 且只存固定值，清除後讀取為 false」「值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯」。單檔 vitest 確認紅燈（模組不存在）並貼出輸出
- [ ] 2.2 GREEN（TDD）：新增 `nextjs-pickball/lib/auth/session-hint.ts`（design Decision 5）。2.1 全綠
- [ ] 2.3 RED（TDD）：`nextjs-pickball/lib/auth/session-store.test.ts` 新增四個 it——「有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶」「session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示」「被丟棄的過時 session 回應不改變提示」「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」；
  `nextjs-pickball/hooks/useSession.test.ts` 新增一個 it——「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」；同一 commit 依檔頭授權 ①② 各加一行 `localStorage.clear()`。
  兩檔各跑單檔 vitest，確認五個新 it 全紅、既有 it 全綠並貼出輸出（新 it 放在新的 `describe` 並自帶 localStorage 清理；fake timers 於 `finally` 還原）
- [ ] 2.4 GREEN（TDD）：改 `nextjs-pickball/lib/auth/session-store.ts`（design Decision 4、6、11）。2.3 全綠、兩檔既有 it 全綠
- [ ] 2.5 RED（TDD）：`nextjs-pickball/hooks/useSession.test.ts` 新增兩個 it——「hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true」「client 端一般 mount 的第一次 render 即為 hydrated」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 2.6 GREEN（TDD）：`useSession` 回傳值加 `hydrated`（design Decision 3）；`UseSessionResult` 型別同步。2.5 全綠、該檔既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0
- [ ] 2.7 RED（TDD）：`nextjs-pickball/lib/auth/session-client.test.ts` 新增 it「signOut 成功時清除上次登入提示，失敗時保留」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 2.8 GREEN（TDD）：`signOut()` 在 `res.ok` 時呼叫 `clearSignedInHint()`（design Decision 6）。2.7 與該檔既有 it 全綠
- [ ] 2.9 RED（TDD）：`nextjs-pickball/lib/sync/storage-mode.test.ts` 新增兩個 it——「session 載入中且帶上次登入提示時為 pending」「尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local」。單檔 vitest 確認紅燈；既有「只有 session 就緒、auth 啟用且有 user 時為 remote」維持綠（regression guard，點名）
- [ ] 2.10 GREEN（TDD）：`StorageMode` 加 `"pending"`、參數型別放寬、依 design Decision 2 判斷；更新檔頭註解。2.9 全綠；tsc exit 0；改動檔 ESLint 0 errors
- [ ] 2.11 regression guard：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts` 新增 it「regression guard：clearAllLocalData 不移除上次登入提示」（design Decision 12）。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`transfer-storage.ts` 一行不改
- [ ] 2.12 REFACTOR：session-store 的提示判斷與 `resolveStorageMode` 的 remote 條件是否值得共用（預期不抽：兩處語意不同層、各一行）；註解是否只寫「為什麼」；無壞味道則註記 skipped

## 3. 顯示狀態、選擇器與使用選擇器的頁面

Depends on: §2

- [ ] 3.1 RED（TDD，E2E）：新檔 `nextjs-pickball/tests/e2e/helpers/flash-recorder.ts`（`installFlashRecorder`、`readFlashHits`；寫法依 test-plan「E2E 共同要求」）；
  新檔 `nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`（不設 storage state）新增 test「訪客載入本機資料的過程中參賽者、對戰、統計與計分板頁從未出現空狀態或預設值」「訪客重新整理參賽者頁時在 session 回應前即顯示本機名單」「上次登入提示殘留但已非登入時先顯示等待中再顯示本機名單並清除提示」；
  `nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts` 新增 test「已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單」（沿用 `seedCloudPlayers`／`buildPlayer`）。
  雙鎖下各跑一次（`--project=chromium` 跑 `data-pending.spec.ts`；`--project=user-data` 跑 roster-sync 的 `-g` 該條）：三條紅、訪客 session 暫停那條綠（regression guard，點名）並貼出輸出
- [ ] 3.2 RED（TDD）：`nextjs-pickball/lib/sync/sync-status.test.ts` 新增 it「pending、loading、load-failed 取代內容，pending 的文案為正在載入資料」；新檔 `nextjs-pickball/components/sync/SyncStatusNotice.test.tsx`，it「pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染」。兩檔單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.3 GREEN（TDD）：`sync-status.ts` 新增 `DataStatus`、`DATA_PENDING_MESSAGE`、`isContentBlocked`；`SyncStatusNotice` 的 `status` 改為 `DataStatus`（design Decision 10）。3.2 全綠、`sync-status.test.ts` 既有 it 全綠
- [ ] 3.4 RED（TDD）：`nextjs-pickball/hooks/useRosterStore.test.tsx` 新增三個 it——「session 等待中時不回傳本機名單、syncStatus 為 pending 且操作不寫入本機也不發請求」「等待中的 session 確認為未登入時改回本機名單」「本機名單讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.5 GREEN（TDD）：`useLocalRosterStore` 加讀入旗標（design Decision 7）；`useRosterStore` 依 design Decision 8 回傳，`syncStatus` 型別改為 `DataStatus`；為通過型別所需的最小改動：`app/matchmaker/page.tsx` 的 `SYNC_STATUS_PRIORITY`／`mergeSyncStatus` 改用 `DataStatus` 並在 `loading` 之後加入 `pending`、`components/matchmaker/RemoteStatsContent.tsx` 的參數型別改為 `DataStatus`。3.4 全綠、該檔既有 it 全綠；tsc exit 0
- [ ] 3.6 RED（TDD）：`nextjs-pickball/hooks/useRoundStore.test.tsx` 新增兩個 it——「session 等待中時不回傳本機回合與歷史、syncStatus 為 pending 且操作不生效」「本機回合讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.7 GREEN（TDD）：`useLocalRoundStore` 加讀入旗標；`useRoundStore` 依 design Decision 8 回傳（`rosterSyncStatus` 選項型別放寬為 `DataStatus`，傳給雲端 hook 時 `pending` 以 `loading` 傳入）。3.6 全綠、該檔既有 it 全綠；tsc exit 0
- [ ] 3.8 RED（TDD）：`nextjs-pickball/hooks/useScoreboardStore.test.tsx` 新增兩個 it——「session 等待中時不回傳本機計分且 syncStatus 為 pending，帶 matchId 時綁定狀態為 pending」「本機計分讀入前 syncStatus 為 pending，讀入後為 local」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.9 GREEN（TDD）：`useLocalScoreboardStore` 加讀入旗標；`useScoreboardStore` 依 design Decision 8 回傳。3.8 全綠、該檔既有 it 全綠（含兩條「首次 render 的綁定狀態」）；tsc exit 0
- [ ] 3.10 RED（TDD）：新檔 `nextjs-pickball/app/matchmaker/stats/page.test.tsx`，it「session 等待中時統計頁顯示等待中提示且不掛載雲端統計內容」（`RemoteStatsContent` 以 stub 取代）。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.11 GREEN（TDD）：統計頁入口改為只有 `remote` 掛雲端內容、其餘（含 `pending`）掛 `LocalStatsContent`，並更新檔頭註解（design Decision 9）；同時 `LocalStatsContent` 的取代條件改用 `isContentBlocked`（3.10 的提示由它渲染）。3.10 全綠
- [ ] 3.12 GREEN（TDD，E2E 驅動）：`app/matchmaker/players/page.tsx`、`app/matchmaker/page.tsx`（取代條件與 `isRosterReady`）、`components/matchmaker/RemoteStatsContent.tsx`（以 `isContentBlocked` 取代 `isBlockingStatus`）、`components/scoreboard/Scoreboard.tsx` 的取代條件改用 `isContentBlocked`（design Decision 9）。
  雙鎖下重跑 3.1 的兩個 E2E 檔（chromium 全檔、user-data 該條），四條全綠並貼出輸出；tsc exit 0；改動檔 ESLint 0 errors
- [ ] 3.13 REFACTOR：三個選擇器的三態分流寫法是否一致（具名 `mode` 變數與 if，不用巢狀三元）；三個本機 hook 的讀入旗標寫法是否一致；舊註解（「session 載入中視為本機」「本機模式恆為 local」等）是否更新；無壞味道則註記 skipped

## 4. 歷史頁與資料頁

Depends on: §3

- [ ] 4.1 RED（TDD，E2E）：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts` 新增 test「JavaScript 載入前各頁只顯示等待中提示而不顯示空狀態或預設值」（`describe` 內 `test.use({ javaScriptEnabled: false })`）與「訪客載入本機歷史的過程中從未出現空狀態」。
  雙鎖下 `--project=chromium` 跑兩條並貼出輸出：兩條皆紅（前者在 `/matchmaker/history` 與 `/matchmaker/data` 失敗；在紀錄中逐頁註明哪些頁面已因 §3 通過）
- [ ] 4.2 RED（TDD）：新檔 `nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it「session 等待中時顯示等待中提示且不渲染本機歷史」（`RemoteHistoryView` 以 stub 取代）；新檔 `nextjs-pickball/components/matchmaker/HistoryView.test.tsx`，it「伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄」。兩檔單檔 vitest 確認紅燈並貼出輸出
- [ ] 4.3 GREEN（TDD）：`HistoryModeSwitch` 在 `pending` 時渲染等待中容器；`HistoryView` 在 `hydrated === null` 時渲染同一個等待中容器（design Decision 9）。4.2 全綠
- [ ] 4.4 RED（TDD）：`JsonBackupSection.test.tsx` 新增 it「session 等待中時以等待中提示取代匯出與還原操作」；`HistoryCsvSection.test.tsx` 新增 it「session 等待中時以等待中提示取代匯出操作」；新檔 `RosterCsvImportSection.test.tsx`，it「session 等待中時以等待中提示取代選檔與確認匯入」（皆在 `nextjs-pickball/components/matchmaker/`）。三檔各跑單檔 vitest 確認三個新 it 全紅並貼出輸出
- [ ] 4.5 GREEN（TDD）：三個區塊在 `pending` 時保留 `CardHeader`、`CardContent` 只放 `SyncStatusNotice status="pending"`（判斷在所有 hook 之後；design Decision 9）。4.4 全綠、兩個既有測試檔的既有 it 全綠；tsc exit 0；改動檔 ESLint 0 errors
- [ ] 4.6 regression guard：`LocalDataImportSection.test.tsx` 新增 it「regression guard：session 等待中時不渲染匯入區塊」。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`LocalDataImportSection.tsx` 一行不改
- [ ] 4.7 驗證：雙鎖下 `--project=chromium` 重跑 `data-pending.spec.ts` 全檔，五條全綠並貼出輸出
- [ ] 4.8 REFACTOR：歷史兩處等待中容器、資料頁三區塊的等待中分支是否一致；是否值得抽共用元件（預期不抽：各兩三行 JSX，抽出後要多一個跨 capability 的檔案）；無壞味道則註記 skipped

## 5. 文件同步與總驗收

Depends on: §4

- [ ] 5.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——「訪客（含 auth 停用、session 載入中）仍全走 LocalStorage」改為說明三態與等待中（伺服器輸出、有提示的 session 等待、本機讀入前皆顯示「正在載入資料…」）；統計頁條目「訪客與 session 載入中為 `LocalStatsContent`」補上 `pending`；
  「對戰、參賽者、統計三頁在 loading／load-failed 時」改為 `isContentBlocked`；`lib/sync/` 的 `storage-mode`、`sync-status` 說明補「三態」「`DataStatus`」，`lib/auth/` 補 `session-hint`、`hooks/` 的 `useSession` 補 `hydrated`。commit（`docs:`）
- [ ] 5.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 5.3 驗收（指令）C2：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint` 0 errors、warning 不多於基線
- [ ] 5.4 驗收（指令）C3：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test` 全綠；前端檔數＝基線＋6、測試數＝基線＋29，後端與核心與基線相同
- [ ] 5.5 驗收（指令）C4：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 5.6 驗收（指令）C5：`.dev.vars` 齊備下依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  user-data＝基線＋1 全 passed、0 skipped；五個 browser project 各＝基線＋5、0 failed（skip 只限既有瀏覽器條件）。結果寫在本 task 後方；失敗不得自行判定為雜訊，附證據上報 coordinator
- [ ] 5.7 驗收（指令）C6：使用端清單 grep 的檔案集合恰為 design Decision 2 表格的 9 個檔案
- [ ] 5.8 驗收（指令）C7：`"load-failed"` grep 只剩 test-plan C7 列出的兩處
- [ ] 5.9 驗收（指令）C8：範圍 diff 輸出為空
- [ ] 5.10 驗收（指令）C9：`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過
- [ ] 5.11 提醒：本 change 無使用者人工上線步驟；合併後是否 push（push 即觸發正式站部署）由使用者決定
