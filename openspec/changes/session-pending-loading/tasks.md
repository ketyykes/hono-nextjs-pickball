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
- [x] 1.2 對齊 main：確認 proposal Impact 列出的產品檔與測試檔、`tests/e2e/user-data/roster-sync.spec.ts` 與 propose 時（`main` `d371225`）內容一致（`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat d371225 HEAD -- <路徑…>` 無輸出）；
  以 python difflib 比對本 change 七個 MODIFIED Requirement（`user-data-sync`「前端依 session 選擇儲存模式」、`auth`「全頁共用的 session store 與 useSession」、`player-roster`「登入時名單以雲端為準」、`round-lifecycle`「登入時回合與場次分槽以雲端為準」、`scoreboard`「登入時獨立計分板以雲端為準」、`match-history`「歷史頁唯讀消費既有紀錄」、`data-transfer`「清除本機資料與其確認流程」）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另以 Context7 查證並記錄：React 19 `useSyncExternalStore` 在 hydration 時使用 `getServerSnapshot`、client 快照不同時於 hydration 後重新 render；`hydrateRoot` 的 `onRecoverableError`；Playwright `javaScriptEnabled`、`page.addInitScript`、`route.continue()`／`page.unrouteAll({ behavior: "ignoreErrors" })`。與 design 假設不符時停止並回報
  - 紀錄：`git diff --stat d371225 HEAD -- nextjs-pickball/{lib,hooks,components,app,tests}` 無輸出（產品檔、測試檔與 `roster-sync.spec.ts` 自 propose 後未變）；`openspec/specs/` 最後一次變動為 `09ebe7f`（早於 `d371225`）。
    python difflib 比對七個 MODIFIED Requirement 與主 spec：差異全為本 change 刻意增修（三態、`hydrated`、提示、`isContentBlocked`、等待中取代、不屬清除範圍的 key），另有區塊尾端空行與分隔線 `---` 的擷取假差異；無需重新套用。`openspec validate session-pending-loading --strict` valid。
    Context7：`/reactjs/react.dev` useSyncExternalStore——`getServerSnapshot` 只在伺服器 render 與 client hydration 時使用，之後以 `getSnapshot` 為準、值不同（Object.is）即 re-render；hydrateRoot——`onRecoverableError` 在 React 自動從錯誤（含 hydration 不一致）復原時呼叫。`/websites/playwright_dev`——`test.use({ javaScriptEnabled: false })` 停用 JS；`page.addInitScript` 在每次導覽、文件建立後且頁面腳本執行前執行；`page.unrouteAll({ behavior: "ignoreErrors" })` 不等待進行中的 handler、之後拋出的錯誤一律吞下。皆與 design 假設一致。

## 2. 上次登入提示、hydration 旗標與儲存模式三態

Depends on: §1

- [x] 2.1 RED（TDD）：新檔 `nextjs-pickball/lib/auth/session-hint.test.ts`，寫入兩個 it——「寫入後讀取為 true 且只存固定值，清除後讀取為 false」「值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯」。單檔 vitest 確認紅燈（模組不存在）並貼出輸出
- [x] 2.2 GREEN（TDD）：新增 `nextjs-pickball/lib/auth/session-hint.ts`（design Decision 5）。2.1 全綠
- [x] 2.3 RED（TDD）：`nextjs-pickball/lib/auth/session-store.test.ts` 新增四個 it——「有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶」「session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示」「被丟棄的過時 session 回應不改變提示」「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」；
  `nextjs-pickball/hooks/useSession.test.ts` 新增一個 it——「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」；同一 commit 依檔頭授權 ①② 各加一行 `localStorage.clear()`。
  兩檔各跑單檔 vitest，確認五個新 it 全紅、既有 it 全綠並貼出輸出（新 it 放在新的 `describe` 並自帶 localStorage 清理；fake timers 於 `finally` 還原）
