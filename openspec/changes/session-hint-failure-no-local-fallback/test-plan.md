# Test Plan: session-hint-failure-no-local-fallback

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端 Vitest＋happy-dom；`useSession` 以既有 module-level `vi.mock` 取代，或以真 store＋mock `fetchSession`）；
> `e2e`（Playwright；新增的兩條在五個 browser project 以訪客身分執行）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **共同 mock 寫法**（型別為 `UseSessionResult`，§2 GREEN 後合法）：
> - 無法確認：`{ status: "loading", signedInHint: true, unavailable: true, hydrated: true, refresh }`
> - 本機備援：`{ status: "loading", localFallback: true, hydrated: true, refresh }`
> - 訪客：`{ status: "ready", authEnabled: true, user: null, hydrated: true, refresh }`；已登入：`{ status: "ready", authEnabled: true, user: USER, hydrated: true, refresh }`
>
> 「本機資料不變」一律以「mount 前後 `JSON.parse(localStorage.getItem(key))` 深度相等」斷言；「不發請求」以 `vi.stubGlobal("fetch", fetchMock)` 後 `expect(fetchMock).not.toHaveBeenCalled()`（或呼叫次數不變）斷言。
> 無法確認時的提示文字以 `syncStatusMessage("load-failed")` 取得、按鈕與本機提示以 `LOCAL_FALLBACK_ACTION_LABEL`、`LOCAL_FALLBACK_NOTICE` 取得（§3 GREEN 前 import 不存在，屬型別紅燈），不抄字面值；唯一例外是 `sync-status.test.ts` 鎖定常數值的那一個 it 以字面值比對。
>
> **store 測試**：沿用 `session-store.test.ts` 既有 `vi.mock("./session-client")`、`resetSessionStoreForTests()` 與 Promise resolver 寫法；有提示的情境先 `writeSignedInHint()` 再 `resetSessionStoreForTests()`；fake timers 於 `finally` 還原。
>
> **授權改寫的既有 it（僅三個；改名與改斷言，視為該 it 的 RED，紀錄中標「改寫既有 it」）**：
> `session-client.test.ts` 兩個（期望由未啟用改為 `null`）、`session-store.test.ts` 一個（逾時由回到 loading 改為無法確認）。其餘既有 it／test 的名稱與斷言一律不得修改。
>
> **E2E 共同要求**：
> - 本機資料以 `data-pending.spec.ts` 既有 `seedStorage` 寫入；上次登入提示以 `page.addInitScript` 在下一個文件載入前寫入（`seedStorage` 開的首頁若有 session 回應在途，確認為訪客時會清掉以 `evaluate` 寫入的提示）。
> - `page.route("**/api/session", …)` MUST 在 `seedStorage` **之後**、`goto` 之前註冊（`route.fulfill({ status: 500, body: "" })` 或 `route.abort()`）；`try／finally`，`finally` 內 `page.unrouteAll({ behavior: "ignoreErrors" })`。
> - key 與文案一律自 `@/lib/auth/session-hint`、`@/lib/matchmaker/storage-keys`、`@/lib/sync/sync-status` 匯入。SHALL NOT 使用 `waitForTimeout`；逾時 10 秒只做單元測試。

## auth

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| fetchSession 於非 200、形狀不符或網路錯誤時回傳 null 且不拋錯 | 任何失敗都降級為未啟用（標題沿用，內容改為回傳 null） | **改寫既有 it**「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」：既有 16 種失敗逐一 `stubFetch` → `await expect(fetchSession()).resolves.toBeNull()` | 契約改變的根；現行回 `DISABLED` → **真紅** | unit |
| signInMethods 形狀不符時 fetchSession 回傳 null | signInMethods 形狀不符時降級為未啟用（標題沿用） | **改寫既有 it**「signInMethods 形狀不符時 fetchSession 回傳未啟用」：四種 `signInMethods` → `resolves.toBeNull()` | 同上 → **真紅** | unit |
| （既有）fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user；fetchSession 以 keepalive 發出請求；fetchSession 回傳後端提供的 signInMethods；session store 的快照保留 signInMethods 的 it | 回應正確時原樣回傳／keepalive／含 signInMethods／快照保留 signInMethods | 原樣通過（含既有 `{ authEnabled: false, user: null }` 的 200 回應仍原樣回傳） | regression guard：成功路徑不變 | unit |

