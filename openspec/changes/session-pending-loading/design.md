# Design: session-pending-loading

## Context

- `lib/auth/session-store.ts` 是全頁共用的 module 層級 store：初始快照 `{ status: "loading" }`，第一次被訂閱才呼叫 `fetchSession()`，之後快照為 `{ status: "ready", authEnabled, user, signInMethods? }`；
  `refresh()` 期間快照維持 ready、不回到 loading。`hooks/useSession.ts` 以 `useSyncExternalStore` 讀它，server snapshot 固定 `{ status: "loading" }`（既有 it 以 `toEqual({ status: "loading" })` 鎖住，不能加欄位）。
- `fetchSession()` 絕不 throw：非 200、JSON 錯誤、形狀不符、網路錯誤一律回 `{ authEnabled: false, user: null }`（fail-closed）。因此 store 一定會轉為 ready，只有「請求永不結束」會讓它一直停在 loading。
- `lib/sync/storage-mode.ts` 的 `resolveStorageMode` 只有兩態，loading 一律 `"local"`。主 spec 刻意如此（訪客首屏時序不變），並把「已登入者先看到本機資料一瞬間」列為取捨。
- `resolveStorageMode` 的產品使用端共 9 處（`grep -rn "resolveStorageMode(" nextjs-pickball/{app,components,hooks,lib}`，不含測試）：
  `hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、`components/matchmaker/HistoryModeSwitch.tsx`、`app/matchmaker/stats/page.tsx`、
  `components/matchmaker/{LocalDataImportSection,JsonBackupSection,RosterCsvImportSection,HistoryCsvSection}.tsx`。前三者是選擇器 hook，後六者以 `=== "remote"` 或 `=== "local"` 二分。
- 本機資料的讀取時機：三個本機 hook（`useLocalRosterStore`、`useLocalRoundStore`、`useLocalScoreboardStore`）與 `HistoryView` 都在 **effect** 內讀 localStorage（hydration 安全的既有慣例），
  第一次 render（含伺服器輸出與 hydration）一律是初始值：名單 `[]`、回合 `null`、計分 0:0、歷史 `null`（畫成空狀態）。本機 hook 用 `hasHydratedRef`（ref，不觸發 render）守門寫入，沒有「已讀入」的 state；無本機資料時不 dispatch。
- 頁面層的載入保護：參賽者頁、對戰頁、`LocalStatsContent`、`RemoteStatsContent`（名單，自有 `isBlockingStatus`）、`Scoreboard` 都有「`syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代主要內容、根元素帶 `data-sync-status`」的分支，判斷各自內聯。
- 對戰頁的分槽回填 effect 在 `round !== null` 且 `remoteMatchSlots === null` 時會讀本機分槽、呼叫本機 `submitScore` 並清除分槽——現況下已登入者在 session 回應前，本機殘留的已完成分槽會被寫進本機歷史。
- `lib/sync/sync-status.ts` 的 `SyncStatus` 有 8 個值；既有 it「local、synced、saving 不顯示提示，其餘狀態各有固定文案」以 `Record<SyncStatus, …>` 列舉並斷言 `toHaveLength(8)`——在 `SyncStatus` 加值會讓這個既有 it 的型別與斷言都要改。
- 頁面是預先渲染的 client component：伺服器輸出（以及 JS 載入前的畫面）對所有人相同。
- 專案讀 localStorage 的既有慣例：render 期間不讀，改在 effect 內讀，或經 `useSyncExternalStore` 的 server snapshot 區隔；localStorage 讀寫放 `lib/`；key 命名 `<領域>:<名稱>:v<版本>`。
- 使用者已定案方案 B（瀏覽器提示），不做方案 C（伺服器端判斷），不改後端；並認可「SSR／hydration 前一律先顯示載入中，hydration 後訪客立刻顯示本機資料」。

### 盤點清單（全站 `app/`、`components/`、`hooks/`，逐項查證）

「閃爍」定義：真實狀態還沒確定時先畫出錯誤或空白的內容（空清單、空狀態提示、預設值），確定後才換掉。

