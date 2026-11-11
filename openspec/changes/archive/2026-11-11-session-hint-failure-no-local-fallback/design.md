# Design: session-hint-failure-no-local-fallback

## Context

- 上一個 change（`session-pending-loading`，已封存於 `openspec/changes/archive/2026-11-08-session-pending-loading/`）加入「上次登入提示」（`auth:signed-in-hint:v1`，`lib/auth/session-hint.ts`）：
  有提示時 session store 的 client 初始快照為 `{ status: "loading", signedInHint: true }`，`resolveStorageMode` 回 `"pending"`，各頁顯示「正在載入資料…」。
- `lib/auth/session-client.ts` 的 `fetchSession()` 絕不 throw，**任何失敗**（非 200、JSON 錯誤、形狀不符、網路錯誤）回 `DISABLED = { authEnabled: false, user: null }`。
  store（`lib/auth/session-store.ts` 的 `load()`）採用後清除提示、轉為 ready → `"local"`。唯一呼叫端就是 `load()`（`grep -rn fetchSession nextjs-pickball/{app,components,hooks,lib}`，不含測試）。
- store 的逾時：`startHintTimer()` 在第一次訂閱時排 10 秒（`SIGNED_IN_HINT_WAIT_MS`）計時器，到期時若快照仍是 `LOADING_WITH_HINT` 就改為 `LOADING` 並通知 → `"local"`。
- 兩條路徑都讓登入者在不知情的情況下改看、改寫本機資料。使用者已定案：先擋住並顯示「無法載入雲端資料，請重新整理頁面」＋按鈕「先用這台裝置的資料」，按了才進本機模式並顯示「修改只會存在這台裝置」的提示；
  只有明確確認「未登入／auth 停用」（200 且形狀正確）才自動退回本機並清除提示；沒有提示的訪客完全不變。
- 只看 `session.status === "loading"` 的元件：navbar `components/layout/AccountEntry.tsx`（隱形佔位）、`components/auth/LoginForm.tsx`（`return null`）。
- `resolveStorageMode` 的 `"pending"` 使用端（上一個 change 的 Decision 2 表）：三個選擇器、`HistoryModeSwitch`、統計頁入口（`pending` 時掛 `LocalStatsContent`）、資料頁 `JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`；`LocalDataImportSection` 只看 `=== "remote"`。
- 選擇器的等待中分支沿用「未啟用的雲端 hook 結果」，前提是「雲端 hook 在第一次取得 session 之前從未啟用過，內部必為初始狀態」。
  **新狀態打破這個前提**：已登入使用中 `refresh()` 失敗會從 `"remote"` 回到 `"pending"`。查證 `hooks/useRemoteRosterStore.ts`：未啟用時回傳的 `players` 是 reducer 內殘留的上一輪雲端名單（只有 `mismatched` 時才換成 `NO_PLAYERS`）；
  `hooks/useRemoteRoundStore.ts` 未啟用時 `round` 為 `null`、`remoteMatchSlots` 為 `null`（無殘留）；`useScoreboardStore` 的等待中分支回傳模組常數（無殘留）。操作在三者皆因 controller 已於 effect cleanup 設為 `null` 或 `notReady()` 而不送出。
- 對戰頁 `app/matchmaker/page.tsx` 以 `SYNC_STATUS_PRIORITY.find(...) ?? "local"` 合併名單與回合狀態：陣列沒有列出的值會落到 `"local"`，而頁面在 `local` 時畫出主要內容。
- 計分板頁鎖高（`Scoreboard` 根元素 `h-dvh overflow-hidden`），navbar 為 `fixed`（`z-[110]`），計分回饋為 `fixed top-20 z-[120]`；root layout（`app/layout.tsx`）是 server component，`<body>` 內為 `SiteNavbar` 與 `ViewTransition` 包住的 `children`。
- `SyncStatusNotice` 沒有 `"use client"`，所有匯入者都是 client 元件。
- 專案慣例：localStorage 讀寫放 `lib/`；不在 render 期間讀 localStorage；避免巢狀三元；新 hook 要更新 `pickleball-guide-page` 的 hooks 歸屬清單（本 change 不新增 hook）。

