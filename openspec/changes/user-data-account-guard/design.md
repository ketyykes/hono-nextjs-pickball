# Design: user-data-account-guard

## Context

**問題**：同一瀏覽器兩個分頁，分頁 1 以帳號 A 開著計分板或對戰分配機；分頁 2 登出後改以帳號 B 登入。

- better-auth 1.6 未啟用 multi-session plugin 與 cookie cache（`hono-pickball/src/auth/create-auth.ts`），同一 origin 只有**一個** `better-auth.session_token` cookie，分頁 2 的登入會**覆寫**它；
  舊 session 不會被撤銷（Context7 `/better-auth/better-auth/v1.6.23`，apply §1 再查一次）。
- 分頁 1 的 session store（`nextjs-pickball/lib/auth/session-store.ts`）只在第一次訂閱、登入／登出後與雲端 hook 收到 401 時 refresh——不知道帳號已換。
- 後端 `requireSession` 只看 cookie：分頁 1 的請求以 **B 的身分成功**，既有「401 → `onUnauthorized` → `session.refresh()`」不會啟動。

| 資料 | 分頁 1 的動作 | 對 B 的後果 |
|---|---|---|
| 計分板（B5） | `PUT /api/scoreboard/current` | B 尚無資料或 version 剛好相同時，A 的比分覆蓋 B |
| 名單（B6） | 新增參賽者（version 0 PUT）、CSV 匯入 | 直接寫進 B 的名單 |
| 重置（B6，B7 擴充） | `POST /api/matchmaker/reset` | 刪光 B 的名單、回合、分槽與歷史 |
| 回合（B7） | 產生對戰（回合 PUT version 0）、回合變更 | B 無回合時建立、version 相同時覆寫 B 的回合（含分槽清理） |
| 分槽（B7） | `CourtCard` 建立分槽、計分板分槽 PUT | 409 被 `CourtCard` 視為「已存在」而導向，之後以 B 的身分讀寫 |
| 送出比分（B7） | `POST /round/matches/:id/score` | 版本與場次剛好相符時在 B 名下寫評分與歷史 |
| 讀取 | 任一 GET | 以「已登入：A」顯示 B 的資料 |

另一既有缺陷（B5 design OQ10 ①）：即使 401 發生，refresh 後若 session 仍為登入（只是換了人），雲端 hook 的主 effect 依賴只有 `[enabled]`（分槽為 `[enabled, matchId]`），
`enabled` 維持 true → effect 不重跑 → hook 停在已停止狀態，畫面停在 A 的資料。

**B7 合併後的現況**（`main` `ac572ba` 實讀，apply §1 再核對一次）：

- 後端：`src/routes/scoreboard.ts`、`src/routes/matchmaker.ts` 皆為 `.use("*", localAuth, requireSession)`；`matchmaker.ts` 有 11 條路由（B6 5 條＋B7 6 條），`scoreboard.ts` 2 條，合計 13 條。
  `src/index.ts` 另有 `/api/health`、`/api/cookie-check`、`/api/me`（`localAuth, requireSession`）、`/api/session`、`/api/auth/*`。
- 後端測試 helper：`test/helpers/session.ts`（`seedUser`、`userIdOf`、`signIn` 回傳 cookie 字串）、`test/helpers/matchmaker-fixtures.ts`（`request()`、`appRequestInit()`）。
  `test/scoreboard-current.test.ts` 與 `test/matchmaker-players.test.ts` 各有**本地複本**的 `seedAndSignIn`／`request`／`appRequestInit`（B7 記為維持現狀），另有數處 inline `Cookie:` 請求（例：`matchmaker-round.test.ts` 的 spy DB 情境、`matchmaker-players.test.ts` 匯入 DB 錯誤情境）。