| # | 位置 | 會閃的內容（查證結果） | 處理 | 理由 |
|---|---|---|---|---|
| F1 | `/matchmaker/players`（`useRosterStore`） | 伺服器輸出與 hydration 前為「共 0 位參賽者」＋「目前還沒有參賽者」；有本機名單的訪客、登入者都先看到；登入者在 session 回應前再看到本機名單 | 是 | 本機資料讀入前與儲存模式未定時皆為等待中 |
| F2 | `/matchmaker`（名單＋回合） | 伺服器輸出為「目前沒有可出場的參賽者」空舞台、匯出鈕停用、本輪設定預設值；session 回應前為本機回合（回填 effect 還會寫本機歷史） | 是 | 同上 |
| F3 | `/matchmaker/stats`（`LocalStatsContent`） | 伺服器輸出為標題＋篩選器＋「還沒有任何對戰紀錄」；session 回應前為本機統計 | 是 | 同上 |
| F4 | `/matchmaker/history`（`HistoryView`） | 伺服器輸出為篩選器＋「還沒有任何對戰紀錄」（`hydrated === null` 時畫成空狀態）；session 回應前為本機歷史 | 是 | 同上 |
| F5 | `/scoreboard`（獨立） | 伺服器輸出為 0:0、預設設定列；有存檔的訪客先看到 0:0；session 回應前為本機比分 | 是 | 同上 |
| F6 | `/scoreboard?match=`（綁定） | 伺服器輸出為 0:0；session 回應前本機判定為「場次已失效」或本機分槽 | 是 | 同上（等待中綁定為 `pending`，不閃失效說明） |
| F7 | `/matchmaker/data` 的 `JsonBackupSection` | 伺服器輸出與 session 回應前都是本機版「選擇備份檔…」（覆寫式還原）；登入者應為雲端匯入版 | 是 | 儲存模式未定時以提示取代操作區 |
| F8 | `/matchmaker/data` 的 `HistoryCsvSection` | 兩種模式畫面相同，但 session 回應前按「匯出 CSV」會匯出本機歷史 | 是 | 同 F7（伺服器輸出也要是等待中，否則登入者會看到按鈕→提示→按鈕） |
| F9 | `/matchmaker/data` 的 `RosterCsvImportSection` | 同 F8；session 回應前確認匯入會寫入本機名單並 reload | 是 | 同 F8 |
| — | 計分板的 `useOrientation`（伺服器端 `portrait`）、`useFullscreen`（`false`）、`OrientationHint`（sessionStorage）、`useFocusMode` | hydration 前會以預設值畫出直式提示、缺全螢幕鈕 | 併入 F5／F6 | 等待中取代整個計分畫面；這三個 `useSyncExternalStore` 在 hydration 後的同步 re-render 就更新，早於本機資料讀入，計分畫面出現時已是正確值 |
| — | 對戰頁 `RoundTimerBanner`／`useRoundTimer`、`ExportActions`、`RoundControls`、`PrintSheet` | 只在有回合時有內容，hydration 前隨 F2 一起被取代 | 併入 F2 | 同上 |
| N1 | navbar `AccountEntry` | 載入中為同寬隱形佔位（`data-account-entry="loading"`），不顯示登入或登出 | 否 | 查證不會閃：沒有錯誤內容，佔位寬度與入口相同 |
| N2 | `/login` 的 `LoginForm` | 載入中 `return null`，回應後只出現一次正確內容 | 否 | 查證不會閃：不顯示表單、未開放訊息或登出鈕任何一種錯誤內容 |
| N3 | `/quiz`（`QuizClient`） | `dynamic(..., { ssr: false })`＋骨架，題目只在 client 產生一次 | 否 | 查證不會閃 |
| N4 | `/tour` 的 `TourProgressRail`（`activeIndex` 初值 0）、`ScrollTimelineProvider` | 捲動容器是 `main`，重新整理後從頂端開始，0 即正確 | 否 | 查證不會閃 |
| N5 | `LocalDataImportSection`、參賽者頁 `LocalImportNotice` | 只在雲端模式確認後由無到有出現，之前不顯示任何內容 | 否 | 查證不會閃錯誤內容（不是先畫錯再換掉） |
| N6 | `ClearLocalDataSection` | 兩種模式相同，不讀儲存模式 | 否 | 查證不會閃 |
| N7 | 首頁 `SiteNavbar`／`TocBar`（`useScrolledPast` 初值 `false`、`useScrollSpy` 初值 `null`） | 重新整理且瀏覽器在 hydration 前還原捲動位置時，導覽列先是透明樣式、目錄無高亮，300ms 過渡後變白底 | 否 | 不屬資料狀態：捲動位置連伺服器（方案 C）也無從得知，只能靠 `<head>` inline script；列為 Non-Goal 並請 coordinator 確認 |
| N8 | 指南 `Section`、導覽各 stage 的 `useReducedMotion`（伺服器端 `false`） | 要求減少動態的使用者在 hydration 前看到的是淡入動畫起點 | 否 | 不屬資料狀態：作業系統偏好伺服器同樣無從得知；列為 Non-Goal |

