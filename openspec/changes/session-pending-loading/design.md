# Design: session-pending-loading

## Context

- `lib/auth/session-store.ts` 是全頁共用的 module 層級 store：初始快照 `{ status: "loading" }`，第一次被訂閱才呼叫 `fetchSession()`，之後快照為 `{ status: "ready", authEnabled, user, signInMethods? }`；
  `refresh()` 期間快照維持 ready、不回到 loading。`hooks/useSession.ts` 以 `useSyncExternalStore` 讀它，server snapshot 固定 `{ status: "loading" }`。
- `fetchSession()` 絕不 throw：非 200、JSON 錯誤、形狀不符、網路錯誤一律回 `{ authEnabled: false, user: null }`（fail-closed）。因此 store 一定會轉為 ready，只有「請求永不結束」會讓它一直停在 loading。
- `lib/sync/storage-mode.ts` 的 `resolveStorageMode` 只有兩態，loading 一律 `"local"`。主 spec 刻意如此（訪客首屏時序不變），並把「已登入者先看到本機資料一瞬間」列為取捨。
- `resolveStorageMode` 的產品使用端共 9 處（`grep -rn "resolveStorageMode(" nextjs-pickball/{app,components,hooks,lib}`，不含測試）：
  `hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、`components/matchmaker/HistoryModeSwitch.tsx`、`app/matchmaker/stats/page.tsx`、
  `components/matchmaker/{LocalDataImportSection,JsonBackupSection,RosterCsvImportSection,HistoryCsvSection}.tsx`。前三者是選擇器 hook，後六者以 `=== "remote"` 或 `=== "local"` 二分。
- 頁面層的載入保護：參賽者頁、對戰頁、`LocalStatsContent`、`RemoteStatsContent`（名單）、`Scoreboard` 都有「`syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代主要內容、根元素帶 `data-sync-status`」的分支；`HistoryView` 直接讀 `readHistory()`，不經 store。
- 本機 hook 依 hooks 規則永遠 mount，mount 時讀本機資料並把同一份寫回（雲端模式下也一樣）。對戰頁的分槽回填 effect 在 `round !== null` 且 `remoteMatchSlots === null` 時會讀本機分槽、呼叫本機 `submitScore` 並清除分槽——也就是說，現況下已登入者在 session 回應前，本機殘留的已完成分槽會被寫進本機歷史。
- 頁面是靜態預先渲染的 client component：伺服器輸出（以及 JS 載入前的畫面）一律是本機初始狀態（名單為空），訪客與登入者相同；本機資料要到 hydration 後的 effect 才讀入。
- 專案讀 localStorage 的既有慣例：render 期間不讀（hydration 安全），改在 effect 內讀並 dispatch，或經 `useSyncExternalStore` 的 server snapshot 區隔；localStorage 讀寫放 `lib/`；key 命名 `<領域>:<名稱>:v<版本>`（`matchmaker:roster:v1`、`scoreboard:current:v1`）。
- 使用者已定案方案 B（瀏覽器提示），不做方案 C（伺服器端判斷），不改後端。

## Goals / Non-Goals

**Goals**

- 有「上次登入」提示的瀏覽器在 session 回應前（hydration 之後）顯示既有的「正在載入雲端資料…」，不顯示本機資料、不能對本機資料或雲端做任何互動。
- 沒有提示的瀏覽器（訪客、從未登入）行為、DOM、時序完全不變。
- 提示只存布林、不含個資；SSR 與 hydration 不產生不一致；不會永遠停在等待中。

**Non-Goals**

- **hydration 之前的畫面**：靜態 HTML 對所有人都是本機初始狀態，登入者在 JS 載入前仍會看到它一瞬間（訪客同樣看到空名單後才出現本機名單）。要消除這段需要伺服器端得知登入狀態（方案 C）或在 `<head>` 插入預先執行的 inline script 隱藏內容，兩者皆不在範圍。
- 改 `/api/session` 契約或 `fetchSession` 的 fail-closed 規則（例如區分「請求失敗」與「auth 停用」）。
- session 失敗的重試、新文案、登入入口改顯示頭像、本機資料自動匯入雲端。
- 新增 hook、新增相依、後端與核心套件變更。

