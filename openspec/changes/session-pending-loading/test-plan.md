# Test Plan: session-pending-loading

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端 Vitest＋happy-dom；`useSession` 以既有 module-level `vi.mock` 取代，或以真 store＋mock `fetchSession`）；
> `e2e`（Playwright；登入情境只在 `user-data` project、訪客情境在五個 browser project）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **等待中 mock 的共同寫法**：`{ status: "loading", signedInHint: true, hydrated: true, refresh }`（型別為 `UseSessionResult`，§2 GREEN 後合法）。訪客 mock：`{ status: "ready", authEnabled: true, user: null, hydrated: true, refresh }`。
> 「本機資料不變」一律以「mount 前後 `JSON.parse(localStorage.getItem(key))` 深度相等」斷言（本機 hook mount 時會把同一份資料重新序列化寫回，既有行為），不比字串。
> 「不發請求」以 `vi.stubGlobal("fetch", fetchMock)` 後 `expect(fetchMock).not.toHaveBeenCalled()` 斷言。
> 「讀入前」以「在 hook 的 render 階段同步 push 每次 render 的值」取得第一筆（比照既有 it「帶 matchId 時首次 render 的綁定狀態為 pending 而非 missing」）。
>
> **localStorage 隔離**：新 it 自行在開頭 `localStorage.clear()`；`session-store.test.ts` 與 `useSession.test.ts` 既有 `beforeEach` 各加一行 `localStorage.clear()`（proposal 授權的唯一既有測試修改）。
>
> **E2E 共同要求**：
> - session 暫停：共用 helper `tests/e2e/helpers/hold-session.ts`（`page.route("**/api/session", handler)`，handler 內 `await` 一個 Promise resolver 後 `route.continue()`）；放行前所有斷言 MUST 先以 `main[data-sync-status="pending"]`（或訪客情境的本機參賽者）可見作為錨點，再斷言其他元素不存在；
>   以 `try／finally` 確保放行，並在 `finally` 內 `page.unrouteAll({ behavior: "ignoreErrors" })`。放行前的斷言數量保持精簡（Decision 11 的 10 秒逾時）。放行前先建立 `page.waitForResponse("**/api/session")`，放行後 `await` 它再做放行後的斷言與讀閃爍記錄，確保斷言涵蓋回應之後的畫面（helper 介面不變）。
> - 閃爍記錄器 `tests/e2e/helpers/flash-recorder.ts`：`installFlashRecorder(page, { texts, selectors })` 以 `page.addInitScript` 注入（每個文件、含 reload 都重新開始），`MutationObserver` 監看 `document`（`childList`、`subtree`、`characterData`），每批變動檢查 `document.body?.innerText` 與 `document.querySelector`，命中即記入 `window.__flashHits`；
>   `readFlashHits(page)` 讀出。斷言時機：本機（或雲端）資料已以 web-first 斷言可見之後。
> - 種本機資料：先 `page.goto("/")` 再 `page.evaluate` 寫入（例外：上次登入提示改以 `page.addInitScript` 在下一個文件載入前寫入——首頁的 `/api/session` 回應若仍在途，確認為訪客後會清掉以 `evaluate` 寫入的提示），key 一律自 `@/lib/matchmaker/storage-keys`、`@/lib/scoreboard/storage-keys`、`@/lib/auth/session-hint` 匯入，不抄字面值。
> - SHALL NOT 使用 `waitForTimeout`。

## auth