合計：處理 9 項（F1～F9），不處理 8 項（N1～N6 查證不會閃；N7、N8 不屬「資料狀態未知」且伺服器端判斷也無法解，只能靠 inline script）。

## Goals / Non-Goals

**Goals**

- F1～F9：資料來源還沒確定時（伺服器輸出、JS 載入前、hydration、session 等待中、本機資料讀入前）一律只顯示等待中提示「正在載入資料…」，不畫空狀態、預設值或錯誤一邊的資料，也不能操作。
- hydration 後：沒有上次登入提示的訪客在本機資料讀入的同一次 render 就看到本機資料；有提示者等到 session 確認。
- 用一套機制涵蓋所有頁面：一個儲存模式判斷（三態）＋一個顯示狀態（`pending`）＋一個「是否取代內容」判斷，不在每頁各寫一套。
- 提示只存布林、不含個資；SSR 與 hydration 不產生不一致；不會永遠停在等待中。

**Non-Goals**

- N7（首頁導覽列與目錄的捲動樣式）與 N8（減少動態偏好）：不是「資料狀態未知」，且伺服器端判斷（方案 C）也無從得知，唯一解法是在 `<head>` 插入預先執行的 inline script，不在範圍。
- N1～N6：查證後不會閃（見盤點清單）。
- 伺服器端判斷登入狀態（方案 C）、改 `/api/session` 契約或 `fetchSession` 的 fail-closed 規則。
- 登入入口改顯示頭像、本機資料自動匯入雲端、session 失敗的重試、等待中以外的新文案。
- client 端導覽（不重新整理）時本機資料在 effect 內讀入的那一次 render：仍會有一個 render 是等待中提示（原本是空狀態），本 change 不改成同步讀取。
- 新增 hook、新增相依、後端與核心套件變更。

## Decisions

### Decision 1：統一機制——「資料就緒」分兩層判斷，以同一個顯示狀態 `pending` 呈現

**Choice**：畫面能不能顯示資料只取決於兩件事，兩者都映射到同一個顯示狀態 `"pending"`：

1. **儲存模式未定**：`resolveStorageMode(session)` 回 `"pending"`——session 尚未回應，且（有上次登入提示，或這次 render 是伺服器端／hydration）。
2. **本機資料尚未讀入**：儲存模式為 `"local"`，但本機來源（三個本機 hook、`HistoryView`）的 effect 還沒讀 localStorage。

選擇器（`useRosterStore`、`useRoundStore`、`useScoreboardStore`）把兩層都折進回傳的 `syncStatus`（型別放寬為 `DataStatus = SyncStatus | "pending"`）；只依 session 的元件（歷史入口、統計入口、資料頁三區塊）直接看 `resolveStorageMode`。
頁面一律以 `lib/sync/sync-status.ts` 新增的 `isContentBlocked(status)`（`pending`、`loading`、`load-failed` 為 true）決定是否以 `SyncStatusNotice` 取代內容，取代既有五處內聯的 `=== "loading" || === "load-failed"`（含 `RemoteStatsContent` 的 `isBlockingStatus`）。

**為什麼要兩層**：只做第 1 層時，訪客在 hydration 完成後 `useSession` 的同步 re-render 已是 `"local"`，但本機 hook 的 `HYDRATE` 是 effect 內的 default lane 更新，兩者不在同一次 commit——中間那次 commit 會畫出空名單。只做第 2 層時，資料頁三區塊沒有本機來源可等，伺服器輸出會是本機版操作區（F7）。

**Alternatives considered**：
- 只用一個 mounted／hydrated 旗標（`useSyncExternalStore(() => () => {}, () => true, () => false)`）擋所有頁面：hydration 後旗標的同步 re-render 早於本機 `HYDRATE`，仍有一次 commit 畫出空狀態（上述 lane 差異），且 client 端導覽時旗標一開始就是 true，空狀態照樣出現。不選。
- 每頁各自加 mounted 判斷：判斷散在 9 處以上，正是使用者要求避免的。不選。
- 本機 hook 改在 render 期間同步讀 localStorage（`useSyncExternalStore` 的 client snapshot）：伺服器與 client 第一次輸出必然不同；要改寫三個本機 hook 的讀寫模型與既有大量測試。不選。

### Decision 2：儲存模式第三態 `"pending"`，使用端逐一定案