- [x] 2.4 GREEN（TDD）：改 `nextjs-pickball/lib/auth/session-store.ts`（design Decision 4、6、11）。2.3 全綠、兩檔既有 it 全綠
- [x] 2.5 RED（TDD）：`nextjs-pickball/hooks/useSession.test.ts` 新增兩個 it——「hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true」「client 端一般 mount 的第一次 render 即為 hydrated」。單檔 vitest 確認紅燈並貼出輸出
- [x] 2.6 GREEN（TDD）：`useSession` 回傳值加 `hydrated`（design Decision 3）；`UseSessionResult` 型別同步。2.5 全綠、該檔既有 it 全綠；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0
- [x] 2.7 RED（TDD）：`nextjs-pickball/lib/auth/session-client.test.ts` 新增 it「signOut 成功時清除上次登入提示，失敗時保留」。單檔 vitest 確認紅燈並貼出輸出
- [x] 2.8 GREEN（TDD）：`signOut()` 在 `res.ok` 時呼叫 `clearSignedInHint()`（design Decision 6）。2.7 與該檔既有 it 全綠
- [x] 2.9 RED（TDD）：`nextjs-pickball/lib/sync/storage-mode.test.ts` 新增兩個 it——「session 載入中且帶上次登入提示時為 pending」「尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local」。單檔 vitest 確認紅燈；既有「只有 session 就緒、auth 啟用且有 user 時為 remote」維持綠（regression guard，點名）
- [x] 2.10 GREEN（TDD）：`StorageMode` 加 `"pending"`、參數型別放寬、依 design Decision 2 判斷；更新檔頭註解。2.9 全綠；tsc exit 0；改動檔 ESLint 0 errors
- [x] 2.11 regression guard：`nextjs-pickball/lib/matchmaker/transfer-storage.test.ts` 新增 it「regression guard：clearAllLocalData 不移除上次登入提示」（design Decision 12）。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`transfer-storage.ts` 一行不改
- [x] 2.12 REFACTOR：session-store 的提示判斷與 `resolveStorageMode` 的 remote 條件是否值得共用（預期不抽：兩處語意不同層、各一行）；註解是否只寫「為什麼」；無壞味道則註記 skipped
  - 紀錄（§2 整組）：
    - commit：2.1 RED `bf4bb8b`／2.2 GREEN `1f65aff`；2.3 RED `a90f3e6`／2.4 GREEN `fc91502`；2.5 RED `c3d75f2`／2.6 GREEN `bd7dff0`；2.7 RED `5fa4f20`／2.8 GREEN `798e18a`；2.9 RED `786b2b3`／2.10 GREEN `b1cd8c6`；2.11 regression guard `4df3362`；Stage 2 修正 `4290f13`（測試）、`246ba78`（註解）。2.12 REFACTOR：skipped（store 的提示判斷與 `resolveStorageMode` 的 remote 條件語意不同層、各一行，不抽）。
    - 紅燈（leader 以 `git show <RED>^:<path>` 機械複驗：五個 RED commit 只動測試檔，新 it 名稱在 RED 前計數 0、RED 後 1）：2.1 `Failed to resolve import "./session-hint"`；2.3 session-store `4 failed | 12 passed`、useSession `1 failed | 3 passed`；2.5 `2 failed | 4 passed`（`hydrated` 為 undefined）；2.7 `1 failed | 10 passed`；2.9 `2 failed | 1 passed`（`expected 'local' to be 'pending'`），既有「只有 session 就緒、auth 啟用且有 user 時為 remote」維持綠（regression guard）。Stage 1 另以 `git archive <RED>` 於 /tmp 重跑複驗，皆真紅。新 it 無先綠者；2.11 寫入即綠（regression guard）。
    - mutation（Implementer 與 Stage 2 各自獨立）：①～⑨ 全數轉紅；對照組（`!(hydrated ?? true)`、調換兩條 pending 判斷、`res.ok` 改寫為 2xx 範圍等）皆維持綠。存活：S1／S9（採用回應後不清計時器、計時器不檢查 ready——兩道防線互為備援，同時拿掉即紅）、S4（讀取接受 `"1 "`）、S6（模組載入時就讀提示：`beforeEach` 的 reset 會蓋掉初始值，風險低未補測）、S7（reset 不清計時器，只影響測試隔離）、S8（每次訂閱都排計時器，結果冪等）。
    - Stage 1（sonnet）：PASS。Stage 2（opus）：第一輪 FAIL——`session-hint.test.ts` 以 `vi.spyOn(Storage.prototype, …)` 下 spy 在 happy-dom 對 `localStorage` 不生效（拿掉 try/catch 仍綠、單獨跑 `-t "不可用"` 反紅）；修正為 instance spy（`4290f13`，同時採納建議補 `{ authEnabled: false, user: USER }` 情境、`246ba78` 補註解），test-plan 對應列同步改寫；複審 PASS（三函式拿掉 try/catch 皆轉紅、寫入條件只看 user 轉紅）。此修正是測試品質修補，不是新的紅燈。
    - 偏離：`UseSessionResult.hydrated` 型別為 `hydrated?: boolean`（見 design Decision 3 補註）。

## 3. 顯示狀態、選擇器與使用選擇器的頁面

Depends on: §2