### Requirement: 全頁共用的 session store 與 useSession（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶 | 有上次登入提示時 client 初始快照帶提示而伺服器端快照不帶 | `localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, "1")` → `resetSessionStoreForTests()`；`fetchSession` 回永不完成的 Promise → `getSnapshot()` 為 `{ status: "loading", signedInHint: true }`、兩次 `toBe` 同一參考；`getServerSnapshot()` 為 `{ status: "loading" }`；`fetchSession` 未被呼叫 | golden path；現行快照不帶提示 → **真紅** | unit |
| 帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading | 帶提示等待逾時後回到不帶提示的 loading | `vi.useFakeTimers()`；有提示、永不完成 → `subscribe(listener)` → `advanceTimersByTime(9_999)` 仍帶提示 → 再推進 1 → 快照 `toEqual({ status: "loading" })`、listener 被呼叫；第二輪 reset 後 `fetchSession` 回已登入 → 等 ready → 推進 10_001 → 快照仍為 ready；`finally` 還原 real timers | 「不得永遠卡在載入中」的唯一保證 → **真紅** | unit |
| 有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示 | 有提示時 hydration 一致且完成後反映提示 | 有提示、`fetchSession` 永不完成；`Probe` 顯示 `session.status === "loading" && session.signedInHint === true ? "hinted" : "plain"` → `renderToString` 含 `plain`；`container.innerHTML = html`、spy `console.error`、`hydrateRoot(container, el, { onRecoverableError })` 包在 `act` → 兩者皆未被呼叫、`container.textContent` 為 `hinted` | hydration 安全；現行無提示 → **真紅** | unit |
| hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true | hydrated 在伺服器端與 hydration 時為 false，完成後為 true | `Probe` 顯示 `String(useSession().hydrated)` → `renderToString` 含 `false`；`hydrateRoot` 包在 `act`，`onRecoverableError` 與 `console.error` 皆未被呼叫，完成後 `textContent` 為 `true` | 「伺服器輸出為等待中」的根據；現行無 `hydrated`（輸出 `undefined`）→ **真紅** | unit |
| client 端一般 mount 的第一次 render 即為 hydrated | client 端非 hydration 的 mount 第一次 render 即為 hydrated | `renderHook(() => { const s = useSession(); seen.push(s.hydrated); return s; })` → `seen[0]` 為 `true` | client 端導覽不得多出一段儲存模式未定；現行 `undefined` → **真紅** | unit |
| （既有）初始為 loading，第一次訂閱後取得 session 並轉為 ready；請求完成前的多個訂閱者只觸發一次請求；refresh 重新取得 session 並通知所有訂閱者；getServerSnapshot 在 store 已為 ready 後仍固定為 loading；useSession 回傳 store 快照並隨 refresh 更新；伺服器端 render 時 useSession 為 loading 且不發請求；其餘既有 it | 初始為 loading…／多個訂閱者…／refresh…／useSession 隨 store 更新／伺服器端 render 為 loading | 原樣通過（`beforeEach` 加 `localStorage.clear()` 後；斷言一字不改） | regression guard：無提示時行為不變、server snapshot 不變 | unit |

### Requirement: 上次登入提示的儲存與清除（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 寫入後讀取為 true 且只存固定值，清除後讀取為 false | 提示只以固定值寫入並可清除 | 空 localStorage → `readSignedInHint()` false → `writeSignedInHint()` → `getItem("auth:signed-in-hint:v1") === "1"`、`localStorage.length === 1` → read true → `clearSignedInHint()` → `getItem` 為 null → read false；`SIGNED_IN_HINT_STORAGE_KEY === "auth:signed-in-hint:v1"` | 模組不存在 → **真紅**（import 失敗） | unit |
| 值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯 | 非固定值或 localStorage 不可用時不拋錯 | `"true"`、`"0"`、`"u1"` 各讀為 false；`vi.spyOn(localStorage, "getItem"/"setItem"/"removeItem").mockImplementation(() => { throw … })`（instance spy；happy-dom 下 `Storage.prototype` 的 spy 對 `localStorage` 不生效，apply 時實測後改寫） 下三函式 `not.toThrow()`、讀取為 false；`finally` `vi.restoreAllMocks()` | 個資與穩定性邊界 → **真紅**（同上） | unit |
| session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示 | session 確認結果決定寫入或清除提示 | `fetchSession` 依序 `mockResolvedValueOnce` 已登入、`{ authEnabled: true, user: null }`、已登入、`{ authEnabled: false, user: null }`，再接已登入、`{ authEnabled: false, user: USER }`（auth 停用卻帶 user 的不一致 payload）→ subscribe 等 ready 後 `readSignedInHint()` true；每次 `await refresh()` 後依序 false、true、false、true、false | golden path；現行 store 不寫提示 → **真紅** | unit |
| 被丟棄的過時 session 回應不改變提示 | 過時的 session 回應不改變提示 | 比照既有 A／B resolver 寫法：B 先 resolve 已登入 → A 再 resolve `{ authEnabled: true, user: null }` → 兩次 `await Promise.resolve()` → `readSignedInHint()` true、快照 `user` 為 B | 提示寫入若放在 `requestId` 守衛之前會被舊回應清掉；現行不寫提示 → **真紅** | unit |
| signOut 成功時清除上次登入提示，失敗時保留 | 登出成功時立即清除提示 | 先 `writeSignedInHint()`；`fetch` 回 200 → `await signOut()` 後 read false；再寫入、`fetch` 回 500 → read true | 現行 signOut 不碰 localStorage → **真紅** | unit |