**Choice**：`resolveStorageMode(snapshot)` 回傳 `"local" | "remote" | "pending"`；參數型別放寬為 `SessionSnapshot & { readonly hydrated?: boolean }`（`useSession()` 的回傳值直接傳入）。
`status === "loading"` 且（`signedInHint === true` 或 `hydrated === false`）時為 `"pending"`；`hydrated` 未提供（`undefined`）視同 true，既有呼叫與既有 it 的結果不變；ready 的判斷逐字不變。
9 個使用端的處置：

| 使用端 | 現況（pending 會被當成） | 本 change |
|---|---|---|
| `useRosterStore` | `=== "remote"` → 本機 | 等待中結果（Decision 8） |
| `useRoundStore` | 同上 | 等待中結果 |
| `useScoreboardStore` | 同上 | 等待中結果 |
| `HistoryModeSwitch` | `=== "remote"` → `HistoryView` | 等待中提示（Decision 9） |
| `app/matchmaker/stats/page.tsx` | `=== "local"` → 否則 `RemoteStatsContent` | 改走 `LocalStatsContent` |
| `JsonBackupSection` | `=== "remote"` → 本機匯出與覆寫式還原 | 操作區換成提示 |
| `HistoryCsvSection` | 同上 → 本機 CSV 匯出 | 操作區換成提示 |
| `RosterCsvImportSection` | 同上 → 本機 CSV 匯入（寫入本機並 reload） | 操作區換成提示 |
| `LocalDataImportSection` | `=== "remote"` → 不渲染 | 不改（現況即正確），以 regression guard 鎖住 |

**型別強制的取捨**：使用端以字串比較二分，加入第三個字面值不會讓既有比較在 tsc 期報錯；改以「使用端清單」強制——tasks 的指令驗收以 grep 機械比對使用端集合恰為這 9 處，且每一處都有對應測試。

**Alternatives considered**：
- 回傳物件聯集讓 `=== "remote"` 變成 TS2367：只能逼使用端「被碰到」，改寫後 pending 照樣可能落入本機；改動更大。不選。
- 新增必填參數 `resolveStorageMode(snapshot, hydrated)`：9 個使用端都要改呼叫並自行取得旗標。改由 `useSession()` 帶出、選用欄位。不選。

### Decision 3：hydration 旗標由 `useSession` 帶出，不新增 hook

**Choice**：`useSession()` 的回傳值加 `hydrated: boolean`，以第二個 `useSyncExternalStore(subscribeNever, () => true, () => false)` 取得：伺服器端與 hydration 那次 render 為 `false`，hydration 完成後 React 以 client 快照同步重新 render 為 `true`；client 端非 hydration 的 mount（client 端導覽）第一次 render 就是 `true`。
session 快照（store）本身不變，`getServerSnapshot()` 仍是 `{ status: "loading" }`。
**apply 補註（型別）**：`UseSessionResult.hydrated` 宣告為 `hydrated?: boolean`（可省略）。既有 12 個元件／hook 測試檔以不含 `hydrated` 的物件 mock `useSession`，宣告為必填會讓 tsc 失敗，而既有測試不得修改；`useSession()` 執行期一律回傳 boolean，`resolveStorageMode` 將未提供視同 `true`（Decision 2），行為與 spec 一致。Stage 1 判定可接受。

**Rationale**：所有使用端本來就把 `useSession()` 的結果交給 `resolveStorageMode`，旗標隨之生效，不必改 9 處接線；不新增 hook，不必更新 `pickleball-guide-page` 的 hooks 歸屬清單。

**Alternatives considered**：
- 在 server snapshot 加標記（例 `{ status: "loading", serverRender: true }`）：既有 it「getServerSnapshot 在 store 已為 ready 後仍固定為 loading」以 `toEqual({ status: "loading" })` 鎖住，不能改。不選。
- 用快照物件的參考區分伺服器與 client：`useSession` 展開快照後參考就消失，且依賴參考比較難以理解。不選。
- 新增 `useHydrated` hook：要更新 hooks 歸屬清單與 `hooksInventory.test.ts`，使用端還要多呼叫一個 hook。不選。

### Decision 4：提示經 session store 快照帶出，hydration 沿用 `useSyncExternalStore` 的 server snapshot

**Choice**：`SessionSnapshot` 的 loading 變體擴充為 `{ status: "loading"; signedInHint?: true }`。store 在 client 端**第一次讀快照**時讀一次提示並快取成兩個常數之一（`{ status: "loading" }` 或 `{ status: "loading", signedInHint: true }`），模組載入時不讀 localStorage；`getServerSnapshot()` 仍固定 `{ status: "loading" }`。