## Goals / Non-Goals

**Goals**

- 有上次登入提示時，session 請求失敗（含已登入使用中重新取得失敗）或等待逾時，一律先擋住資料畫面，提供「先用這台裝置的資料」；按下前不交出本機資料、不啟用雲端、不發使用者資料請求。
- 按下後本次頁面期間以本機資料運作，並常駐顯示「修改只會存在這台裝置」；不被晚到的回應悄悄切回雲端。
- 只有 200 且形狀正確的「未登入／auth 停用」才清除提示並自動退回本機。
- 沒有提示的訪客：行為、DOM、時序完全不變。
- 沒處理新狀態的使用端只會顯示等待中，不會誤顯示本機資料（安全預設）。

**Non-Goals**

- 自動重試 session 請求、合併或上傳本機備援期間的修改、改後端、改 `/api/session` 契約。
- 改 navbar 帳號入口與登入頁（已知取捨，見 Decision 2）。
- 新增 hook、新增 npm 相依、migration。

## Decisions

### Decision 1：`fetchSession()` 失敗回 `null`，降級與否交給 store

**Choice**：回傳型別改為 `Promise<SessionState | null>`；成功同現在，任何失敗回 `null`，仍絕不 throw。`DISABLED` 常數從 client 移除（store 自行建立 fail-closed 的 ready 快照）。
既有兩個 it（期望回傳未啟用）改寫為期望 `null`（proposal 授權），是真紅。

**Rationale**：「這次無法確認」與「確認未登入」是兩種事實，只有 store 知道有沒有提示、能決定要不要降級；`null` 讓 TypeScript 強制唯一呼叫端處理。

**Alternatives considered**：
- 維持回傳 `DISABLED` 另加 `{ failed: true }` 欄位：`SessionState` 會帶到 ready 快照與 `useSession()` 回傳值，所有使用端都看得到一個不該看的欄位。不選。
- 失敗時 throw：違反「四個函式絕不 throw」的既有契約，呼叫端要補 try/catch。不選。
- 回傳 `{ ok: true, state } | { ok: false }`：與 `null` 等價但較冗長，且 `null` 已是本專案「沒有值」的慣用表達（`round: null`、`user: null`）。不選。

### Decision 2：store 以兩個 loading 快照表達「無法確認」與「本機備援」

**Choice**：`SessionSnapshot` 的 loading 變體擴充為 union：
`{ status: "loading"; signedInHint?: true }`、`{ status: "loading"; signedInHint: true; unavailable: true }`（`LOADING_UNAVAILABLE`）、`{ status: "loading"; localFallback: true }`（`LOADING_LOCAL_FALLBACK`），兩個新快照都是模組層級固定參考。
TypeScript 對 union 存取非共有欄位會報錯，實作可用 `?: never` 補齊各變體或以 `"unavailable" in snapshot` 判斷，由 Implementer 擇一並在各處一致。

**Rationale**：`status` 仍是 `"loading"`，只看 `status === "loading"` 的 `AccountEntry`、`LoginForm` 不必改（不碰 `components/layout/**`、`components/auth/**`）；
`resolveStorageMode` 對帶提示的 loading 本來就回 `"pending"`，無法確認快照必帶 `signedInHint` 所以**不改判斷就已是安全預設**——任何沒處理新狀態的使用端只會顯示等待中。
**已知取捨**：無法確認與本機備援時 navbar 帳號入口維持隱形佔位、登入頁空白（`LoginForm` 回 `null`），使用者沒有登入／登出入口；重新整理即重新確認 session。

**Alternatives considered**：
- 新增 `status: "unavailable"`／`"local-fallback"`：`AccountEntry`、`LoginForm` 與所有 `status === "ready"` 的窄化都要重審，`AccountEntry` 在 `status !== "loading"` 時會讀 `session.authEnabled`（新狀態沒有此欄位）。不選。
- 本機備援直接轉為 `{ status: "ready", authEnabled: false, user: null }`：等於假裝 auth 停用，navbar 與登入頁會顯示「未開放登入」的錯誤內容，且無從得知要顯示本機提示。不選。
- 另一個獨立 store 管理「使用者已選擇本機」：兩個 store 的組合狀態要在每個使用端合併，判斷散落。不選。

