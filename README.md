# hono-nextjs-pickball

匹克球指南專案的 monorepo，使用 pnpm workspaces 管理前後端。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/        ← 前端：Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
│  └─ wrangler.jsonc       ← Worker「nextjs-pickball」設定（OpenNext + service binding）
├─ hono-pickball/          ← 後端：Hono on Cloudflare Workers
│  └─ wrangler.jsonc       ← Worker「hono-pickball」設定
├─ packages/pickball-core/ ← 前後端共用的純邏輯核心套件 `@pickball/core`（無建置產物）
├─ openspec/               ← OpenSpec 規格與變更（CLI 從 root 執行）
├─ docs/superpowers/       ← 設計文件與實作計畫（歷史紀錄；正式規格在 openspec/）
├─ .claude/                ← Claude Code 專案設定
├─ .agents/                ← agent 相關設定（唯一來源，不在 workspace 內複製）
├─ AGENTS.md               ← 非 Claude agent 的入口（只放指標；規範內文見 CLAUDE.md）
└─ skills-lock.json        ← 外部 skill 版本鎖定（root 單一份）
```

## 環境

- Node `22.22.1`（見 `.node-version`）
- pnpm `10.17.0`

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm install` | 一次安裝三個 workspace 的依賴 |
| `pnpm dev` | 同時起前端（:3005）與後端（:8787） |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | `pnpm -r build`，三個 workspace 都真的建置（後端為 `tsc --noEmit && wrangler deploy --dry-run`；核心套件無產物，build 即 `tsc --noEmit`） |
| `pnpm lint` | 跑 Next.js ESLint |
| `pnpm typecheck` | `pnpm -r exec tsc --noEmit`（核心套件只跑 `src` 這一段，不含其 `test/tsconfig.json`） |
| `pnpm test` | `pnpm -r test`，前端 Vitest + 後端 workerd Vitest + 核心套件 Vitest（node 環境） |
| `pnpm test:web` / `pnpm test:api` | 只跑單一 workspace 的單元測試 |
| `pnpm test:e2e` | 跑 Playwright E2E（5 個 browser project＋需登入的 `user-data` project） |
| `pnpm --filter ./nextjs-pickball preview` | OpenNext build 後在本機 workerd runtime 驗證 |
| `pnpm --filter ./<workspace> cf-typegen` | 改 `wrangler.jsonc` 後重新產生 Cloudflare binding 型別 |

## 部署

部署目標為 Cloudflare Workers，經 CF Dashboard 的 **Workers Builds**（Git 整合）自動部署；兩個 Worker 連同一個 repo、各設 root directory：

| Worker 名稱 | 來源 | 說明 |
|---|---|---|
| `hono-pickball` | `hono-pickball/` | Hono API（wrangler） |
| `nextjs-pickball` | `nextjs-pickball/` | Next.js（@opennextjs/cloudflare），service binding `HONO_API` 指向 hono-pickball |

- 部署順序：**先 hono-pickball、後 nextjs-pickball**（service binding 目標必須先存在）
- 兩個 Worker 皆相依 workspace 套件 `@pickball/core`；Workers Builds 在各自 root directory 下能否解析它**尚待遠端驗證**（本機 build 與 dry-run 已通過）
- 部署後 URL 形式：`<worker>.<subdomain>.workers.dev`
- 每個 Worker 的 root directory 與 build command 設在 **CF Dashboard → Settings → Builds**，不在 repo 內；`wrangler.jsonc` 的 `name` 必須與 Dashboard 上的 Worker 名稱一致，否則會部署到錯的 Worker

### 部署前手動檢查清單

本專案**不使用 CI**，以下八步在推送前手動跑過（順序刻意由快到慢，讓失敗盡早出現）：

```bash
pnpm lint                                        # 1. ESLint
pnpm -r exec tsc --noEmit                        # 2. 型別檢查（三個 workspace）
pnpm --filter ./nextjs-pickball test --run       # 3. 前端單元測試
pnpm --filter ./packages/pickball-core test --run # 4. 核心套件單元測試
pnpm test:api --run                              # 5. 後端單元測試（workerd；--run 停用 watch）
pnpm test:e2e                                    # 6. Playwright E2E（會自動帶起前後端）
pnpm --filter ./nextjs-pickball preview          # 7. workerd runtime 整合驗證
```