**hydration**：伺服器 render 與 hydration 的第一次 render 都用 server snapshot（不帶提示），加上 `hydrated === false`，結果都是 `"pending"`，與伺服器輸出一致、不產生 mismatch；hydration 完成後才依 client 快照與 `hydrated === true` 重新判斷。
Context7 `/reactjs/react.dev`（reference/react/useSyncExternalStore「Adding support for server rendering」）：`getServerSnapshot` 只在伺服器產生 HTML 與 client hydration 時執行，之後以 `getSnapshot` 為準、值不同時重新 render——與本設計一致（apply §1.2 再以 React 19 文件複核）。

**Alternatives considered**：獨立 hook 讀提示（新增 hook）；render 期間直接讀 localStorage（hydration mismatch）；各元件以 mounted 旗標延後（9 處各一份）。皆不選。

### Decision 5：提示格式與存放

**Choice**：新模組 `lib/auth/session-hint.ts`，key `auth:signed-in-hint:v1`，值固定 `"1"`；讀取只有恰為 `"1"` 才為 true；三個函式包 try/catch 不拋錯（SSR 無 `window`、私密模式、配額滿）。

**Alternatives considered**：存 user id（個資且無用途：雲端 hook 以 session 回應的 user id 為準）；sessionStorage（新分頁與主畫面捷徑沒有提示）；cookie（前端不依賴 session cookie，另設 cookie 會隨每個請求送到後端）。皆不選。

### Decision 6：提示的寫入與清除時機，以及 session 失敗的處理

**Choice**：
- session store 每次**採用**回應時：`authEnabled && user !== null` → 寫入；其餘 → 清除。被 `requestId` 丟棄的過時回應不動提示。
- `signOut()` 回 2xx 時立即清除；失敗不清。兩個登出入口都是 `await signOut(); await session.refresh()`，在 `signOut` 內清除涵蓋 refresh 完成前就重新整理的情況，也不必改兩個元件。
- **session 失敗**：fail-closed 已把失敗降級為「auth 停用」，store 因此清除提示並轉為 ready → `"local"`，不會停在等待中。代價是一次暫時性網路失敗會清掉提示，下一次重新整理少了等待中，確認登入後寫回。

**Alternatives considered**：失敗時保留提示（要改 `fetchSession` 契約）；只在明確登出時清除（cookie 過期後提示永遠殘留）；在 `LoginForm`／`AccountEntry` 各自清除（重複且漏掉日後的入口）。皆不選。

### Decision 7：本機資料讀入旗標

**Choice**：三個本機 hook 各加一個 `hydrated` state（`useReducer(() => true, false)`，比照 `bindingStatus` 用 reducer 以免觸發 `react-hooks/set-state-in-effect`），在既有的 read effect 內**無論有沒有本機資料都標記**；值經 hook 的回傳值交給選擇器（`useLocal<X>Store` 的回傳型別加 `hydrated: boolean`）。
`HistoryView` 沿用既有的 `hydrated === null` 判斷，改為渲染等待中區塊（Decision 9）。

既有的 `hasHydratedRef`（寫入守門）與「沒有資料時不 dispatch `HYDRATE`」維持不變：旗標是獨立 state，不改 `state` 參考，寫入 effect 不會多跑。

**Alternatives considered**：把旗標放進既有 reducer state（`HYDRATE` 一律 dispatch）：會讓無資料時也產生新的 `state` 參考，觸發寫入 effect 把初始值寫回 localStorage，違反「無資料時不 dispatch」的既有註解與行為。不選。

### Decision 8：選擇器的等待中結果

**Choice**：
- **儲存模式 `"pending"`**：三個選擇器都不啟用雲端 hook（`enabled` 為 false，`userId` 為 `null`），回傳
  - `useRosterStore`：未啟用的雲端 hook 結果，`syncStatus` 改為 `"pending"`（空名單，操作因 controller 為 null 直接返回）。
  - `useRoundStore`：同上，`syncStatus` 為 `"pending"`（`round` 為 `null`、七個操作因 `notReady()` 回 `ok: false`；`round` 為 `null` 也讓對戰頁回填 effect 直接 return）。傳給雲端 hook 的 `rosterSyncStatus` 為 `pending` 時以 `loading` 傳入（雲端 hook 的型別維持 `SyncStatus`，兩者對它都是「名單未就緒」）。
  - `useScoreboardStore`：明確回傳 `[計分板初始狀態, 不做事的 dispatch, matchId === null ? "standalone" : "pending", "pending"]`。不沿用未啟用的雲端計分板 hook：它在未啟用時回傳真正的 `dispatch`。綁定狀態用 `"pending"`，否則帶 `?match=` 的已登入者會先閃「場次已失效」。