### Decision 3：採用 `null` 時於當下讀提示

**Choice**：`load()` 採用 `null` 時呼叫 `readSignedInHint()`：true → `LOADING_UNAVAILABLE`；false → `{ status: "ready", authEnabled: false, user: null }`。兩者都不寫入也不清除提示（沒有提示時清除本來就是 no-op，因此省略呼叫）。
非 `null` 的結果照舊：登入 → 寫入提示，其餘 → 清除。被 `requestId` 丟棄的回應不動提示與快照（既有守衛）。

**Rationale**：讀 localStorage 而不是讀快照的 `signedInHint`，才能涵蓋「已登入使用中 `refresh()` 失敗」（此時快照是 ready、不帶 `signedInHint`，但提示已在登入確認時寫入）。這正是原本會悄悄退回本機的另一條路徑（401 → `refresh()` → 失敗 → 未啟用）。

**Alternatives considered**：只看初始快照是否帶提示——漏掉 `refresh()` 失敗；失敗時沿用前一個快照（ready 已登入）——雲端 hook 會繼續以失效的 session 送出請求、反覆 401。皆不選。

### Decision 4：逾時改為無法確認，進行中的請求不取消

**Choice**：計時器到期且快照仍為 `LOADING_WITH_HINT` 時改為 `LOADING_UNAVAILABLE` 並通知；不遞增 `requestId`，之後到達的回應照常採用（非 `null` → ready；`null` → 仍為無法確認，同一參考）。`resetSessionStoreForTests()` 照舊清除計時器與快取。

**Rationale**：逾時只代表「等太久」，不代表請求失敗；回應晚到仍是最可信的資料，使用者還沒按按鈕前應直接轉入正確模式。

**Alternatives considered**：逾時後取消請求（`AbortController` 要改 `fetchSession` 簽章，且放棄可能就快到的正確回應）；不設逾時（違反「不得永遠停在等待中」）。皆不選。

### Decision 5：`chooseLocalFallback()` 只在無法確認時生效，並丟棄進行中的回應

**Choice**：新匯出 `chooseLocalFallback(): void`：快照不是 `LOADING_UNAVAILABLE` 時直接 return（不改快照、不通知、不動 `requestId`）；是的話 `requestId += 1`、`clearHintTimer()`、快照改為 `LOADING_LOCAL_FALLBACK`、通知。不碰提示。
之後只有明確呼叫的 `refresh()` 會再改變快照（結果依 Decision 3 採用，失敗且有提示時會回到無法確認）。實務上本機備援期間沒有入口會呼叫 `refresh()`：雲端 hook 未啟用、登入入口為佔位。

**Rationale**：使用者已明確選擇本機，晚到的回應若把畫面切回雲端，會讓剛才在本機做的修改「消失」在另一個資料來源裡，比停留在本機更令人困惑；重新整理即可再次連線雲端，提示文案也這樣告知。
命名不以 `use` 開頭：它是 store 函式不是 hook，以免被 `react-hooks` 規則與 hooks 歸屬清單誤認。

**Alternatives considered**：
- 晚到的成功回應仍切回雲端：見上，且本機修改不會上雲，使用者以為已存。不選。
- 由元件持有「已選擇本機」的 state：每一頁各自持有、換頁即遺失，且 `resolveStorageMode` 拿不到。不選。
- 名稱 `useLocalDataFallback`：不是 hook 卻以 `use` 開頭，違反 hooks 命名慣例。不選。

### Decision 6：儲存模式與等待中顯示狀態