> ⚠️ 第 6 步的 Playwright 設定會重用既有 dev server（`reuseExistingServer`）。若 dev server
> 已連續運行很久（隔夜以上），陳舊的 dev chunk 快取可能噴 `ChunkLoadError` 造成假失敗
> （2026-09-03 於 webkit 實測，隔離重跑即過）。跑本清單前請先重啟 dev server，
> 或先停掉它讓 Playwright 自行帶起乾淨的前後端。

8. 確認部署順序：先 hono-pickball，後 nextjs-pickball；首次上線，以及日後改動 secrets 或正式 D1 時，另依下方「正式站上線步驟」逐步執行與驗收

### 正式站上線步驟

正式站只開放 Google 登入；後端以 Worker secret 取得設定，正式 D1 為 `hono-pickball`。以下步驟**一律由使用者手動執行**（coding agent 不執行任何遠端 Cloudflare 操作，只做 `--local` 與 `--dry-run`），指令皆在 repo root 執行。**步驟 1～3 完成前不要 `git push`**：push 即觸發兩個 Worker 的正式部署，缺 secret 時正式站會退回訪客版（不會壞，但需要再部署一次）。OAuth 的 Client ID／Secret 與任何 secret 值不得寫入任何會 commit 的檔案。

#### 1. 設定 hono-pickball 的四個 Worker secret

```bash
pnpm --dir hono-pickball exec wrangler login
openssl rand -base64 32        # 複製輸出，作為下一行的值
pnpm --dir hono-pickball exec wrangler secret put BETTER_AUTH_SECRET
pnpm --dir hono-pickball exec wrangler secret put BETTER_AUTH_URL      # 輸入 https://nextjs-pickball.wedsatcoming.workers.dev（無尾端斜線）
pnpm --dir hono-pickball exec wrangler secret put GOOGLE_CLIENT_ID     # Google Cloud Console 的用戶端 ID
pnpm --dir hono-pickball exec wrangler secret put GOOGLE_CLIENT_SECRET # 用戶端密鑰
pnpm --dir hono-pickball exec wrangler secret list
```

- 驗收：`secret list` 恰列出 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 四個名稱，**沒有** `ENVIRONMENT`。
- `ENVIRONMENT` **絕不**以 secret、`vars` 或 Dashboard 變數設定於遠端：設了 `development` 會在正式站開啟測試帳號登入。
- `BETTER_AUTH_URL` 必須與 Google Cloud Console 登記的 redirect URI 的 origin 逐字相同（多一個尾端斜線或寫成後端網址，Google 會以 `redirect_uri_mismatch` 拒絕）。
- 若 Worker 尚未有任何部署，`secret put` 會詢問是否建立 Worker；選是即可，下一次部署會沿用這些 secret。

#### 2. 對正式 D1 套用 migration（不帶 `--env`）

```bash
pnpm --dir hono-pickball exec wrangler d1 migrations apply DB --remote
pnpm --dir hono-pickball exec wrangler d1 migrations list DB --remote
```

- 驗收：apply 列出 `0000`～`0004` 並成功；list 回報沒有待套用的 migration；輸出中的資料庫為 `hono-pickball`（`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`），**不是** `hono-pickball-local`。
- 不帶 `--env`：讀 top-level 的正式 D1 設定；帶 `--env local` 會對到沒有 `database_id` 的本機設定。
- 未套用就部署時，登入 callback 會 500、session 查詢會降級為未登入。

#### 3. CF Dashboard 確認（Workers & Pages → 各 Worker → Settings）

- Builds：`hono-pickball` 的 root directory 為 `hono-pickball`、`nextjs-pickball` 的為 `nextjs-pickball`；build／deploy command **不含** `--env`；Build variables **沒有** `CLOUDFLARE_ENV`。帶 `--env` 或設了 `CLOUDFLARE_ENV` 會讓部署改讀沒有 `database_id` 的 `env.local`，wrangler 可能在遠端自動建立一個新的 D1；repo 內無法防範，只能在這裡人工確認。
- Variables and Secrets：`hono-pickball` 只有步驟 1 的四個 secret，**沒有** `ENVIRONMENT`（任何類型）。
- 若最近一次 build log 可查，確認 `pnpm install` 有解析 `packages/pickball-core`（`workspace:*`）；首次無法確認時於步驟 5 檢查。
- 驗收：以上各項皆符合；任一不符先修正再往下。