- [x] 3.1 RED（TDD，E2E）：新檔 `nextjs-pickball/tests/e2e/helpers/flash-recorder.ts`（`installFlashRecorder`、`readFlashHits`；寫法依 test-plan「E2E 共同要求」）；
  新檔 `nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`（不設 storage state）新增 test「訪客載入本機資料的過程中參賽者、對戰、統計與計分板頁從未出現空狀態或預設值」「訪客重新整理參賽者頁時在 session 回應前即顯示本機名單」「上次登入提示殘留但已非登入時先顯示等待中再顯示本機名單並清除提示」；
  `nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts` 新增 test「已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單」（沿用 `seedCloudPlayers`／`buildPlayer`）。
  雙鎖下各跑一次（`--project=chromium` 跑 `data-pending.spec.ts`；`--project=user-data` 跑 roster-sync 的 `-g` 該條）：三條紅、訪客 session 暫停那條綠（regression guard，點名）並貼出輸出
- [x] 3.2 RED（TDD）：`nextjs-pickball/lib/sync/sync-status.test.ts` 新增 it「pending、loading、load-failed 取代內容，pending 的文案為正在載入資料」；新檔 `nextjs-pickball/components/sync/SyncStatusNotice.test.tsx`，it「pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染」。兩檔單檔 vitest 確認紅燈並貼出輸出
- [x] 3.3 GREEN（TDD）：`sync-status.ts` 新增 `DataStatus`、`DATA_PENDING_MESSAGE`、`isContentBlocked`；`SyncStatusNotice` 的 `status` 改為 `DataStatus`（design Decision 10）。3.2 全綠、`sync-status.test.ts` 既有 it 全綠
- [x] 3.4 RED（TDD）：`nextjs-pickball/hooks/useRosterStore.test.tsx` 新增三個 it——「session 等待中時不回傳本機名單、syncStatus 為 pending 且操作不寫入本機也不發請求」「等待中的 session 確認為未登入時改回本機名單」「本機名單讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」。單檔 vitest 確認紅燈並貼出輸出
- [x] 3.5 GREEN（TDD）：`useLocalRosterStore` 加讀入旗標（design Decision 7）；`useRosterStore` 依 design Decision 8 回傳，`syncStatus` 型別改為 `DataStatus`；為通過型別所需的最小改動：`app/matchmaker/page.tsx` 的 `SYNC_STATUS_PRIORITY`／`mergeSyncStatus` 改用 `DataStatus` 並在 `loading` 之後加入 `pending`、`components/matchmaker/RemoteStatsContent.tsx` 的參數型別改為 `DataStatus`。3.4 全綠、該檔既有 it 全綠；tsc exit 0
- [x] 3.6 RED（TDD）：`nextjs-pickball/hooks/useRoundStore.test.tsx` 新增兩個 it——「session 等待中時不回傳本機回合與歷史、syncStatus 為 pending 且操作不生效」「本機回合讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」。單檔 vitest 確認紅燈並貼出輸出
- [x] 3.7 GREEN（TDD）：`useLocalRoundStore` 加讀入旗標；`useRoundStore` 依 design Decision 8 回傳（`rosterSyncStatus` 選項型別放寬為 `DataStatus`，傳給雲端 hook 時 `pending` 以 `loading` 傳入）。3.6 全綠、該檔既有 it 全綠；tsc exit 0
- [x] 3.8 RED（TDD）：`nextjs-pickball/hooks/useScoreboardStore.test.tsx` 新增兩個 it——「session 等待中時不回傳本機計分且 syncStatus 為 pending，帶 matchId 時綁定狀態為 pending」「本機計分讀入前 syncStatus 為 pending，讀入後為 local」。單檔 vitest 確認紅燈並貼出輸出
- [x] 3.9 GREEN（TDD）：`useLocalScoreboardStore` 加讀入旗標；`useScoreboardStore` 依 design Decision 8 回傳。3.8 全綠、該檔既有 it 全綠（含兩條「首次 render 的綁定狀態」）；tsc exit 0
- [x] 3.10 RED（TDD）：新檔 `nextjs-pickball/app/matchmaker/stats/page.test.tsx`，it「session 等待中時統計頁顯示等待中提示且不掛載雲端統計內容」（`RemoteStatsContent` 以 stub 取代）。單檔 vitest 確認紅燈並貼出輸出
- [x] 3.11 GREEN（TDD）：統計頁入口改為只有 `remote` 掛雲端內容、其餘（含 `pending`）掛 `LocalStatsContent`，並更新檔頭註解（design Decision 9）；同時 `LocalStatsContent` 的取代條件改用 `isContentBlocked`（3.10 的提示由它渲染）。3.10 全綠
- [x] 3.12 GREEN（TDD，E2E 驅動）：`app/matchmaker/players/page.tsx`、`app/matchmaker/page.tsx`（取代條件與 `isRosterReady`）、`components/matchmaker/RemoteStatsContent.tsx`（以 `isContentBlocked` 取代 `isBlockingStatus`）、`components/scoreboard/Scoreboard.tsx` 的取代條件改用 `isContentBlocked`（design Decision 9）。
  雙鎖下重跑 3.1 的兩個 E2E 檔（chromium 全檔、user-data 該條），四條全綠並貼出輸出；tsc exit 0；改動檔 ESLint 0 errors
