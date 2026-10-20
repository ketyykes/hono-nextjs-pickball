# Test Plan: backend-d1-foundation

> **RED-phase 承諾書**。本檔只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier 對照：
> - `integration`：`hono-pickball/test/**`，Vitest 跑在 workerd（`@cloudflare/vitest-pool-workers`），
>   使用真實的本機 D1（經 migration 夾具建立）。本 change 的後端測試全屬此層——它們都碰到 binding 與真實 SQLite。
> - `unit`：不碰 binding 的純函式。本 change 沒有。
> - `e2e`：Playwright。本 change 不新增 E2E，但 §5 MUST 跑完整套既有 E2E 作為回歸（`dev` script 改走 `--env local`）。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致**。
>
> 部分 Scenario 的驗收是「指令實跑紀錄」（dry-run、從零 migration、無漂移、typegen 穩定、worker 名稱、CLAUDE.md 內容），
> 它們不是 Vitest 測試，列在本檔最後的「指令驗收」表，tasks 中以「驗收（指令）」標示，不偽裝成 RED。

## backend-database

### Requirement: 後端以 getDb 取得 D1 的 drizzle 實例

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| getDb 回傳的實例可寫入並讀回 user 資料列 | 取得的實例可寫入並讀回資料 | `getDb(env)` 插入 `{ id, name, email }` 後以 email 查詢 → 讀回列的 `id`／`name`／`email` 與寫入值相同 | golden path：runbook 驗收「一條測試真的寫入並讀回 D1」的本體；`client.ts` 不存在時為真紅燈（模組解析失敗） | integration |
| DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤 | DB binding 不存在時立即拋錯 | `getDb({ ...env, DB: undefined })` → throw，`message` 含 `DB` | edge case：正式部署沒有 `DB`，這是唯一能在取得實例當下暴露 misconfiguration 的防線 | integration |
| getDb 回傳的實例帶入 schema，可用 relational query 讀回 user | （覆蓋義務：Requirement 本文「帶入 `src/db/schema.ts` 全部資料表定義」） | 插入一筆 user 後以 `db.query.user.findFirst({ where: ... email })` 讀回 → `id` 與寫入值相同 | §4 Stage 2 審查以 mutation 發現 `drizzle(env.DB)`／`{ schema: {} }` 存活；B2 adapter 與 relational query 依賴 schema。寫入即綠，屬覆蓋測試（非 RED） | integration |

### Requirement: auth 核心資料表由 migration 建立

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| auth 核心四張資料表皆已由 migration 建立 | migration 套用後四張表皆存在 | `SELECT name FROM sqlite_master WHERE type='table'` → 含 `user`／`session`／`account`／`verification` | golden path：夾具＋migration 管線是否接通的第一個訊號；寫入時 migration 不存在 → 真紅燈 | integration |
| user.email 重複時插入失敗 | user.email 不可重複 | 先插入 `a@example.com`，再插入同 email → reject（訊息含 `UNIQUE`）；`COUNT(*)` 仍為 1 | edge case：設定層約束的覆蓋義務（Decision 6）；B2 的 seed 與登入依賴 email 唯一 | integration |
| 刪除使用者時其 session 與 account 一併刪除 | 刪除使用者時連帶刪除其 session 與 account | 建立 user＋session＋account → 刪除 user → 兩表中該 `userId` 的筆數皆為 0 | edge case：cascade 漏寫不會有任何其他訊號，會留下孤兒憑證；同時驗證 D1 的 foreign key 實際生效 | integration |
| session.token 重複時插入失敗 | （覆蓋義務，無獨立 Scenario；dev-workflow「D1 schema 與 migration SQL 屬設定層」要求每個約束各有測試） | 同一位 user 插入兩筆相同 token 的 session → 第二筆 reject（訊息含 `UNIQUE`）；該 token 的 `COUNT(*)` 仍為 1 | §3 Stage 2 審查以 mutation 發現 `session_token_unique` 移除後全綠存活；token 是 session 查找鍵。寫入即綠，屬覆蓋測試（非 RED） | integration |
| verification 資料表可寫入並讀回 | （覆蓋義務，無獨立 Scenario；「每新增一張資料表 MUST 有測試證明可經 migration 建立並被寫入讀回」） | 插入 `{ id, identifier, value, expires_at, created_at, updated_at }` 後以 id 查回 → 各欄位與寫入值相同 | §3 Stage 2 審查發現 verification 只有「存在」測試、無任何寫入讀回。寫入即綠，屬覆蓋測試（非 RED） | integration |