## user-data-sync

### Requirement: 前端依 session 選擇儲存模式（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| session 載入中且帶上次登入提示時為 pending | session 載入中且帶上次登入提示時為 pending | `{ status: "loading", signedInHint: true }` → `"pending"`；`{ status: "loading" }` → `"local"`；三種 ready 快照硬塞 `signedInHint: true`（`as unknown as SessionSnapshot`）→ `"local"`、`"local"`、`"remote"` | 第三態；現行回 `"local"` → **真紅** | unit |
| 尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local | 伺服器端與 hydration 時尚未 hydration 的 session 為 pending | `{ status: "loading", hydrated: false }` → `"pending"`；`{ status: "loading", hydrated: true }` → `"local"`；`{ ready, authEnabled: true, user: USER, hydrated: false }` → `"remote"` | 伺服器輸出為等待中的唯一判斷；現行忽略 `hydrated` → 第一個斷言 **真紅** | unit |
| （既有）只有 session 就緒、auth 啟用且有 user 時為 remote | 只有就緒、啟用且已登入時為 remote | 原樣通過（不帶 `hydrated` 視同 true） | regression guard：無提示、已 hydration 的 loading 仍為 local | unit |

### Requirement: 資料來源確定前的等待中畫面（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| pending、loading、load-failed 取代內容，pending 的文案為正在載入資料 | pending 與 loading、load-failed 同樣取代內容且有獨立文案 | 九個值逐一 `isContentBlocked`：只有 `pending`、`loading`、`load-failed` 為 true；`DATA_PENDING_MESSAGE === "正在載入資料…"` 且 `!== syncStatusMessage("loading")` | 共用判斷不存在 → **真紅**（import 失敗） | unit |
| pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染 | 同步提示在等待中顯示正在載入資料 | 新檔；`render(<SyncStatusNotice status="pending" />)` → `getByRole("status")` 文字「正在載入資料…」；`loading` → 「正在載入雲端資料…」；`local` → `container` 為空 | 現行 `pending` 不是合法 status（型別紅＋`syncStatusMessage` 回 `undefined`）→ **真紅** | unit |
| session 等待中時不回傳本機名單、syncStatus 為 pending 且操作不寫入本機也不發請求 | 等待中：名單選擇器不交出本機名單且操作無效 | 種一位本機參賽者；mock 等待中 → `players` `[]`、`syncStatus` `pending`、`droppedCount` 0；`act` 內 `addPlayer`、`togglePlayerActive(<本機 id>)`、`resetRoster()` → `players` 仍 `[]`；`matchmaker:roster:v1` 深度相等；`fetchMock` 未被呼叫 | 現行回本機名單與 `local` → **真紅** | unit |
| 等待中的 session 確認為未登入時改回本機名單 | 等待中：確認為未登入後改回本機名單 | 種一位；mock 等待中 → `players` `[]`；mock 改訪客、`rerender` → `players` 為該位、`syncStatus` `local` | 現行等待中即回本機 → 第一段 **真紅** | unit |
| 本機名單讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local | 本機名單讀入前為等待中 | mock 訪客；第一輪種一位：render 階段記錄 `[syncStatus, players.length]`，`seen[0][0]` 為 `pending`、最後一筆為 `["local", 1]`、`seen` 不含 `["local", 0]`；第二輪清空 localStorage：`seen[0][0]` `pending`、最後一筆 `syncStatus` 為 `local` | 現行本機恆為 `local` → **真紅**；第二輪殺「無資料時不標記讀入」變異 | unit |
| session 等待中時不回傳本機回合與歷史、syncStatus 為 pending 且操作不生效 | 等待中：回合選擇器不交出本機回合與歷史且操作無效 | 種本機回合與一筆歷史；mock 等待中；`useRoundStore({ players: [四位], updatePlayer: vi.fn(), … })` → `round` null、`history` `[]`、`droppedCount` 0、`syncStatus` `pending`、`remoteMatchSlots` null；`generateRound(<合法設定>)` 回 `ok: false`；兩個本機 key 深度相等；`updatePlayer` 與 `fetchMock` 未被呼叫 | 對戰頁回填寫本機歷史的根因；現行回本機回合 → **真紅** | unit |
| 本機回合讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local | 本機回合讀入前為等待中 | mock 訪客；第一輪種一輪：記錄 `[syncStatus, round !== null]`，第一筆 `pending`、最後一筆 `["local", true]`、不含 `["local", false]`；第二輪無資料：第一筆 `pending`、最後 `local` | 現行恆 `local` → **真紅** | unit |
| session 等待中時不回傳本機計分且 syncStatus 為 pending，帶 matchId 時綁定狀態為 pending | 等待中：計分板選擇器不交出本機計分且綁定場次不顯示為失效 | 種 `scoreboard:current:v1`（非初始比分）；mock 等待中 → `useScoreboardStore(null)`：`[0]` 等於 `createInitialState()`、`[2]` `standalone`、`[3]` `pending`；`act` dispatch `RALLY_WON` 後 `[0]` 仍等於初始、本機 key 深度相等；`useScoreboardStore("m1")`（無分槽）：`[2]` `pending`、`[3]` `pending`；`fetchMock` 未被呼叫 | 現行回本機與 `missing` → **真紅** | unit |
| 本機計分讀入前 syncStatus 為 pending，讀入後為 local | 本機計分讀入前為等待中 | mock 訪客；種比分 5:3；`useScoreboardStore(null)` 記錄 `[syncStatus, scores.us]`：第一筆 `pending`、最後 `["local", 5]`、不含 `["local", 0]`；`useScoreboardStore("gone")`：第一筆 `pending`、最後 `syncStatus` `local`、`bindingStatus` `missing` | 現行恆 `local` → **真紅** | unit |
| session 等待中時多次 render 回傳同一個 state 參考 | 等待中：計分板選擇器在多次 render 間回傳同一個 state 參考 | mock 等待中；`renderHook(() => useScoreboardStore(null))` → 記下 `result.current[0]` → `rerender()` → `toBe` 同一參考 | apply §3.12 實跑 E2E 時發現等待中每次回傳新的初始狀態，`Scoreboard` 在 render 中依 state 參考更新衍生狀態而無限 re-render（`Too many re-renders`）；apply 時追加 → **真紅** | unit |
| session 等待中時顯示等待中提示且不渲染本機歷史 | 等待中：歷史頁顯示等待中且不讀本機歷史 | 新檔；種一筆今日歷史；`vi.mock("./RemoteHistoryView", …)` 為 testid stub；mock 等待中 → status 文字「正在載入資料…」、`[data-sync-status="pending"]` 存在；`queryByRole("radiogroup", { name: "歷史區間" })` null；紀錄卡片不存在；stub 不存在 | 現行掛 `HistoryView` → **真紅** | unit |
| 伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄 | 本機歷史讀入前為等待中而非空狀態 | 新檔；種一筆今日歷史；`renderToString(<HistoryView />)` 含「正在載入資料…」與 `data-sync-status="pending"`、不含「還沒有任何對戰紀錄」與「歷史區間」；`render(<HistoryView />)` 後該筆卡片可見、`container.querySelector("[data-sync-status]")` null | 現行伺服器輸出為空狀態 → **真紅** | unit |
| session 等待中時統計頁顯示等待中提示且不掛載雲端統計內容 | 等待中：統計頁顯示等待中且不掛載雲端統計 | 新檔；`vi.mock("@/components/matchmaker/RemoteStatsContent", …)` 為 stub；mock 等待中；`render(<MatchmakerStatsPage />)` → status 文字「正在載入資料…」、`main[data-sync-status="pending"]` 存在、heading「球員統計」不存在、stub 不存在；`fetchMock` 未被呼叫 | 現行 `=== "local"` 二分 → 掛雲端 → **真紅** | unit |
| session 等待中時以等待中提示取代匯出與還原操作 | 等待中：JSON 備份區塊不提供匯出與還原 | mock 等待中 → heading「JSON 完整備份」存在；status 文字「正在載入資料…」；按鈕「匯出 JSON」、兩個選檔 testid 皆不存在 | 現行走本機分支 → **真紅** | unit |
| session 等待中時以等待中提示取代匯出操作 | 等待中：歷史 CSV 區塊不提供匯出 | mock 等待中 → heading「歷史賽果 CSV 匯出」存在；status 文字固定；按鈕「匯出 CSV」不存在 | 現行可匯出本機 CSV → **真紅** | unit |
| session 等待中時以等待中提示取代選檔與確認匯入 | 等待中：參賽者 CSV 匯入區塊不提供選檔與確認 | 新檔，`vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }))`；mock 等待中 → heading「參賽者名單 CSV 匯入」存在；status 文字固定；`roster-csv-import-input` 與按鈕「確認匯入」皆不存在 | 現行可寫入本機名單並 reload → **真紅** | unit |
| regression guard：session 等待中時不渲染匯入區塊 | 等待中：匯入本機資料區塊不渲染 | 種一位本機參賽者；mock 等待中 → `queryByTestId("local-import-section")` null；`fetchMock` 未被呼叫 | 現行 `=== "remote"` 已正確 → 寫入即綠（regression guard；mutation `isRemote` 改 `mode !== "local"` 須轉紅） | unit |
| session 等待中時即使本機資料含損壞筆數 droppedCount 仍為 0 | 等待中：名單選擇器不交出本機名單且操作無效 | 種一筆損壞資料與一位有效參賽者；mock 等待中 → `droppedCount` 為 0、`players` `[]` | 行為已正確 → 寫入即綠（regression guard；變異「等待中改帶本機 droppedCount」須轉紅） | unit |
| 本機資料讀入前為 pending，讀入後為 local | 本機名單讀入前為等待中 | `localDataStatus(false)` 為 `pending`、`localDataStatus(true)` 為 `local` | 三個選擇器共用判斷抽出時的 refactor 守護 → 寫入即綠（regression guard；回傳反轉須轉紅） | unit |
| JavaScript 載入前各頁只顯示等待中提示而不顯示空狀態或預設值 | JavaScript 載入前各頁只顯示等待中提示 | 新檔 `data-pending.spec.ts` 的 `describe` 內 `test.use({ javaScriptEnabled: false })`；七個路徑逐一 goto → `[data-sync-status="pending"]` 與「正在載入資料…」可見；spec 列出的空狀態文字、「選擇備份檔…」、按鈕「匯出 CSV」「確認匯入」、`[aria-label="我方目前 0 分"]` 皆 `toHaveCount(0)` | 使用者要求的「靜態 HTML 不出現空名單」直接證據；現行伺服器輸出為空狀態 → **真紅** | e2e |
| 訪客載入本機資料的過程中參賽者、對戰、統計與計分板頁從未出現空狀態或預設值 | 訪客載入本機資料的過程中從未出現空狀態或預設值 | 種兩位參賽者（`isActive`，單打回合需要兩位）、一輪回合、一筆今日歷史、比分 5:3；`installFlashRecorder`（texts：五個空狀態文字；selectors：`[aria-label="我方目前 0 分"]`）；四頁逐一 goto → 本機資料可見（參賽者名、場地卡、排行榜列、`[aria-label="我方目前 5 分"]`）→ `readFlashHits` 為 `[]`、`[data-sync-status]` `toHaveCount(0)` | 「hydration 後不閃空狀態」的直接證據；現行伺服器輸出即命中 → **真紅** | e2e |
| 訪客載入本機歷史的過程中從未出現空狀態 | 訪客載入本機歷史的過程中從未出現空狀態 | 種一筆今日歷史；recorder（texts：「還沒有任何對戰紀錄」）；goto `/matchmaker/history` → 卡片可見 → hits 為 `[]`、`[data-sync-status]` `toHaveCount(0)` | 現行 `hydrated === null` 時畫空狀態 → **真紅** | e2e |
| 已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單 | 已登入者重新整理時在 session 回應前顯示等待中而非空名單 | `seedCloudPlayers` 一位「雲端甲」→ goto → synced 與「雲端甲」可見 → `installFlashRecorder`（texts：「目前還沒有參賽者」「共 0 位參賽者」）→ route 暫停 → `page.reload()` → `main[data-sync-status="pending"]` 可見、status 文字「正在載入資料…」→ 放行 → synced 與「雲端甲」可見 → hits 為 `[]` | 使用者回報的原始情境 → **真紅** | e2e |
| 訪客重新整理參賽者頁時在 session 回應前即顯示本機名單 | 訪客重新整理時 session 回應前即顯示本機名單 | 寫一位本機參賽者 → goto 後可見 → `installFlashRecorder`（texts：參賽者頁空狀態文字）→ route 暫停 → reload → 該參賽者可見、`[data-sync-status]` 與 `getByRole("status")` `toHaveCount(0)` → 放行 → 仍可見、兩者仍為 0 → `readFlashHits` 為 `[]` | regression guard：hydration 後訪客不等 session（寫入即綠）；閃爍記錄器使「參賽者頁取代條件改回只看 loading／load-failed」變異轉紅 | e2e |
| 上次登入提示殘留但已非登入時先顯示等待中再顯示本機名單並清除提示 | 上次登入提示殘留但已非登入時短暫等待後回到本機 | 寫一位本機參賽者，提示 `"1"` 以 `addInitScript` 於下一個文件載入前寫入 → route 暫停 → goto 參賽者頁 → `main[data-sync-status="pending"]` 可見、該參賽者 `toHaveCount(0)`、`getByRole("status")` 文字為 `DATA_PENDING_MESSAGE`、「目前還沒有參賽者」`toHaveCount(0)` → 放行 → 參賽者可見、`[data-sync-status]` 0、該 key 讀回 `null` | 殘留提示的完整路徑 → **真紅** | e2e |
| （既有）`user-data` 全部 spec 與五個 browser project 全部 spec（含 `matchmaker-local-mode`、`scoreboard-local-mode` 的訪客守護） | 既有 Scenario | 原樣通過 | regression guard：伺服器輸出改為等待中、登入後 reload 路徑改變（design Risks） | e2e |