**Choice**：`resolveStorageMode` 的 loading 分支最前面加「`localFallback === true` → `"local"`」，其餘判斷不變（無法確認因帶提示而為 `"pending"`）。
`lib/sync/storage-mode.ts` 新增 `pendingDataStatus(snapshot: SessionSnapshot): "pending" | "unavailable"`：無法確認快照 → `"unavailable"`，其餘 → `"pending"`。

**Rationale**：helper 讀的是 session 快照，與 `resolveStorageMode` 同一層；`sync-status.ts` 維持「只描述顯示狀態、不認識 session」的純模組（它目前不 import 任何東西），`storage-mode.ts` 本來就 import `SessionSnapshot`，再 import `DataStatus` 型別不會形成循環。
使用端只問 helper，不自行讀 `unavailable` 欄位，判斷只有一處。
本機備援判斷放最前面、無法確認不改判斷，因此 `resolveStorageMode` 的兩條新斷言在現行程式碼下就會成立——對應 it 誠實標為 regression guard（tasks 不得偽造紅燈）。

**Alternatives considered**：
- helper 放 `sync-status.ts`：純顯示模組要開始 import session 型別。不選。
- 讓 `resolveStorageMode` 回第四態 `"unavailable"`：9 個使用端都以字串比較二分，加值不會讓既有比較在 tsc 期報錯，漏處理的使用端會把它當成 `local` 或 `remote` 以外的「其他」——正是要避免的；維持 `"pending"` 才是安全預設。不選。

### Decision 7：顯示狀態 `unavailable` 與兩個新文案

**Choice**：`lib/sync/sync-status.ts`：`DataStatus = SyncStatus | "pending" | "unavailable"`；`isContentBlocked` 加入 `unavailable`；新增常數 `LOCAL_FALLBACK_ACTION_LABEL = "先用這台裝置的資料"`、`LOCAL_FALLBACK_NOTICE = "目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端"`。
無法確認的提示文字沿用 `syncStatusMessage("load-failed")`。

**Rationale**：放在 `DataStatus` 而非 `SyncStatus`：雲端 hook 不會回報它；且既有 it「local、synced、saving 不顯示提示，其餘狀態各有固定文案」以 `Record<SyncStatus, …>` 與 `toHaveLength(8)` 鎖住，不能加值。沿用既有失敗文案，新文案只有使用者定案的兩句。

**Alternatives considered**：沿用 `load-failed` 這個值（無從區分要不要顯示按鈕，雲端載入失敗時也會冒出「先用這台裝置的資料」）；另立「無法確認登入狀態」文案（使用者已定案沿用既有文案）。皆不選。

### Decision 8：`SyncStatusNotice` 在 `unavailable` 時多一顆按鈕

**Choice**：`unavailable` 時回傳一個容器：`role="status"` 的文案元素（外觀同現在）＋其**外**的 `Button`（`components/ui/button`，`type="button"`），`onClick` 直接呼叫 `chooseLocalFallback()`。其他狀態輸出與現在逐字相同。
因為元件開始帶事件處理器，檔頭加 `"use client"`（所有匯入者本來就是 client 元件，行為不變）。

**Rationale**：按鈕放在 live region 之外，避免螢幕報讀器在內容更新時重複朗讀互動元素；直接呼叫 store 函式，不必把 callback 經 8 個使用端一路傳下去。

**Alternatives considered**：新增 `onUseLocalData` prop 由使用端傳入（8 個使用端各接一次線，漏接就沒有按鈕）；把按鈕放進 `role="status"` 內（a11y 不佳）。皆不選。

### Decision 9：使用端改用 `pendingDataStatus`，名單等待中明確回傳空名單