- **儲存模式 `"local"` 但本機尚未讀入**：回傳本機結果（此時本就是初始值），只把 `syncStatus` 設為 `"pending"`；計分板的 `bindingStatus` 沿用本機 hook 的值（首次 render 的 `pending`／`standalone` 既有語意不變）。讀入後 `syncStatus` 為 `"local"`。

可以沿用未啟用的雲端 hook，是因為等待中只出現在第一次取得 session 之前：雲端 hook 在這之前從未啟用過，內部一定是初始狀態。

**apply 補註**：
- 計分板等待中的 `state` 以模組層級常數提供（多次 render 為同一參考）。apply §3.12 實跑 E2E 時發現每次 render 回傳新的 `createInitialState()` 會讓 `Scoreboard` 依 state 參考在 render 中更新衍生狀態而無限 re-render；追加 it「session 等待中時多次 render 回傳同一個 state 參考」（先紅後綠）與對應 Scenario，新 it 總數由 29 改為 30；後續審查又追加 2 個 regression guard（`68d32d0`、`8dad6aa`），最終為 32。
- `UseRosterStoreResult` 與 `UseRoundStoreResult` 改為以 `syncStatus` 型別為參數的泛型（預設 `SyncStatus`），選擇器回傳 `<DataStatus>`：雲端 hook 與其既有測試（把 `syncStatus` 推進 `SyncStatus[]`）維持 `SyncStatus`，不必改動。

**Alternatives considered**：pending 時回傳本機結果但把 `syncStatus` 改成 `pending`：本機 `round` 非 null，回填 effect 會在等待中把本機分槽寫進本機歷史，操作也仍會寫本機。不選。

### Decision 9：頁面與元件的處置

**Choice**：
- **參賽者頁、對戰頁、`LocalStatsContent`、`RemoteStatsContent`（名單）、`Scoreboard`**：既有「取代內容」分支的條件改用 `isContentBlocked(syncStatus)`；根元素的 `data-sync-status` 照舊輸出實際值（`pending` 時為 `"pending"`），`local` 時照舊不輸出。對戰頁 `mergeSyncStatus` 的優先序在 `loading` 之後加入 `pending`，`isRosterReady` 改為 `!isContentBlocked(rosterSyncStatus)`。
- **`HistoryModeSwitch`**：`"pending"` 時渲染 `<div data-sync-status="pending" className="flex flex-col gap-4"><SyncStatusNotice status="pending" /></div>`（與 `HistoryView`／`RemoteHistoryView` 根元素同 class），不掛載任何歷史元件。
- **`HistoryView`**：`hydrated === null`（本機歷史尚未讀入）時渲染同一個等待中區塊，SHALL NOT 渲染篩選器與空狀態。歷史頁標題由 server component 輸出，維持顯示。
- **統計頁入口**：改為 `mode === "remote" ? 雲端 : LocalStatsContent`，等待中由 `LocalStatsContent` 的選擇器狀態顯示提示；維持「雲端內容只在 `"remote"` 時掛載」。
- **`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`**：`"pending"` 時保留 `CardHeader`（兩種模式文字相同），`CardContent` 只放 `SyncStatusNotice status="pending"`，且該 `CardContent` 帶 `data-sync-status="pending"`（與其他頁的根元素標示一致，停用 JavaScript 的 E2E 以它辨識資料頁）。判斷在所有 hook 呼叫之後。
- **`LocalDataImportSection`、`ClearLocalDataSection`**：不改（N5、N6）。

**Alternatives considered**：
- CSV 兩區塊在等待中保留畫面、只停用按鈕：畫面兩模式相同，可少一次提示→按鈕的切換；但伺服器輸出必須與等待中一致，停用樣式也會在訪客 hydration 後切換一次，且 `FileTextPicker` 沒有停用介面。為與其他頁一致（使用者認可「hydration 前一律先顯示載入中」），採提示。不選。
- 資料頁包一個 client 閘門元件：要在純入口 server component 新增接線，區塊內仍要處理三態。不選。
- `HistoryModeSwitch` 等待中掛 `RemoteHistoryView`：它在 `userId` 為 `null` 時顯示引導型空狀態，正是要避免的。不選。

### Decision 10：等待中的顯示狀態與文案

