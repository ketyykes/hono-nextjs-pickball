# Specification: auth

## MODIFIED Requirements

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `fetchSession()`：以 `GET /api/session`（same-origin）取得
`{ authEnabled, user, signInMethods? }`。回應為 200 且形狀符合（`authEnabled` 為布林、`user` 為 `null` 或含字串 `id`／`email`／`name` 的物件、
`signInMethods` 不存在或為含布林 `google` 與 `emailPassword` 的物件）時原樣回傳——`signInMethods` 不存在時回傳值 SHALL NOT 含此鍵
（相容 G1 之前的後端：當時 `authEnabled: true` 只代表測試帳號登入）；
**任何其他情況**（非 200、JSON 解析失敗、形狀不符——含 `signInMethods` 存在但形狀不符、網路錯誤）MUST 回傳 `null` 且 SHALL NOT throw；回傳型別為 `Promise<SessionState | null>`。
`null` 代表「這次無法確認登入狀態」，與 200 且形狀正確的「未登入」或「auth 停用」不同，`fetchSession()` 本身 SHALL NOT 把它降級為未啟用：
是否降級由唯一呼叫端 session store 依上次登入提示決定（「全頁共用的 session store 與 useSession」）——沒有提示時仍 fail-closed 為未啟用，訪客介面維持現狀；
有提示時改為無法確認，SHALL NOT 讓登入者在不知情的情況下改用本機資料。

請求 MUST 以 `keepalive: true` 發出：WebKit 會拒絕「整頁導覽開始後才發出」的一般 fetch，並由瀏覽器自行輸出 console 錯誤
（`Fetch API cannot load … due to access control checks`，不是 JS 例外，try/catch 擋不住），使既有 E2E 的 console 守衛失敗；
`keepalive` 請求不受此限制。回應處理與失敗回 `null` 的規則不變。

`nextjs-pickball/lib/auth/session-store.ts` 的 ready 快照 MUST 原樣帶出 `fetchSession()` 非 `null` 回傳值的全部欄位（含 `signInMethods`），SHALL NOT 只挑 `authEnabled` 與 `user`。

前端 SHALL NOT 讀取或依賴 session cookie 的名稱或內容（HttpOnly，且 https 下名稱為 `__Secure-` 前綴）。
前端 SHALL NOT 以 build-time 環境變數判斷是否顯示登入入口或登入方式——顯示登入入口的唯一訊號是 `authEnabled`，登入頁顯示哪些登入方式的唯一訊號是 `signInMethods`。

#### Scenario: 回應正確時原樣回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": { "id": "u1", "email": "a@example.com", "name": "A" } }`
- **THEN** `fetchSession()` 回傳同一個物件內容
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user」

#### Scenario: session 請求以 keepalive 發出

- **WHEN** 呼叫 `fetchSession()`
- **THEN** `fetch` 以 `/api/session` 與 `keepalive: true` 被呼叫
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 以 keepalive 發出請求」；
  端到端以既有 webkit／mobile-safari E2E 的 console 守衛（`player-roster`、`match-stage`、`round-timer`、`visual-export`）在 `.dev.vars` 齊備時通過為證

#### Scenario: 任何失敗都降級為未啟用

- **WHEN** `/api/session` 分別回 500、回 200 但 body 不是 JSON、回 200 但 `authEnabled` 不是布林、`fetch` 拋出例外
- **THEN** 四種情況 `fetchSession()` 皆回傳 `null` 且不 throw（是否降級為未啟用改由 session store 依上次登入提示決定，見「全頁共用的 session store 與 useSession」）
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於非 200、形狀不符或網路錯誤時回傳 null 且不拋錯」（改寫既有 it「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」）

#### Scenario: 回應含 signInMethods 時一併回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": null, "signInMethods": { "google": true, "emailPassword": false } }`
- **THEN** `fetchSession()` 回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 回傳後端提供的 signInMethods」

#### Scenario: signInMethods 形狀不符時降級為未啟用

- **WHEN** `/api/session` 回 200，`authEnabled` 為 `true`、`user` 為 `null`，`signInMethods` 分別為 `null`、`"google"`、`{ "google": true }`、`{ "google": "yes", "emailPassword": false }`
- **THEN** 四種情況 `fetchSession()` 皆回傳 `null` 且不 throw
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signInMethods 形狀不符時 fetchSession 回傳 null」（改寫既有 it「signInMethods 形狀不符時 fetchSession 回傳未啟用」）