### Requirement: 全頁共用的 session store 與 useSession（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| session 請求失敗且有上次登入提示時快照改為無法確認且保留提示 | session 請求失敗且有上次登入提示時改為無法確認並保留提示 | 有提示；`mockedFetchSession.mockResolvedValue(null)`；`subscribe(listener)` → `vi.waitFor` 快照 `toEqual({ status: "loading", signedInHint: true, unavailable: true })`；兩次 `getSnapshot()` `toBe` 同一參考；`listener` 被呼叫；`readSignedInHint()` 為 true | golden path；現行 `null.authEnabled` 拋 TypeError、快照停在 loading → **真紅** | unit |
| session 請求失敗且沒有上次登入提示時快照為 auth 停用的 ready | session 請求失敗且沒有提示時仍降級為 auth 停用 | 空 localStorage；`mockResolvedValue(null)` → 等待後快照 `toEqual({ status: "ready", authEnabled: false, user: null })`；`localStorage.length` 為 0 | 訪客 fail-closed 不得退化；現行拋 TypeError → **真紅** | unit |
| 已登入使用中 refresh 失敗時快照改為無法確認且保留提示 | 已登入使用中重新取得 session 失敗時改為無法確認 | 空 localStorage；`mockResolvedValueOnce({ authEnabled: true, user: USER }).mockResolvedValueOnce(null)` → subscribe 等 ready、`readSignedInHint()` true → `await refresh()` → 快照 `toEqual({ status: "loading", signedInHint: true, unavailable: true })`；提示仍 true | 401 → refresh → 失敗曾悄悄退回本機的第二條路徑；現行拋 TypeError、快照維持已登入 ready → **真紅** | unit |
| 帶提示等待逾時仍未取得 session 時快照改為無法確認 | 帶提示等待逾時後回到不帶提示的 loading（標題沿用，內容改為無法確認） | **改寫既有 it**「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」：流程不變；10 秒時的斷言改為 `toEqual({ status: "loading", signedInHint: true, unavailable: true })`、listener 被呼叫，另加 `readSignedInHint()` 為 true；第二輪（逾時前已 ready）斷言不變 | 逾時曾悄悄退回本機；現行改回 `{ status: "loading" }` → **真紅** | unit |
| 無法確認之後才到達的 session 回應仍照常採用 | 無法確認之後晚到的回應仍照常採用 | fake timers；有提示；`fetchSession` 回傳以 resolver 控制的 Promise → `subscribe(listener)` → `advanceTimersByTime(10_000)` → 快照為無法確認 → `listener.mockClear()` → resolve `{ authEnabled: true, user: USER }` → `await vi.advanceTimersByTimeAsync(0)` → 快照 `toEqual({ status: "ready", authEnabled: true, user: USER })`、listener 被呼叫、提示 true | 使用者未選擇前，正確回應晚到要能直接轉入雲端；現行逾時後快照為 `{ status: "loading" }`，第一個斷言 → **真紅** | unit |
| chooseLocalFallback 在無法確認時改為本機備援並丟棄進行中請求的結果 | 選擇本機備援後丟棄進行中請求的結果 | fake timers；有提示；resolver 控制的 Promise → subscribe → 推進 10 秒（無法確認）→ `listener.mockClear()` → `chooseLocalFallback()` → 快照 `toEqual({ status: "loading", localFallback: true })`、再讀 `toBe` 同一參考、listener 被呼叫、提示 true → resolve 已登入 → `advanceTimersByTimeAsync(0)` → 快照仍為本機備援、`mockedFetchSession` 呼叫 1 次 → 改 `mockResolvedValue({ authEnabled: true, user: USER })` → `await refresh()` → 已登入 ready | 「按了才進本機、之後不被切走」的唯一保證；`chooseLocalFallback` 尚不存在 → **真紅**（import 為 undefined，呼叫即 TypeError） | unit |
| 不是無法確認時呼叫 chooseLocalFallback 不改變快照也不通知 | 不是無法確認時選擇本機備援沒有效果 | 三輪（各輪 reset）：① 無提示、resolver 控制、subscribe → `before = getSnapshot()` → `chooseLocalFallback()` → `toBe(before)`、listener 未呼叫 → resolve 已登入 → 已登入 ready；② 有提示、未逾時，同上；③ 已 ready → 呼叫後 `toBe(before)`、listener 未呼叫 | 防「任何狀態都切本機」與「呼叫時遞增 requestId 而丟掉正常回應」；函式尚不存在 → **真紅** | unit |
| （既有）初始為 loading，第一次訂閱後取得 session 並轉為 ready；請求完成前的多個訂閱者只觸發一次請求；refresh 重新取得 session 並通知所有訂閱者；有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶；`useSession.test.ts` 全部既有 it（含兩條 hydration）；其餘既有 it | 初始為 loading…／多個訂閱者…／refresh…／useSession 隨 store 更新／伺服器端 render 為 loading／有提示時初始快照／hydration 三條 | 原樣通過 | regression guard：成功路徑、server snapshot 與 hydration 不變 | unit |

