# Test Plan: auth-backend-test-account

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：
> - `unit`：不碰 binding 與網路的純函式（`isLocalAuthEnabled`）。仍放 `hono-pickball/test/`、跑在 workerd。
> - `integration`：`hono-pickball/test/**` 中經由 Hono app（`exports.default.fetch` 或 `app.request`）或 D1 的測試。
> - `e2e`：Playwright，`nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`，前後端兩個 dev server。
>
> 共通前置：測試帳號以 `buildTestAccountSeedSql` 的輸出套用到測試用 D1（同一測試檔共用 storage，各 it 用不同 email 避免碰撞）。
> 所有 POST `/api/auth/*` 帶 `Origin: http://localhost:3005`。停用／缺值／替身情境用 `app.request(url, init, env)`。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**（runbook：每個端點要有未登入 401 與他人資料被拒）：
>
> | 端點 | 未登入 | 他人資料 | 說明 |
> |------|--------|----------|------|
> | `GET /api/me` | 401（auth-me） | A 的 cookie 不得取得 B（auth-me） | 本 change 唯一的受保護端點 |
> | `GET /api/session` | N/A：刻意永遠 200 | 回傳的是 cookie 本人（auth-session「登入後回…」） | 狀態探針，不作授權依據（spec 明文） |
> | `/api/auth/*` | better-auth 自身行為 | N/A | 只驗證本 change 的設定（gate、註冊關閉、錯誤密碼） |

## auth

### Requirement: 本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真 | isLocalAuthEnabled 只接受字面值 development | `undefined`／`""`／`"production"`／`"Development"` → false；`"development"` → true | golden path＋edge：D5 反向設計的核心判斷，所有 gate 都建立在它上面 | unit |
| ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie | ENVIRONMENT 缺值時 email 登入不可用 | env 去掉 `ENVIRONMENT`，正確帳密 POST sign-in → 404，無 `Set-Cookie` | edge case：runbook 明定「兩種情況都要有測試」之一；遠端忘了設變數的情境 | integration |
| ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie | ENVIRONMENT 為非 development 值時 email 登入不可用 | `ENVIRONMENT="production"`，正確帳密 → 404，無 `Set-Cookie` | edge case：runbook 明定之二 | integration |
| 停用且無 DB binding 時 auth 路由與 /api/me 皆回 404 | 停用時不觸碰 D1 | env 去掉 `ENVIRONMENT` 與 `DB`，GET `/api/auth/get-session` 與 GET `/api/me` → 皆 404（非 500） | edge case：等同正式部署設定；證明 gate 在 `createAuth`／`getDb` 之前 | integration |

### Requirement: 測試帳號以 email 與密碼登入

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 帳密正確時回 200 並設定 HttpOnly、SameSite=Lax 的 session cookie | 帳密正確時取得 session cookie | 200；`Set-Cookie` 含 `better-auth.session_token=`、`HttpOnly`、`SameSite=Lax`、`Path=/`，不含 `Secure` | golden path：B2 的核心價值；`/api/auth/*` 未掛載前為真紅燈（404） | integration |
| 密碼錯誤時回 401 且不發 session cookie | 密碼錯誤回 401 | 錯誤密碼 → 401，無 `better-auth.session_token` | edge case：runbook 驗收「錯誤密碼 401」 | integration |
| 帳號不存在與密碼錯誤回應相同的 401 | 帳號不存在與密碼錯誤的回應無從區分 | 兩種請求 → status 皆 401，`await res.json()` 深度相等 | edge case：帳號列舉防護；better-auth 預設行為，可能加入即綠（如實標註 regression guard） | integration |

### Requirement: 不開放註冊

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 註冊端點回 400 且不建立使用者 | 註冊端點被拒 | POST `/api/auth/sign-up/email`（新 email）→ 400；`SELECT COUNT(*) FROM user WHERE email=?` → 0 | edge case：runbook 驗收「註冊端點被拒」；`disableSignUp` 漏設時會靜默建立帳號 | integration |