#### 4. 確認內容並 push

```bash
git -C . status --porcelain        # 必須為空
git log --oneline origin/main..main
git push origin main
```

- 驗收：`status` 為空；`origin/main..main` 列出的 commit 都是預期要上線的內容。
- push 時機由你決定。push 後在 Dashboard 確認部署順序與結果：`hono-pickball` 的 build 成功後再確認 `nextjs-pickball` 的 build 成功（兩者實際完成先後不受 repo 控制）；`hono-pickball` 的 deploy log 應列出 `env.DB (hono-pickball)`。任一失敗依步驟 7 回滾或重試。
- 過渡期皆安全：前端新、後端舊時仍是訪客介面；後端新、前端舊時，登入頁送出會顯示「此環境未開放登入」，不會寫入任何資料。

#### 5. 部署後驗收

```bash
curl -s https://hono-pickball.wedsatcoming.workers.dev/api/health
curl -s https://nextjs-pickball.wedsatcoming.workers.dev/api/session
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://nextjs-pickball.wedsatcoming.workers.dev' \
  -d '{"email":"nobody@example.com","password":"x"}' \
  https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/sign-in/email
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://nextjs-pickball.wedsatcoming.workers.dev' \
  -d '{"email":"nobody@example.com","password":"xxxxxxxx","name":"x"}' \
  https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/sign-up/email
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/callback/google
```

- 驗收：health 回 200 JSON；`/api/session` 為 `{"authEnabled":true,"user":null,"signInMethods":{"google":true,"emailPassword":false}}`；兩個 email 端點皆 `404`；callback 為 `302`（或其他 3xx）且 redirect_url 指向 `https://nextjs-pickball.wedsatcoming.workers.dev/...`。
- 瀏覽器：開 `/login` 只見「使用 Google 登入」→ 選帳號並同意 → 回到首頁、navbar 顯示登出；重整仍登入；DevTools 可見 `__Secure-better-auth.session_token`（`Secure`、`HttpOnly`）；在 `/matchmaker/players` 新增一位參賽者、重整仍在（遠端 D1 寫入可用）；登出後回到訪客。Dashboard → hono-pickball → Observability 檢查 callback 與 `/api/session` 無 `exceededCpu`／1102。
- 判讀：
  - `authEnabled:false` → Google secret 缺或為空（回步驟 1）。
  - `/api/auth/*` 回 500 或 `user` 永遠為 null → `BETTER_AUTH_SECRET`／`BETTER_AUTH_URL` 缺，或步驟 2 未完成。
  - Google 顯示 `redirect_uri_mismatch` → `BETTER_AUTH_URL` 與 Console 登記值不一致。
  - email 端點不是 404 → 遠端被誤設了 `ENVIRONMENT`，立即移除。

#### 6. Google OAuth 同意畫面

同意畫面為「測試中」時，只有列入測試使用者的帳號能登入；要開放給所有人時，於 Google Cloud Console 發布應用程式，是否發布由你決定。系統不設允許名單，首次 Google 登入即建立帳號。

#### 7. 回滾

- Dashboard → 該 Worker → Deployments → 回滾至前一版（兩個 Worker 可各自回滾）；或 `git revert <commit>` 後 `git push origin main`。
- 只想暫停 Google 登入、保留新版程式：`pnpm --dir hono-pickball exec wrangler secret delete GOOGLE_CLIENT_ID`（正式站回到訪客版）。
- 遠端 D1 的資料與其餘 secret 保留不刪（舊版程式不讀它們）。

## 各 workspace 細節

規範內文的單一來源是各層的 `CLAUDE.md`；同層 `AGENTS.md` 只是非 Claude agent 的入口指標，不含規範內文。

- 前端：規範見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)；入口指標 [`nextjs-pickball/AGENTS.md`](./nextjs-pickball/AGENTS.md)
- 後端：規範見 [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)；入口指標 [`hono-pickball/AGENTS.md`](./hono-pickball/AGENTS.md)
- 核心套件：規範見 [`packages/pickball-core/CLAUDE.md`](./packages/pickball-core/CLAUDE.md)
