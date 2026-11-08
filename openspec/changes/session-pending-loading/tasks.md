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
> **標註**：`TDD`；`regression guard`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C8）。
>
> **範圍**：產品程式碼只改 proposal Impact 列出的 12 個檔案（含新檔 `lib/auth/session-hint.ts`）。**不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`、`afterEach` 亦同）；E2E 不得使用 `waitForTimeout`。
> UI 不新增文案：等待中一律用 `SyncStatusNotice status="loading"`（「正在載入雲端資料…」）。
>
> **授權修改的既有測試（僅限下列兩處；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> ① `nextjs-pickball/lib/auth/session-store.test.ts` 既有 `describe("session-store")` 的 `beforeEach` 加一行 `localStorage.clear()`；
> ② `nextjs-pickball/hooks/useSession.test.ts` 既有 `describe("useSession")` 的 `beforeEach` 加一行 `localStorage.clear()`。
> 兩者都是測試隔離：store 會把提示寫入 localStorage，前一個 it 寫入的提示會讓後面 it 的初始快照多出 `signedInHint`。
>
> **本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成（§2.1 的 RED 會 import 尚不存在的模組，屬型別紅燈）。

## 1. 對齊與基線（不寫產品程式碼）

- [ ] 1.1 確認分支 `change/session-pending-loading`、工作樹乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local` 成功；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
- [ ] 1.2 對齊 main：確認 proposal Impact 列出的產品檔與測試檔、`tests/e2e/user-data/roster-sync.spec.ts` 與 propose 時（`main` `fa2d4e5`）內容一致（`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat fa2d4e5 HEAD -- <路徑…>` 無輸出）；
  以 python difflib 比對本 change 五個 MODIFIED Requirement（`user-data-sync`「前端依 session 選擇儲存模式」、`auth`「全頁共用的 session store 與 useSession」、`player-roster`「登入時名單以雲端為準」、`round-lifecycle`「登入時回合與場次分槽以雲端為準」、`data-transfer`「清除本機資料與其確認流程」）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另以 Context7 查證並記錄：React 19 `useSyncExternalStore` 在 hydration 時使用 `getServerSnapshot`、client 快照不同時於 hydration 後重新 render；`hydrateRoot` 的 `onRecoverableError`；Playwright `route.continue()`／`page.unrouteAll({ behavior: "ignoreErrors" })`。與 design 假設不符時停止並回報

## 2. 上次登入提示與儲存模式第三態

Depends on: §1

- [ ] 2.1 RED（TDD）：新檔 `nextjs-pickball/lib/auth/session-hint.test.ts`，寫入兩個 it——「寫入後讀取為 true 且只存固定值，清除後讀取為 false」「值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯」（斷言依 test-plan）。單檔 vitest 確認紅燈（模組不存在）並貼出輸出
- [ ] 2.2 GREEN（TDD）：新增 `nextjs-pickball/lib/auth/session-hint.ts`（`SIGNED_IN_HINT_STORAGE_KEY`、`readSignedInHint`、`writeSignedInHint`、`clearSignedInHint`；design Decision 3）。2.1 全綠
- [ ] 2.3 RED（TDD）：`nextjs-pickball/lib/auth/session-store.test.ts` 新增四個 it——「有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶」「session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示」「被丟棄的過時 session 回應不改變提示」「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」；
  `nextjs-pickball/hooks/useSession.test.ts` 新增一個 it——「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」；同一 commit 依檔頭授權 ①② 各加一行 `localStorage.clear()`。
  兩個檔各跑單檔 vitest，確認五個新 it 全紅、既有 it 全綠並貼出輸出（新 it 放在新的 `describe` 區塊並自帶 localStorage 清理；fake timers 於 `finally` 還原）
- [ ] 2.4 GREEN（TDD）：改 `nextjs-pickball/lib/auth/session-store.ts`——`SessionSnapshot` loading 變體加 `signedInHint?: true`；client 第一次讀快照時讀提示並快取為兩個常數之一；`getServerSnapshot` 不變；採用回應時依 `authEnabled && user !== null` 寫入或清除（在 `requestId` 守衛之後）；
  第一次訂閱且帶提示時排 `SIGNED_IN_HINT_WAIT_MS = 10_000` 的計時器；`resetSessionStoreForTests` 清除計時器與快取（design Decision 2、4、7）。2.3 全綠；兩個測試檔既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0