- [x] 3.13 REFACTOR：三個選擇器的三態分流寫法是否一致（具名 `mode` 變數與 if，不用巢狀三元）；三個本機 hook 的讀入旗標寫法是否一致；舊註解（「session 載入中視為本機」「本機模式恆為 local」等）是否更新；無壞味道則註記 skipped

### 審查修正紀錄（§3 Stage 2 兩份 FAIL 之後）

兩位 Stage 2 reviewer 的 FAIL 都只因兩處過時註解，程式行為無誤；必修與建議全數處理，task 尚未勾選（待複審）。

| # | 類型 | 處置 | commit |
|---|---|---|---|
| 1 | 必修：`LocalStatsContent.tsx` 時鐘註解仍稱 history 為空陣列 | 改為「首次伺服器輸出與 hydration 當下 syncStatus 皆為 pending，走等待中提示分支」 | `876356e` |
| 2 | 必修：`app/matchmaker/page.tsx` 註解稱本機模式名單恆就緒 | 改為「remoteMatchSlots 恆為 null；名單就緒在本機讀入的同一次 render 由 false 轉 true」 | `876356e` |
| 3 | 建議：X4 缺測（等待中 `droppedCount` 改帶本機值不會紅） | `useRosterStore.test.tsx` 新增 it「session 等待中時即使本機資料含損壞筆數 droppedCount 仍為 0」，**regression guard**（行為早已正確，寫入即綠） | `68d32d0` |
| 4 | 建議：E2E 放行前錨點太弱 | `data-pending.spec.ts` 追加：殘留提示那條斷言 `getByRole("status")` 為 `DATA_PENDING_MESSAGE` 並斷言空名單文案為 0；訪客重新整理那條加閃爍記錄器 | `68d32d0` |
| 5 | 建議：`unrouteAll` 移進 `finally` | 三處（data-pending 兩處、roster-sync 一處）改為 try 內放行並斷言、finally 內再 release 與 unrouteAll | `68d32d0` |
| 6 | 建議：暫停邏輯重複 | 抽出 `tests/e2e/helpers/hold-session.ts`，兩個 spec 共用 | `68d32d0` |
| 7 | 建議：型別寫法不一 | `useRoundStore.ts` 的 `LocalRoundStoreResult` 改明確寫 `UseRoundStoreResult<DataStatus>`，與名單一致 | `8dad6aa` |
| 8 | 建議：三選擇器重複本機狀態判定 | `sync-status.ts` 新增 `localDataStatus(hydrated)`（if 寫法），三選擇器改用；單元 it 標 regression guard | `8dad6aa` |

**X4 變異**：把 `useRosterStore` 等待中分支改為帶本機 `droppedCount`（先解構 local 再回傳 `{ ...remote, droppedCount: localStore.droppedCount, syncStatus: "pending" }`）。單檔 vitest：`Test Files 1 failed`、`Tests 1 failed | 15 passed`，紅的正是新 it（`AssertionError: expected 1 to be +0`）。等價對照組（`mode === "pending"` 改寫為 `mode !== "local" && mode !== "remote"`）：`16 passed`。每次變異後已還原、git status 乾淨。

**E2E 錨點變異**（參賽者頁取代條件改回只看 `loading`／`load-failed`）：
- 只追加 status 文案斷言時，變異下只有第一條紅，另兩條仍綠——放行前畫面的 `main[data-sync-status="pending"]` 與狀態文案由別處渲染，與是否取代內容無關；因此再追加「空名單文案為 0」與閃爍記錄器。
- 追加後變異下 3 條皆紅（`1 failed`/`2 passed` → `3 failed`）；等價對照組（`isContentBlocked(syncStatus)` 展開成三個狀態的 `||`）3 passed。

