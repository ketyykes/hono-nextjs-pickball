# Test Plan: user-data-account-guard

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier（同 B5～B7）：`unit`（核心套件 node；前端 `lib/**`、元件 happy-dom）、`hook`（`renderHook`＋mock `fetch` 與 `@/hooks/useSession`）、
> `integration`（`hono-pickball/test/**`，workerd＋D1）、`e2e`（`tests/e2e/user-data/**` 只在 `user-data` project；需 `.dev.vars`）。
> `hook` 為 `unit` 的細分（同為 Vitest），沿用前棒標示以便派工。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> 「Why first」欄的 **regression guard** 表示該測試在實作前就會綠（行為已存在或由平台保證），tasks 紀錄中 MUST 點名標註、SHALL NOT 偽造紅燈。
> **驗收型 RED**：E2E 在 §4（守衛上線前）寫入後即實跑看到紅，GREEN 要到 §9 前後端都完成才會轉綠。

> **後端 API 授權覆蓋表**（四類；前三類為 B5～B7 既有 it，第四類由本 change 的列舉 it 一次涵蓋，迴圈內每條路由 MUST 各自斷言狀態碼、body 與資料快照）：
>
> | 端點 | 未登入 401 | 他人資料被拒 | auth 停用 404 | 預期帳號缺少／不符 401 ACCOUNT_MISMATCH |
> |------|-----------|--------------|---------------|------------------------------------------|
> | `GET /api/scoreboard/current` | 未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401 | B 的 cookie 讀不到 A 的計分板且寫入不影響 A | auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404 | 每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變；缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變 |
> | `PUT /api/scoreboard/current` | 同上 | 同上 | 同上 | 同上 |
> | `GET /api/matchmaker/players` | （B6 既有）未登入呼叫所有 /api/matchmaker 端點皆回 401 | （B6 既有，`matchmaker-players.test.ts` 的隔離 it） | （B6 既有）auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404 | 同上 |
> | `PUT /api/matchmaker/players/:id` | 同上 | 同上 | 同上 | 同上 |
> | `DELETE /api/matchmaker/players/:id` | 同上 | 同上 | 同上 | 同上 |
> | `POST /api/matchmaker/players/import` | 同上 | 同上 | 同上 | 同上 |
> | `POST /api/matchmaker/reset` | 同上 | 重置在同一 batch 內刪除本人的名單、回合、分槽與歷史 | 同上 | 同上 |
> | `GET /api/matchmaker/round` | 未登入呼叫回合、分槽與送出比分端點皆回 401 | B 看不到也改不到 A 的回合與分槽 | auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404 | 同上 |
> | `PUT /api/matchmaker/round` | 同上 | 同上 | 同上 | 同上 |
> | `GET /api/matchmaker/slots` | 同上 | 同上 | 同上 | 同上 |
> | `GET /api/matchmaker/slots/:matchId` | 同上 | 同上 | 同上 | 同上 |
> | `PUT /api/matchmaker/slots/:matchId` | 同上 | 同上 | 同上 | 同上 |
> | `POST /api/matchmaker/round/matches/:matchId/score` | 同上 | B 對 A 的場次送出比分回 409 且 A 的資料不變 | 同上 | 同上 |
>
> 另：「列舉出的使用者資料路由恰與守衛樣本表一致」保證上表即為完整清單（13 條）；B8／B9 新增端點時 MUST 補樣本並在其 test-plan 本表加列。

## user-data-sync

### Requirement: 使用者資料 API 的路由、授權與停用閘門（MODIFIED）