### Requirement: auth 實例每請求依 env 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 缺少 BETTER_AUTH_SECRET 時 createAuth 拋錯 | 缺少 BETTER_AUTH_SECRET 時拒絕建立 | `createAuth({ ...env, BETTER_AUTH_SECRET: undefined })` → throw，訊息含 `BETTER_AUTH_SECRET` | edge case：防止以 better-auth 預設 secret 運作 | integration |
| 缺少 BETTER_AUTH_URL 時 createAuth 拋錯 | 缺少 BETTER_AUTH_URL 時拒絕建立 | 同上，訊息含 `BETTER_AUTH_URL` | edge case：缺 baseURL 時 origin 檢查與 cookie 判斷皆不可預期 | integration |
| baseURL 與 trustedOrigins 皆取自 BETTER_AUTH_URL | baseURL 與 trustedOrigins 取自 BETTER_AUTH_URL | 以與 vitest binding 不同的值（例 `"http://other.test:4321"`）覆寫 `BETTER_AUTH_URL` → `options.baseURL` 等於該值、`trustedOrigins` 深度等於 `[該值]`；同 it 覆寫 `BETTER_AUTH_SECRET` → `options.secret` 等於該值（apply §3 Stage 2 補強：與 binding 同值時寫死的實作測不出） | golden path：CSRF 與 cookie 屬性都由此決定 | integration |
| emailAndPassword 只在 development 啟用且一律禁止註冊 | emailAndPassword 隨 isLocalAuthEnabled 開關且禁止註冊 | development → `enabled===true`；缺值 → `false`；兩者 `disableSignUp===true` | edge case：第二道防線，gate 被移除時仍關閉 | integration |
| Google provider 只在 client id 與 secret 皆存在時註冊 | Google 只在兩個變數皆存在時註冊 | 三種組合 → 只有兩者皆有時 `options.socialProviders.google` 存在 | edge case：預留結構不得在缺一值時半啟用 | integration |

### Requirement: requireSession 與 GET /api/me

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 未登入呼叫 /api/me 回 401 | 未登入呼叫 /api/me 回 401 | 無 cookie → 401，body `{ error: "UNAUTHORIZED" }` | golden path（授權）：Wave 2 所有 API 的樣板 | integration |
| 偽造的 session cookie 呼叫 /api/me 回 401 | 無效 cookie 回 401 | `Cookie: better-auth.session_token=forged` → 401 | edge case：只檢查 cookie 存在而不驗證的實作會放行 | integration |
| 登入後 /api/me 回本人的 id、email 與 name | 登入後 /api/me 回本人且只含三個欄位 | 登入取 cookie → 200；`Object.keys(user).sort()` 為 `["email","id","name"]`；email 相符 | golden path：runbook 驗收「登入取得 session cookie → GET /api/me 回使用者」；鍵集合斷言擋掉洩漏額外欄位 | integration |
| A 的 cookie 只能取得 A 而非 B 的資料 | 不會取得其他使用者的資料 | seed A、B；以 A 登入 → `/api/me` 的 `id` 等於 A 的 id 且不等於 B 的 id | edge case：runbook「存取他人資料被拒」在本端點的對應 | integration |
| 登出後原 session cookie 呼叫 /api/me 回 401 | 登出後原 cookie 失效 | 登入 → POST sign-out（帶 cookie 與 Origin）→ 同 cookie GET `/api/me` → 401 | edge case：B3 登出 E2E 的後端依據；只清 cookie 不撤銷 session 的實作會放行 | integration |

### Requirement: GET /api/session 狀態探針永遠回 200

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 停用且無 DB 時回 200 與 authEnabled false | 停用時回 authEnabled false 且不需要 DB | env 去掉 `ENVIRONMENT`、`DB` → 200，body 深度等於 `{ authEnabled: false, user: null }` | golden path：正式部署與訪客的唯一路徑，B3 依賴 | integration |
| 啟用但未登入時回 200 與 user null | 啟用但未登入時回 user null | 無 cookie → 200，`{ authEnabled: true, user: null }` | golden path：B3 顯示登入入口的訊號 | integration |
| 登入後回 200 與目前使用者的 id、email 與 name | 登入後回目前使用者 | 登入取 cookie → 200，`authEnabled===true`，`user` 鍵集合為三個 | golden path | integration |
| session 查詢拋錯時仍回 200 與 user null | session 查詢失敗時降級為 user null | `DB` 換成 `prepare()` 一律拋錯的替身＋任一 session cookie → 200，`{ authEnabled: true, user: null }` | edge case：本機未 migration 時訪客 UI 不得壞；同時證明降級只在探針 | integration |

