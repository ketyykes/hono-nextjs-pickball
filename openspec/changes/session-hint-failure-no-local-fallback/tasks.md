# Tasks: session-hint-failure-no-local-fallback

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`，前後清殘留 dev server（只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`）。
>
> **重負載雙鎖**（E2E、eslint 全套、全套 vitest、build）：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→
> `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 紅燈宣稱一律以 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱；改寫的既有 it 確認 RED 前為舊名稱）。
>
> **標註**：`TDD`；`regression guard`；`改寫既有 it`；`設定層`（文件）；`驗收（指令）`（test-plan C1～C10）。
>
> **範圍**：產品程式碼只改 proposal Impact 列出的 15 個檔案（含新檔 `components/sync/LocalFallbackBanner.tsx`）。**不新增相依、無 migration、不動後端與核心套件、禁止任何遠端 CF 操作、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`、`afterEach` 亦同）；E2E 不得使用 `waitForTimeout`。
> UI 只新增兩個文案：`LOCAL_FALLBACK_ACTION_LABEL`「先用這台裝置的資料」與 `LOCAL_FALLBACK_NOTICE`「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」；無法確認的提示沿用 `syncStatusMessage("load-failed")`。
>
> **授權改寫的既有測試（僅限下列三個 it；改名與改斷言，其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> ① `nextjs-pickball/lib/auth/session-client.test.ts`「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」→「fetchSession 於非 200、形狀不符或網路錯誤時回傳 null 且不拋錯」，斷言改為 `toBeNull()`；
> ② 同檔「signInMethods 形狀不符時 fetchSession 回傳未啟用」→「signInMethods 形狀不符時 fetchSession 回傳 null」，斷言改為 `toBeNull()`；
> ③ `nextjs-pickball/lib/auth/session-store.test.ts`「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」→「帶提示等待逾時仍未取得 session 時快照改為無法確認」，10 秒時的斷言改為無法確認快照並加斷言提示仍在。
> 三者對應的主 spec Scenario 標題沿用原名（openspec 不允許 MODIFIED 改名既有 Scenario），內容已在 delta spec 改寫。
>
> **本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成（§2.1、§2.3、§3.2、§3.12 等 RED 會 import 尚不存在的匯出或模組，或以 `null` 呼叫型別尚不允許的 mock，屬型別紅燈）。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/session-hint-failure-no-local-fallback`、工作樹除本 change artifact 外乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local` 成功；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck（test-plan C1）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（六個 project 各自數量）；回填 environment.md Verification 並 commit（`chore:`）
- [x] 1.2 對齊 main：確認 proposal Impact 列出的產品檔與測試檔自 `0de9ad9` 後未被其他提交改動（`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --stat 0de9ad9 HEAD -- nextjs-pickball/{lib,hooks,components,app,tests}` 只含本 change 的提交）；
  以 python difflib 比對本 change 九個 MODIFIED Requirement（`auth` 三個、`user-data-sync` 三個、`player-roster`、`round-lifecycle`、`scoreboard` 各一個）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate session-hint-failure-no-local-fallback --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  另以 Context7 查證並記錄：Playwright `route.fulfill({ status })`、`route.abort()`、`page.addInitScript`、`page.unrouteAll({ behavior: "ignoreErrors" })`；Next.js 16 的 page 模組只允許特定匯出（design Decision 9 不從 `page.tsx` 匯出 `mergeSyncStatus` 的根據）。與 design 假設不符時停止並回報
  - Context7 查證（§1 Implementer 實查，2026-11-09；verify 第一輪指出原本漏記，補記於此）：
    `route.fulfill({ status })` 的 status 預設 200、可指定任意狀態碼；`route.abort()` 的 errorCode 預設 `'failed'`；
    `page.addInitScript` 在文件建立後、頁面任何 script 執行前評估，每次導航與子 frame 附加或導航都會執行（符合「提示在下一個文件載入前寫入」）；
    `page.unrouteAll({ behavior: "ignoreErrors" })` 不等待進行中的 handler、之後的 handler 錯誤靜默吞掉，本機 playwright 1.60.0 的 `types.d.ts` 確認存在（v1.41 後）。
    Next.js 16 page 模組的匯出限制：Context7 查不到明文；改查本機 `next/dist/build/webpack/plugins/next-types-plugin/index.js`，生成的型別檢查以 `checkFields<Diff<…>>` 與 `Omit<T, keyof Base>` 比對 `never`，只允許 `default`、`generateMetadata`、`generateStaticParams` 等指定欄位——佐證 design Decision 9 不從 `page.tsx` 匯出 `mergeSyncStatus`（推論自型別生成程式碼，非官方文件逐字明文）。