既有四個 Scenario 的 it 不改名、不改斷言；本 change 只經 helper 讓成功路徑帶標頭（tasks §3 設定層）。

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404`（既有） | auth 停用時使用者資料 API 回 404 且不觸碰 D1 | 守衛加入後仍 404 | regression guard（守衛在 localAuth 之後） | integration |
| `未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401`（既有） | 未登入呼叫使用者資料 API 回 401 | 仍為 `UNAUTHORIZED` 而非 `ACCOUNT_MISMATCH` | regression guard（順序） | integration |
| `B 的 cookie 讀不到 A 的計分板且寫入不影響 A`（既有） | 只能存取本人的資料 | helper 帶上 B 的標頭後斷言不變 | regression guard（helper 帶標頭的證明） | integration |
| （typecheck 紀錄，既有） | 未經 requireSession 的 handler 讀取 user 為型別錯誤 | `pnpm --filter ./hono-pickball typecheck` exit 0 | regression guard | integration |

### Requirement: 使用者資料請求的預期帳號守衛（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變` | 預期帳號守衛：帳號不符時每條使用者資料路由回 401 且資料不變 | B cookie＋A 標頭 × 13 條樣本 → 每條 401 `{ error: "ACCOUNT_MISMATCH" }`；`USER_DATA_TABLES` 中 A、B 列前後相同 | golden path；真紅（守衛不存在時以 B 身分成功，reset 會刪 B 的資料） | integration |
| `缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變` | 預期帳號守衛：缺少標頭時每條使用者資料路由回 401 且資料不變 | 無標頭與空字串各一輪 × 13 → 401 ACCOUNT_MISMATCH；資料不變 | fail-closed 邊界；真紅 | integration |
| `列舉出的使用者資料路由恰與守衛樣本表一致` | 預期帳號守衛：列舉出的路由恰與樣本表一致 | `app.routes` 扣除 `ALL` 與 allowlist 的「方法＋路徑」集合 == 樣本表鍵、數量 13 | 交接機制；寫入時即綠（列舉與樣本表在同一 RED commit 建立）→ regression guard | integration |
| `未登入回 UNAUTHORIZED、停用回 404，皆優先於帳號守衛` | 預期帳號守衛：未登入與停用的回應優先於帳號守衛 | 無 cookie 無標頭 → 401 UNAUTHORIZED；停用 env → 404（13 條各自斷言） | 順序；regression guard | integration |
| `標頭與 session 相符時使用者資料端點照常處理且標頭名稱不分大小寫` | 預期帳號守衛：標頭與 session 相符時照常處理 | 小寫標頭 PUT v0 → 200 v1；GET 取回 | regression guard（守衛前後皆綠） | integration |
| `非使用者資料路由不要求預期帳號標頭` | 預期帳號守衛：非使用者資料路由不要求標頭 | 無標頭 `/api/me`、`/api/session`、`/api/health` → 200，user.id 為 A | regression guard（防止守衛掛錯位置） | integration |
| `API_ERROR_CODES 恰為四個錯誤碼且值等於鍵名` | 預期帳號守衛：錯誤碼常數含 ACCOUNT_MISMATCH | `Object.keys` 排序後 == 四個；值 == 鍵 | 真紅（缺 ACCOUNT_MISMATCH） | unit |
| `EXPECTED_USER_ID_HEADER 為 X-Expected-User-Id` | 預期帳號守衛：標頭名稱常數 | 值 == `"X-Expected-User-Id"` | 真紅（模組不存在） | unit |

### Requirement: 前端使用者資料請求帶預期帳號（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `每個請求帶 X-Expected-User-Id 標頭，有 body 時與 Content-Type 並存` | 請求標頭：每個請求帶預期帳號標頭 | GET 與 PUT 的 `new Headers(init.headers).get("X-Expected-User-Id")` == `user-a`；PUT 另有 JSON content-type | golden path；真紅 | unit |
| `requestJson 只使用呼叫端給的 expectedUserId，不讀 session store` | 請求標頭：預期帳號只來自呼叫端 | mock session store 快照為 B、以 `user-a` 呼叫 → 標頭為 `user-a` | 競態防線；GREEN 前因標頭不存在而紅（若實作從未讀 session，此列在 GREEN 後的意義為 regression guard，紀錄中註明） | unit |
| `401 ACCOUNT_MISMATCH 同樣分類為 unauthorized` | 請求標頭：帳號不符的 401 同樣分類為 unauthorized | 401＋`{ error: "ACCOUNT_MISMATCH" }` → `{ kind: "unauthorized" }` | regression guard（既有 401 分類不看 body） | unit |
| `包裝把 expectedUserId 交給 requestJson`（`roster-api.test.ts`） | 請求標頭：API 薄包裝把預期帳號原樣交給 requestJson | 5 個包裝以 `user-a` 為第一參數 → 每次 `calls[i][2].expectedUserId` == `user-a` | 真紅 | unit |
| `包裝把 expectedUserId 交給 requestJson`（`round-api.test.ts`） | 同上 | 6 個包裝同上 | 真紅 | unit |

