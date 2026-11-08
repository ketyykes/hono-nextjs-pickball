# Test Plan: session-pending-loading

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端 Vitest＋happy-dom；`useSession` 以既有 module-level `vi.mock` 取代，或以真 store＋mock `fetchSession`）；
> `e2e`（Playwright；登入情境只在 `user-data` project、訪客情境在五個 browser project）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **等待中 mock 的共同寫法**：`{ status: "loading", signedInHint: true, refresh }`（型別為 `UseSessionResult`，§2 GREEN 後合法）。「本機資料不變」一律以「mount 前後 `JSON.parse(localStorage.getItem(key))` 深度相等」斷言——本機 hook mount 時會把同一份資料重新序列化寫回（既有行為），不比字串。
> 「不發請求」以 `vi.stubGlobal("fetch", fetchMock)` 後 `expect(fetchMock).not.toHaveBeenCalled()` 斷言。
>
> **localStorage 隔離**：新 it 自行在開頭 `localStorage.clear()`；`session-store.test.ts` 與 `useSession.test.ts` 既有 `beforeEach` 各加一行 `localStorage.clear()`（proposal 授權的唯一既有測試修改）。
>
> **E2E 攔截的共同要求**：`page.route("**/api/session", handler)`，handler 內 `await` 一個 Promise resolver 後 `route.continue()`；放行前所有斷言 MUST 先以 `main[data-sync-status="loading"]`（或訪客情境的本機參賽者）可見作為「hydration 已完成」的錨點，再斷言其他元素不存在；
> 以 `try／finally` 確保放行，並在結束前 `page.unrouteAll({ behavior: "ignoreErrors" })`。SHALL NOT 使用 `waitForTimeout`。放行前的斷言數量保持精簡（Decision 7 的 10 秒逾時，design Risks）。

## auth

### Requirement: 全頁共用的 session store 與 useSession（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶 | 有上次登入提示時 client 初始快照帶提示而伺服器端快照不帶 | `localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, "1")` → `resetSessionStoreForTests()`；`fetchSession` 回永不完成的 Promise → `getSnapshot()` 為 `{ status: "loading", signedInHint: true }`、兩次 `toBe` 同一參考；`getServerSnapshot()` 為 `{ status: "loading" }`；`fetchSession` 未被呼叫 | golden path；現行快照不帶提示 → **真紅** | unit |
| 帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading | 帶提示等待逾時後回到不帶提示的 loading | `vi.useFakeTimers()`；有提示、永不完成 → `subscribe(listener)` → `advanceTimersByTime(9_999)` 仍帶提示 → 再推進 1 → 快照 `toEqual({ status: "loading" })`、listener 被呼叫；第二輪 reset 後 `fetchSession` 回已登入 → 等 ready → 推進 10_001 → 快照仍為 ready；`finally` 還原 real timers | 「不得永遠卡在載入中」的唯一保證 → **真紅** | unit |
| 有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示 | 有提示時 hydration 一致且完成後反映提示 | 有提示、`fetchSession` 永不完成；`Probe` 顯示 `session.status === "loading" && session.signedInHint === true ? "hinted" : "plain"` → `renderToString` 含 `plain`；`container.innerHTML = html`、spy `console.error`、`hydrateRoot(container, el, { onRecoverableError })` 包在 `act` → 兩者皆未被呼叫、`container.textContent` 為 `hinted` | hydration 安全是使用者硬性要求；現行無提示 → `hinted` 不出現 → **真紅** | unit |
| （既有）初始為 loading，第一次訂閱後取得 session 並轉為 ready；請求完成前的多個訂閱者只觸發一次請求；refresh 重新取得 session 並通知所有訂閱者；模組剛載入時為 loading，第一次訂閱才請求；getServerSnapshot 在 store 已為 ready 後仍固定為 loading；useSession 回傳 store 快照並隨 refresh 更新；伺服器端 render 時 useSession 為 loading 且不發請求；其餘既有 it | 初始為 loading…／多個訂閱者…／refresh…／useSession 隨 store 更新／伺服器端 render 為 loading | 原樣通過（`beforeEach` 加 `localStorage.clear()` 後；斷言一字不改） | regression guard：無提示時行為不變 | unit |