## 2. session client、store 與儲存模式（lib 層）

Depends on: §1

- [x] 2.1 RED（TDD；含 改寫既有 it ①②③）：`nextjs-pickball/lib/auth/session-client.test.ts` 依檔頭授權改寫 ①②；`nextjs-pickball/lib/auth/session-store.test.ts` 依檔頭授權改寫 ③，並新增六個 it——
  「session 請求失敗且有上次登入提示時快照改為無法確認且保留提示」「session 請求失敗且沒有上次登入提示時快照為 auth 停用的 ready」「已登入使用中 refresh 失敗時快照改為無法確認且保留提示」
  「無法確認之後才到達的 session 回應仍照常採用」「chooseLocalFallback 在無法確認時改為本機備援並丟棄進行中請求的結果」「不是無法確認時呼叫 chooseLocalFallback 不改變快照也不通知」。
  兩檔各跑單檔 vitest，確認兩個改寫 it、一個改寫 it 與六個新 it 全紅、其餘既有 it 全綠並貼出輸出（新 it 放在新的 `describe` 並自帶 localStorage 清理；fake timers 於 `finally` 還原）
  - RED commit `c3e2570`（改寫既有 it ①②③）。紅燈：session-client.test.ts 2 failed（兩個改寫 it：`expected { authEnabled: false, user: null } to be null`）；session-store.test.ts 7 failed（改寫 it 逾時：`expected { status: 'loading' } to deeply equal {…}`；六個新 it：兩個 TypeError `null.authEnabled`／`chooseLocalFallback is not a function`、其餘快照不符或停在 loading）；其餘既有 it 全綠。regression guard：無（八個皆真紅）。mutation 見 §2.4 後。
- [x] 2.2 GREEN（TDD）：`fetchSession()` 回傳型別改為 `Promise<SessionState | null>`、失敗回 `null`（design Decision 1）；`session-store.ts` 依 design Decision 2、3、4、5 加入無法確認與本機備援快照、採用 `null` 的規則、逾時改為無法確認、`chooseLocalFallback()`；更新兩檔的檔頭與相關註解。
  2.1 全綠、兩檔既有 it 全綠；`hooks/useSession.test.ts` 全綠（不改）；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors
  - GREEN commit `e6fbc7e`。session-client 11/11、session-store 22/22、useSession 6/6 綠；tsc exit 0；改動檔 ESLint exit 0。
- [x] 2.3 RED（TDD）：`nextjs-pickball/lib/sync/storage-mode.test.ts` 新增兩個 it——「本機備援的 loading 快照為 local，無法確認的 loading 快照為 pending」「pendingDataStatus 在無法確認時為 unavailable，其餘為 pending」。
  單檔 vitest 貼出輸出：後者紅（import 不存在）；前者預期寫入即綠，點名標 regression guard（design Decision 6）
  - RED commit `5f451d9`。`pendingDataStatus` 新 it 紅（`TypeError: pendingDataStatus is not a function`）；「本機備援的 loading 快照為 local，無法確認的 loading 快照為 pending」寫入即綠（4 passed），**regression guard**。