- 核心套件：`src/api/errors.ts` 三個錯誤碼；`CORE_MODULES` 目前 23 項（含 `api/{versioned,errors,user-data-tables,players,round}`）；`test/api/` 尚無 `errors.test.ts`。
- 前端：`lib/sync/api-client.ts` 的 `requestJson(method, path, { body?, schema })`；`lib/sync/roster-api.ts`（5 個包裝）、`lib/sync/round-api.ts`（6 個包裝）；
  `round-command-queue.ts` 的 options `putRound: typeof putRemoteRound`、`submitScore: typeof submitRemoteScore`；
  `useRemoteScoreboardStore` **直接**呼叫 `requestJson`（沒有包裝）；`useRemoteRosterStore` 主 effect 依賴 `[enabled, replacePlayers]`、`useRemoteRoundStore` `[enabled, showRound]`、`useRemoteMatchSlotStore` `[enabled, matchId]`。
  `CourtCard` 在雲端模式（`remoteNavigate` 有值）以 `putRemoteSlot(match.id, seed, 0)` 建立分槽，ok 或 conflict 即導向，**unauthorized 不 refresh**（B7 記為維持現狀，本 change 修正）；
  `JsonBackupSection`／`RosterCsvImportSection` 以 `resolveStorageMode(useSession())` 判斷模式，失敗只顯示 `REMOTE_TRANSFER_MESSAGES` 的訊息。
- E2E：`tests/e2e/user-data/round-sync.spec.ts` 有多處 `page.request.get/put` 直接打 API；`roster-sync.spec.ts` 有一處 `page.request.put`。

**coordinator 已裁定**（2026-10-23，Q1～Q12 全採草稿建議）：所有方法含 GET 皆要求標頭；缺標頭與不符共用 `401 ACCOUNT_MISMATCH`；跨分頁主動通知列非目標；
一次性操作收到 401 也 refresh；丟棄舊帳號待送變更不加提示；401 後 refresh 仍同帳號的停擺不在本 change；包裝以第一參數接收 `expectedUserId`；
標頭常數放新模組 `@pickball/core/api/headers`；不重寫其他 capability 的 hook 參數列；第二帳號由 seed 衍生；本 change 為 B7.5，B8／B9 不預改；
錯誤碼 `ACCOUNT_MISMATCH`、標頭 `X-Expected-User-Id`。

## Goals

- **後端拒絕**：任何使用者資料請求，若「前端以為的帳號」與 cookie 對應的 session 使用者不同，回 `401 ACCOUNT_MISMATCH`，資料不變（含 GET 不回傳資料）。
- **前端不跨帳號送出**：雲端 store 每一世代的請求都綁定該世代載入時的 user id；換帳號後舊世代的待送、重試、在途結果一律丟棄。
- **前端自癒**：收到 401 後沿用既有 refresh；refresh 後 user id 改變時各雲端 store 以新帳號重新載入；換帳號的那一次 render 起不再顯示前一帳號的資料。
- 覆蓋 B5、B6、B7 全部 13 個端點與四支雲端 hook、三個一次性操作；讓 B8、B9 新增的端點**預設被測試抓到**（漏掛守衛即紅燈）。
- 訪客／auth 停用路徑零變更（守衛位於 `localAuth` 之後；本機 hook 一行不改）。

## Non-Goals

- 跨分頁**主動**同步登入狀態（BroadcastChannel、`storage` 事件、`visibilitychange` refresh）——只縮短發現時間，正確性完全由伺服器守衛保證；另開小 change。
- 「每個分頁各自一個 session」（bearer plugin、multi-session）——auth 架構重設計。
- 換帳號時為被丟棄的 A 待送變更新增提示文案或 `SyncStatus`。
- 401 後 refresh 仍為**同一帳號**時 store 停擺（B5 OQ10 ① 的同帳號分支）。
- B8 的歷史端點、B9 的 `/api/import`（見「交接給 B8／B9」）。G1 的正式站部署、Google 登入。

## Decisions

### Decision 1: 以自訂標頭帶「預期帳號」，由伺服器比對

**Choice**：每個使用者資料請求帶 `X-Expected-User-Id: <user id>`；後端在 `requireSession` 之後比對 `c.var.user.id`。

**Rationale**：一處 middleware 覆蓋全部方法（含 GET、DELETE、無 body 的 POST）；路由、schema、URL 皆不變；資料仍只以 `c.var.user.id` 決定，
標頭只是斷言，因此與「SHALL NOT 從 path、query 或 body 接受使用者 id」不衝突（MODIFIED 中寫明）。既有「忽略 query／body 中的 userId」守護 it 的語意與斷言不變：
它們送的是 cookie B＋`?userId=<A>`，helper 依 cookie 帶 `X-Expected-User-Id: <B>`，照常成功、query／body 照樣被忽略。附帶效果：跨站表單無法帶自訂標頭，多一道 CSRF 防線（不寫入 spec 保證）。