### Requirement: 上次登入提示的儲存與清除（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增規則的錨點）session 請求失敗且有上次登入提示時快照改為無法確認且保留提示；已登入使用中 refresh 失敗時快照改為無法確認且保留提示；帶提示等待逾時仍未取得 session 時快照改為無法確認；chooseLocalFallback 在無法確認時改為本機備援並丟棄進行中請求的結果 | 見上表對應 Scenario | 各 it 斷言提示仍在（同上表） | 「失敗、逾時、按下按鈕不清除」的規則由 store 的 Scenario 逐一斷言，本 Requirement 不另立 it | unit |
| （既有）寫入後讀取為 true 且只存固定值，清除後讀取為 false；值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯；session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示；被丟棄的過時 session 回應不改變提示；signOut 成功時清除上次登入提示，失敗時保留 | 本 Requirement 全部既有 Scenario | 原樣通過（200 且形狀正確的未登入／停用仍清除） | regression guard | unit |

## user-data-sync

### Requirement: 前端依 session 選擇儲存模式（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 本機備援的 loading 快照為 local，無法確認的 loading 快照為 pending | 本機備援為 local、無法確認為 pending | `{ status: "loading", localFallback: true }`、同上加 `hydrated: true` → `"local"`；`{ status: "loading", signedInHint: true, unavailable: true }`、同上加 `hydrated: true` → `"pending"` | 現行判斷已成立（本機備援不帶提示、無法確認帶提示）→ 寫入即綠（**regression guard**；mutation「本機備援判斷改回 pending」「無法確認判斷改回 local」須轉紅） | unit |
| pendingDataStatus 在無法確認時為 unavailable，其餘為 pending | 等待中的顯示狀態依快照區分無法確認 | 無法確認快照 → `"unavailable"`；`{ status: "loading", signedInHint: true }`、`{ status: "loading" }`、本機備援、三種 ready 快照 → `"pending"` | 所有使用端共用的判斷；函式不存在 → **真紅**（import 失敗） | unit |
| （既有）只有 session 就緒、auth 啟用且有 user 時為 remote；session 載入中且帶上次登入提示時為 pending；尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local | 本 Requirement 既有三個 Scenario | 原樣通過 | regression guard | unit |

### Requirement: 同步狀態與提示（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （例外的錨點）只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染 | 見「session 無法確認時的阻擋畫面與本機備援」 | 同下表 | 本 Requirement 只加一句例外，行為錨點在 ADDED Requirement | unit |
| （既有）local、synced、saving 不顯示提示，其餘狀態各有固定文案；訪客模式下計分板不渲染同步提示與 data-sync-status | 只有需要使用者注意的狀態才有文案／訪客的計分板不渲染同步元素 | 原樣通過 | regression guard：`SyncStatus` 文案不變、訪客 DOM 不變 | unit／e2e |

### Requirement: 資料來源確定前的等待中畫面（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）本 Requirement 全部既有 it（含「pending、loading、load-failed 取代內容，pending 的文案為正在載入資料」、三個選擇器的等待中與讀入前 it、歷史與資料頁四區塊的等待中 it） | 本 Requirement 全部既有 Scenario | 原樣通過（無法確認快照與既有等待中 mock 不同；既有 mock 不帶 `unavailable`，`pendingDataStatus` 回 `pending`） | regression guard：等待中行為不變 | unit |
| （既有）`data-pending.spec.ts` 既有五條、`roster-sync.spec.ts`「已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單」 | 本 Requirement 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