**Choice**：`lib/sync/sync-status.ts` 新增 `type DataStatus = SyncStatus | "pending"`、`DATA_PENDING_MESSAGE = "正在載入資料…"`、`isContentBlocked(status: DataStatus): boolean`、`localDataStatus(hydrated: boolean): DataStatus`（三個選擇器共用的本機讀入前／後判斷）；`SyncStatus` 與其 8 個固定文案不變。
`SyncStatusNotice` 的 `status` 型別放寬為 `DataStatus`：`pending` 時以同一個 `role="status"` 外觀顯示「正在載入資料…」，其餘照舊。

**Rationale**：伺服器輸出對訪客與登入者相同，沿用「正在載入雲端資料…」會讓訪客在每次載入時看到「雲端」字樣（錯誤內容）。「正在載入資料…」是唯一新增的文案，取既有文案的前半段，不指涉來源。

**Alternatives considered**：
- 在 `SyncStatus` 加值：既有 it「local、synced、saving 不顯示提示，其餘狀態各有固定文案」的 `Record<SyncStatus, …>` 與 `toHaveLength(8)` 都要改，違反「既有 it 斷言不得改」。不選。
- 沿用 `loading`：見上，訪客看到「雲端」。不選。
- 另一個 `pending: boolean` 欄位：三個選擇器回傳型別各多一個欄位，頁面要同時看兩個值，`data-sync-status` 無法標示等待中。不選。

### Decision 11：等待逾時 10 秒

**Choice**：store 在第一次訂閱時，若快照帶提示就排一個 10 秒（`SIGNED_IN_HINT_WAIT_MS`）的計時器；到期時若仍未採用任何回應，快照改為不帶提示的 `{ status: "loading" }` 並通知——回到「無提示的 loading」（訪客行為，顯示本機畫面），之後回應到達照常轉為 ready。`resetSessionStoreForTests()` 一併清除計時器與快取。

**Rationale**：唯一會讓等待中無限延續的是請求永不結束；10 秒遠大於正常 session 往返，又不至於讓使用者以為當機。

**Alternatives considered**：不設逾時（違反「不得永遠卡在載入中」）；`fetchSession` 加 `AbortSignal.timeout`（改變所有人的契約）；更短的 3 秒（慢速網路下登入者回到先閃本機）。皆不選。

### Decision 12：「清除本機資料」不清除提示

**Choice**：`CLEAR_ALL_KEYS` 不變；data-transfer「清除本機資料與其確認流程」以 MODIFIED 明定此 key 為唯一例外，並加一個 regression guard Scenario。提示不是使用者資料，生命週期跟隨 session；清掉它只會在下一次 session 確認時被寫回。

**Alternatives considered**：納入清除——要改既有 it 的 `expectedKeys` 斷言，且登入中清除後下一次重新整理多一次本機閃現。不選。

### Decision 13：測試策略

**Choice**：
- 單元測試：等待中以 mock `useSession` 回傳 `{ status: "loading", signedInHint: true, hydrated: true, refresh }` 驅動；本機讀入前的狀態以「render 階段同步記錄每次 render 的值」驗證第一筆（比照既有「帶 matchId 時首次 render 的綁定狀態為 pending 而非 missing」）；伺服器輸出以 `renderToString` 驗證。
- hydration：`renderToString` 產生伺服器輸出、放進容器後 `hydrateRoot`，斷言 `onRecoverableError` 與 `console.error` 未被呼叫。
- 逾時以 fake timers 推進，`finally` 還原。
- **E2E 證明「JS 載入前不出現空狀態」**：`test.use({ javaScriptEnabled: false })` 直接檢查伺服器輸出的畫面——七個路徑皆可見 `[data-sync-status="pending"]` 與「正在載入資料…」，且空狀態、預設比分與本機版操作皆不存在。
- **E2E 證明「整個載入過程從未出現空狀態」**：`page.addInitScript` 注入閃爍記錄器——以 `MutationObserver` 監看 `document`，每批變動檢查 `document.body.innerText` 是否含指定文字、`document.querySelector` 是否命中指定選擇器，命中即記下；頁面載入完成後讀出記錄應為空。
  記錄器放 `tests/e2e/helpers/flash-recorder.ts`，每個文件（含 reload）重新開始記錄。web-first 斷言，SHALL NOT 使用 `waitForTimeout`。
- session 暫停：`page.route("**/api/session")` 以 Promise resolver 暫停、斷言後放行，`try／finally` 與 `page.unrouteAll({ behavior: "ignoreErrors" })` 收尾；放行前的斷言先以等待中元素可見作為錨點。
- 測試隔離：store 會把提示寫入 localStorage，`session-store.test.ts` 與 `useSession.test.ts` 既有 `beforeEach` 各加 `localStorage.clear()`（proposal 授權；不改任何 it 名稱與斷言）。