- [x] 2.4 GREEN（TDD）：`resolveStorageMode` 的 loading 分支最前面加入本機備援判斷；新增 `pendingDataStatus`（design Decision 6）；更新檔頭註解。2.3 全綠；tsc exit 0；改動檔 ESLint 0 errors
  - GREEN commit `3e66dca`。storage-mode 5/5 綠；tsc exit 0；ESLint exit 0。
  - §2 mutation（單檔 vitest，三重落地檢查，每次還原後 git status 乾淨）：① 三處失敗分支（非 ok／catch／形狀不符）各改回 DISABLED 皆轉紅；② null 一律 ready 紅；③ null 清除提示 紅；④ null 改讀快照 signedInHint 紅（refresh 失敗那條）；⑤ 逾時回 LOADING 紅；⑥ 逾時遞增 requestId 紅；⑦ choose 不遞增 requestId 紅；⑧ choose 不檢查快照 紅；
    ⑨ `getSnapshot` 對無法確認／本機備援每次回新物件，各自轉紅（Stage 2 更正：「`load()` 採用 `null` 的分支改建新物件」維持綠，但**不是**等價變異——`chooseLocalFallback` 以參考比對無法確認快照，請求失敗後按鈕會失效；單元層只涵蓋逾時路徑，改由 §3 必做變異 ⑫ 以 `data-pending.spec.ts` 的 500 那條 E2E 涵蓋）；⑩ 本機備援改回 pending 紅（regression guard 轉紅）；補充：無法確認改回 local 紅；⑪ pendingDataStatus 一律 pending 紅。
    對照組（須維持綠）：`"unavailable" in snapshot && snapshot.unavailable` 改寫維持綠；調換 resolveStorageMode 本機備援與提示判斷順序維持綠。
- [x] 2.5 REFACTOR：store 中「採用一份結果」的分支（非 `null`／`null`＋提示／`null` 無提示）是否以 if/else 清楚表達、無巢狀三元；union 型別窄化寫法全檔一致；`resolveStorageMode` 與 `pendingDataStatus` 是否值得共用判斷（預期不抽：一個回儲存模式、一個回顯示狀態）；無壞味道則註記 skipped
  - skipped：採用結果分支以 if/else 表達、無巢狀三元；union 以 `?: never` 補齊，全檔一致；`resolveStorageMode` 與 `pendingDataStatus` 不抽共用（一個回儲存模式、一個回顯示狀態）。

## 3. 顯示狀態、按鈕、選擇器、對戰頁與本機提示

Depends on: §2