### Requirement: 雲端 store 以登入帳號為界（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入`（`useRemoteScoreboardStore.test.tsx`） | 帳號世代：計分板換帳號時丟棄待送變更並以新帳號重新載入 | A 世代 PUT 500 等重試 → rerender B → 只有一次 B 標頭的 GET、無 PUT；狀態 4:2、synced | 核心競態；真紅（effect 依賴不含 userId） | hook |
| `userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入`（`useRemoteRosterStore.test.tsx`） | 帳號世代：名單換帳號時丟棄待送變更並以新帳號重新載入 | 同型；無 PUT／DELETE；名單為 B 的一位 | 真紅 | hook |
| `userId 變更時丟棄前一帳號的命令佇列並以新帳號重新載入` | 帳號世代：回合換帳號時丟棄命令佇列並以新帳號重新載入 | 回合 PUT 500 等重試 → rerender B → 無 PUT／POST；round／slots 為 B；兩個 GET 帶 B；`updatePlayer` 未呼叫 | 真紅 | hook |
| `userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入`（`useRemoteMatchSlotStore.test.tsx`） | 帳號世代：分槽換帳號時丟棄待送變更並以新帳號重新載入 | 分槽 PUT 500 等重試 → rerender B → 無 PUT；`missing`；GET 帶 B | 真紅 | hook |
| `每個世代的請求一律帶該世代的帳號`（計分板、名單各一） | 帳號世代：每個世代的請求一律帶該世代的帳號 | rerender 前全部請求標頭 A、之後全部 B（含重試） | 標頭綁世代；真紅 | hook |
| `userId 變更的那一次 render 起不回傳前一帳號的資料`（計分板、名單、回合各一） | 帳號世代：換帳號的那一次 render 起不回傳前一帳號的資料 | rerender 後同步讀 `result.current` → 初始狀態＋loading；操作不送出、不改狀態 | 閃一幀的防線；真紅 | hook |
| `enabled 為 true 但 userId 為 null 時不發出任何請求`（四支 hook 各一） | 帳號世代：userId 為 null 時視同停用 | fetch 未被呼叫 | 邊界；真紅（目前只看 enabled） | hook |
| `換帳號後才回來的送出比分結果不呼叫 applyRemotePlayers` | 帳號世代：換帳號後才回來的送出比分結果不影響名單 | POST 在途 → rerender B → POST 200 → `applyRemotePlayers`、`reloadRemotePlayers` 未呼叫 | 跨 store port 防線；真紅 | hook |
| `選擇器把 session 的 user id 傳給雲端 hook`（三個選擇器測試檔各一） | 帳號世代：選擇器把 session 的 user id 交給雲端 hook | mock `useSession` A → B：載入請求標頭依序 A、B；loading／訪客無請求 | 真紅 | hook |
| `雲端匯入與備份的每個請求都帶呼叫端給的帳號` | 帳號世代：一次性雲端操作以觸發當下的帳號送出 | mock 包裝，`importRemoteRoster("user-a", …)`、`buildRemoteBackupSnapshot("user-a")` → 每個包裝呼叫第一參數為 `user-a` | 真紅 | unit |
| `雲端匯入與備份遇到 401 時以機器可讀欄位標示未授權` | 帳號世代：一次性雲端操作標示未授權 | 各 401 分支 → 結果帶未授權欄位、訊息不變；`failed`／`conflict` 分支不帶 | 真紅 | unit |
| `雲端建立分槽帶入目前帳號且未授權時刷新 session 並不導向` | 帳號世代：建立雲端分槽帶入目前帳號且未授權時刷新 session | mock `useSession`（A、`refresh` spy）與 `putRemoteSlot` 回 unauthorized → 第一參數 A、`refresh` 一次、錯誤訊息出現、`remoteNavigate` 未呼叫 | 真紅 | unit |

### Requirement: 另一分頁換帳號時本分頁不寫入新帳號（ADDED）

全部為**驗收型 RED**（§4 寫入並實跑看到紅，§9 轉綠）。

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `另一分頁換成帳號 B 後，本分頁的計分不會寫入 B 且改以 B 的資料重新載入` | 換帳號 E2E：本分頁的計分不寫入新帳號 | PUT 401；頁面最終 2:0、帳號入口為 B；B 版本不變；A 未變 | 真紅（目前 PUT 以 B 身分成功或 409 後顯示 B 卻仍標 A） | e2e |
| `另一分頁換成帳號 B 後，本分頁新增的參賽者不會寫入 B 的名單` | 換帳號 E2E：本分頁新增的參賽者不寫入新帳號 | PUT 401；B 名單仍一位；A 未變 | 真紅（目前寫進 B） | e2e |
| `另一分頁換成帳號 B 後，本分頁的重置不會刪除 B 的資料` | 換帳號 E2E：本分頁的重置不刪除新帳號的資料 | reset 401；B 名單仍一位 | 真紅（目前刪光 B） | e2e |
| `另一分頁換成帳號 B 後，本分頁產生的對戰不會寫入 B 的回合` | 換帳號 E2E：本分頁產生的對戰不寫入新帳號 | 回合 PUT 401；B 的 round 為 null/0 | 真紅（目前 version 0 PUT 在 B 建立回合） | e2e |
| `另一分頁換成帳號 B 後，本分頁送出比分不會寫入 B 的回合與歷史` | 換帳號 E2E：本分頁送出比分不寫入新帳號 | POST 401；B 不變；A 該場仍未完成 | 紅燈只來自狀態碼（目前 409），見 design Open Questions 2；紀錄中如實註明 | e2e |
| `另一分頁換成帳號 B 後，本分頁進入計分板不會在 B 建立分槽` | 換帳號 E2E：本分頁進入計分板不在新帳號建立分槽 | 分槽 PUT 401；停留 `/matchmaker`、顯示錯誤；帳號入口為 B；B 的分槽清單為空 | 真紅（目前 409 被當成已存在而導向） | e2e |
| `使用者資料請求經前端 proxy 帶上目前帳號的標頭` | 換帳號 E2E：經前端 proxy 的請求帶上目前帳號 | `waitForRequest` 的 `x-expected-user-id` == `/api/session` 的 user.id；回應 200 | 真紅（標頭不存在） | e2e |