**Choice**：
- `useRosterStore`：`mode === "pending"` 時回傳 `{ ...remote, players: NO_PLAYERS, droppedCount: 0, syncStatus: pendingDataStatus(session) }`（`NO_PLAYERS` 為模組常數空陣列，多次 render 參考穩定）。
- `useRoundStore`：等待中回傳 `{ ...remote, syncStatus: pendingDataStatus(session) }`（雲端回合 hook 未啟用時 `round`、`remoteMatchSlots` 本來就是 `null`）；傳給雲端 hook 的 `rosterSyncStatus` 在 `pending` 或 `unavailable` 時皆以 `loading` 傳入（`SyncStatus` 型別強制要處理）。
- `useScoreboardStore`：等待中回傳 `[PENDING_STATE, doNothingDispatch, pendingBinding, pendingDataStatus(session)]`，其餘不變。
- `HistoryModeSwitch`、`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`：`mode === "pending"` 分支的 `data-sync-status` 與 `SyncStatusNotice status` 改為 `pendingDataStatus(session)` 的值（`HistoryModeSwitch` 改為先取 `const session = useSession()`）。
- `app/matchmaker/page.tsx`：`SYNC_STATUS_PRIORITY` 第一位加入 `"unavailable"`。
- 參賽者頁、統計頁（`LocalStatsContent`）、`RemoteStatsContent`、`Scoreboard`：不改，經 `isContentBlocked` 與 `data-sync-status={syncStatus}` 自動正確。

**Rationale**：名單明確回傳空陣列是因為 Context 所述的殘留名單；內容雖被 `isContentBlocked` 取代而看不到，但 spec 承諾「`players` 為空陣列」，且統計、對戰頁會拿 `players` 做其他計算（例：對戰頁 `useRoundStore` 的 `players` 參數）。
對戰頁的優先序不是型別強制的（`find(...) ?? "local"`），漏列會畫出空舞台——以頁面層級的單元測試鎖住（`app/matchmaker/page.tsx` 不能匯出 `mergeSyncStatus`：Next.js 的 page 模組只允許特定匯出）。

**Alternatives considered**：
- 名單等待中仍沿用 `remote.players`：殘留名單會被交給呼叫端。不選。
- 把 `SYNC_STATUS_PRIORITY` 改成 `Record<DataStatus, number>` 讓 tsc 強制：屬順手重構，改動既有比較邏輯；以測試與 mutation 鎖住即可。不選。

### Decision 10：本機提示 `LocalFallbackBanner` 掛在 root layout

**Choice**：新 client 元件 `components/sync/LocalFallbackBanner.tsx`：以 `useSession()` 判斷，只有 `status === "loading"` 且 `localFallback === true` 時渲染
`<div role="status">{LOCAL_FALLBACK_NOTICE}</div>`，其餘 `return null`。外觀：`fixed` 於視窗底部置中（例 `fixed inset-x-0 bottom-4 flex justify-center px-4`），
`pointer-events-none`、`print:hidden`，`z-index` 為 `z-30`：高於一般頁面內容，低於計分板專注模式操作列（`ActionBar` 的 `z-40`）與對話框遮罩（shadcn Dialog／AlertDialog 的 `z-50`），更低於 navbar（`z-[110]`）與計分回饋（`z-[120]`）——沿用 `ActionBar` 註解「浮動元素要低於 z-50 對話框」的慣例；樣式比照 `SyncStatusNotice` 的卡片外觀。
`app/layout.tsx` 在 `<body>` 內、`SiteNavbar` 之後、`ViewTransition` 之外放 `<LocalFallbackBanner />`（不參與換頁動畫，換頁時常駐）。

**Rationale**：
- 本機備援影響所有資料頁，提示必須跨頁常駐；root layout 是唯一不必改 8 個頁面的位置。
- 固定定位不佔版面：計分板 `h-dvh overflow-hidden` 的零捲動版面不受影響；`pointer-events-none` 讓下方按鈕照常可按（「非阻斷」）；`print:hidden` 不污染列印成果（`visual-export`）。
- 伺服器輸出與 hydration 那次 render 的快照不可能是本機備援（只能由使用者點擊進入），元件輸出 `null`，不影響 hydration；useSession 本來就由 navbar 訂閱，不會多發請求。
- 專注模式（navbar 隱藏）時仍顯示：使用者仍在改本機資料。