## Decisions

### Decision 1：在 storage-mode 加第三態 `"pending"`，使用端逐一定案

**Choice**：`resolveStorageMode(snapshot)` 回傳 `"local" | "remote" | "pending"`；`status === "loading"` 且 `snapshot.signedInHint === true` 時為 `"pending"`，其餘規則逐字不變。
9 個使用端的處置如下（等待中結果見 Decision 5、6）：

| 使用端 | 現況（pending 會被當成） | 本 change |
|---|---|---|
| `useRosterStore` | `=== "remote"` → 本機 | 等待中結果（Decision 5） |
| `useRoundStore` | 同上 | 等待中結果 |
| `useScoreboardStore` | 同上 | 等待中結果 |
| `HistoryModeSwitch` | `=== "remote"` → `HistoryView` | 載入中提示（Decision 6） |
| `app/matchmaker/stats/page.tsx` | `=== "local"` → 否則 `RemoteStatsContent` | 改走 `LocalStatsContent` |
| `JsonBackupSection` | `=== "remote"` → 本機匯出與覆寫式還原 | 操作區換成提示 |
| `HistoryCsvSection` | 同上 → 本機 CSV 匯出 | 操作區換成提示 |
| `RosterCsvImportSection` | 同上 → 本機 CSV 匯入（寫入本機並 reload） | 操作區換成提示 |
| `LocalDataImportSection` | `=== "remote"` → 不渲染 | 不改（現況即正確），以 regression guard 鎖住 |

**型別強制的取捨**：使用端以字串比較二分，加入第三個字面值不會讓既有比較在 tsc 期報錯。本 change 改以「使用端清單」強制：上表即完整清單，tasks 的指令驗收以 grep 機械比對使用端集合恰為這 9 處，且每一處都有對應測試（7 處 RED、`LocalDataImportSection` 為 regression guard、選擇器另含轉換測試）。

**Alternatives considered**：
- 回傳物件聯集（例 `{ kind: "remote" } | …`）讓所有 `=== "remote"` 變成 TS2367 錯誤：只能逼使用端「被碰到」，改寫成 `.kind === "remote"` 後 pending 照樣靜默落入本機；且要改 9 處呼叫寫法與主 spec 簽章。保證力與使用端清單相同、改動更大。不選。
- 新增必填參數（例 `resolveStorageMode(snapshot, hint)`）：需要另一個 hook 供應 hint，等於新增 hook（要更新 `pickleball-guide-page` 的 hooks 歸屬清單）。不選。
- 各元件自行讀提示判斷：判斷散在 9 處、每處都要處理 hydration。不選。
- 新增 `SyncStatus` 值（例 `"pending"`）：要新文案或改 `sync-status.ts` 的固定文案表，且每個頁面的 `loading` 判斷都要多一個條件。等待中本質就是「雲端載入中」，沿用 `loading`。不選。

### Decision 2：提示經 session store 快照帶出，hydration 沿用 `useSyncExternalStore` 的 server snapshot

**Choice**：`SessionSnapshot` 的 loading 變體擴充為 `{ status: "loading"; signedInHint?: true }`。session store 在 client 端**第一次讀快照**時讀一次提示並快取成兩個常數之一（`{ status: "loading" }` 或 `{ status: "loading", signedInHint: true }`），模組載入時不讀 localStorage；`getServerSnapshot()` 仍固定回 `{ status: "loading" }`。
`useSession` 不改：它原樣展開快照，提示自然出現在 `useSession()` 的回傳值，所有使用端只要照舊把 session 交給 `resolveStorageMode`。