### Requirement: session 無法確認時的阻擋畫面與本機備援（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| unavailable 取代內容，按鈕與本機提示文案為固定值 | 無法確認的顯示狀態取代內容且新文案為固定值 | `isContentBlocked("unavailable")` 為 true；`LOCAL_FALLBACK_ACTION_LABEL === "先用這台裝置的資料"`；`LOCAL_FALLBACK_NOTICE === "目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端"`；`syncStatusMessage("load-failed") === "無法載入雲端資料，請重新整理頁面"` | 新狀態與文案的單一事實來源；常數不存在 → **真紅**（import 失敗） | unit |
| unavailable 顯示無法載入雲端資料與先用這台裝置的資料按鈕，按下後呼叫 chooseLocalFallback | 同步提示在無法確認時顯示載入失敗文案與按鈕 | `vi.mock("@/lib/auth/session-store", async (importOriginal) => ({ ...(await importOriginal()), chooseLocalFallback: vi.fn() }))`；`render(<SyncStatusNotice status="unavailable" />)` → `getByRole("status").textContent` 為 load-failed 文案；`getByRole("button", { name: LOCAL_FALLBACK_ACTION_LABEL })` 存在且 `status.contains(button)` 為 false；`fireEvent.click` → mock 呼叫 1 次；`pending`、`load-failed` 各自 render 後 `queryByRole("button")` 為 null | 按鈕是使用者唯一的出口；現行 `unavailable` 不是合法 status、無按鈕 → **真紅** | unit |
| session 無法確認時 syncStatus 為 unavailable 且不回傳本機名單也不發請求 | 無法確認：名單選擇器回報 unavailable 且不交出本機名單 | 種一位本機參賽者；mock 無法確認 → `players` `[]`、`syncStatus` `unavailable`；`act` 內 `addPlayer` → `players` 仍 `[]`；`matchmaker:roster:v1` 深度相等；`fetchMock` 未被呼叫 | 現行 `syncStatus` 為 `pending` → **真紅** | unit |
| 已登入使用中 session 轉為無法確認時不交出先前的雲端名單且操作不發請求 | 已登入使用中轉為無法確認時名單選擇器不交出先前的雲端名單 | mock 已登入；`fetchMock` 回一位雲端參賽者（比照既有「已登入時改用雲端名單並回傳 syncStatus」）→ `waitFor` `synced` 且 `players` 長度 1 → 記下 `fetchMock.mock.calls.length` → mock 改無法確認、`rerender` → `players` `[]`、`syncStatus` `unavailable` → `act` 內 `addPlayer` → 呼叫次數不變 | Context 查證的殘留名單；現行回傳殘留的雲端名單與 `pending` → **真紅** | unit |
| 選擇先用這台裝置的資料後回傳本機名單且 syncStatus 為 local | 本機備援：名單選擇器回傳本機名單 | 種一位本機參賽者；mock 本機備援 → `waitFor` `players` 為該位、`syncStatus` `local`；`fetchMock` 未被呼叫 | 現行本機備援快照已判為 `local` → 寫入即綠（**regression guard**；mutation「本機備援判斷改回 pending」須轉紅） | unit |
| session 無法確認時 syncStatus 為 unavailable 且不回傳本機回合與歷史 | 無法確認：回合選擇器回報 unavailable 且不交出本機回合與歷史 | 比照既有「session 等待中時不回傳本機回合與歷史…」的五位參賽者 fixture；mock 無法確認；`useRoundStore({ players, updatePlayer: vi.fn(), rosterSyncStatus: "unavailable", … })` → `round` null、`history` `[]`、`syncStatus` `unavailable`、`remoteMatchSlots` null；`generateRound(<合法設定>)` 回 `ok: false`；兩個本機 key 深度相等；`fetchMock` 未被呼叫 | 現行 `pending` → **真紅** | unit |
| session 無法確認時 syncStatus 為 unavailable 且不回傳本機計分，帶 matchId 時綁定狀態為 pending | 無法確認：計分板選擇器回報 unavailable 且不交出本機計分 | 種非初始比分；mock 無法確認 → `useScoreboardStore(null)`：`[0]` 等於 `createInitialState()`、`[2]` `standalone`、`[3]` `unavailable`；`act` dispatch `RALLY_WON` 後 `[0]` 仍等於初始、本機 key 深度相等；`useScoreboardStore("m1")`：`[2]` `pending`、`[3]` `unavailable`；`fetchMock` 未被呼叫 | 現行 `pending` → **真紅** | unit |
| session 無法確認時顯示無法載入提示與按鈕且不渲染歷史 | 無法確認：歷史頁顯示無法載入提示與按鈕 | 種一筆今日歷史；沿用既有 `RemoteHistoryView` stub；mock 無法確認 → status 文字為 load-failed 文案；按鈕存在；`[data-sync-status="unavailable"]` 存在；`queryByRole("radiogroup", { name: "歷史區間" })` null；紀錄卡片與 stub 不存在 | 現行容器寫死 `pending` → **真紅** | unit |
| session 無法確認時以無法載入提示與按鈕取代匯出與還原操作 | 無法確認：JSON 備份區塊不提供匯出與還原 | mock 無法確認 → heading「JSON 完整備份」存在；status 文字為 load-failed 文案；按鈕存在；`[data-sync-status="unavailable"]` 存在；按鈕「匯出 JSON」、兩個選檔 testid 皆不存在 | 同上 → **真紅** | unit |
| session 無法確認時以無法載入提示與按鈕取代匯出操作 | 無法確認：歷史 CSV 區塊不提供匯出 | mock 無法確認 → heading「歷史賽果 CSV 匯出」存在；status 文字、按鈕、`[data-sync-status="unavailable"]` 存在；按鈕「匯出 CSV」不存在 | 同上 → **真紅** | unit |
| session 無法確認時以無法載入提示與按鈕取代選檔與確認匯入 | 無法確認：參賽者 CSV 匯入區塊不提供選檔與確認 | mock 無法確認 → heading「參賽者名單 CSV 匯入」存在；status 文字、按鈕、`[data-sync-status="unavailable"]` 存在；`roster-csv-import-input` 與按鈕「確認匯入」不存在 | 同上 → **真紅** | unit |
| session 無法確認時對戰頁以無法載入提示與按鈕取代場次舞台 | 無法確認：對戰頁以提示與按鈕取代場次舞台 | 新檔；比照 `app/matchmaker/stats/page.test.tsx` 的 `vi.mock("@/hooks/useSession")`，另 `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))`（子模組在 happy-dom 無法載入時以 stub 取代，紀錄中註明）；種兩位可出場參賽者；mock 無法確認；`render(<MatchmakerPage />)` → `main[data-sync-status="unavailable"]` 存在；status 文字為 load-failed 文案；按鈕存在；「目前沒有可出場的參賽者」「尚未產生任何回合」不存在；`fetchMock` 未被呼叫 | 優先序漏列會落到 `local` 畫出空舞台；現行為 `pending`（§3 選擇器 GREEN 後則落到 `local`）→ **真紅**；mutation「`SYNC_STATUS_PRIORITY` 拿掉 `unavailable`」須轉紅 | unit |
| 只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染 | 本機提示只在本機備援時出現 | 新檔；`vi.mock("@/hooks/useSession")`；本機備援 → `getByRole("status").textContent` 為 `LOCAL_FALLBACK_NOTICE`；無法確認、`{ status: "loading", signedInHint: true }`、`{ status: "loading" }`、訪客 ready、已登入 ready 各自 render → `container.innerHTML` 為 `""` | 元件不存在 → **真紅**（import 失敗） | unit |
| 有上次登入提示而 session 請求失敗時先擋住畫面，按下先用這台裝置的資料後顯示本機名單與本機提示 | 有上次登入提示而 session 請求失敗時先擋住畫面，選擇後改用本機名單 | `seedStorage` 一位「本機甲」→ `addInitScript` 寫提示 → `page.route` fulfill 500 → goto `/matchmaker/players` → `main[data-sync-status="unavailable"]` 可見、`getByRole("status")` 文字為 load-failed 文案、按鈕可見、「本機甲」`toHaveCount(0)`、`evaluate` 讀提示為 `"1"` → 按下按鈕 → 「本機甲」可見、`getByText(LOCAL_FALLBACK_NOTICE)` 可見、`[data-sync-status]` `toHaveCount(0)`、提示仍為 `"1"` | 使用者定案行為的端到端證據；現行 500 → 未啟用 → 直接顯示本機甲 → **真紅** | e2e |
| 有上次登入提示而 session 請求網路中斷時顯示無法載入提示與按鈕 | 有上次登入提示而 session 請求網路中斷時同樣先擋住畫面 | 同上但 `route.abort()`；goto 後 `main[data-sync-status="unavailable"]` 可見、status 文字為 load-failed 文案、按鈕可見、「本機甲」`toHaveCount(0)` | 網路錯誤走 `fetch` 例外分支，與 500 不同路徑；現行直接顯示本機 → **真紅** | e2e |