**實跑數字**：單檔 vitest（三個 store 測試與 `sync-status.test.ts`）4 files、70 tests 全綠（roster 16、round 28、scoreboard 23、sync-status 3；Stage 2 複審實跑更正），`useRosterStore.test.tsx` 16 passed；chromium `data-pending.spec.ts` 3 passed（HEAD）；user-data `roster-sync.spec.ts -g` 1 passed、0 skipped；`pnpm -r exec tsc --noEmit` exit 0；改動檔 eslint 0 errors。

**Stage 2 複審（opus，coordinator 派，涵蓋 `30b4265..bddd70e`）**：程式碼與測試 PASS；X4 變異紅（1 failed／15 passed）、`localDataStatus` 回傳反轉紅（四檔共 8 failed）、對照組（改寫為三元）全綠；chromium `data-pending.spec.ts` HEAD 3 passed、M10 變異 3 failed、對照組（`isContentBlocked` 展開為三個 `||`）3 passed；tsc exit 0、改動 11 檔 eslint 0 errors。所列必修皆為 artifact 未同步（test-plan 兩條 E2E 的 Assertion／Why first、兩個 regression guard it 缺列、design Decision 10 缺 `localDataStatus`、tests 數 69→70），已由 coordinator 於本次 commit 同步；建議「E2E 共同要求點名 `hold-session.ts`」已併入 test-plan，建議「放行後先 await `/api/session` 回應再斷言」併入 §4 派工處理。§3 完成。

## 4. 歷史頁與資料頁

Depends on: §3

- [x] 4.1 RED（TDD，E2E）：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts` 新增 test「JavaScript 載入前各頁只顯示等待中提示而不顯示空狀態或預設值」（`describe` 內 `test.use({ javaScriptEnabled: false })`）與「訪客載入本機歷史的過程中從未出現空狀態」。
  雙鎖下 `--project=chromium` 跑兩條並貼出輸出：兩條皆紅（前者在 `/matchmaker/history` 與 `/matchmaker/data` 失敗；在紀錄中逐頁註明哪些頁面已因 §3 通過）
  - 紀錄：前置修正 `c885061`（`test:`）：data-pending 兩條與 roster-sync 一條在 `release()` 後先 `await` 事先建立的 `page.waitForResponse("**/api/session")` 再斷言；既有斷言與 test 名稱未動，`hold-session.ts` 介面不變。RED commit `e79f9fb`。
  - 紅燈（雙鎖、chromium、`data-pending.spec.ts` 全檔，`/tmp/g4-red41.log`）：`2 failed, 3 passed`。①「訪客載入本機歷史的過程中從未出現空狀態」紅：閃爍記錄 `readFlashHits` 非空（現行 `hydrated === null` 時畫空狀態）；②「JavaScript 載入前各頁只顯示等待中提示…」紅：`/matchmaker/history 應顯示等待中 … element(s) not found`。既有三條仍綠（同時驗證前置修正）。
  - 逐頁：七個路徑依序驗，`/matchmaker/players`、`/matchmaker`、`/matchmaker/stats` 已因 §3 通過；`/matchmaker/history` 失敗（迴圈停在此處，之後的路徑未檢查）。§4.3 後同一條改在 `/matchmaker/data` 失敗，證明資料頁亦為紅；4.5 後 `/matchmaker/data`、`/scoreboard`、`/scoreboard?match=m1` 皆通過。
  - 實作取捨：`test.use` 作用於整個 `describe`，故停用 JavaScript 的 test 獨立放在第二個 `describe`（「…（只看伺服器輸出）」），未放進既有 describe，避免影響其餘四條。
  - RED 複驗：`git show e79f9fb^:nextjs-pickball/tests/e2e/specs/data-pending.spec.ts` 不含兩個新 test 名稱（grep 計數 0）。
- [x] 4.2 RED（TDD）：新檔 `nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it「session 等待中時顯示等待中提示且不渲染本機歷史」（`RemoteHistoryView` 以 stub 取代）；新檔 `nextjs-pickball/components/matchmaker/HistoryView.test.tsx`，it「伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄」。兩檔單檔 vitest 確認紅燈並貼出輸出
  - 紀錄：RED commit `5e0e2cd`。兩檔單檔 vitest 皆紅（`Test Files 2 failed (2)`、`Tests 2 failed (2)`）：`HistoryModeSwitch` 為 `Unable to find an accessible element with the role "status"`（現行掛 `HistoryView`）；`HistoryView` 為 `expected '<div class="flex flex-col gap-4"><div…' to contain '正在載入資料…'`（伺服器輸出為篩選器與空狀態）。兩檔皆新檔，皆非 regression guard。產品檔 `HistoryModeSwitch.tsx`、`HistoryView.tsx` 在 `5e0e2cd^` 與 `5e0e2cd` 相同。