**Alternatives considered**：
- user id 放進 URL：13 個端點＋B8／B9 全改路徑，user id 進存取紀錄，與主 spec 字面衝突。
- body 帶 `userId`：GET／DELETE／reset／score 無法統一，且與既有「body 的 userId 被忽略」守護 it 語意反轉。
- query 帶 `expectedUserId`：user id 進 URL，與既有「忽略 query 的 userId」it 同位置易混淆。
- 只靠前端跨分頁通知：在途請求、退避計時器、背景分頁節流都仍會以 B 的 cookie 送出 A 的資料，不正確。
- 比對 session id：同帳號重新登入會被無謂拒絕；`/api/session` 不回 session id。
- 不符回 409：會觸發「重新 GET」，而 GET 以同一舊標頭再被拒 → 無限重載。

### Decision 2: 所有方法一律要求標頭（fail-closed），缺少與不符共用 401 ACCOUNT_MISMATCH

**Choice**：缺標頭、空字串、不完全相等（不 trim、不接受多值）一律 `401 { error: "ACCOUNT_MISMATCH" }`。

**Rationale**：前端任何漏帶標頭的路徑會在單元／E2E 立刻紅；GET 也保證舊分頁不會顯示他人資料。前端型別使缺標頭不可能發生，分出 400 錯誤碼只會在測試與 curl 出現。
401 才會走既有 refresh 流程。相容成本只落在後端測試 helper、E2E 直接打 API 與人工 curl。

**Alternatives considered**：只要求寫入（舊分頁仍顯示他人資料）；有帶才比對（前端漏帶即完全失去防護且測不出來）；缺標頭回 `400 MISSING_EXPECTED_USER`（多一個錯誤碼、前端多一個分支）。

### Decision 3: 獨立 middleware，不改 requireSession

**Choice**：新增 `src/auth/require-expected-user.ts`（`createMiddleware<SessionAppEnv>`），只掛在使用者資料 sub-app：`use("*", localAuth, requireSession, requireExpectedUser)`。

**Rationale**：`requireSession` 也被 `GET /api/me` 使用（`auth` capability），把比對塞進去會連帶改變 auth 的行為。順序由前到後：`localAuth`（停用 404）→ `requireSession`（401 `UNAUTHORIZED`／例外 500）
→ `requireExpectedUser`（401 `ACCOUNT_MISMATCH`）→ `zValidator`（400）→ handler（409 等）。守衛在 validator 之前，不符時連 body 都不解析，「資料不變」由結構保證。
守衛只讀已取得的 `c.var.user.id`，不增加 D1 查詢。

**Alternatives considered**：改 `requireSession` 加參數（`/api/me` 的呼叫端要區分，型別與行為面都變大）；在每個 handler 內比對（13 處重複、B8／B9 易漏）。

### Decision 4: 以 `app.routes` 列舉守衛範圍，樣本表與列舉雙向一致

**Choice**：`test/expected-user-guard.test.ts` 由 `app.routes` 取出所有路由，排除 method `ALL`（`use()` 註冊的 middleware）與 allowlist（`/api/health`、`/api/cookie-check`、`/api/auth/*`、`/api/me`、`/api/session`），
其餘每條路由在樣本表中 MUST 有一份「若放行就會改變或回傳資料」的合法請求；另一個 it 斷言列舉集合與樣本表的鍵完全相同（本 change 為 13）。
資料不變的斷言以 `USER_DATA_TABLES` 逐表比對 A 與 B 的列（請求前後快照）；B 事先 seed 好計分板、名單、回合（含 pending 場次）與分槽，使 reset、PUT、score 若被放行一定看得出來。

**Rationale**：B8／B9 新增端點時，漏掛守衛或漏補樣本都會讓本測試紅——這是刻意的交接機制。

**Alternatives considered**：手寫端點表（新增端點不會自動被抓到）；只測代表性端點（漏掛不會被發現）。
**待查證**：Hono 的 `app.routes` 是否包含經 `app.route()` 掛載的 sub-app 路由且路徑已合併前綴、`use()` 是否以 `ALL` 出現——apply §1 以一次性實測確認；不符時退回「手寫端點表＋與 `app.routes` 雙向比對」並記入 Open Questions。

### Decision 5: 前端標頭綁定「store 世代」，requestJson 不讀 session

**Choice**：`requestJson(method, path, { body?, schema, expectedUserId })`，`expectedUserId` 必填；`requestJson` 不 import session store。
雲端 hook 以主 effect 的一次執行為「世代」，閉包捕獲該世代的 `userId`，世代內所有請求（含 saver 的重試、命令佇列、衝突重載）都用它。