**hydration**：伺服器 render 與 hydration 的第一次 render 都用 server snapshot（不帶提示 → `"local"`），與靜態 HTML 一致，不產生 mismatch；
hydration 完成後 React 發現 client 快照不同，以 client 快照重新 render，此時才進入 `"pending"`。這是 `useSession` 既有的做法（同一個 store、同一條路徑），不需 mounted 旗標或 effect。
hydration 那一次 commit 的畫面與靜態 HTML 相同，不會多出新的閃現；本機 hook 在 effect 內讀入的本機資料不會被交出（選擇器在下一次 render 已是 pending）。
Context7 `/reactjs/react.dev`（reference/react/useSyncExternalStore「Adding support for server rendering」）：`getServerSnapshot` 只在伺服器產生 HTML 與 client hydration 時執行，必須與伺服器端回傳相同的資料；之後以 `getSnapshot` 為準，值不同（`Object.is`）時重新 render——與本設計一致（apply §1.2 再以 React 19 文件複核）。

**Alternatives considered**：
- 獨立 hook（例 `useSignedInHint`）：新增 hook 要更新 hooks 歸屬清單，且每個使用端都要多呼叫一個 hook。不選。
- 在 render 期間直接讀 localStorage：違反專案的 hydration 慣例，伺服器與 client 第一次輸出不同會產生 mismatch。不選。
- 各元件以 mounted 旗標延後判斷：9 處各寫一份，且 mounted 前仍是本機畫面。不選。

### Decision 3：提示格式與存放

**Choice**：新模組 `lib/auth/session-hint.ts`（localStorage I/O 放 `lib/`），key `auth:signed-in-hint:v1`（沿用 `<領域>:<名稱>:v<版本>`），值固定 `"1"`；讀取只有恰為 `"1"` 才為 true；三個函式包 try/catch 不拋錯（SSR 無 `window`、私密模式、配額滿）。

**Alternatives considered**：
- 存 user id 以便「同一帳號才等待」：是個資，且等待中本來就不顯示任何帳號資料、雲端 hook 以 session 回應的 user id 為準，存 id 沒有用途。不選。
- sessionStorage：只在同一分頁內存活，從主畫面捷徑或新分頁開啟時沒有提示，等於只修一半。不選。
- cookie：前端 SHALL NOT 依賴 session cookie（auth 主 spec），另設非 HttpOnly cookie 又會隨每個請求送到後端，沒有必要。不選。

### Decision 4：寫入與清除時機，以及 session 失敗的處理

**Choice**：
- session store 每次**採用**回應時：`authEnabled && user !== null` → 寫入；其餘 → 清除。判斷條件與 `resolveStorageMode` 的 remote 條件相同。被 `requestId` 丟棄的過時回應不動提示（與快照一致）。
- `signOut()` 回 2xx 時立即清除；失敗不清（仍是登入狀態，之後的 `refresh` 會再寫回）。兩個登出入口（`LoginForm`、`AccountEntry`）都是 `await signOut(); await session.refresh()`，refresh 的結果也會清除；在 `signOut` 內清除是為了 refresh 完成前就重新整理的情況，也不必改兩個元件。
- **session 失敗**：`fetchSession` 的 fail-closed 已把所有失敗降級為「auth 停用」，store 因此清除提示並轉為 ready → `"local"`——與現行 session 失敗的處理一致（回到本機畫面），不會停在等待中。代價是一次暫時性網路失敗會清掉提示，下一次重新整理少了等待中（回到現況），session 確認後又會寫回。

**Alternatives considered**：
- 失敗時保留提示：store 看到的失敗與「auth 停用」是同一個值，要區分就得改 `fetchSession` 的回傳契約（auth 主 spec 的 fail-closed Requirement）。不選。
- 只在明確登出時清除、其他情況不清：cookie 過期或 auth 停用後提示永遠殘留，每次重新整理都先等一下。不選。
- 在 `LoginForm`／`AccountEntry` 各自清除：兩處重複，且漏掉日後的第三個登出入口。不選。

### Decision 5：選擇器的等待中結果