- [x] 4.3 GREEN（TDD）：`HistoryModeSwitch` 在 `pending` 時渲染等待中容器；`HistoryView` 在 `hydrated === null` 時渲染同一個等待中容器（design Decision 9）。4.2 全綠
  - 紀錄：GREEN commit `a1df7cd`。`HistoryModeSwitch.test.tsx`、`HistoryView.test.tsx`、既有 `RemoteHistoryView.test.tsx` 共 `3 passed`／18 tests。等待中容器為 `<div data-sync-status="pending" className="flex flex-col gap-4"><SyncStatusNotice status="pending" /></div>`，兩處相同。
- [x] 4.4 RED（TDD）：`JsonBackupSection.test.tsx` 新增 it「session 等待中時以等待中提示取代匯出與還原操作」；`HistoryCsvSection.test.tsx` 新增 it「session 等待中時以等待中提示取代匯出操作」；新檔 `RosterCsvImportSection.test.tsx`，it「session 等待中時以等待中提示取代選檔與確認匯入」（皆在 `nextjs-pickball/components/matchmaker/`）。三檔各跑單檔 vitest 確認三個新 it 全紅並貼出輸出
  - 紀錄：RED commit `342a55d`。三個新 it 單檔 vitest 皆紅，錯誤皆為 `Unable to find an accessible element with the role "status"`：`JsonBackupSection`（`1 failed | 4 passed`）、`HistoryCsvSection`（`1 failed | 4 passed`）、`RosterCsvImportSection`（新檔，`1 failed`）。三者皆非 regression guard；既有 it 全綠。
- [x] 4.5 GREEN（TDD）：三個區塊在 `pending` 時保留 `CardHeader`、`CardContent` 只放 `SyncStatusNotice status="pending"`（判斷在所有 hook 之後；design Decision 9）。4.4 全綠、兩個既有測試檔的既有 it 全綠；tsc exit 0；改動檔 ESLint 0 errors
  - 紀錄：GREEN commit `b94ad8b`，補強 `6df1a41`。四檔（含 `LocalDataImportSection.test.tsx`）單檔 vitest `4 passed`／13 tests；`tsc` exit 0；改動檔 ESLint exit 0（含 `components/matchmaker/*.test.tsx` 與兩個 E2E spec）。判斷放在所有 hook 之後；三區塊的 `CardHeader` 保留，`CardContent` 只放 `SyncStatusNotice`。
  - 偏離：4.7 首次實跑時 `/matchmaker/data` 因等待中提示本身不帶 `data-sync-status` 而使「各頁 `[data-sync-status="pending"]` 可見」失敗；`6df1a41` 讓三個等待中的 `CardContent` 帶 `data-sync-status="pending"`（與其他頁一致），design Decision 9 已同步寫明。
  - mutation（單檔 vitest，harness 三重落地檢查，每次還原後 `git status` 乾淨）：
    - ① `HistoryModeSwitch` 的 `mode === "pending"` 改為永不成立（等價於等待中改掛 `HistoryView`）→ 紅；對照 `mode !== "local" && mode !== "remote"` → 綠。
    - ② `HistoryView` 的 `hydrated === null` 改為 `=== undefined`（讀入前渲染篩選器與空狀態）→ 紅；對照 `!hydrated` → 綠。
    - ③ `JsonBackupSection` 等待中改走本機分支 → 紅；對照 → 綠。
    - ④ `HistoryCsvSection` 等待中仍渲染「匯出 CSV」→ 紅；對照 → 綠。
    - ⑤ `RosterCsvImportSection` 等待中仍渲染選檔 → 紅；對照 → 綠。
    - ⑥ `LocalDataImportSection` 的 `isRemote` 改為 `!== "local"` → 紅（regression guard 轉紅）；對照 `!(… !== "remote")` → 綠。
- [x] 4.6 regression guard：`LocalDataImportSection.test.tsx` 新增 it「regression guard：session 等待中時不渲染匯入區塊」。寫入即綠，單檔 vitest 貼出輸出並註明 regression guard；`LocalDataImportSection.tsx` 一行不改
  - 紀錄：commit `831f480`。**regression guard**（寫入即綠）：單檔 vitest `Test Files 1 passed (1)`、`Tests 2 passed (2)`；`LocalDataImportSection.tsx` 未改。mutation ⑥ 見 4.5。
- [x] 4.7 驗證：雙鎖下 `--project=chromium` 重跑 `data-pending.spec.ts` 全檔，五條全綠並貼出輸出
  - 紀錄：雙鎖、chromium、`data-pending.spec.ts` 全檔（`/tmp/g4-green47c.log`）：`5 passed (10.7s)`、EXIT=0。user-data `roster-sync.spec.ts -g "已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單"`：`1 passed`、0 skipped、EXIT=0（含前置修正的 `await sessionResponse`）。