**Rationale**：若在送出當下讀全域 session，會出現競態：401 → refresh 完成、快照變 B → React 尚未 commit、舊世代 cleanup 未跑 → 舊世代退避計時器到期送出 **A 的待送值**、標頭卻讀到 **B** → 後端放行。
標頭必須表達「這份待送值屬於誰」。

**Alternatives considered**：`requestJson` 讀 `getSnapshot()`（上述競態）；在 `fetch` 層全域攔截（同樣是送出當下才決定）。

### Decision 6: 包裝函式以第一參數接收 expectedUserId；命令佇列改收已綁定的函式

**Choice**：`roster-api.ts`（5）、`round-api.ts`（6）、`remote-transfer.ts`（`importRemoteRoster`、`buildRemoteBackupSnapshot`）第一參數為 `expectedUserId`；
`round-command-queue.ts` 的 options 型別改為 `putRound: (round: Round, version: number) => ReturnType<typeof putRemoteRound>`、`submitScore: (matchId, body…) => ReturnType<typeof submitRemoteScore>`（不含帳號），
由 `useRemoteRoundStore` 在每個世代以閉包綁定 user id 後傳入；佇列本身不知道帳號，其既有 it 只需型別相容的呼叫處調整。`useRemoteScoreboardStore` 直接呼叫 `requestJson` 處同樣傳入（不為此新增包裝）。

**Rationale**：diff 小、易審；佇列兩種做法都要改型別，第一參數改動最少。

**Alternatives considered**：綁定工廠 `createRosterApi(userId)`（呼叫端較乾淨，但每個世代建立物件、測試 mock 形狀全改）。

### Decision 7: 換帳號在 render 階段就不回傳前一帳號的資料（擁有者標記）

**Choice**：主 effect 依賴加 `userId`；已載入的狀態記錄擁有者 `owner`；render 時 `owner !== userId` 則回傳模組常數的初始狀態（計分板 `createInitialState()`、名單空陣列、回合 `null`／`remoteMatchSlots` 空物件、分槽初始狀態）
與 `syncStatus: "loading"`，所有操作為 no-op。舊世代 cleanup：`cancelled = true`、dispose 所有 saver／命令佇列；在途結果以 `cancelled` 忽略，**不呼叫** `applyRemotePlayers`、`reloadRemotePlayers`、`updatePlayer`。

**Rationale**：只靠 effect 重設狀態會晚一個 commit，畫面會閃 A 的資料（B6 Final 非阻擋項「同一 mount 換帳號會閃一幀前帳號名單」一併處理）。
跨 store port 的限制：A 世代在 cookie 換成 B 之前送出的比分可能在換帳號後才回來，若照樣 `applyRemotePlayers`，會把 A 的四位參賽者套進 B 的名單畫面。
`enabled` 為 true 但 `userId` 為 null 視同停用，避免以 null 帳號送出（型別上 `expectedUserId` 是 string）。

**Alternatives considered**：以 `key={userId}` 讓頁面重新掛載（需改多個頁面，且無法涵蓋選擇器內部）；在 effect 內 `dispatch(RESET)`（會閃一幀）。
REFACTOR 時若四支 hook 的擁有者判斷重複，可抽 `lib/sync/` 小工具；否則 skipped。

### Decision 8: 一次性雲端操作以觸發當下的 user id 呼叫，401 時 refresh

**Choice**：`RosterCsvImportSection`（雲端匯入）、`JsonBackupSection`（雲端匯出）、`CourtCard`（建立分槽）在 render 時取 `useSession()` 的 user id，點擊時以它呼叫包裝；
`importRemoteRoster` 的 GET→POST 用同一個 id。`remote-transfer.ts` 的失敗結果加機器可讀欄位標示未授權（例：`{ ok: false, message, unauthorized: true }`，確切欄位名由 Implementer 依既有風格決定並寫進測試），
元件見到該欄位時呼叫 `refresh()`；`CourtCard` 直接依 `result.kind === "unauthorized"` 呼叫 `refresh()`、顯示既有錯誤、不導向。user id 為 null（理論上雲端模式不會發生）時不送出、顯示既有錯誤。