**Choice**：三個選擇器在 `"pending"` 時都不啟用雲端 hook（`enabled` 為 false，`userId` 本來就是 `null`），回傳：
- `useRosterStore`：未啟用的雲端 hook 結果，`syncStatus` 改為 `"loading"`。未啟用時雲端 hook 的名單是初始空陣列、所有操作因 `controllerRef.current === null` 直接返回，正好是「空資料、操作不生效」。
- `useRoundStore`：同上。未啟用時 `round` 為 `null`、`history` 為空、`remoteMatchSlots` 為 `null`，七個操作因 `notReady()` 回 `ok: false`（訊息為雲端 hook 既有的未就緒文案）。`round` 為 `null` 也讓對戰頁的分槽回填 effect 直接 return，不碰本機分槽與歷史。
- `useScoreboardStore`：明確回傳 `[計分板初始狀態, 不做事的 dispatch, matchId === null ? "standalone" : "pending", "loading"]`。不沿用未啟用的雲端計分板 hook：它在未啟用時回傳真正的 `dispatch`（會改記憶體中的狀態），不符合「操作不生效」。綁定狀態用 `"pending"` 而非本機判定的 `"missing"`，否則帶 `?match=` 的已登入者會先閃「場次已失效」。

可以沿用未啟用的雲端 hook，是因為等待中只出現在第一次取得 session 之前：雲端 hook 在這之前從未啟用過，內部一定是初始狀態（Context：store 取得回應後不會回到 loading）。Implementer 若改寫為明確常數，行為必須與上述相同（由測試鎖住）。

**Alternatives considered**：
- 回傳本機結果但把 `syncStatus` 改成 `loading`：頁面的 loading 分支會遮住畫面，但本機 `round` 仍非 null，對戰頁的回填 effect 會在等待中把本機分槽寫進本機歷史；操作也仍會寫本機。不選。
- 三者都寫明確常數：名單與回合要重做七個操作的失敗回傳型別與文案，與雲端 hook 的未就緒防線重複。不選（計分板例外，理由見上）。

### Decision 6：歷史、統計入口與資料頁四個區塊的處置

**Choice**：
- `HistoryModeSwitch`：`"pending"` 時渲染 `<div data-sync-status="loading" className="flex flex-col gap-4"><SyncStatusNotice status="loading" /></div>`（容器 class 與 `HistoryView`／`RemoteHistoryView` 的根元素相同，版面不跳動），不掛載任何歷史元件。歷史頁標題由 server component `page.tsx` 輸出，維持顯示。
- 統計頁入口：改為 `mode === "remote" ? 雲端 : LocalStatsContent`。`LocalStatsContent` 的名單來自選擇器，等待中為 `loading`，其既有分支會渲染與參賽者頁相同的 `<main data-sync-status="loading">` 提示；維持「雲端內容只在 `"remote"` 時掛載」的既有不變式。
- `JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`：`"pending"` 時保留 `CardHeader`（標題與說明兩種模式文字相同），`CardContent` 只放 `SyncStatusNotice`（`loading`）。判斷放在所有 hook 呼叫之後。
- `LocalDataImportSection`：不改。`ClearLocalDataSection`：不改——它不讀儲存模式，兩種模式都只清本機 key（data-transfer 主 spec「登入時的資料工具頁」表：不變），在等待中按下的結果與 session 確認後按下相同，不是「對錯的一邊動手」。

**Alternatives considered**：
- 資料頁加一個包住四個區塊的 client 閘門元件：要在資料頁（純入口 server component）新增元件與接線，且區塊內部仍要處理三態；只換來「頁面一個提示、而非三個」。不選。
- 區塊在等待中改為 disabled 按鈕：要決定顯示本機還是雲端版的標籤（JSON 還原兩種模式的選檔標籤與說明不同），顯示本機版就是另一種「先閃本機畫面」；`FileTextPicker` 也沒有 disabled 介面。不選。
- 區塊在等待中不渲染：資料頁只剩標題與「清除本機資料」，沒有載入中提示，session 回應後區塊突然出現。不選。
- `HistoryModeSwitch` 在等待中掛 `RemoteHistoryView`：它在 `userId` 為 `null` 時會顯示引導型空狀態（「還沒有任何紀錄」），正是要避免的誤導。不選。

### Decision 7：等待逾時 10 秒