## player-roster

### Requirement: 登入時名單以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 等待中時不回傳本機名單…；等待中的 session 確認為未登入時改回本機名單；本機名單讀入前 syncStatus 為 pending… | 見 user-data-sync 對應 Scenario | 同上表 | 本 Requirement 只改選擇器、本機 `syncStatus` 與頁面取代條件三句，行為錨點集中在 user-data-sync（Decision 14） | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test（含「session 載入中或訪客時走本機…」） | 全部既有 Scenario | 原樣通過（`renderHook` 的最終值已讀入，`syncStatus` 為 `local`） | regression guard（C3／C5 守住） | unit |
| （既有）本 Requirement 全部既有 E2E | 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## round-lifecycle

### Requirement: 登入時回合與場次分槽以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 等待中時不回傳本機回合與歷史…；本機回合讀入前 syncStatus 為 pending… | 見 user-data-sync 對應 Scenario | 同上表 | 同 player-roster 列 | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard | unit |
| （既有）本 Requirement 全部既有 E2E | 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## scoreboard

### Requirement: 登入時獨立計分板以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 等待中時不回傳本機計分…；本機計分讀入前 syncStatus 為 pending，讀入後為 local；JavaScript 載入前各頁只顯示等待中提示…（`/scoreboard`、`/scoreboard?match=m1`） | 見 user-data-sync 對應 Scenario | 同上表 | 本 Requirement 只改選擇器、本機 `syncStatus` 與 `Scoreboard` 取代條件三句 | unit／e2e |
| （既有）本 Requirement 全部既有 Scenario 的 it／test（含「session 載入中或訪客時走本機且 syncStatus 為 local」、兩條首次 render 綁定狀態 it） | 全部既有 Scenario | 原樣通過 | regression guard | unit |
| （既有）本 Requirement 全部既有 E2E | 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## match-history