**Rationale**：Q4 裁定納入；否則 navbar 停在 A、使用者只看到「請重新登入」卻其實已是 B。元件 SHALL NOT 比對訊息字串判斷類別（沿用 M8 交棒紀錄的原則）。
`CourtCard` 已有元件測試檔，走 TDD；`JsonBackupSection`／`RosterCsvImportSection` 沒有元件測試，refresh 那一行以 Stage 2 閱讀與 Open Questions 1 的裁定處理。

**Alternatives considered**：讓 `requestJson` 在 401 時自行 refresh（`lib/sync` 會依賴 auth，違反 Decision 5 的解耦）；由頁面傳入 `userId` prop 給 `CourtCard`（多改 `MatchStage`／`page.tsx` 兩層 props，且 `page.tsx` 屬 TDD 例外層無法單元驗證）。

### Decision 9: 第二測試帳號由 seed 衍生（plus addressing、同密碼）

**Choice**：`deriveSwitchAccountEmail(email)` 在本地部分加固定後綴（例：`tester@example.com` → `tester+switch@example.com`；已含 `+` 時仍產生不同值，例如改附加 `-switch`），
seed 腳本以同一組密碼建立兩個帳號；E2E helper 以相同規則各寫一份。換帳號情境在同一 context 內以 `context.request` 用 B 登入覆寫 cookie。

**Rationale**：不需改 `.dev.vars`（agent 不可寫、使用者不必手動補值），不會出現第二組密碼；better-auth 不撤銷 A 的 session，globalSetup 存下的 A storage state 仍可用。
兩份衍生規則以「E2E 以衍生帳密登入失敗即 throw」守住一致。

**Alternatives considered**：`.dev.vars` 新增 `TEST_ACCOUNT_2_*`（多一道人工步驟，缺值時 E2E 會 skip 而被忽略）；不建第二帳號、以 `page.route` 改標頭（測不到「refresh 後以 B 重新載入」，且 refresh 回同帳號會撞上非目標的停擺）。

### Decision 10: 後端測試 helper 集中帶標頭

**Choice**：`test/helpers/session.ts` 的 `signIn` 登入後把「cookie → user id」記入模組層 Map（登入回應 body 的 `user.id`，apply §1 確認；或改以 `userIdOf(email)`），
並匯出 `expectedUserHeader(cookie)`；`matchmaker-fixtures.ts` 的 `request()`／`appRequestInit()` 有 cookie 時自動帶標頭。
`scoreboard-current.test.ts`、`matchmaker-players.test.ts` 的本地複本 helper 與 inline 請求逐一補標頭（只加標頭，it 本體零改動）。
不帶 cookie 的 401 it、停用 404 it、`getSession` 例外 500 it 都在守衛之前結束，**不需要**標頭（若一併帶上也無妨，但不得因此改變 it 的語意）。
§3 先做這一步而守衛尚未存在：全套必須照綠，證明只是加標頭、未改行為。

**Rationale**：B6／B7 測試檔的 it 本體零改動；既有授權三類 it 不受影響。

**Alternatives considered**：守衛加「測試環境略過」開關（測試與正式行為分岔，B5 起刻意避免）。

### Decision 11: spec 增修策略——只 MODIFIED 一條，其餘以 ADDED 補充

**Choice**：`user-data-sync` 只 MODIFIED「使用者資料 API 的路由、授權與停用閘門」（middleware 鏈本身與授權覆蓋三類→四類，非改不可）；
錯誤碼清單、`requestJson` 簽章、雲端 hook 參數列、選擇器傳 user id、一次性操作、seed 的第二帳號、E2E 夾具，皆以 ADDED Requirement 明文「補充」既有 Requirement。
新 Scenario 標題一律加 Requirement 專屬前綴（「預期帳號守衛：」「請求標頭：」「帳號世代：」「換帳號 E2E：」「衍生測試帳號：」「換帳號夾具：」），避免與主 spec 既有的重名問題（`backend-database`、`player-roster` 各有一組同名 Scenario）再擴大。

**Rationale**：Q9 裁定；B7 剛 MODIFIED 過 `scoreboard`／`player-roster`／`round-lifecycle`／`data-transfer` 的大段 Requirement，B8／B9 也還要 MODIFIED 其中幾條，重抄會增加漂移與 archive 衝突。
OpenSpec 1.9 的 MODIFIED 不可丟棄或改名既有 Scenario（B7 apply §1 實測），本 change 的 MODIFIED 逐字保留四個既有 Scenario。
代價：`round-lifecycle`「回合與送出比分的雲端 API」的「sub-app（B6，`localAuth`＋`requireSession`）」、`scoreboard`／`player-roster`／`round-lifecycle` 的 `useRemote<X>Store({ enabled, … })`
與 `user-data-sync`「前端 API 請求的結果分類」的 `requestJson` 簽章不是完整清單；MODIFIED 與 ADDED 中已寫明「以本 Requirement 為準」。