**Alternatives considered**：
- 各頁以 `SyncStatusNotice` 疊加：需要一個「本機但要顯示提示」的新顯示狀態，與「`local` 時不渲染任何同步元素」衝突，且 8 個使用端各接一次。不選。
- 放進 navbar：屬 `components/layout/**`（Impact 不改清單），專注模式下 navbar 隱藏，窄螢幕沒有空間。不選。
- 可關閉的 toast：要多一個關閉按鈕文案與狀態，關掉後使用者容易忘記修改不會上雲。不選。
- 置頂（navbar 下緣）：會蓋住各頁標題與計分回饋（`top-20`）。不選。

### Decision 11：提示（hint）清除規則

**Choice**：只有採用非 `null` 且非登入的結果才清除；`null`、逾時、`chooseLocalFallback()` 皆不清除；`signOut()` 2xx 清除不變；`CLEAR_ALL_KEYS` 不變。

**Rationale**：提示代表「上次確認時是登入狀態」，失敗並沒有推翻這個事實；保留它，下一次重新整理才會再次先等待 session，而不是直接把本機資料交給登入者。

**Alternatives considered**：按下按鈕時清除（下一次重新整理會直接顯示本機資料，重演本 change 要修的問題）；失敗時清除（現行行為）。皆不選。

### Decision 12：測試策略

**Choice**：
- 無法確認的共同 mock：`{ status: "loading", signedInHint: true, unavailable: true, hydrated: true, refresh }`；本機備援：`{ status: "loading", localFallback: true, hydrated: true, refresh }`（§2 GREEN 後型別合法）。
- store：沿用既有 `vi.mock("./session-client")` 與 Promise resolver 寫法；逾時以 fake timers，`finally` 還原；晚到回應以 `vi.advanceTimersByTimeAsync(0)` 或兩次 `await Promise.resolve()` 推進微任務。
- `SyncStatusNotice`：以 `vi.mock("@/lib/auth/session-store", async (importOriginal) => ({ ...(await importOriginal()), chooseLocalFallback: vi.fn() }))` 替換後點擊。
- 對戰頁：新檔 `app/matchmaker/page.test.tsx`，比照 `app/matchmaker/stats/page.test.tsx` 以 module mock 取代 `useSession`；`next/navigation` 的 `useRouter` 以 mock 取代；若頁面子模組在 happy-dom 下無法載入，以 stub 取代該子模組（阻斷分支在 render 主要內容之前就 return）。
- E2E：在 `data-pending.spec.ts` 既有 describe 內新增兩條；本機資料以既有 `seedStorage` 寫入，提示以 `addInitScript` 在下一個文件載入前寫入（理由同既有「提示殘留」那條），`page.route("**/api/session", …)` 在 `seedStorage` **之後**註冊（`route.fulfill({ status: 500 })` 與 `route.abort()`），`finally` 內 `page.unrouteAll({ behavior: "ignoreErrors" })`；web-first 斷言，SHALL NOT `waitForTimeout`。逾時 10 秒只做單元測試。
- 授權改寫的既有 it 僅三個（proposal Impact）：改名與改斷言視為該 it 的 RED（產品碼未改前必紅），紀錄中標「改寫既有 it」。

### Decision 13：spec 切法與 Scenario 標題限制

**Choice**：新行為集中在 `user-data-sync` 新增的「session 無法確認時的阻擋畫面與本機備援」；與新行為字面衝突的既有句子以 MODIFIED 改寫（`auth` 三個、`user-data-sync` 三個、`player-roster`／`round-lifecycle`／`scoreboard` 各一個，後三者各只改兩句）。
openspec validator 不允許 MODIFIED 刪除或改名既有 Scenario（archive 會拒絕），因此 `auth` 的三個 Scenario（「任何失敗都降級為未啟用」「signInMethods 形狀不符時降級為未啟用」「帶提示等待逾時後回到不帶提示的 loading」）**標題沿用原名**，內容改為新行為並加註；對應的 it 名稱則改為新語意。

**Alternatives considered**：REMOVED 整個 Requirement 再 ADDED 新名稱：其他 capability 以名稱引用這些 Requirement，會一起失效。不選。

## Risks / Trade-offs