- [ ] 2.5 RED（TDD）：`nextjs-pickball/lib/auth/session-client.test.ts` 新增 it「signOut 成功時清除上次登入提示，失敗時保留」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 2.6 GREEN（TDD）：`signOut()` 在 `res.ok` 時呼叫 `clearSignedInHint()`（design Decision 4）。2.5 與該檔既有 it 全綠
- [ ] 2.7 RED（TDD）：`nextjs-pickball/lib/sync/storage-mode.test.ts` 新增 it「session 載入中且帶上次登入提示時為 pending」。單檔 vitest 確認紅燈；既有「只有 session 就緒、auth 啟用且有 user 時為 remote」維持綠（regression guard，點名）
- [ ] 2.8 GREEN（TDD）：`StorageMode` 加 `"pending"`，`resolveStorageMode` 依 design Decision 1 判斷；更新檔頭註解（不再寫「session 載入中一律視為本機」）。2.7 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 2.9 regression guard：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts` 新增 it「regression guard：clearAllLocalData 不移除上次登入提示」（design Decision 8）。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`transfer-storage.ts` 一行不改
- [ ] 2.10 REFACTOR：session-store 的提示判斷是否與 `resolveStorageMode` 的 remote 條件重複到值得共用（預期不抽：兩處語意不同層、各一行）；註解是否只寫「為什麼」；無壞味道則註記 skipped

## 3. 選擇器的等待中結果與 E2E

Depends on: §2

- [ ] 3.1 RED（TDD，E2E）：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts` 新增 test「已登入者重新整理參賽者頁時在 session 回應前顯示載入中而非空名單」（沿用 `seedCloudPlayers`／`buildPlayer`）；
  新檔 `nextjs-pickball/tests/e2e/specs/session-pending.spec.ts`（不設 storage state）新增 test「訪客重新整理參賽者頁時在 session 回應前即顯示本機名單」「上次登入提示殘留但已非登入時先顯示載入中再顯示本機名單並清除提示」（key 自 `@/lib/auth/session-hint`、`@/lib/matchmaker/storage-keys` 匯入）。
  攔截、收尾與斷言順序依 test-plan「E2E 攔截的共同要求」。雙鎖下各跑一次（`--project=user-data` 跑 roster-sync 的 `-g` 該條；`--project=chromium` 跑 `session-pending.spec.ts`）：登入者 reload 與提示殘留兩條紅、訪客那條綠（regression guard，點名）並貼出輸出
- [ ] 3.2 RED（TDD）：`nextjs-pickball/hooks/useRosterStore.test.tsx` 新增兩個 it——「session 等待中時不回傳本機名單、syncStatus 為 loading 且操作不寫入本機也不發請求」「等待中的 session 確認為未登入時改回本機名單」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.3 GREEN（TDD）：`useRosterStore` 在 `pending` 時回傳等待中結果（design Decision 5）。3.2 全綠、該檔既有 it 全綠；雙鎖下重跑 3.1 的兩個 E2E 檔（user-data 該條、chromium 全檔），三條全綠並貼出輸出
- [ ] 3.4 RED（TDD）：`nextjs-pickball/hooks/useRoundStore.test.tsx` 新增 it「session 等待中時不回傳本機回合與歷史、syncStatus 為 loading 且操作不生效」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.5 GREEN（TDD）：`useRoundStore` 在 `pending` 時回傳等待中結果（design Decision 5）。3.4 全綠、該檔既有 it 全綠
- [ ] 3.6 RED（TDD）：`nextjs-pickball/hooks/useScoreboardStore.test.tsx` 新增 it「session 等待中時不回傳本機計分且 syncStatus 為 loading，帶 matchId 時綁定狀態為 pending」。單檔 vitest 確認紅燈並貼出輸出
- [ ] 3.7 GREEN（TDD）：`useScoreboardStore` 在 `pending` 時回傳 `[初始狀態, 不做事的 dispatch, matchId === null ? "standalone" : "pending", "loading"]`（design Decision 5）。3.6 全綠、該檔既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 3.8 REFACTOR：三個選擇器的三態分流寫法是否一致（例：同樣以具名的 `mode` 變數與 if 判斷，不用巢狀三元）；註解是否更新「session 載入中視為本機」等舊敘述；無壞味道則註記 skipped