### Requirement: 上次登入提示的儲存與清除（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 寫入後讀取為 true 且只存固定值，清除後讀取為 false | 提示只以固定值寫入並可清除 | 空 localStorage → `readSignedInHint()` false → `writeSignedInHint()` → `getItem("auth:signed-in-hint:v1") === "1"`、`localStorage.length === 1` → read true → `clearSignedInHint()` → `getItem` 為 null → read false；`SIGNED_IN_HINT_STORAGE_KEY === "auth:signed-in-hint:v1"` | 模組不存在 → **真紅**（import 失敗） | unit |
| 值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯 | 非固定值或 localStorage 不可用時不拋錯 | `"true"`、`"0"`、`"u1"` 各讀為 false；`vi.spyOn(Storage.prototype, "getItem"/"setItem"/"removeItem").mockImplementation(() => { throw … })` 下三函式 `not.toThrow()`、讀取為 false；`finally` `vi.restoreAllMocks()` | 個資與穩定性邊界 → **真紅**（同上） | unit |
| session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示 | session 確認結果決定寫入或清除提示 | `fetchSession` 依序 `mockResolvedValueOnce` 已登入、`{ authEnabled: true, user: null }`、已登入、`{ authEnabled: false, user: null }` → subscribe 等 ready 後 `readSignedInHint()` true；每次 `await refresh()` 後依序 false、true、false | golden path；現行 store 不寫提示 → **真紅** | unit |
| 被丟棄的過時 session 回應不改變提示 | 過時的 session 回應不改變提示 | 比照既有「進行中呼叫 refresh 會重新請求…」的 A／B resolver：B 先 resolve 已登入 → `await pending` → A resolve `{ authEnabled: true, user: null }` → 兩次 `await Promise.resolve()` → `readSignedInHint()` true、快照 `user` 為 B | 邊界：提示寫入若放在 `requestId` 守衛之前會被舊回應清掉；現行不寫提示 → **真紅** | unit |
| signOut 成功時清除上次登入提示，失敗時保留 | 登出成功時立即清除提示 | 先 `writeSignedInHint()`；`fetch` 回 200 → `await signOut()` 後 read false；再寫入、`fetch` 回 500 → read true | golden path；現行 signOut 不碰 localStorage → **真紅** | unit |

## user-data-sync

### Requirement: 前端依 session 選擇儲存模式（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| session 載入中且帶上次登入提示時為 pending | session 載入中且帶上次登入提示時為 pending | `{ status: "loading", signedInHint: true }` → `"pending"`；`{ status: "loading" }` → `"local"`；`{ ready, authEnabled: false, user: null, signedInHint: true }`、`{ ready, authEnabled: true, user: null, signedInHint: true }`、`{ ready, authEnabled: true, user: USER, signedInHint: true }`（皆 `as unknown as SessionSnapshot`）→ `"local"`、`"local"`、`"remote"` | 第三態的唯一判斷；現行回 `"local"` → **真紅** | unit |
| 只有 session 就緒、auth 啟用且有 user 時為 remote（既有） | 只有就緒、啟用且已登入時為 remote | 原樣通過 | regression guard：無提示的 loading 仍為 local（訪客零變更的核心） | unit |