- [Risk] 後端或網路長時間異常時，帶提示的登入者每次重新整理都先看到阻擋畫面 → Mitigation：按鈕一鍵進入本機備援；使用者已定案此行為。
- [Risk] 無法確認與本機備援時 navbar 帳號入口為佔位、登入頁空白，使用者無法登入或登出 → Mitigation：重新整理即重新確認；記為已知取捨（Decision 2），不改 `components/layout/**`、`components/auth/**`。
- [Risk] 沒處理新狀態的使用端 → Mitigation：無法確認時儲存模式仍為 `"pending"`（安全預設）；`DataStatus` 加值使 `useRoundStore` 的 `rosterSyncStatus` 對應在 tsc 期報錯；對戰頁優先序以頁面測試與 mutation 鎖住；Final review 以 grep 比對 `resolveStorageMode(` 使用端集合。
- [Risk] 已登入使用中轉為無法確認時，未啟用的雲端名單 hook 殘留雲端名單 → Mitigation：Decision 9 明確回傳空名單，新 it 為真紅。
- [Risk] 本機備援期間若有東西呼叫 `refresh()` 且失敗，會回到阻擋畫面 → 目前沒有入口會呼叫（雲端 hook 未啟用、登入入口為佔位）；接受並記錄。
- [Risk] `route.abort()` 或 500 在部分瀏覽器輸出 console 錯誤（`Failed to load resource`）→ `data-pending.spec.ts` 沒有 console 守衛，新 test 也 SHALL NOT 加；若既有含 console 守衛的 spec 受影響，依「E2E 失敗不得當雜訊」上報。
- [Risk] 資料頁三區塊各有一顆按鈕 → 任一顆效果相同，可接受。
- [Risk] 本機提示固定於底部，窄螢幕會折成兩行，可能疊在頁面底部內容與非專注模式計分板的最底列上 → `pointer-events-none` 不擋操作；層級 `z-30` 低於專注模式操作列（`z-40`）與對話框遮罩（`z-50`），不會蓋住計分操作列或浮在對話框之上；其餘遮蓋接受（verify 第一輪更正原本「只有一行」的前提）。專注模式（`html.sb-focus`）時浮動操作列固定在 `bottom-2`，提示以 `[.sb-focus_&]:bottom-16` 讓到操作列上方，文字不被遮住（verify 第二輪）。導覽頁右下角的「跳過導覽」按鈕（`TourSkipButton`，`fixed right-6 bottom-6 z-50`）在窄螢幕會蓋住提示右段：該按鈕是導覽唯一出口、提示仍可讀主要文字，接受。
- [Risk] 既有 E2E 依賴「session 失敗時退回本機」→ 已查 `tests/e2e/**` 的 `/api/session` 攔截：`navbar-account-entry.spec.ts` 以 200 fulfill、`data-pending.spec.ts` 以 hold 後 `continue()`，皆非失敗回應；訪客（無提示）仍 fail-closed。Mitigation：合併前全瀏覽器 gate。
- [Risk] 本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈；§2 的 RED（`mockResolvedValue(null)`、`chooseLocalFallback` 匯入）是型別紅燈 → RED 與其 GREEN MUST 在同一張派工單內完成。
- [Risk] 單元測試之間的提示洩漏 → 既有 `beforeEach` 已有 `localStorage.clear()`；新 it 自帶清理。
- [Risk] Scenario 標題沿用舊名而與內容不符 → 內容加註，對應 it 名稱已改；屬 validator 限制，不另做處理。

## Migration Plan

無資料或 schema 遷移；不新增相依。部署照 README「部署前手動檢查清單」，只影響前端 Worker。回滾：revert 本 change 的前端提交；提示 key 格式不變，舊版程式碼可直接沿用。

## Open Questions

（設計裁量皆已於 Decisions 定案。）

- §1.2 對齊結果：自 `0de9ad9` 後 `nextjs-pickball/{lib,hooks,components,app,tests}` 與 `openspec/specs` 皆無其他提交改動（diff --stat 為空），主 spec 未變，delta 無需重新套用；`openspec validate --strict` 通過。