### Requirement: 歷史頁唯讀消費既有紀錄（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄；訪客載入本機歷史的過程中從未出現空狀態 | 見 user-data-sync 對應 Scenario | 同上表 | 本 Requirement 只改「首次伺服器輸出」與「SSR 時顯示空狀態」兩句 | unit／e2e |
| （既有）瀏覽與切換區間後 matchmaker:history:v1 內容不變；紀錄於 hydration 後顯示且無 console error；登入時歷史頁唯讀的 E2E | 瀏覽與切換區間不改動持久化資料／紀錄於 hydration 後才出現且無 console error／歷史頁唯讀 | 原樣通過 | regression guard：hydration 無 console error 仍成立 | e2e |

## data-transfer

### Requirement: 清除本機資料與其確認流程（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| regression guard：clearAllLocalData 不移除上次登入提示 | 清除本機資料不移除上次登入提示 | 寫入提示與名單 key → `clearAllLocalData()` → 名單 key null、提示仍 `"1"`；`(CLEAR_ALL_KEYS as readonly string[]).includes(SIGNED_IN_HINT_STORAGE_KEY)` 為 false | `CLEAR_ALL_KEYS` 不變 → 寫入即綠（regression guard；mutation 把提示加入清單須轉紅） | unit |
| （既有）clearAllLocalData 移除本 app 寫入的全部 LocalStorage key；clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響 | 確認後全部已知 key 皆被移除；清除不動列舉範圍以外的 key | 原樣通過 | regression guard | unit |
| （既有）清除本機資料的確認提示…；取消清除…；確認清除本機資料後參賽者頁回到空白狀態 | 對應既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck`（不 `cd`；不用 `pnpm --dir <root> --filter`） | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數＝基線＋6、測試數＝基線＋32；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 依 project 分開跑（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | user-data＝基線＋1，全 passed、0 skipped；五個 browser project 各＝基線＋5 且 0 failed（skip 只限既有瀏覽器條件）；無因缺帳密 skip |
| C6 | （使用端清單，Decision 2） | `grep -rn "resolveStorageMode(" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/lib \| grep -v "\.test\." \| grep -v "export function"` | 檔案集合恰為 Decision 2 表格的 9 個檔案 |
| C7 | （統一判斷，Decision 1） | `grep -rn '"load-failed"' /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components \| grep -v "\.test\."` | 只剩 `app/matchmaker/page.tsx` 的 `SYNC_STATUS_PRIORITY` 一行與 `components/matchmaker/RemoteHistoryView.tsx`（雲端歷史專屬、狀態來自 `useRemoteHistory`、本 change 不改）；參賽者頁、對戰頁的取代判斷與 `isRosterReady`、`LocalStatsContent`、`RemoteStatsContent`、`Scoreboard` 皆已改用 `isContentBlocked` |
| C8 | （範圍） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat -- hono-pickball packages 'nextjs-pickball/hooks/useRemote*.ts' nextjs-pickball/components/layout nextjs-pickball/components/auth nextjs-pickball/components/quiz nextjs-pickball/components/tour nextjs-pickball/components/guide nextjs-pickball/lib/matchmaker/transfer-storage.ts nextjs-pickball/components/matchmaker/LocalDataImportSection.tsx nextjs-pickball/components/matchmaker/ClearLocalDataSection.tsx nextjs-pickball/components/matchmaker/LocalImportNotice.tsx nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx nextjs-pickball/package.json pnpm-lock.yaml` | 輸出為空 |
| C9 | （規格） | `DO_NOT_TRACK=1 openspec validate session-pending-loading --strict`（repo root） | valid |

## Checklist

- [x] 每個 Requirement 至少一列（auth 2、user-data-sync 2、player-roster 1、round-lifecycle 1、scoreboard 1、match-history 1、data-transfer 1）
- [x] 每個新增 Scenario（auth 10、user-data-sync 25、data-transfer 1）至少一列；MODIFIED 帶入的既有 Scenario 以「（既有）」列合併
- [x] 每列皆有 Tier（unit | e2e）
- [x] 新 it 共 32（真紅 28、regression guard 4：transfer-storage、LocalDataImport，以及 §3 審查追加的 droppedCount、localDataStatus；其中「session 等待中時多次 render 回傳同一個 state 參考」為 apply 時追加的真紅 it）；新 E2E 6（真紅 5、regression guard 1）
- [x] 授權修改的既有測試只有兩處 `beforeEach` 各加一行 `localStorage.clear()`，不改任何 it 名稱與斷言