- [x] 3.1 RED（TDD，E2E）：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts` 既有的訪客 describe 內新增 test「有上次登入提示而 session 請求失敗時先擋住畫面，按下先用這台裝置的資料後顯示本機名單與本機提示」「有上次登入提示而 session 請求網路中斷時顯示無法載入提示與按鈕」（寫法依 test-plan「E2E 共同要求」）。
  雙鎖下 `--project=chromium` 跑該檔並貼出輸出：兩條新 test 紅、既有五條綠
  - RED commit `1021096`。chromium 單檔 E2E：兩條新 test 紅（`main[data-sync-status="unavailable"]` 找不到），既有五條綠；regression guard：無。（首次嘗試因 heavy.py 排隊後 webServer 逾時 120s，非測試結果，重跑得上述結果。）
- [x] 3.2 RED（TDD）：`nextjs-pickball/lib/sync/sync-status.test.ts` 新增 it「unavailable 取代內容，按鈕與本機提示文案為固定值」；`nextjs-pickball/components/sync/SyncStatusNotice.test.tsx` 新增 it「unavailable 顯示無法載入雲端資料與先用這台裝置的資料按鈕，按下後呼叫 chooseLocalFallback」。兩檔單檔 vitest 確認紅燈並貼出輸出
  - RED commit `1895de8`。sync-status：`isContentBlocked("unavailable")` 得 false；SyncStatusNotice：status 文字為空；皆真紅，regression guard：無。
- [x] 3.3 GREEN（TDD）：`sync-status.ts` 的 `DataStatus` 加 `"unavailable"`、`isContentBlocked` 含它、新增兩個文案常數（design Decision 7）；`SyncStatusNotice` 依 design Decision 8 渲染 `unavailable`（加 `"use client"`）。
  為通過型別所需的最小改動：`hooks/useRoundStore.ts` 傳給雲端 hook 的名單狀態在 `unavailable` 時與 `pending` 同樣以 `loading` 傳入（design Decision 9）。3.2 全綠、兩檔既有 it 全綠；tsc exit 0
  - GREEN commit `17ca0f4`（useRoundStore 的 `unavailable`→`loading` 對應併入 `2319c84`）。兩檔 6/6 綠。**注意**：既有 it「pending、loading、load-failed 取代內容…」的 `Record<DataStatus, boolean>` 型別標註會因 DataStatus 加值而 tsc 失敗，僅把該標註改為 `Record<Exclude<DataStatus, "unavailable">, boolean>`（名稱、斷言與其他 setup 不變），已在回報中請 coordinator 確認。**coordinator 裁定：接受**——只改型別標註、行為不變，且不改則主 worktree 的 tsc 無法通過；不視為改寫既有 it（Stage 1 已核實只改標註）。
- [x] 3.4 RED（TDD）：`nextjs-pickball/hooks/useRosterStore.test.tsx` 新增三個 it——「session 無法確認時 syncStatus 為 unavailable 且不回傳本機名單也不發請求」「已登入使用中 session 轉為無法確認時不交出先前的雲端名單且操作不發請求」「選擇先用這台裝置的資料後回傳本機名單且 syncStatus 為 local」。
  單檔 vitest 貼出輸出：前兩個紅；第三個預期寫入即綠，點名標 regression guard
  - RED commit `6c6f9e6`。前兩個真紅（`pending`≠`unavailable`；殘留雲端名單 `[c1]`≠`[]`）；「選擇先用這台裝置的資料後回傳本機名單且 syncStatus 為 local」寫入即綠，**regression guard**。
- [x] 3.5 GREEN（TDD）：`useRosterStore` 等待中分支明確回傳空名單、`syncStatus` 為 `pendingDataStatus(session)`（design Decision 9）；更新「沿用未啟用的雲端 hook 結果，它從未啟用過」的註解。3.4 全綠、該檔既有 it 全綠；tsc exit 0
  - GREEN commit `0567708`。useRosterStore 19/19 綠。
- [x] 3.6 RED（TDD）：`nextjs-pickball/hooks/useRoundStore.test.tsx` 新增 it「session 無法確認時 syncStatus 為 unavailable 且不回傳本機回合與歷史」。單檔 vitest 確認紅燈並貼出輸出
  - RED commit `1d69669`。`expected 'pending' to be 'unavailable'`，真紅。
- [x] 3.7 GREEN（TDD）：`useRoundStore` 等待中分支 `syncStatus` 改為 `pendingDataStatus(session)`；同步更新註解。3.6 全綠、該檔既有 it 全綠；tsc exit 0
  - GREEN commit `2319c84`。useRoundStore 全綠。
- [x] 3.8 RED（TDD）：`nextjs-pickball/hooks/useScoreboardStore.test.tsx` 新增 it「session 無法確認時 syncStatus 為 unavailable 且不回傳本機計分，帶 matchId 時綁定狀態為 pending」。單檔 vitest 確認紅燈並貼出輸出
  - RED commit `f5f8ad3`。`expected 'pending' to be 'unavailable'`，真紅。
- [x] 3.9 GREEN（TDD）：`useScoreboardStore` 等待中分支的顯示狀態改為 `pendingDataStatus(session)`。3.8 全綠、該檔既有 it 全綠（含「session 等待中時多次 render 回傳同一個 state 參考」）；tsc exit 0
  - GREEN commit `37ee625`。useScoreboardStore 全綠（含同一 state 參考 it）。
- [x] 3.10 RED（TDD）：新檔 `nextjs-pickball/app/matchmaker/page.test.tsx`，it「session 無法確認時對戰頁以無法載入提示與按鈕取代場次舞台」（寫法依 test-plan 該列；若有子模組以 stub 取代，紀錄中逐一列出與理由）。單檔 vitest 確認紅燈並貼出輸出（此時選擇器已回 `unavailable`，紅因是優先序落到 `local`）
  - RED commit `db51c86`。`main[data-sync-status="unavailable"]` 找不到（優先序落到 `local`），真紅。無需 stub 任何子模組，只 mock `useSession` 與 `next/navigation` 的 `useRouter`。
- [x] 3.11 GREEN（TDD）：`app/matchmaker/page.tsx` 的 `SYNC_STATUS_PRIORITY` 第一位加入 `"unavailable"`（design Decision 9）。3.10 全綠；tsc exit 0；改動檔 ESLint 0 errors
  - GREEN commit `8a88a7b`。page.test 1/1 綠；ESLint 0 errors。
- [x] 3.12 RED（TDD）：新檔 `nextjs-pickball/components/sync/LocalFallbackBanner.test.tsx`，it「只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染」。單檔 vitest 確認紅燈（模組不存在）並貼出輸出
  - RED commit `54bc0b1`。模組不存在（import 解析失敗），真紅。
- [x] 3.13 GREEN（TDD）：新增 `components/sync/LocalFallbackBanner.tsx`，並在 `app/layout.tsx` 的 `<body>` 內、`SiteNavbar` 之後、`ViewTransition` 之外掛載（design Decision 10）。3.12 全綠；tsc exit 0；改動檔 ESLint 0 errors
  - GREEN commit `aeef1ba`。Banner 1/1 綠；tsc exit 0；改動檔 ESLint 0 errors（僅既有 `_arg` 警告）。
- [x] 3.14 驗證：雙鎖下 `--project=chromium` 重跑 `data-pending.spec.ts` 全檔，七條全綠並貼出輸出
  - 雙鎖下 chromium 跑 data-pending.spec.ts：7 passed（16.3m，含排隊等待另一專案的鎖）。
- [x] 3.15 REFACTOR：三個選擇器等待中分支的寫法是否一致（具名 `mode`／顯示狀態變數與 if，不用巢狀三元）；`SyncStatusNotice` 兩種回傳形態是否清楚；舊註解是否已更新；無壞味道則註記 skipped
  - skipped：三個選擇器等待中分支皆以具名呼叫 `pendingDataStatus(session)`、無巢狀三元；`SyncStatusNotice` 兩種回傳形態清楚；舊註解已更新。
  - §3 mutation（單檔 vitest／單檔 E2E，三重落地檢查，每次還原後 git status 乾淨）：① isContentBlocked 漏 unavailable 紅；② Notice 不渲染按鈕 紅；③ 按鈕放進 role="status" 內 紅；④ onClick 不呼叫 chooseLocalFallback 紅；⑤ 名單等待中沿用 remote.players 紅；⑥ 名單等待中 syncStatus 寫死 pending 紅；⑦ 回合 寫死 pending 紅；⑧ 計分板 寫死 pending 紅；⑨ SYNC_STATUS_PRIORITY 拿掉 unavailable 紅；⑩ Banner 在無法確認時也渲染 紅；
    ⑪ layout 不掛 LocalFallbackBanner：500 那條 E2E 紅（本機提示 getByText 找不到）；⑫ load() 的 null＋提示分支每次建新物件：同一條 E2E 紅（按鈕按下後本機甲不可見）。對照組 isContentBlocked 改為四值 includes：維持綠。
  - Stage 1 PASS、Stage 2 PASS（無必修）。Stage 2 三項建議由 coordinator 處理：`SyncStatusNotice` 新 it 補斷言按鈕 `type="button"`（regression guard，加入即綠；X1 變異原本漏網）；`unavailable` 分支 `className` 套在外層容器的差異補註解；`data-pending.spec.ts` 內 helper 改名 `readHintRaw` 以免與 `lib/auth/session-hint` 的 `readSignedInHint` 混淆（僅改名）。

## 4. 歷史頁與資料頁

Depends on: §3

- [x] 4.1 RED（TDD）：`HistoryModeSwitch.test.tsx` 新增 it「session 無法確認時顯示無法載入提示與按鈕且不渲染歷史」；`JsonBackupSection.test.tsx` 新增 it「session 無法確認時以無法載入提示與按鈕取代匯出與還原操作」；
  `HistoryCsvSection.test.tsx` 新增 it「session 無法確認時以無法載入提示與按鈕取代匯出操作」；`RosterCsvImportSection.test.tsx` 新增 it「session 無法確認時以無法載入提示與按鈕取代選檔與確認匯入」（皆在 `nextjs-pickball/components/matchmaker/`，新 it 放入各檔既有的「等待中」describe 或新開「無法確認」describe）。
  四檔各跑單檔 vitest，確認四個新 it 全紅並貼出輸出
  - RED commit `9a69264`。四檔各 1 failed（`expected '正在載入資料…' to be '無法載入雲端資料，請重新整理頁面'`），既有 it 全綠；四個新 it 皆真紅，regression guard：無。（新 it 放入各檔既有的「等待中」describe 或 HistoryModeSwitch 既有 describe。）
- [x] 4.2 GREEN（TDD）：四個元件 `mode === "pending"` 分支的 `data-sync-status` 與 `SyncStatusNotice status` 改為 `pendingDataStatus(session)` 的值（`HistoryModeSwitch` 先取 `const session = useSession()`；判斷位置不變，仍在所有 hook 之後；design Decision 9）。4.1 全綠、四檔既有 it 全綠；tsc exit 0；改動檔 ESLint 0 errors
  - GREEN commit `d0c9628`。四檔 2/6/6/2 全綠；tsc exit 0；改動檔與四個測試檔 ESLint exit 0。
  - §4 mutation（單檔 vitest，三重落地檢查，每次還原後 git status 乾淨）：① HistoryModeSwitch 容器與提示寫死 pending 紅；② JsonBackupSection 紅；③ HistoryCsvSection 紅；④ RosterCsvImportSection 紅；另單獨只改容器屬性（①b）、只改提示（③b）各自皆紅。對照組 `pendingDataStatus(session)` 改寫為 `=== "unavailable" ? "unavailable" : "pending"` 維持綠。
- [x] 4.3 REFACTOR：四處等待中分支的寫法是否一致（同一個具名變數、同樣的屬性順序）；是否值得抽共用元件（預期不抽：各兩三行 JSX）；無壞味道則註記 skipped
  - skipped：四處等待中分支皆以同名 `pendingStatus` 先取值再用於 `data-sync-status` 與 `SyncStatusNotice status`，屬性順序一致；不抽共用元件（各兩三行 JSX）。
  - Stage 1 PASS、Stage 2 PASS（皆無必修、無建議項）。

## 5. 文件同步、總驗收與合併

Depends on: §4

- [x] 5.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`——儲存三態條目補「session 無法確認（有提示而請求失敗或逾時）時儲存模式仍為 `pending`、顯示狀態為 `unavailable`，以失敗文案＋『先用這台裝置的資料』取代內容；按下後為本機備援（`local`），root layout 顯示 `LocalFallbackBanner`」；
  歷史頁與統計頁條目的 `pending` 說明補 `unavailable`；`isContentBlocked` 的列舉（兩處）補 `unavailable`；`lib/auth/` 補「`fetchSession` 失敗回 `null`、`chooseLocalFallback`」、`lib/sync/` 補 `pendingDataStatus`、`DataStatus` 的 `unavailable` 與兩個文案常數、`components/sync/` 補 `LocalFallbackBanner`。commit（`docs:`）
  - 結果：`nextjs-pickball/CLAUDE.md` 已補儲存三態（無法確認、`chooseLocalFallback`、`LocalFallbackBanner`）、歷史頁與統計頁 `unavailable`、`isContentBlocked` 兩處、`lib/auth/`、`lib/sync/`、`components/sync/`；commit `c835c7d`（`docs:`）。