**Alternatives considered**：逐一 MODIFIED 上列 Requirement（約 8 條、數十個既有 Scenario 要逐字帶入，與 B8／B9 的 MODIFIED 撞同一條）。

## Risks / Trade-offs

- [Risk] 既有測試的機械改動面大（後端 helper 2 檔＋本地複本 2 檔＋inline 數處；前端約 10 個測試檔的呼叫處）→ Mitigation：tasks 檔頭明列允許範圍，Stage 2 以 `git diff` 逐行確認只有加參數／加標頭；
  雲端 hook 測試若不補 `userId`，會因「`userId` 為 null 視同停用」而紅（vitest 不做型別檢查），必須與 GREEN 同步補上。
- [Risk] 主 repo 進行時，`requestJson` 簽章改動到所有呼叫處補完之前前端 tsc 為紅，Stop hook 會擋主 worktree → Mitigation：§6～§8 由同一位 Implementer 連續完成，leader 在 §8 交件前不結束回合（execution-plan）。
- [Risk] §5 守衛上線到 §8 前端帶標頭之間，既有 `user-data` E2E 必紅 → Mitigation：換帳號 E2E 的 RED 與「加標頭後既有 spec 照綠」都排在 §4（守衛上線前）；§5～§8 期間不跑 user-data project 判讀，§9 驗收。
- [Risk] `app.routes` 列舉行為與預期不符 → Mitigation：§1 實測；退路見 Decision 4。
- [Risk] 換帳號時 A 的待送變更被靜默丟棄 → 刻意取捨（送不出去才是正確）；navbar 與資料同時變成 B。
- [Risk] 401 後 refresh 仍為同一帳號時 store 停擺（A→B→A 在 refresh 期間又換回）→ 不會跨帳號寫入，重新整理可恢復；列為後續。
- [Risk] keepalive GET 帶自訂標頭在 WebKit 的行為（同源理論上無 preflight）→ Mitigation：§9 在 Safari 手動走一次登入態計分板並記錄；`user-data` project 只有 Desktop Chrome。
- [Risk] 衍生規則在 seed 與 E2E helper 各寫一份 → Mitigation：以衍生帳密登入失敗即 throw（不 skip）。
- [Risk] B8／B9 已 propose 的 artifacts 未含本守衛 → Mitigation：「交接給 B8／B9」；列舉測試讓漏改在其第一次後端全套測試就紅。
- [Trade-off] GET 也要求標頭：curl 除錯要多帶一個標頭；`hono-pickball/CLAUDE.md` 補範例。

## Migration Plan

- 無資料表與 migration 變更；不新增相依；不新增 `.dev.vars` 變數。
- 本機：切到分支後重跑一次 `pnpm --filter ./hono-pickball db:seed:local`（或由 E2E globalSetup 自動執行），第二帳號才會存在。
- 部署（G1 之後才有遠端）：前後端必須同一批上線；部署順序仍先 hono-pickball 後 nextjs-pickball——兩者之間的短暫窗口內，舊前端不帶標頭會收到 401 → refresh → 仍登入 → 停擺（非目標的同帳號分支），重新整理即恢復。
  G1 前正式站 auth 停用，使用者資料 API 皆回 404，此窗口不影響正式站。
- 回滾：還原兩個 sub-app 的 `use` 一行即停用守衛；前端多帶的標頭對舊後端無害。

## 交接給 B8／B9

本 change 不預改 B8／B9 的 artifacts（Q11）；兩者各自在 apply §1 依下列清單對齊並把 artifacts 的差異記入其 design Open Questions：