#### Scenario: session store 的快照保留 signInMethods

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }` 的假函式
- **WHEN** 訂閱 store 並等待請求完成
- **THEN** 快照為 `{ status: "ready", authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods」

### Requirement: 全頁共用的 session store 與 useSession

`nextjs-pickball/lib/auth/session-store.ts` SHALL 提供單一 module 層級 store：
- 初始快照：localStorage 沒有上次登入提示（「上次登入提示的儲存與清除」）時為 `{ status: "loading" }`；有提示時 client 端為 `{ status: "loading", signedInHint: true }`。
  提示在 client 端**第一次讀取快照時**讀一次並快取（未變更時 `getSnapshot()` MUST 回傳同一個參考）；模組載入時 SHALL NOT 讀取 localStorage。
- `SessionSnapshot` 的 loading 變體以 union 表達三種（ready 變體不變）：
  `{ status: "loading"; signedInHint?: true }`（一般載入中）、
  `{ status: "loading"; signedInHint: true; unavailable: true }`（**無法確認**：必帶提示）、
  `{ status: "loading"; localFallback: true }`（**本機備援**）。
  無法確認與本機備援快照各為 module 層級的固定參考。三者的 `status` 都是 `"loading"`：只看 `status === "loading"` 的元件（navbar `AccountEntry`、登入頁 `LoginForm`）不需修改，
  在無法確認與本機備援時仍顯示載入中佔位——已知取捨（此時沒有登入或登出入口，重新整理頁面即重新確認 session）。
- **第一次被訂閱時**才呼叫 `fetchSession()`，取得**非 `null`** 結果後快照變為 `{ status: "ready", authEnabled, user }` 並通知訂閱者；
- **採用到 `null`（請求失敗）**：於採用當下以 `readSignedInHint()` 讀取提示——有提示時快照 MUST 改為無法確認快照並通知訂閱者；沒有提示時快照為 `{ status: "ready", authEnabled: false, user: null }`（fail-closed，訪客行為不變）。
  兩者皆 SHALL NOT 寫入或清除提示。此規則同樣適用於已登入使用中呼叫的 `refresh()`（例如雲端 hook 收到 401 之後）：請求失敗時改為無法確認，SHALL NOT 改為 auth 停用而退回本機。
- 在第一次請求完成前新增的訂閱者 SHALL NOT 觸發第二次請求；
- `refresh()` MUST 重新呼叫 `fetchSession()` 並通知所有訂閱者（登入、登出後由呼叫端觸發）；請求期間快照維持原值，結果依上列規則採用；
- **等待逾時**：快照帶 `signedInHint` 時，自第一次訂閱起 10 秒（`SIGNED_IN_HINT_WAIT_MS = 10_000`）仍未採用任何回應，快照 MUST 改為無法確認快照並通知訂閱者——
  SHALL NOT 改回不帶提示的 `{ status: "loading" }`（那會讓已登入者悄悄改用本機資料），也 SHALL NOT 永遠停在等待中。進行中的請求不取消：之後回應到達照常採用（非 `null` → ready；`null` → 維持無法確認）。已轉為 ready 後逾時 SHALL NOT 改變快照。
- **本機備援**：`chooseLocalFallback(): void`（不是 React hook，不以 `use` 開頭）只在快照為無法確認時有效：快照 MUST 改為本機備援快照並通知訂閱者，
  同時使進行中請求的結果被丟棄（遞增請求編號，比照既有「只有最新一次請求的回應能更新快照」）——本次頁面期間不會被晚到的回應切走；
  之後只有明確呼叫的 `refresh()` 會再改變快照（結果依上列規則採用）。不寫入也不清除提示；重新整理頁面即回到初始流程。
  其他快照下呼叫 SHALL NOT 改變快照、SHALL NOT 通知訂閱者、SHALL NOT 影響進行中的請求。

`nextjs-pickball/hooks/useSession.ts` SHALL 以 `useSyncExternalStore` 讀取該 store，回傳快照、`refresh` 與 `hydrated: boolean`。
`hydrated` 以第二個 `useSyncExternalStore`（不訂閱任何來源，client 快照為 `true`、server snapshot 為 `false`）取得：伺服器端 render 與 hydration 那次 render 為 `false`，hydration 完成後為 `true`；
client 端非 hydration 的 mount（例如 client 端導覽）第一次 render 即為 `true`。它供 `user-data-sync`「前端依 session 選擇儲存模式」判斷「伺服器輸出與 hydration 時儲存模式未定」，不改變 session 快照本身。
server snapshot MUST 固定為 `{ status: "loading" }`（**不帶** `signedInHint`、`unavailable` 或 `localFallback`，伺服器端無從得知）——伺服器端與 hydration 時的第一次 render 一致，不產生 hydration mismatch；
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
- **THEN** 9,999 毫秒時快照仍為 `{ status: "loading", signedInHint: true }`；10 秒時快照為 `{ status: "loading", signedInHint: true, unavailable: true }`、訂閱者被通知且提示仍在；另一輪中快照維持 ready、不被逾時改變；逾時後 SHALL NOT 回到不帶提示的 loading
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「帶提示等待逾時仍未取得 session 時快照改為無法確認」（改寫既有 it「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」）

#### Scenario: 有提示時 hydration 一致且完成後反映提示

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式；一個依 `useSession()` 顯示「是否帶提示」的元件
- **WHEN** 以 `renderToString` 產生伺服器端輸出，放進容器後以 `hydrateRoot` hydrate
- **THEN** 伺服器端輸出為「不帶提示」；hydrate 過程 `onRecoverableError` 與 `console.error` 皆未被呼叫；hydrate 完成後畫面為「帶提示」
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」

#### Scenario: hydrated 在伺服器端與 hydration 時為 false，完成後為 true

- **GIVEN** `fetchSession` 為永不完成的假函式；一個顯示 `String(useSession().hydrated)` 的元件
- **WHEN** 以 `renderToString` 產生伺服器端輸出，放進容器後以 `hydrateRoot` hydrate
- **THEN** 伺服器端輸出為 `false`；hydrate 過程 `onRecoverableError` 與 `console.error` 皆未被呼叫；hydrate 完成後畫面為 `true`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true」

#### Scenario: client 端非 hydration 的 mount 第一次 render 即為 hydrated

- **WHEN** 以 `renderHook` 渲染 `useSession`，並在 render 階段同步記錄每次 render 的 `hydrated`
- **THEN** 第一筆即為 `true`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「client 端一般 mount 的第一次 render 即為 hydrated」

#### Scenario: session 請求失敗且有上次登入提示時改為無法確認並保留提示

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳 `null`
- **WHEN** 訂閱並等待請求完成，之後讀取 `getSnapshot()` 兩次
- **THEN** 快照為 `{ status: "loading", signedInHint: true, unavailable: true }` 且兩次為同一個參考；訂閱者被通知；提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 請求失敗且有上次登入提示時快照改為無法確認且保留提示」

#### Scenario: session 請求失敗且沒有提示時仍降級為 auth 停用

- **GIVEN** localStorage 為空；`fetchSession` 回傳 `null`
- **WHEN** 訂閱並等待請求完成
- **THEN** 快照為 `{ status: "ready", authEnabled: false, user: null }`；localStorage 仍為空（沒有寫入提示）
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 請求失敗且沒有上次登入提示時快照為 auth 停用的 ready」

#### Scenario: 已登入使用中重新取得 session 失敗時改為無法確認

- **GIVEN** localStorage 沒有提示；`fetchSession` 先回傳已登入使用者，之後回傳 `null`
- **WHEN** 訂閱並等待 ready（提示因此寫入），接著呼叫 `refresh()` 並等待完成
- **THEN** `refresh()` 後快照為 `{ status: "loading", signedInHint: true, unavailable: true }`（不是 auth 停用的 ready）；提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「已登入使用中 refresh 失敗時快照改為無法確認且保留提示」

#### Scenario: 無法確認之後晚到的回應仍照常採用

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳一個由測試控制完成時機的 Promise；使用 fake timers
- **WHEN** 訂閱後推進 10 秒（快照改為無法確認），再讓該請求回應已登入使用者
- **THEN** 快照轉為 `{ status: "ready", authEnabled: true, user: <該使用者> }` 並通知訂閱者；提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「無法確認之後才到達的 session 回應仍照常採用」

#### Scenario: 選擇本機備援後丟棄進行中請求的結果

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳一個由測試控制完成時機的 Promise；使用 fake timers；訂閱後推進 10 秒，快照為無法確認
- **WHEN** 呼叫 `chooseLocalFallback()`，再讓先前的請求回應已登入使用者；之後把 `fetchSession` 改為回傳已登入使用者並呼叫 `refresh()`
- **THEN** 呼叫後快照為 `{ status: "loading", localFallback: true }`、再讀一次為同一個參考、訂閱者被通知、提示仍在；先前請求的回應到達後快照不變；`refresh()` 完成後快照為已登入的 ready
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「chooseLocalFallback 在無法確認時改為本機備援並丟棄進行中請求的結果」

#### Scenario: 不是無法確認時選擇本機備援沒有效果

- **GIVEN** 三種快照：沒有提示的 loading（請求進行中）、帶提示的 loading（請求進行中、尚未逾時）、ready
- **WHEN** 各自呼叫 `chooseLocalFallback()`；前兩種之後再讓進行中的請求回應已登入使用者
- **THEN** 呼叫前後 `getSnapshot()` 為同一個參考、訂閱者未被通知；前兩種的請求回應仍被採用，快照轉為已登入的 ready
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「不是無法確認時呼叫 chooseLocalFallback 不改變快照也不通知」

### Requirement: 上次登入提示的儲存與清除

`nextjs-pickball/lib/auth/session-hint.ts` SHALL 匯出 `SIGNED_IN_HINT_STORAGE_KEY`（值為 `auth:signed-in-hint:v1`，沿用專案 `<領域>:<名稱>:v<版本>` 的 localStorage 命名慣例）、
`readSignedInHint(): boolean`、`writeSignedInHint(): void`、`clearSignedInHint(): void`，是上次登入提示在 localStorage 的**唯一讀寫點**（瀏覽器 I/O 放 `lib/` 的既有慣例）。

- 提示 MUST 只存固定字串 `"1"`；SHALL NOT 存 user id、email、name 或任何其他使用者資訊。讀取時只有值**恰為** `"1"` 才為 true，其他值（含舊格式或被竄改）一律為 false。
- 三個函式 SHALL NOT throw：localStorage 不存在（SSR）、不可用或 `getItem`／`setItem`／`removeItem` 拋例外時，讀取回 false、寫入與清除靜默略過。
- 寫入與清除時機：
  - session store 每次**採用**一份**非 `null`** 的 `fetchSession()` 結果時（即 200 且形狀正確）：`authEnabled === true` 且 `user !== null` → `writeSignedInHint()`；其餘（未登入、auth 停用）→ `clearSignedInHint()`。
    被丟棄的過時回應（已有更新的請求，或使用者已選擇本機備援）SHALL NOT 寫入或清除提示。
  - 採用到 `null`（請求失敗）、帶提示等待逾時、呼叫 `chooseLocalFallback()` 三種情況 SHALL NOT 寫入或清除提示：登入狀態只是這次無法確認，下一次重新整理仍應先等待 session，而不是直接顯示本機資料
    （逐一由「全頁共用的 session store 與 useSession」的無法確認、逾時與本機備援 Scenario 斷言提示仍在）。
  - `signOut()`（`lib/auth/session-client.ts`）在登出請求回 2xx 時 MUST 立即 `clearSignedInHint()`，不等之後的 `refresh()`——使用者在 refresh 完成前重新整理也不會進入等待中；登出失敗時 SHALL NOT 清除（使用者仍為登入狀態）。
- 提示的生命週期跟隨 session，不屬於使用者資料：`data-transfer`「清除本機資料與其確認流程」SHALL NOT 清除它，JSON 備份與本機資料匯入雲端皆不讀取它。

已知取捨：登出以外的方式結束 session（cookie 過期、在其他裝置撤銷）時提示會殘留，該瀏覽器下一次重新整理會先短暫顯示等待中，session 回應後回到本機畫面並清除提示。
請求失敗不清除提示：後端或網路長時間異常時，帶提示的瀏覽器每次重新整理都會先等待、再顯示無法確認畫面（可選擇先用這台裝置的資料），直到 session 能夠確認為止。

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