- [x] 5.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  - 2026-11-11 gate（HEAD `3148070`）：`-r exec tsc`、hono-pickball typecheck、pickball-core typecheck 皆 exit 0。
- [x] 5.3 驗收（指令）C2：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint` 0 errors、warning 不多於基線
  - 同次 gate：lint 0 errors／3 warnings（與基線相同，皆既有 unused-vars）。
- [x] 5.4 驗收（指令）C3：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test` 全綠；前端檔數＝基線＋2、測試數＝基線＋21，後端與核心與基線相同
  - 同次 gate：前端 119 檔／1184 tests（基線 117／1163，＋2 檔、＋21），後端 27／223、核心 10／27 與基線相同，全綠。
- [x] 5.5 驗收（指令）C4：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build` exit 0；建置後 `git status --porcelain` 為空
  - 同次 gate：`pnpm build` exit 0；建置後 `git status --porcelain` 為空。
- [x] 5.6 驗收（指令）C5（coordinator）：建立 `/tmp/cgate-session-hint-failure-no-local-fallback.e2e`（照 `/tmp/cgate-session-pending-loading.e2e` 複製）後執行 `/tmp/cgate2.sh session-hint-failure-no-local-fallback`；
  五個 browser project 各＝基線＋2、0 failed（skip 只限既有瀏覽器條件）；user-data＝基線、全 passed、0 skipped。結果寫在本 task 後方；失敗不得自行判定為雜訊，附證據裁定
  - 第一次 gate（2026-11-09 12:28 起，結果保存於 `/tmp/cg-session-hint-failure-no-local-fallback.prev/`）：E2E 各 project 皆有失敗、build 失敗。逐項查證為執行環境問題，非本 change：
    當時機器嚴重過載（tsc 平常 4s 跑 937s、chromium 平常約 2 分跑 27.3 分、user-data 出現 `browserType.launch: Timeout 180000ms exceeded`），失敗訊息集中在後端回 503（console 守衛與 `取得目前帳號失敗，HTTP 503`）與逾時；build 失敗於下載 Google Fonts（網路）。
    負載恢復後同一 HEAD 先單獨重跑 chromium（167 passed）與 build（exit 0）再重跑整個 gate，全部通過，判定為環境因素。
  - 第二次 gate（2026-11-11 11:31–11:52，HEAD `3148070`，`/tmp/cgate2.sh`）：chromium 167 passed；firefox 154 passed／13 skipped；mobile-chrome 164／3；webkit 三片 51／5、48／8、55／0（共 167）；mobile-safari 三片 51／5、48／8、55／0（共 167）；user-data 48 passed、0 skipped；0 failed。
    五個 browser project 各為基線 165＋2；skip 數與基線相同（既有瀏覽器條件）。
- [x] 5.7 驗收（指令）C6：`resolveStorageMode(` 使用端集合恰為 test-plan C6 的 9 個檔案
  - 指令：`grep -rln "resolveStorageMode(" nextjs-pickball/{app,components,hooks} | grep -v "\.test\."`。結果：恰 9 檔（stats/page.tsx、HistoryModeSwitch、LocalDataImportSection、JsonBackupSection、RosterCsvImportSection、HistoryCsvSection、useRoundStore、useScoreboardStore、useRosterStore），與預期一致。
- [x] 5.8 驗收（指令）C7：`pendingDataStatus(` 使用端恰為 7 個檔案；`"unavailable"` 字樣只出現在 test-plan C7 列出的位置
  - 指令：`grep -rln "pendingDataStatus(" …/{app,components,hooks} | grep -v "\.test\."`。結果：恰 7 檔（HistoryModeSwitch、JsonBackupSection、RosterCsvImportSection、HistoryCsvSection、useScoreboardStore、useRoundStore、useRosterStore），與預期一致。
  - 指令：`grep -rn "unavailable" …/{app,components,hooks} | grep -v "\.test\."`。結果：app/matchmaker/page.tsx（38 註解、40 優先序）、hooks/useRoundStore.ts:450、components/sync/SyncStatusNotice.tsx（24 註解、28 按鈕分支）符合白名單；另出現 `components/auth/LoginForm.tsx:82` 的 `result.reason === "unavailable"`，為登入結果欄位、與本 change 無關，未列入 test-plan C7 白名單，已回報 coordinator 裁定，未改 test-plan 或產品碼。
- [x] 5.9 驗收（指令）C8：範圍 diff 輸出為空
  - 指令：C8 範圍 `git diff main --stat -- <test-plan C8 列出的路徑>`。結果：輸出為空（exit 0），與預期一致。
- [x] 5.10 驗收（指令）C9：`DO_NOT_TRACK=1 openspec validate session-hint-failure-no-local-fallback --strict` 通過
  - 指令：`DO_NOT_TRACK=1 openspec validate session-hint-failure-no-local-fallback --strict`（repo root）。結果：`Change 'session-hint-failure-no-local-fallback' is valid`，exit 0。
- [x] 5.11 驗收（指令）C10：`fetchSession(` 的產品呼叫端只有 `lib/auth/session-store.ts`
  - 指令：C10 `grep -rn "fetchSession(" …/{app,components,hooks,lib} | grep -v "\.test\." | grep -v "export async function"`。結果：只有 `lib/auth/session-store.ts:88`，與預期一致。
- [x] 5.12 Final Code Review（opus，依 execution-plan）：結論與處置寫在本 task 後方；必修項處理並 commit 後才勾選
  - Final Code Review（opus）：第一次 FAIL，唯一必修為 `nextjs-pickball/CLAUDE.md` 把 `pendingDataStatus` 寫在 `sync-status` 名下（實際在 `storage-mode.ts`）；建議兩項：`session-store.ts` 型別註解未提 `LocalFallbackBanner` 直接讀 `localFallback`、tasks 3.3 未記 coordinator 裁定。三項皆已修正（本 task 的 commit）。程式碼無必修；C6、C7、C8、C10 由 reviewer 重跑一致；範圍 ⊆ Impact、主 spec 無改動、新 it 21 個與 gate 計數一致。修正只涉及文件與註解，不需重跑 gate。

- [ ] 5.13 `/opsx:verify`：critical／warning／suggestion 全部逐項查證並處理（修正 commit 記在本 task 後方），直到報告全清才勾選
  - verify 第一輪程式修正（Implementer，sonnet）：
    - 本機提示層級（TDD）：`63abb06 test:` 擴充 it「只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染」，單檔 vitest 真紅（`expect(root?.classList.contains("z-30")).toBe(true)` 收到 false，Tests 1 failed）；`2372c68 fix:` 把 `z-[100]` 改為 `z-30` 並註明低於 ActionBar z-40 與對話框 z-50，綠。`fixed`、`pointer-events-none`、`print:hidden` 三個 class 斷言與 auth 停用 ready 那一種預期為空，寫入即綠，標 regression guard。
    - 請求失敗後按按鈕：`259b5ae test:` 在 it「session 請求失敗且有上次登入提示時快照改為無法確認且保留提示」尾端補 `chooseLocalFallback()` 後快照為 `{ status: "loading", localFallback: true }`，寫入即綠，標 regression guard。
    - `7c9ba21 docs:` 在 `session-store.ts` 採用 `null` 後的 `notify()` 補註解（參考相同、useSyncExternalStore 略過、刻意保留，不改行為）。
    - mutation（三重落地檢查通過、每次還原且 status 乾淨）：`z-30`→`z-[100]` 紅；拿掉 `pointer-events-none` 紅；拿掉 `print:hidden` 紅；對照組 class 字串順序調換（`fixed pointer-events-none …`）綠；`load()` 的 `snapshot = LOADING_UNAVAILABLE` 改為每次新物件 `{ status: "loading", signedInHint: true, unavailable: true }` 紅；對照組 `readSignedInHint()` 改 `readSignedInHint() === true` 綠。
    - 驗收：兩個單檔 vitest 綠（2 檔 23 tests）、`pnpm -r exec tsc --noEmit` exit 0、改動檔 ESLint exit 0。
  - verify 第一輪（opus，2026-11-11）：CRITICAL 0、WARNING 1、SUGGESTION 7。處置：
    W1 §1.2 Context7 查證未記錄 → 補記於 1.2（`c8dfa4c`）。
    S1 本機提示 `z-[100]` 會蓋住計分板專注模式操作列（z-40）並浮在對話框遮罩（z-50）之上、窄螢幕兩行 → 規格／design／test-plan 改為 `z-30` 並更正風險敘述（`c8dfa4c`），程式 TDD 修正（`63abb06` RED、`2372c68` GREEN）。
    S2 提示版面 MUST 無測試鎖住 → 同一個 it 補 `fixed`、`pointer-events-none`、`print:hidden`、`z-30` 斷言與 auth 停用 ready（`63abb06`）。
    S3「請求失敗後按按鈕」單元層未覆蓋 → 補斷言（`259b5ae`，regression guard；原本漏網的 ⑨c 變異現已由單元測試轉紅）。
    S4 快照未變仍 notify → 補註解說明刻意保留、無害（`7c9ba21`）。
    S5 tasks 紀錄插錯位置 → 排版修正（`c8dfa4c`）。
    S6 execution-plan 審查清單未勾 → 註明為準則、實際結論見 tasks 紀錄（`c8dfa4c`）。
    S7 計分板與統計頁的 `unavailable` 阻擋無元件層測試 → **不採納**：兩者經選擇器取得 `unavailable` 後由既有 `isContentBlocked` 分支取代內容（Decision 9），選擇器已各有 `unavailable` 單元測試、`isContentBlocked` 含 `unavailable` 亦有單元測試，參賽者頁另有 E2E；再加元件測試只是重複同一條判斷，且會使前端測試數偏離 test-plan 定額。
    RED 機械複驗（coordinator）：`63abb06` 只動測試檔，產品檔在 RED 前後皆含 `z-[100]`。
- [ ] 5.14 合併（coordinator）：在 `main` 執行 `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball merge --no-ff change/session-hint-failure-no-local-fallback`，合併後由 coordinator 執行 archive；**不 push**（push 即觸發正式站部署，由使用者決定）
