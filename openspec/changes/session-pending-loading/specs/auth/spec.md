# Specification: auth

## MODIFIED Requirements

### Requirement: 全頁共用的 session store 與 useSession

`nextjs-pickball/lib/auth/session-store.ts` SHALL 提供單一 module 層級 store：
- 初始快照：localStorage 沒有上次登入提示（「上次登入提示的儲存與清除」）時為 `{ status: "loading" }`；有提示時 client 端為 `{ status: "loading", signedInHint: true }`。
  提示在 client 端**第一次讀取快照時**讀一次並快取（未變更時 `getSnapshot()` MUST 回傳同一個參考）；模組載入時 SHALL NOT 讀取 localStorage。
  `SessionSnapshot` 的 loading 變體型別為 `{ status: "loading"; signedInHint?: true }`，ready 變體不變；
- **第一次被訂閱時**才呼叫 `fetchSession()`，取得後快照變為 `{ status: "ready", authEnabled, user }` 並通知訂閱者；
- 在第一次請求完成前新增的訂閱者 SHALL NOT 觸發第二次請求；
- `refresh()` MUST 重新呼叫 `fetchSession()` 並通知所有訂閱者（登入、登出後由呼叫端觸發）；
- **等待逾時**：快照帶 `signedInHint` 時，自第一次訂閱起 10 秒（`SIGNED_IN_HINT_WAIT_MS = 10_000`）仍未採用任何回應，快照 MUST 改為不帶提示的 `{ status: "loading" }` 並通知訂閱者——
  已登入者在 session 請求遲遲不回時回到現行行為（先顯示本機畫面），SHALL NOT 永遠停在等待中；之後回應到達仍照常轉為 ready。已轉為 ready 後逾時 SHALL NOT 改變快照。

`nextjs-pickball/hooks/useSession.ts` SHALL 以 `useSyncExternalStore` 讀取該 store，回傳快照與 `refresh`。
server snapshot MUST 固定為 `{ status: "loading" }`（**不帶** `signedInHint`，伺服器端無從得知提示）——伺服器端與 hydration 時的第一次 render 一致，不產生 hydration mismatch；
hydration 完成後 React 依 client 快照重新 render，此時才反映提示。這是專案讀取瀏覽器狀態而不造成 hydration mismatch 的既有做法（同一個 store），SHALL NOT 改用在 render 期間直接讀 localStorage。

所有需要登入狀態的元件（navbar、登入頁，以及 Wave 2 的儲存層切換）SHALL 透過 `useSession` 取得，SHALL NOT 各自呼叫 `/api/session`。