1. **B8 `matchmaker-history-stats-backend`**
   - `GET /api/matchmaker/history` 在 matchmaker sub-app 內，自動受守衛保護；但 `test/expected-user-guard.test.ts` 的**樣本表 MUST 補一條 history**（否則「列舉出的使用者資料路由恰與守衛樣本表一致」會紅——刻意的）。
   - test-plan 的「後端 API 授權覆蓋表」加第四欄「預期帳號缺少／不符 401」，指向本 change 的列舉 it。
   - `test/matchmaker-history.test.ts` 用 `matchmaker-fixtures.ts` 的 `request()` 即自動帶標頭；inline 請求要自己帶。
   - `lib/sync/history-api.ts` 的包裝以 `expectedUserId` 為第一參數；`useRemoteHistory({ enabled, userId, … })` 主 effect 依賴加 `userId`，比照 Decision 7 的擁有者標記與新世代重載；
     B8 tasks 的 hook RED 多一個 it「userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史」。
   - `remote-transfer.ts` 的歷史匯出、`HistoryCsvSection` 雲端分支以點擊時的 user id 呼叫，未授權時 refresh。
   - E2E 直接打 API 處改用 `expectedUserHeaders()`；`clearTestAccountUserData()` 已涵蓋第二帳號。
2. **B9 `local-data-import`**
   - 新 sub-app `src/routes/import.ts` 開頭 MUST 為 `use("*", localAuth, requireSession, requireExpectedUser)`；樣本表 MUST 補 `POST /api/import`（漏掛或漏補皆會使列舉測試紅）。
   - `user-data-sync`「本機資料匯入雲端的 API」加一個 Scenario：「預期帳號與 session 不符時匯入回 401 且雲端不寫入」——匯入被寫錯帳號時後果最大。
   - `lib/sync/local-import.ts` 的 `importLocalData(expectedUserId, payload)`；匯入區塊以 render 時的 user id 呼叫，未授權時 refresh。授權覆蓋表加第四欄。
3. **runbook**：`backend-scoring-runbook-b1-b9.md` 由 coordinator 記錄本 change 為 B7.5 並把上列清單抄入「下一棒須知」（leader 不得改 runbook）。

## Open Questions

> 以下為 propose 時（2026-10-24）新發現、需 coordinator 裁定的事項，皆附建議值；apply 期間未裁定者依建議值執行。apply §1 的查證紀錄另起一節附在本檔末。

1. **資料頁兩個區塊的 refresh 沒有單元測試**：`JsonBackupSection`、`RosterCsvImportSection` 沒有元件測試檔，「未授權時呼叫 `refresh()`」是一行元件程式碼。
   選項：(a) 只以 `remote-transfer.test.ts` 驗證未授權標示＋Stage 2 閱讀確認元件呼叫 refresh；(b) 為兩個元件新增元件測試檔；(c) 新增一條資料頁換帳號 E2E。
   **建議 (a)**：行為邏輯（何時算未授權）已在 `lib/` 以 TDD 守住，元件層只剩呼叫；(b)／(c) 的成本（mock 下載樣板或多一條 E2E）高於收益。
2. **「送出比分」換帳號 E2E 的紅燈只來自狀態碼**：B 沒有 A 的回合，守衛不存在時送出比分在 B 名下也會因版本／場次不符回 409、資料本來就不會被寫入；該 test 在 RED 階段是因「預期 401 實得 409」而紅，
   並非「資料被寫入 B」。真正的資料毀損面由後端列舉測試守住（樣本請求針對 B 自己已 seed 的回合與 pending 場次，若放行必定寫入 B 的評分與歷史）。**建議**：保留此 E2E（它驗證前端走 401 → refresh 的路徑），tasks 與紅燈紀錄中如實註明紅燈性質。
3. **`CourtCard` 改為自行呼叫 `useSession()`**：B7 的 `CourtCard` 只靠 `remoteNavigate` prop 判斷雲端模式，不讀 session。本 change 讓它在 render 時讀 `useSession()` 取 user id 與 `refresh`（Decision 8），
   既有 `CourtCard.test.tsx` 的 render 需要 mock `@/hooks/useSession`（只新增 `vi.mock` 區塊，既有 it 不改）。**建議**：採用；替代為從 `page.tsx` 經 `MatchStage` 傳入 `remoteUserId`，但會擴大到例外層檔案且無法單元驗證。
4. **B7 記為「維持現狀」的「CourtCard 遇 unauthorized 不 refresh」由本 change 修正**（Q4 的直接結果）。**建議**：runbook 的 B7 維持現狀清單在本 change 合併時劃掉該項（coordinator 處理）。
5. **既有主 spec 的同名 Scenario**（`backend-database`「user_id 必須參照既有使用者」、`player-roster`「刪除參賽者」）不在本 change 範圍，未處理；本 change 新增標題皆已以 python 計數確認在各主 spec 合併後唯一。