- [x] 4.8 REFACTOR：歷史兩處等待中容器、資料頁三區塊的等待中分支是否一致；是否值得抽共用元件（預期不抽：各兩三行 JSX，抽出後要多一個跨 capability 的檔案）；無壞味道則註記 skipped
  - 紀錄：skipped（無壞味道）。歷史兩處等待中容器 JSX 逐字相同（同 class、同 `data-sync-status`、同 `SyncStatusNotice`）；資料頁三區塊的等待中分支同形（`mode === "pending"` 三元、保留 `CardHeader`、`CardContent data-sync-status="pending"` 只放提示）。各只有 2～5 行 JSX，抽共用元件要新增跨 capability 的檔案，不抽。

**§4 審查（coordinator 派）**：Stage 1（sonnet）PASS，無必修；4.2、4.4 RED 已重新實跑，確認為真紅。Stage 2（opus）PASS，無必修：mutation ①～⑥ 全紅、對照組全綠；chromium `data-pending.spec.ts` HEAD 5 passed；user-data 新增那條 1 passed、0 skipped。E3（拿掉 HistoryView 等待中分支）只有「訪客載入本機歷史…」轉紅；「JavaScript 載入前…」不紅，因為伺服器輸出走 HistoryModeSwitch 的 pending 分支，HistoryView 的伺服器輸出改由 `renderToString` 單元測試涵蓋。E4（只拿掉單一區塊的屬性）不紅；E5（三區塊全拿掉）在 `/matchmaker/data` 轉紅。不擋的建議五條，處理方式：delta spec 資料頁段落補「帶 `data-sync-status="pending"` 的 `CardContent`」由 coordinator 同步；HistoryView 早退後的多餘判斷、資料頁三區塊改以 if/else 算出內容、`waitForResponse` 改在 `release()` 前一刻建立、等待中 it 移到正確的 describe，這四條併入 §5 前置修正。

**§4 審查建議處置（§5 前置修正）**：四條皆已處理——`HistoryView` 把 `entries`／`filteredEntries` 移到早退之後並刪掉三處多餘判斷、資料頁三區塊改以 if/else 先算出 `content`（`JsonBackupSection` 的 `isRemote` 巢狀三元一併改為 if/else 的 `importPicker`），commit `649ea8d`（refactor，`components/matchmaker` 17 檔 162 個測試全綠）；`data-pending.spec.ts` 與 `user-data/roster-sync.spec.ts` 的 `waitForResponse("**/api/session")` 改在 `release()` 前一刻建立（例外：「上次登入提示殘留…」那條由 `goto` 觸發 session 請求，故在 `goto` 之前、`holdSession` 之後建立）；等待中 it 移入各自新開的「等待中」describe（名稱與斷言不變；`JsonBackupSection.test.tsx` 與 `HistoryCsvSection.test.tsx` 的兩個等待中 it 亦移入專屬 describe），commit `bcf087c`（雙鎖 chromium `data-pending.spec.ts` 5 passed；user-data 該條 1 passed、0 skipped）。其他 `waitForResponse` 皆為先註冊再觸發的寫入請求，或在無 hold 的新頁面上註冊，不屬同一問題；`local-import.spec.ts` 訪客那條在 `NEUTRAL_PAGE` 之後註冊，理論上可能被前一頁的 session 回應滿足，但它只是等待回應落地再斷言空狀態，本次未改。

## 5. 文件同步與總驗收

Depends on: §4

- [x] 5.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——「訪客（含 auth 停用、session 載入中）仍全走 LocalStorage」改為說明三態與等待中（伺服器輸出、有提示的 session 等待、本機讀入前皆顯示「正在載入資料…」）；統計頁條目「訪客與 session 載入中為 `LocalStatsContent`」補上 `pending`；
  「對戰、參賽者、統計三頁在 loading／load-failed 時」改為 `isContentBlocked`；`lib/sync/` 的 `storage-mode`、`sync-status` 說明補「三態」「`DataStatus`」，`lib/auth/` 補 `session-hint`、`hooks/` 的 `useSession` 補 `hydrated`。commit（`docs:`）
  - 紀錄：commit `5cb1cc2`（docs）。`nextjs-pickball/CLAUDE.md` 六處同步（儲存三態與等待中、統計頁 `pending`、`isContentBlocked`、`Scoreboard` 取代條件、`lib/sync`、`lib/auth/session-hint`、`useSession.hydrated`）。