## dev-workflow

### Requirement: 後端測試在 workerd runtime 中執行

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration | 測試用 D1 已由夾具套用全部 migration | `SELECT name FROM d1_migrations ORDER BY id` 的名稱陣列 → 等於 `env.TEST_MIGRATIONS.map(m => m.name)`，且長度 ≥ 1 | golden path：證明夾具是「套用 repo 內 migration」而不是碰巧有表；長度 ≥ 1 擋掉「兩邊都空陣列」的恆真 | integration |
| 可在 workerd runtime 中執行並存取 Hono worker | 後端測試可在 workerd runtime 中取得 worker | 既有 it，原樣保留 | regression guard：夾具改動 vitest config 後既有測試必須不變 | integration |

### Requirement: 後端 Hono app 必須帶入 binding 型別

型別層要求，依既有 spec 不以單元測試驗收；見下方指令驗收 C4、C5。

### Requirement: 本機 D1 migration 流程

指令驗收 C2、C3。

### Requirement: D1 schema 與 migration SQL 屬設定層

文件驗收 C6。

### Requirement: .dev.vars.example 列出本機所需變數且不含真值

文件驗收 C7。

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| 編號 | 對應 Scenario | 指令／動作 | 通過條件 |
|------|---------------|-----------|----------|
| C1 | 正式部署設定的 dry-run 通過且不含 D1 | `pnpm --filter ./hono-pickball build` | exit 0；輸出的 binding 清單無 `DB` |
| C2 | migration 可從零套用到本機 D1 | 刪 `hono-pickball/.wrangler/state` 後 `pnpm --filter ./hono-pickball db:migrate:local`，再 `wrangler d1 execute DB --local --env local --command "SELECT name FROM sqlite_master WHERE type='table'"` | exit 0；列出四張表 |
| C3 | schema 與 migration 無漂移 | `pnpm --filter ./hono-pickball db:generate` | 回報無變更；`git status --porcelain -- hono-pickball/drizzle` 為空 |
| C4 | 產出的型別中 DB 為可選且不受本機 .dev.vars 影響 | 有／無 `.dev.vars` 各跑一次 `cf-typegen` | 兩次 `git diff --exit-code -- hono-pickball/worker-configuration.d.ts` 皆 0；檔內含 `DB?: D1Database` |
| C5 | 型別檢查通過 | `pnpm --filter ./hono-pickball typecheck` | exit 0（兩段） |
| C6 | CLAUDE.md 記載設定層例外與其覆蓋義務 | 閱讀 `hono-pickball/CLAUDE.md` | 有設定層例外段落且寫明覆蓋義務 |
| C7 | 範例檔存在且 wrangler.jsonc 不設 ENVIRONMENT | 閱讀兩檔 | 範例含 `ENVIRONMENT=development`；`wrangler.jsonc` 無 `vars` 鍵 |
| C8 | 本機環境的 worker 名稱維持 hono-pickball | `pnpm --filter ./hono-pickball exec wrangler dev --env local --port 8790` 啟動後 `curl :8790/api/health`，結束後立刻停止該 process | 啟動輸出含 `hono-pickball`（無 `-local` 後綴）；health 回 200 |

---

## Checklist

- [x] Every requirement has at least one matching test（型別／流程／文件類 Requirement 以指令驗收列出，符合既有 spec「型別層要求不以單元測試驗收」的先例）
- [x] Every Scenario (####) has at least one matching test or command check
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names are descriptive (Traditional Chinese, matching spec anchors)