## 4. 頁面與元件的等待中處置

Depends on: §3

- [ ] 4.1 RED（TDD）：新檔 `nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it「session 等待中時顯示載入中提示且不渲染本機歷史」（`RemoteHistoryView` 以 stub 取代）。單檔 vitest 確認紅燈並貼出輸出
- [ ] 4.2 GREEN（TDD）：`HistoryModeSwitch` 在 `pending` 時渲染 `data-sync-status="loading"` 容器＋`SyncStatusNotice`（design Decision 6）。4.1 全綠
- [ ] 4.3 RED（TDD）：新檔 `nextjs-pickball/app/matchmaker/stats/page.test.tsx`，it「session 等待中時統計頁顯示載入中提示且不掛載雲端統計內容」（`RemoteStatsContent` 以 stub 取代）。單檔 vitest 確認紅燈並貼出輸出
- [ ] 4.4 GREEN（TDD）：統計頁入口改為只有 `remote` 掛雲端內容、其餘（含 `pending`）掛 `LocalStatsContent`，並更新檔頭註解（design Decision 6）。4.3 全綠
- [ ] 4.5 RED（TDD）：`JsonBackupSection.test.tsx` 新增 it「session 等待中時以載入中提示取代匯出與還原操作」；`HistoryCsvSection.test.tsx` 新增 it「session 等待中時以載入中提示取代匯出操作」；新檔 `RosterCsvImportSection.test.tsx`，it「session 等待中時以載入中提示取代選檔與確認匯入」（皆在 `nextjs-pickball/components/matchmaker/`）。三檔各跑單檔 vitest 確認三個新 it 全紅並貼出輸出
- [ ] 4.6 GREEN（TDD）：三個區塊在 `pending` 時保留 `CardHeader`、`CardContent` 只放 `SyncStatusNotice`（判斷在所有 hook 之後；design Decision 6）。4.5 全綠、兩個既有測試檔的既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
- [ ] 4.7 regression guard：`LocalDataImportSection.test.tsx` 新增 it「regression guard：session 等待中時不渲染匯入區塊」。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`LocalDataImportSection.tsx` 一行不改
- [ ] 4.8 REFACTOR：三個資料區塊的等待中分支是否一致；是否值得抽共用元件（三個使用端、各三行 JSX，預期不抽）；無壞味道則註記 skipped

## 5. 文件同步與總驗收

Depends on: §4

- [ ] 5.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——「訪客（含 auth 停用、session 載入中）仍全走 LocalStorage」改為說明三態（有上次登入提示時等待中顯示載入中、無提示時仍走本機）；統計頁條目「訪客與 session 載入中為 `LocalStatsContent`」補上等待中；
  `lib/sync/` 的 `storage-mode` 說明補「三態」，`lib/auth/` 補 `session-hint`。commit（`docs:`）
- [ ] 5.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 5.3 驗收（指令）C2：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint` 0 errors、warning 不多於基線
- [ ] 5.4 驗收（指令）C3：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test` 全綠；前端檔數＝基線＋4、測試數＝基線＋20，後端與核心與基線相同
- [ ] 5.5 驗收（指令）C4：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build` exit 0；建置後 `git status --porcelain` 為空
- [ ] 5.6 驗收（指令）C5：`.dev.vars` 齊備下依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  user-data＝基線＋1 全 passed、0 skipped；五個 browser project 各＝基線＋2、0 failed（skip 只限既有瀏覽器條件）。結果寫在本 task 後方；失敗不得自行判定為雜訊，附證據上報 coordinator
- [ ] 5.7 驗收（指令）C6：使用端清單 grep 的檔案集合恰為 design Decision 1 表格的 9 個檔案
- [ ] 5.8 驗收（指令）C7：範圍 diff 輸出為空（後端、核心、雲端 hook、`useSession.ts`、共用同步元件、`transfer-storage.ts`、`LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、計分板元件、參賽者與對戰頁、相依檔零變更）
- [ ] 5.9 驗收（指令）C8：`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過
- [ ] 5.10 提醒：本 change 無使用者人工上線步驟；合併後是否 push（push 即觸發正式站部署）由使用者決定