### Decision 14：spec 切法

**Choice**：等待中的共通行為集中在 `user-data-sync` 新增的「資料來源確定前的等待中畫面」。與新行為字面衝突的既有 Requirement 以 MODIFIED 只改衝突的句子：
`player-roster`「登入時名單以雲端為準」與 `round-lifecycle`「登入時回合與場次分槽以雲端為準」（選擇器「否則回傳本機實作」、頁面「`loading`／`load-failed` 時取代」）、
`scoreboard`「登入時獨立計分板以雲端為準」（「`syncStatus` 在本機模式恆為 `local`」「其餘非 `local` 狀態照常顯示計分畫面」）、
`match-history`「歷史頁唯讀消費既有紀錄」（「首次伺服器輸出 SHALL 為空狀態」）。`player-stats` 的名單阻斷規則由 `player-roster` 那一句涵蓋，不動。

**Alternatives considered**：把等待中 Scenario 分散到各 capability：同一條規則散成六處。不選。

## Risks / Trade-offs

- [Risk] 訪客每次重新整理多了一段等待中提示（伺服器輸出到本機資料讀入），原本是空狀態或本機畫面 → 使用者已認可；本機資料讀入與提示消失在同一次 render。
- [Risk] N7、N8 仍會在 hydration 前以預設樣式畫出 → 不屬資料狀態、方案 C 也無解，列 Non-Goal；coordinator 須向使用者說明，若要處理另開 change 評估 inline script。
- [Risk] client 端導覽進入本機頁面時，第一次 render 是等待中提示（原本是空狀態）→ 同樣只有一個 render；接受。
- [Risk] 提示殘留（cookie 過期、在其他裝置撤銷 session）→ 下一次重新整理先顯示等待中，session 回應後回到本機並清除提示 → 接受，E2E 鎖住。
- [Risk] 暫時性 session 失敗會清除提示 → 下一次重新整理少了 session 等待中，確認登入後寫回 → 接受。
- [Risk] 逾時後回到本機畫面，期間已登入者可以操作本機資料（與現況相同）→ 接受；只在請求 10 秒仍未回應時發生。
- [Risk] 既有 E2E 在頁面 goto 後立即以非重試方式讀取內容（例 `count()`、`isVisible()`），伺服器輸出改為等待中後可能讀到提示 → Mitigation：propose 時已查證 `matchmaker-local-mode`、`scoreboard-local-mode` 的 `toHaveCount(0)` 皆為重試型斷言；其餘以 C5 全跑，任何新失敗附證據上報 coordinator 裁定，不得自行判定為雜訊或改既有 spec。
- [Risk] `user-data` E2E 第一次載入後就會寫入提示，之後的 `page.reload()` 改為「等待中 → 雲端載入中 → 雲端」 → 既有 spec 一律以 `data-sync-status` 或 response 等待，預期不受影響；C5 全跑。
- [Risk] 單元測試之間提示洩漏 → Decision 13 的 `beforeEach` 清理；Implementer 跑完整前端套件確認。
- [Risk] 既有元件測試 mock `useSession` 時沒有 `hydrated` 欄位 → `undefined` 視同 true（Decision 2），結果不變；既有 hook 測試以 `renderHook` 驗證最終值，effect 已執行，`syncStatus` 仍為 `local`。
- [Risk] E2E 暫停 `/api/session` 超過 10 秒會觸發逾時 → 放行前只做三到四個 web-first 斷言；若出現此類失敗，依雙鎖規則重跑並上報，不得延長逾時或改用固定延遲。
- [Risk] 閃爍記錄器在每批 DOM 變動都讀 `innerText`（強制 layout），可能拖慢頁面 → 只用於 E2E；需要觀察的文字與選擇器各只有數個。
- [Risk] 三個 `pending`（儲存模式、顯示狀態、計分板綁定狀態）同名 → 三者語意都是「尚未確定」，型別各自獨立；註解標明所屬。

## Migration Plan

無資料或 schema 遷移；不新增相依。localStorage 新 key 由前端自行寫入，舊瀏覽器第一次載入時沒有提示，確認登入後即寫入。
部署照 README「部署前手動檢查清單」，只影響前端 Worker。回滾：revert 本 change 的前端提交即可；殘留的 `auth:signed-in-hint:v1` 對舊版程式碼無作用。

## Open Questions

（設計裁量皆已於 Decisions 定案。）