### Requirement: session 確認前的等待中畫面（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| session 等待中時不回傳本機名單、syncStatus 為 loading 且操作不寫入本機也不發請求 | 等待中：名單選擇器不交出本機名單且操作無效 | 種一位本機參賽者；mock 等待中 → `players` 為 `[]`、`syncStatus` 為 `loading`、`droppedCount` 0；`act` 內 `addPlayer`、`togglePlayerActive(<本機 id>)`、`resetRoster()` → `players` 仍 `[]`；`matchmaker:roster:v1` 解析後與種入時深度相等；`fetchMock` 未被呼叫 | golden path；現行回本機名單與 `local` → **真紅** | unit |
| 等待中的 session 確認為未登入時改回本機名單 | 等待中：確認為未登入後改回本機名單 | 種一位；mock 等待中 → `players` 為 `[]`；mock 改 `{ ready, authEnabled: true, user: null }`、`rerender` → `players` 為該位、`syncStatus` 為 `local` | 「提示殘留」的轉換；現行等待中即回本機 → 第一段斷言 **真紅** | unit |
| session 等待中時不回傳本機回合與歷史、syncStatus 為 loading 且操作不生效 | 等待中：回合選擇器不交出本機回合與歷史且操作無效 | 種本機回合與一筆歷史；mock 等待中；`useRoundStore({ players: [四位], updatePlayer: vi.fn(), … })` → `round` null、`history` `[]`、`droppedCount` 0、`syncStatus` `loading`、`remoteMatchSlots` null；`generateRound(<合法設定>)` 回 `ok: false`；兩個本機 key 深度相等；`updatePlayer` 未被呼叫；`fetchMock` 未被呼叫 | 對戰頁回填寫本機歷史的根因（Context）；現行回本機回合 → **真紅** | unit |
| session 等待中時不回傳本機計分且 syncStatus 為 loading，帶 matchId 時綁定狀態為 pending | 等待中：計分板選擇器不交出本機計分且綁定場次不顯示為失效 | 種 `scoreboard:current:v1`（非初始比分）；mock 等待中 → `useScoreboardStore(null)`：`[0]` 等於 `createInitialState()`、`[2]` `standalone`、`[3]` `loading`；`act` dispatch `RALLY_WON` 後 `[0]` 仍等於初始、本機 key 深度相等；`useScoreboardStore("m1")`（無分槽）：`[2]` `pending`、`[3]` `loading`；`fetchMock` 未被呼叫 | 現行回本機與 `missing` → **真紅** | unit |
| （既有）session 載入中或訪客時走本機且 syncStatus 為 local（名單、計分板）；session 載入中或訪客時走本機回合且 syncStatus 為 local；選擇器把 session 的 user id 傳給雲端 hook；已登入時改用雲端…（三個選擇器） | 主 spec `player-roster`／`round-lifecycle`／`scoreboard` 的對應 Scenario（MODIFIED 帶入的既有 Scenario 以此列合併） | 原樣通過（mock 為不帶提示的 `{ status: "loading" }`） | regression guard：無提示時走本機、已登入時走雲端皆不變 | unit |
| session 等待中時顯示載入中提示且不渲染本機歷史 | 等待中：歷史頁顯示載入中且不讀本機歷史 | 種一筆今日歷史；`vi.mock("./RemoteHistoryView", () => ({ RemoteHistoryView: () => <div data-testid="remote-history-view" /> }))`；mock 等待中 → `getByRole("status")` 文字「正在載入雲端資料…」、`container.querySelector('[data-sync-status="loading"]')` 存在；`queryByRole("radiogroup", { name: "歷史區間" })` null；該筆的 `history-record-<matchId>` 不存在；`remote-history-view` 不存在 | 現行掛 `HistoryView` → **真紅** | unit |
| session 等待中時統計頁顯示載入中提示且不掛載雲端統計內容 | 等待中：統計頁顯示載入中且不掛載雲端統計 | `vi.mock("@/components/matchmaker/RemoteStatsContent", …)` 為 testid stub；mock 等待中；`render(<MatchmakerStatsPage />)` → status 文字為固定文案、`main[data-sync-status="loading"]` 存在、heading「球員統計」不存在、stub 不存在；`fetchMock` 未被呼叫 | 現行 `=== "local"` 二分 → 掛雲端 → **真紅** | unit |
| session 等待中時以載入中提示取代匯出與還原操作 | 等待中：JSON 備份區塊不提供匯出與還原 | mock 等待中 → heading「JSON 完整備份」存在；status 文字為固定文案；`queryByRole("button", { name: "匯出 JSON" })` null；`queryByTestId("json-backup-import-input")`、`queryByTestId("json-backup-cloud-import-input")` 皆 null | 現行走本機分支（覆寫式還原可用）→ **真紅** | unit |
| session 等待中時以載入中提示取代匯出操作 | 等待中：歷史 CSV 區塊不提供匯出 | mock 等待中 → heading「歷史賽果 CSV 匯出」存在；status 文字為固定文案；按鈕「匯出 CSV」不存在 | 現行可匯出本機 CSV → **真紅** | unit |
| session 等待中時以載入中提示取代選檔與確認匯入 | 等待中：參賽者 CSV 匯入區塊不提供選檔與確認 | 新檔，`vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }))`；mock 等待中 → heading「參賽者名單 CSV 匯入」存在；status 文字為固定文案；`roster-csv-import-input` 與按鈕「確認匯入」皆不存在 | 現行可寫入本機名單並 reload → **真紅** | unit |
| regression guard：session 等待中時不渲染匯入區塊 | 等待中：匯入本機資料區塊不渲染 | 種一位本機參賽者；mock 等待中 → `queryByTestId("local-import-section")` null；`fetchMock` 未被呼叫 | 現行 `=== "remote"` 已正確 → 寫入即綠（regression guard，鎖住 Decision 1 表格最後一列；mutation `isRemote` 改 `mode !== "local"` 須轉紅） | unit |
| 已登入者重新整理參賽者頁時在 session 回應前顯示載入中而非空名單 | 已登入者重新整理時在 session 回應前顯示載入中而非空名單 | `seedCloudPlayers` 一位「雲端甲」→ goto `/matchmaker/players` → `[data-sync-status="synced"]` 與「雲端甲」可見 → route 暫停 → `page.reload()` → `main[data-sync-status="loading"]` 可見、`getByRole("status")` 文字固定文案、`getByText("目前還沒有參賽者")` `toHaveCount(0)`、`getByText("共 0 位參賽者")` `toHaveCount(0)` → 放行 → synced 與「雲端甲」可見 | 使用者回報的原始情境；§2 後、§3 GREEN 前選擇器把 pending 當本機 → 顯示空名單 → **真紅** | e2e |
| 訪客重新整理參賽者頁時在 session 回應前即顯示本機名單 | 訪客重新整理時行為不變 | 無 storage state；goto 後 `page.evaluate` 寫一位本機參賽者（`ROSTER_STORAGE_KEY`）→ route 暫停 → reload → 該參賽者可見、`[data-sync-status]` `toHaveCount(0)`、`getByRole("status")` `toHaveCount(0)` → 放行 → 仍可見、兩者仍為 0 | regression guard：訪客零變更（寫入即綠） | e2e |
| 上次登入提示殘留但已非登入時先顯示載入中再顯示本機名單並清除提示 | 上次登入提示殘留但已非登入時短暫等待後回到本機 | 無 storage state；goto 後寫一位本機參賽者與 `SIGNED_IN_HINT_STORAGE_KEY = "1"` → route 暫停 → reload → `main[data-sync-status="loading"]` 可見、該參賽者 `toHaveCount(0)` → 放行 → 參賽者可見、`[data-sync-status]` `toHaveCount(0)`、`page.evaluate` 讀該 key 為 `null` | 殘留提示的完整路徑；§3 GREEN 前不顯示載入中 → **真紅** | e2e |
| （既有）`user-data` 全部 spec 與五個 browser project 全部 spec | 既有 Scenario | 原樣通過 | regression guard：登入後 reload 路徑改變（design Risks）、訪客每次載入多一次 `removeItem` | e2e |