- [x] 5.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 紀錄：`pnpm --dir <root> -r exec tsc --noEmit`、`hono-pickball typecheck`、`packages/pickball-core typecheck` 皆 exit 0（含 A 的前置修正之後）。
- [ ] 5.3 驗收（指令）C2：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint` 0 errors、warning 不多於基線
  - 由 coordinator 於合併前執行。
- [ ] 5.4 驗收（指令）C3：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test` 全綠；前端檔數＝基線＋6、測試數＝基線＋33，後端與核心與基線相同
  - 由 coordinator 於合併前執行。
- [ ] 5.5 驗收（指令）C4：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build` exit 0；建置後 `git status --porcelain` 為空
  - 由 coordinator 於合併前執行。
- [ ] 5.6 驗收（指令）C5：`.dev.vars` 齊備下依 project 分開跑 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  user-data＝基線＋1 全 passed、0 skipped；五個 browser project 各＝基線＋5、0 failed（skip 只限既有瀏覽器條件）。結果寫在本 task 後方；失敗不得自行判定為雜訊，附證據上報 coordinator
  - 由 coordinator 於合併前執行。
- [x] 5.7 驗收（指令）C6：使用端清單 grep 的檔案集合恰為 design Decision 2 表格的 9 個檔案
  - 紀錄：9 個檔案＝`app/matchmaker/stats/page.tsx`、`HistoryCsvSection`、`HistoryModeSwitch`、`JsonBackupSection`、`LocalDataImportSection`、`RosterCsvImportSection`、`useRosterStore`、`useRoundStore`、`useScoreboardStore`，與 Decision 2 表格一致。
- [x] 5.8 驗收（指令）C7：`"load-failed"` grep 只剩 test-plan C7 列出的兩處
  - 紀錄：只剩 `app/matchmaker/page.tsx:39`（`SYNC_STATUS_PRIORITY`）與 `components/matchmaker/RemoteHistoryView.tsx:32`。
- [x] 5.9 驗收（指令）C8：範圍 diff 輸出為空
  - 紀錄：`git diff main --stat` 範圍輸出為空（`d0464bb` 起 C8 指令改用 git pathspec 引號，`hooks/useRemote*.ts` 由 git 自行展開，zsh 與 bash 皆可直接執行，不需特別指定 bash）。
- [x] 5.10 驗收（指令）C9：`DO_NOT_TRACK=1 openspec validate session-pending-loading --strict` 通過
  - 紀錄：`Change 'session-pending-loading' is valid`。
- [x] 5.11 提醒：本 change 無使用者人工上線步驟；合併後是否 push（push 即觸發正式站部署）由使用者決定

### Final Code Review 紀錄

Final Code Review（opus）判定 FAIL，原因全是 artifact 的數字與清單未同步，無產品程式碼問題。逐項查證與處置（commit 見下）：

- 新 it 數：以腳本比對 `main` 與 HEAD 各測試檔的 it 名稱，實為 32（非 30）；regression guard 4 個（transfer-storage、LocalDataImport、droppedCount、localDataStatus），真紅 28 不變。已改 proposal、test-plan（C3 與 Checklist）、tasks 5.4、execution-plan Final checklist、design Decision 8 apply 補註。
- proposal Impact 與 `git diff main --stat` 比對：只缺新檔 `tests/e2e/helpers/hold-session.ts`，已補；其餘（21 個產品檔、測試檔）一致。
- user-data-sync delta spec「SHALL NOT 各自內聯比較」補明 `RemoteHistoryView.tsx` 雲端歷史專屬例外與理由。
- Scenario 計數：以與主 spec 逐行比對確認 auth 10、user-data-sync 25（原寫 24，已更正）、data-transfer 1，其餘 capability 0。
- 兩個 guard it 補上 delta spec 驗收錨點；「上次登入提示殘留」Scenario 的 WHEN 改為與測試一致的 `addInitScript` 後 `goto`（標題未動）；`waitForResponse` 建立時機與兩個 describe 的檔名已更正（見 §4 審查建議處置）；5.9 過時的 bash 說明已更新；`nextjs-pickball/CLAUDE.md` 改正「本機資料讀入前」為顯示狀態並補 `localDataStatus`。
- 錨點比對腳本：delta spec 所有驗收錨點各恰好被 grep 到 1 次，本 change 新增的 33 個 it 皆有錨點（含合併前驗收追加的 1 個）。
- 處置 commit：見 `git log`（`docs(openspec):` 與 `docs:` 各一，主題為「同步 Final Code Review 指出的數字與清單」）。