**Choice**：store 在第一次訂閱時，若快照帶提示就排一個 10 秒（`SIGNED_IN_HINT_WAIT_MS`）的計時器；到期時若仍未採用任何回應，快照改為不帶提示的 `{ status: "loading" }` 並通知——回到現行行為（顯示本機畫面），之後回應到達照常轉為 ready。已轉為 ready 後到期不做事。`resetSessionStoreForTests()` 一併清除計時器與快取的提示。

**Rationale**：`fetchSession` 對所有「會結束」的失敗都會回應，唯一會讓等待中無限延續的是請求永不結束（瀏覽器的 fetch 逾時通常以分鐘計）。10 秒遠大於正常 session 往返（本機與正式站皆為數百毫秒等級），又不至於讓使用者以為當機。

**Alternatives considered**：
- 不設逾時：請求懸住時已登入者會一直看到「正在載入雲端資料…」，違反「不得永遠卡在載入中」。不選。
- 在 `fetchSession` 加 `AbortSignal.timeout`：改變所有人的 session 契約，逾時變成「auth 停用」會清除提示並讓已登入者在慢網路下被當成停用。不選。
- 更短（例 3 秒）：慢速行動網路下會讓已登入者回到「先閃本機畫面」。不選。

### Decision 8：「清除本機資料」不清除提示

**Choice**：`CLEAR_ALL_KEYS` 不變；data-transfer「清除本機資料與其確認流程」以 MODIFIED 明定此 key 為唯一例外，並加一個 regression guard Scenario。

**Rationale**：提示不是使用者資料，生命週期跟隨 session；「清除本機資料」不會登出，登入中清掉它只會在下一次 session 確認時被寫回。主 spec 要求清單涵蓋「全部 key」並要求新增 key 時主動決定是否納入——本決定即是那個主動決定，並寫進該 Requirement。

**Alternatives considered**：納入清除：要改既有 it「clearAllLocalData 移除本 app 寫入的全部 LocalStorage key」的 `expectedKeys` 斷言與 `transfer-storage.ts`，且登入中清除後下一次重新整理多一次本機閃現；換來的只是字面上的「全部」。不選。

### Decision 9：測試策略

**Choice**：
- 單元測試以 mock `useSession` 回傳 `{ status: "loading", signedInHint: true, refresh }` 驅動等待中；本機資料以 localStorage 種入，斷言「不交出、不改變、不發 `fetch`」。
- hydration 以 `renderToString` 產生伺服器輸出、放進容器後 `hydrateRoot`，斷言 `onRecoverableError` 與 `console.error` 未被呼叫、完成後反映提示（React 19 的 hydration 不一致會走這兩個出口）。
- 逾時以 fake timers 推進，測試結束還原 real timers。
- E2E：`page.route("**/api/session")` 以 Promise resolver 暫停、斷言後放行，`try／finally` 與 `page.unrouteAll({ behavior: "ignoreErrors" })` 收尾；SHALL NOT 使用 `waitForTimeout`。放行前的所有斷言都以「等待中才會出現的元素」（`main[data-sync-status="loading"]`）先行，確保檢查的是 hydration 之後的畫面，而非靜態 HTML。
  登入情境放 `user-data` project（`roster-sync.spec.ts`，沿用 `seedCloudPlayers`／`buildPlayer`），先完整載入一次讓提示寫入再重新整理；訪客與「提示殘留」情境放新檔 `tests/e2e/specs/session-pending.spec.ts`（五個 browser project，無 storage state），提示殘留以 `page.evaluate` 寫入 `SIGNED_IN_HINT_STORAGE_KEY`（從 `@/lib/auth/session-hint` 匯入，不抄字面值）。
- 測試隔離：store 現在會把提示寫入 localStorage，`session-store.test.ts` 與 `useSession.test.ts` 既有 `beforeEach` 各加 `localStorage.clear()`（proposal 授權；不改任何 it 名稱與斷言），新 it 自帶清理。

### Decision 10：spec 切法