## player-roster

### Requirement: 登入時名單以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 無法確認時 syncStatus 為 unavailable 且不回傳本機名單也不發請求；已登入使用中 session 轉為無法確認時不交出先前的雲端名單且操作不發請求 | 見 user-data-sync 對應 Scenario | 同上表 | 本 Requirement 只改等待中結果的 `syncStatus` 與 `isContentBlocked` 列舉兩句（design Decision 13） | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard | unit／e2e |

## round-lifecycle

### Requirement: 登入時回合與場次分槽以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 無法確認時 syncStatus 為 unavailable 且不回傳本機回合與歷史；session 無法確認時對戰頁以無法載入提示與按鈕取代場次舞台 | 見 user-data-sync 對應 Scenario | 同上表 | 同 player-roster 列 | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard | unit／e2e |

## scoreboard

### Requirement: 登入時獨立計分板以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 無法確認時 syncStatus 為 unavailable 且不回傳本機計分，帶 matchId 時綁定狀態為 pending | 見 user-data-sync 對應 Scenario | 同上表 | 同 player-roster 列 | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard | unit／e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數＝基線＋2、測試數＝基線＋21（改寫的三個 it 不增減數量）；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | `/tmp/cgate2.sh session-hint-failure-no-local-fallback`（矩陣：chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | 五個 browser project 各＝基線＋2 且 0 failed（skip 只限既有瀏覽器條件）；user-data＝基線、全 passed、0 skipped |
| C6 | （`resolveStorageMode` 使用端不變） | `grep -rln "resolveStorageMode(" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks \| grep -v "\.test\."` | 恰為 9 個檔案：`app/matchmaker/stats/page.tsx`、`HistoryCsvSection`、`HistoryModeSwitch`、`JsonBackupSection`、`LocalDataImportSection`、`RosterCsvImportSection`、`useRosterStore`、`useRoundStore`、`useScoreboardStore` |
| C7 | （`pendingDataStatus` 使用端） | `grep -rln "pendingDataStatus(" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks \| grep -v "\.test\."`；另 `grep -rn "unavailable" …/app …/components …/hooks \| grep -v "\.test\."` | 前者恰為 7 個檔案：三個選擇器、`HistoryModeSwitch`、`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`；後者只出現在 `app/matchmaker/page.tsx`（優先序）、`hooks/useRoundStore.ts`（名單狀態對應）、`components/sync/SyncStatusNotice.tsx`（按鈕分支）——沒有其他使用端自行讀取快照的 `unavailable`（註解中的字樣不算，逐行人工確認） |
| C8 | （範圍） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat -- hono-pickball packages 'nextjs-pickball/hooks/useRemote*.ts' nextjs-pickball/hooks/useSession.ts nextjs-pickball/lib/auth/session-hint.ts nextjs-pickball/components/layout nextjs-pickball/components/auth nextjs-pickball/components/scoreboard nextjs-pickball/components/quiz nextjs-pickball/components/tour nextjs-pickball/components/guide nextjs-pickball/app/matchmaker/players nextjs-pickball/app/matchmaker/stats/page.tsx nextjs-pickball/components/matchmaker/LocalStatsContent.tsx nextjs-pickball/components/matchmaker/RemoteStatsContent.tsx nextjs-pickball/components/matchmaker/HistoryView.tsx nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx nextjs-pickball/components/matchmaker/LocalDataImportSection.tsx nextjs-pickball/components/matchmaker/ClearLocalDataSection.tsx nextjs-pickball/components/matchmaker/LocalImportNotice.tsx nextjs-pickball/lib/matchmaker/transfer-storage.ts nextjs-pickball/package.json pnpm-lock.yaml` | 輸出為空 |
| C9 | （規格） | `DO_NOT_TRACK=1 openspec validate session-hint-failure-no-local-fallback --strict`（repo root） | valid |
| C10 | （`fetchSession` 唯一呼叫端） | `grep -rn "fetchSession(" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/lib \| grep -v "\.test\." \| grep -v "export async function"` | 只有 `lib/auth/session-store.ts` |

## Checklist

- [x] 每個 Requirement 至少一列（auth 3、user-data-sync 4、player-roster 1、round-lifecycle 1、scoreboard 1）
- [x] 每個新增 Scenario（auth 6、user-data-sync 17：MODIFIED 儲存模式 2＋ADDED 15）至少一列；改寫內容的 3 個既有 Scenario（標題沿用）各有一列改寫既有 it；其餘既有 Scenario 以「（既有）」列合併
- [x] 每列皆有 Tier（unit | e2e）
- [x] 新 it 共 21（真紅 19、regression guard 2：storage-mode 的本機備援／無法確認判斷、名單的本機備援）；改寫既有 it 3（皆真紅）；新 E2E 2（皆真紅）
- [x] 授權改寫的既有測試只有 proposal Impact 列出的三個 it，不改其他 it 的名稱與斷言