### Requirement: 測試帳號以 seed 寫入本機 D1

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| seed 產生的測試帳號可以登入 | seed 後的測試帳號可以登入 | 套用 SQL → 以同帳密 sign-in → 200 | golden path：seed 與 better-auth 的雜湊／欄位相容性只有這條能證明；模組不存在時真紅燈 | integration |
| 重複 seed 同一 email 只留下一筆且以最新密碼為準 | 重複 seed 不產生重複使用者 | 同 email 套用兩次（密碼 p1、p2）→ user 1 筆、該 user 的 account 1 筆；p1 登入 401、p2 登入 200 | edge case：開發者會反覆執行 seed | integration |
| seed SQL 不含明文密碼且正確跳脫單引號 | SQL 不含明文密碼且正確跳脫單引號 | name `O'Neil`、密碼 `p@ss'word` → SQL 不含 `p@ss'word`；套用後讀回 name 為 `O'Neil` | edge case：明文外洩與 SQL 注入式破損 | integration |

## api-connectivity

### Requirement: better-auth 的 session cookie 經 proxy 原樣穿透

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 經 proxy 登入後 session cookie 落在前端 origin 並可取得 /api/me | 經 proxy 登入後取得 session cookie 並可呼叫 /api/me | `request.post(":3005/api/auth/sign-in/email")` → 200，`set-cookie` 含 `better-auth.session_token=`、`HttpOnly`；同 context GET `/api/me` → 200 且 email 相符 | golden path：runbook B2 驗收「cookie 經 proxy 穿透」；後端路由不存在時真紅燈 | e2e |
| 經 proxy 呼叫 /api/session 未登入時回 200 與 user null | 經 proxy 呼叫 /api/session 回 200 | GET `:3005/api/session` → 200，`typeof authEnabled === "boolean"`，`user === null` | golden path：B3 每頁呼叫的通路 | e2e |

## dev-workflow

### Requirement: 後端測試在 workerd runtime 中執行

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration | 測試用 D1 已由夾具套用全部 migration | B1 既有 it，原樣保留 | regression guard：本 change 改 `vitest.config.ts` 的 bindings 不得破壞夾具 | integration |
| 可在 workerd runtime 中執行並存取 Hono worker | 後端測試可在 workerd runtime 中取得 worker | 既有 it，原樣保留 | regression guard | integration |
| （審查驗收）需要不同 env 的測試以 app.request 注入 | 需要不同 env 的測試以 app.request 注入 | Stage 1 Reviewer 逐檔核對 `auth-gating`／`auth-session` 的停用、缺值、替身情境皆走 `app.request`，`vitest.config.ts` 未為單一測試改全域 binding | 慣例約束，非行為；以審查而非測試驗收 | integration |

### Requirement: 測試帳號 seed 與本機 auth 變數

指令驗收 C3～C6（見下表）。

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| 編號 | 對應 Scenario | 指令／動作 | 通過條件 |
|------|---------------|-----------|----------|
| C1 | （B2 不改 top-level wrangler 設定的回歸） | `pnpm --filter ./hono-pickball build` | exit 0 |
| C2 | （型別） | `pnpm --filter ./hono-pickball typecheck` | 兩段 exit 0 |
| C3 | seed 腳本只寫本機 D1 | `grep -n -- "--remote" hono-pickball/scripts/seed-test-account.ts`；`grep -n -- "--local" …` | 前者無輸出；後者有輸出且同一呼叫含 `--env local` |
| C4 | seed 指令可在本機建立可登入的測試帳號 | `.dev.vars` 齊備 → `db:migrate:local` → `db:seed:local` → 啟動後端 → `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Origin: http://localhost:3005" -H "Content-Type: application/json" -d '{"email":…,"password":…}' http://localhost:8787/api/auth/sign-in/email` | seed exit 0；curl 輸出 200（帳密不得出現在 tasks.md 紀錄中，以 `<TEST_ACCOUNT_*>` 代稱） |
| C5 | 缺少帳密變數時 seed 以非 0 結束 | 暫時移除 `.dev.vars` 的 `TEST_ACCOUNT_PASSWORD` 後執行 `db:seed:local`，結束後還原 | exit 非 0；輸出含 `TEST_ACCOUNT_PASSWORD` |
| C6 | 後端測試結果不受本機 .dev.vars 影響 | 有／無 `.dev.vars` 各跑 `pnpm --filter ./hono-pickball test` | 兩次全綠且通過數相同 |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test or command check
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names match spec anchors verbatim