**Choice**：等待中的所有行為集中在 `user-data-sync` 新增的「session 確認前的等待中畫面」；`player-roster`、`round-lifecycle` 的選擇器 Requirement 原文寫「否則回傳本機實作」，與新行為衝突，以 MODIFIED 只改該句並指向集中的 Requirement；
`scoreboard`「登入時獨立計分板以雲端為準」原文是「本機模式回傳本機實作」，不與等待中衝突，不動。各頁「名單 loading 時以提示取代內容」的既有 Requirement 文字對等待中同樣成立（等待中即回報 `loading`），不動。

**Alternatives considered**：把等待中 Scenario 分散到各 capability：要再 MODIFIED `scoreboard`、`match-history`、`player-stats`、`data-transfer`「登入時的資料工具頁」數個大型 Requirement，且同一條規則散成五處。不選。

## Risks / Trade-offs

- [Risk] hydration 前的靜態 HTML 仍是本機初始畫面（參賽者頁為「目前還沒有參賽者」），登入者在 JS 載入完成前仍會看到一瞬間，慢速裝置上可能明顯 → Mitigation：這段對訪客同樣存在、屬方案 C 範圍（Non-Goals）；本 change 消除的是 hydration 之後到 session 回應的那段。coordinator 須向使用者說明殘餘範圍；若仍不能接受，另開 change 評估 inline script 或伺服器端判斷。
- [Risk] 提示殘留（cookie 過期、在其他裝置撤銷 session）→ 該瀏覽器下一次重新整理先顯示載入中，session 回應後回到本機並清除提示 → 接受（使用者已知的取捨），E2E「提示殘留」鎖住「最終回到本機且清除提示」。
- [Risk] 暫時性 session 失敗會清除提示（Decision 4）→ 下一次重新整理回到現況的本機閃現，確認登入後寫回 → 接受。
- [Risk] 逾時後回到本機畫面，期間已登入者可以操作本機資料（與現況相同）→ 接受；只在請求 10 秒仍未回應時發生。
- [Risk] 既有 `user-data` E2E 在第一次載入後就會寫入提示，之後的 `page.reload()` 改為「載入中 → 雲端」而非「本機 → 載入中 → 雲端」→ Mitigation：既有 spec 已一律以 `data-sync-status` 或 response 等待（檔頭註解明寫），預期不受影響；C5 全跑，任何新失敗附證據上報 coordinator 裁定，不得自行判定為雜訊。
- [Risk] 訪客每次載入都會呼叫一次 `removeItem`（key 本來就不存在）→ DOM 與資料皆無變化；`visual-export.spec.ts` 的整份 localStorage 快照在訪客下不會多出或少掉 key。
- [Risk] 單元測試之間提示洩漏，使既有 it 的初始快照多出 `signedInHint`（例「模組剛載入時為 loading，第一次訂閱才請求」）→ Mitigation：Decision 9 的 `beforeEach` 清理；Implementer 跑完整前端套件確認。
- [Risk] E2E 暫停 `/api/session` 超過 10 秒會觸發逾時，放行前的斷言改看到本機畫面而失敗 → Mitigation：放行前只做三到四個 web-first 斷言，正常遠低於 10 秒；若出現此類失敗，屬環境負載問題，依雙鎖規則重跑並上報，不得延長逾時或改用固定延遲。
- [Risk] 統計頁等待中先掛 `LocalStatsContent`，確認登入後換成 `RemoteStatsContent`（重新 mount）→ 與現況「本機 → 雲端」的切換相同，不新增成本。
- [Risk] 同一瀏覽器多分頁：A 分頁登出會清除提示，B 分頁之後重新整理不進等待中（正確）；A 分頁登入會寫入，B 分頁原為訪客、重新整理時進入等待中再轉雲端（正確）。

## Migration Plan

無資料或 schema 遷移；不新增相依。localStorage 新 key 由前端自行寫入，舊瀏覽器第一次載入時沒有提示（行為同現況），確認登入後即寫入。
部署照 README「部署前手動檢查清單」，只影響前端 Worker（部署順序規則不變）。回滾：revert 本 change 的前端提交即可；殘留在使用者瀏覽器的 `auth:signed-in-hint:v1` 對舊版程式碼無任何作用。

## Open Questions

（無。所有設計裁量已於 Decisions 定案。）