## auth

### Requirement: 換帳號用的衍生測試帳號（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `deriveSwitchAccountEmail 產生不同於原值且固定的 email` | 衍生測試帳號：衍生 email 必與原值不同且恆定 | 兩種輸入各兩次 → 同網域、≠ 輸入、兩次相等 | 真紅（函式不存在） | integration |
| `衍生帳號與原帳號以同一組密碼皆可登入且為不同使用者` | 衍生測試帳號：衍生帳號以同一組密碼可以登入 | 兩份 seed SQL 套用 → 兩者登入 200、`user.id` 不同 | 真紅（依賴 `deriveSwitchAccountEmail`）；seed 本身為既有行為 | integration |
| C2（指令驗收） | 衍生測試帳號：seed 腳本建立原帳號與衍生帳號 | 見下方指令驗收 | 設定層（腳本 I/O） | integration |

## dev-workflow

### Requirement: 換帳號 E2E 夾具（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `另一分頁換成帳號 B 後，本分頁的計分不會寫入 B 且改以 B 的資料重新載入`（前置斷言） | 換帳號夾具：清空使用者資料涵蓋衍生帳號 | `beforeEach` 清空後、切換為 B 時 B 的計分板為 `{ data: null, version: 0 }` | 夾具正確性；隨 E2E 驗收 | e2e |
| C4（指令驗收） | 換帳號夾具：既有 spec 直接呼叫 API 時帶預期帳號標頭 | `--project=user-data` 0 failed、0 skipped | 設定層（`tests/**` helper） | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對象 | 指令 | 通過條件 |
|---|------|------|----------|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （seed） | `pnpm --filter ./hono-pickball db:seed:local` 兩次；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball exec wrangler d1 execute DB --local --env local --command "SELECT email FROM user"`；兩個帳號各以 curl 經 `:8787` 登入；`grep -c -- "--remote" hono-pickball/scripts/seed-test-account.ts` | 兩次 exit 0；原 email 與衍生 email 各 1 筆；兩者 200；grep 為 0；紀錄不含密碼值 |
| C3 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線 |
| C4 | （user-data E2E） | `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data` | 全數 passed、0 skipped；含本 change 新增 7 條 |
| C5 | （完整 E2E） | 依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令（chromium／firefox／mobile-chrome／user-data 各一次；webkit／mobile-safari 各 `--shard=i/3`），先取 `/tmp/heavy-lock.sh` 鎖 | 既有 test 全數原樣通過（webkit `quiz.spec.ts:49` 既有競態以隔離重跑判讀）；訪客 project 的 `--list` 數與基線相同 |
| C6 | （單元） | `pnpm test` | 三組皆綠；檔數／測試數 ≥ 基線 |
| C7 | （建置） | `pnpm build` | exit 0 |
| C8 | （規格） | `DO_NOT_TRACK=1 openspec validate user-data-account-guard --strict` | valid |
| C9 | （WebKit 手動） | Safari 開 `/scoreboard`（已登入）並得分、重新整理 | keepalive GET 帶自訂標頭正常 200；無 console 錯誤；結果記入 tasks |
| C10 | （既有測試改動範圍） | `git diff main -- <tasks 檔頭列出的既有測試檔>` | 只見「新增 `expectedUserId`／`userId` 參數」「請求加標頭」「新增 `vi.mock` 區塊與新 it」；無 it 名稱或斷言改動 |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e；`hook` 為 unit 細分)
- [x] Test names use imperative form（沿用本專案以繁中句子作為 it 名稱的慣例）