## player-roster

### Requirement: 登入時名單以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 等待中時不回傳本機名單、syncStatus 為 loading 且操作不寫入本機也不發請求；等待中的 session 確認為未登入時改回本機名單 | 見 user-data-sync「等待中：名單選擇器…」「等待中：確認為未登入後改回本機名單」 | 同上表 | 本 Requirement 只改「否則回傳本機實作」一句，行為錨點集中在 user-data-sync（design Decision 10） | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard（C3／C5 全套守住） | unit |
| （既有）本 Requirement 全部既有 E2E | 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## round-lifecycle

### Requirement: 登入時回合與場次分槽以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增行為的錨點）session 等待中時不回傳本機回合與歷史、syncStatus 為 loading 且操作不生效 | 見 user-data-sync「等待中：回合選擇器…」 | 同上表 | 同 player-roster 列 | unit |
| （既有）本 Requirement 全部既有 Scenario 的 it／test | 全部既有 Scenario | 原樣通過 | regression guard（C3／C5 全套守住） | unit |
| （既有）本 Requirement 全部既有 E2E | 全部既有 E2E Scenario | 原樣通過 | regression guard | e2e |

## data-transfer

### Requirement: 清除本機資料與其確認流程（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| regression guard：clearAllLocalData 不移除上次登入提示 | 清除本機資料不移除上次登入提示 | `localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, "1")` 與名單 key → `clearAllLocalData()` → 名單 key null、提示仍 `"1"`；`(CLEAR_ALL_KEYS as readonly string[]).includes(SIGNED_IN_HINT_STORAGE_KEY)` 為 false | `CLEAR_ALL_KEYS` 不變 → 寫入即綠（regression guard，鎖住 Decision 8；mutation 把提示加入清單須轉紅） | unit |
| （既有）clearAllLocalData 移除本 app 寫入的全部 LocalStorage key；clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響 | 確認後本 app 寫入的全部已知 key 皆被移除；清除不動列舉範圍以外的 key | 原樣通過（斷言一字不改） | regression guard | unit |
| （既有）清除本機資料的確認提示…；取消清除本機資料後名單維持不變；確認清除本機資料後參賽者頁回到空白狀態 | 確認提示…／取消清除…／清除後回到空白狀態 | 原樣通過 | regression guard | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck`（不 `cd`；不用 `pnpm --dir <root> --filter`，cwd 不在 root 時會 No projects matched 且 exit 0） | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數＝基線＋4（`session-hint.test.ts`、`HistoryModeSwitch.test.tsx`、`RosterCsvImportSection.test.tsx`、`app/matchmaker/stats/page.test.tsx`）、測試數＝基線＋20；後端、核心與基線相同 |
| C4 | （建置） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 依 project 分開跑（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | user-data＝基線＋1，全 passed、0 skipped；五個 browser project 各＝基線＋2 且 0 failed（skip 只限既有瀏覽器條件）；無因缺帳密 skip |
| C6 | （使用端清單，Decision 1） | `grep -rn "resolveStorageMode(" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/lib \| grep -v "\.test\." \| grep -v "export function"` | 輸出的檔案集合恰為 design Decision 1 表格的 9 個檔案，無新增使用端 |
| C7 | （範圍） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat -- hono-pickball packages nextjs-pickball/hooks/useSession.ts nextjs-pickball/hooks/useRemote*.ts nextjs-pickball/components/sync nextjs-pickball/lib/sync/sync-status.ts nextjs-pickball/lib/matchmaker/transfer-storage.ts nextjs-pickball/components/matchmaker/LocalDataImportSection.tsx nextjs-pickball/components/matchmaker/ClearLocalDataSection.tsx nextjs-pickball/components/scoreboard nextjs-pickball/app/matchmaker/players nextjs-pickball/app/matchmaker/page.tsx nextjs-pickball/package.json pnpm-lock.yaml` | 輸出為空 |
| C8 | （規格） | `DO_NOT_TRACK=1 openspec validate session-pending-loading --strict`（repo root） | valid |

## Checklist

- [x] 每個 Requirement 至少一列（auth 2、user-data-sync 2、player-roster 1、round-lifecycle 1、data-transfer 1）
- [x] 每個新增 Scenario（auth 8、user-data-sync 14、data-transfer 1）至少一列；MODIFIED 帶入的既有 Scenario 以「（既有）」列合併
- [x] 每列皆有 Tier（unit | e2e）
- [x] 新 it 共 20（真紅 18、regression guard 2）；新 E2E 3（真紅 2、regression guard 1）
- [x] 授權修改的既有測試只有兩處 `beforeEach` 各加一行 `localStorage.clear()`，不改任何 it 名稱與斷言