#### Scenario: 初始為 loading，第一次訂閱後轉為 ready

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null }` 的假函式；localStorage 沒有上次登入提示
- **WHEN** 讀取初始快照，接著訂閱並等待請求完成
- **THEN** 初始快照為 `{ status: "loading" }`；完成後為 `{ status: "ready", authEnabled: true, user: null }`，訂閱者被通知
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「初始為 loading，第一次訂閱後取得 session 並轉為 ready」

#### Scenario: 多個訂閱者共用一次請求

- **WHEN** 在第一次請求完成前連續訂閱三次
- **THEN** `fetchSession` 只被呼叫一次
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「請求完成前的多個訂閱者只觸發一次請求」

#### Scenario: refresh 重新取得並通知

- **GIVEN** store 已為 ready 且 `user` 為 null
- **WHEN** 假函式改為回傳已登入使用者後呼叫 `refresh()`
- **THEN** `fetchSession` 再被呼叫一次，所有訂閱者被通知，快照的 `user` 為該使用者
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「refresh 重新取得 session 並通知所有訂閱者」

#### Scenario: useSession 隨 store 更新

- **WHEN** 以 `renderHook(useSession)` 渲染，等待 ready 後呼叫回傳的 `refresh`
- **THEN** hook 回傳值先為 loading、再為 ready，refresh 後反映新的 `user`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「useSession 回傳 store 快照並隨 refresh 更新」

#### Scenario: 伺服器端 render 為 loading

- **WHEN** 以 `react-dom/server` 的 `renderToString` 渲染一個顯示 `useSession().status` 的元件
- **THEN** 輸出含 `loading`，且 `fetchSession` 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「伺服器端 render 時 useSession 為 loading 且不發請求」

#### Scenario: 有上次登入提示時 client 初始快照帶提示而伺服器端快照不帶

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式
- **WHEN** 讀取 `getSnapshot()` 兩次與 `getServerSnapshot()`
- **THEN** `getSnapshot()` 為 `{ status: "loading", signedInHint: true }` 且兩次為同一個參考；`getServerSnapshot()` 為 `{ status: "loading" }`；`fetchSession` 未被呼叫
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶」

#### Scenario: 帶提示等待逾時後回到不帶提示的 loading

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式；使用 fake timers
- **WHEN** 訂閱後推進 9,999 毫秒、再推進 1 毫秒；另一輪中 `fetchSession` 在逾時前回應已登入，再推進超過 10 秒
- **THEN** 9,999 毫秒時快照仍帶 `signedInHint`；10 秒時快照為 `{ status: "loading" }` 且訂閱者被通知；另一輪中快照維持 ready、不被逾時改變
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」

#### Scenario: 有提示時 hydration 一致且完成後反映提示

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式；一個依 `useSession()` 顯示「是否帶提示」的元件
- **WHEN** 以 `renderToString` 產生伺服器端輸出，放進容器後以 `hydrateRoot` hydrate
- **THEN** 伺服器端輸出為「不帶提示」；hydrate 過程 `onRecoverableError` 與 `console.error` 皆未被呼叫；hydrate 完成後畫面為「帶提示」
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」

## ADDED Requirements

### Requirement: 上次登入提示的儲存與清除

`nextjs-pickball/lib/auth/session-hint.ts` SHALL 匯出 `SIGNED_IN_HINT_STORAGE_KEY`（值為 `auth:signed-in-hint:v1`，沿用專案 `<領域>:<名稱>:v<版本>` 的 localStorage 命名慣例）、
`readSignedInHint(): boolean`、`writeSignedInHint(): void`、`clearSignedInHint(): void`，是上次登入提示在 localStorage 的**唯一讀寫點**（瀏覽器 I/O 放 `lib/` 的既有慣例）。

- 提示 MUST 只存固定字串 `"1"`；SHALL NOT 存 user id、email、name 或任何其他使用者資訊。讀取時只有值**恰為** `"1"` 才為 true，其他值（含舊格式或被竄改）一律為 false。
- 三個函式 SHALL NOT throw：localStorage 不存在（SSR）、不可用或 `getItem`／`setItem`／`removeItem` 拋例外時，讀取回 false、寫入與清除靜默略過。
- 寫入與清除時機：
  - session store 每次**採用**一份 `fetchSession()` 結果時：`authEnabled === true` 且 `user !== null` → `writeSignedInHint()`；其餘（未登入、auth 停用、請求失敗經 fail-closed 降級為 `{ authEnabled: false, user: null }`）→ `clearSignedInHint()`。
    被丟棄的過時回應（已有更新的請求）SHALL NOT 寫入或清除提示。
  - `signOut()`（`lib/auth/session-client.ts`）在登出請求回 2xx 時 MUST 立即 `clearSignedInHint()`，不等之後的 `refresh()`——使用者在 refresh 完成前重新整理也不會進入等待中；登出失敗時 SHALL NOT 清除（使用者仍為登入狀態）。
- 提示的生命週期跟隨 session，不屬於使用者資料：`data-transfer`「清除本機資料與其確認流程」SHALL NOT 清除它，JSON 備份與本機資料匯入雲端皆不讀取它。

已知取捨：登出以外的方式結束 session（cookie 過期、在其他裝置撤銷）時提示會殘留，該瀏覽器下一次重新整理會先短暫顯示等待中，session 回應後回到本機畫面並清除提示。

#### Scenario: 提示只以固定值寫入並可清除

- **GIVEN** localStorage 為空
- **WHEN** 依序呼叫 `readSignedInHint()`、`writeSignedInHint()`、`readSignedInHint()`、`clearSignedInHint()`、`readSignedInHint()`
- **THEN** 依序為 false、（寫入後 `localStorage.getItem("auth:signed-in-hint:v1")` 恰為 `"1"`，且 localStorage 只多出這一個 key）、true、（key 已移除）、false；`SIGNED_IN_HINT_STORAGE_KEY` 為 `auth:signed-in-hint:v1`
- **驗收**：`nextjs-pickball/lib/auth/session-hint.test.ts`，it 名稱「寫入後讀取為 true 且只存固定值，清除後讀取為 false」

#### Scenario: 非固定值或 localStorage 不可用時不拋錯

- **WHEN** 該 key 的值分別為 `"true"`、`"0"`、`"u1"` 時讀取；以及 `getItem`、`setItem`、`removeItem` 皆被替換為拋出例外時呼叫三個函式
- **THEN** 讀取皆為 false；三個函式皆不拋錯
- **驗收**：`nextjs-pickball/lib/auth/session-hint.test.ts`，it 名稱「值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯」

#### Scenario: session 確認結果決定寫入或清除提示

- **GIVEN** `fetchSession` 依序回傳已登入使用者、`{ authEnabled: true, user: null }`、已登入使用者、`{ authEnabled: false, user: null }`
- **WHEN** 訂閱後等待 ready，之後每次 `refresh()` 完成時檢查提示
- **THEN** 依序為有提示、無提示、有提示、無提示
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示」

#### Scenario: 過時的 session 回應不改變提示

- **GIVEN** 兩個進行中的請求 A（較舊）與 B（較新）
- **WHEN** B 先回應已登入使用者，A 之後才回應 `{ authEnabled: true, user: null }`
- **THEN** 提示維持存在（A 被丟棄），快照的 `user` 為 B 的使用者
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「被丟棄的過時 session 回應不改變提示」

#### Scenario: 登出成功時立即清除提示

- **GIVEN** localStorage 有上次登入提示
- **WHEN** `signOut()` 的請求分別回 200 與 500
- **THEN** 回 200 時提示被清除；回 500 時提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signOut 成功時清除上次登入提示，失敗時保留」
