# 計分機制後端化 B1～B9 執行手冊（runbook）

> 給接手的 coordinator agent。目標：把**計分板（`/scoreboard`）與對戰分配機（`/matchmaker`）**
> 目前存在瀏覽器 LocalStorage 的資料與計分邏輯，搬到 `hono-pickball`（Cloudflare Workers + D1），
> 以登入使用者為單位保存。正式登入方式為 **Google 登入，但 Google 端設定暫緩**（見「G1 暫緩」）；
> 在那之前，以**一個只存在本機的測試帳號**完成並驗證其餘所有功能；**上線（任何遠端環境）一律走 Google 登入**。
>
> 本檔沿用 `matchmaker-runbook-m10-m15.md`（M10～M15，已全部完成）的流程與教訓；
> 凡本檔各段落與「狀態快照」牴觸者，一律以「狀態快照」為準。
>
> **每完成一棒（合併、刪分支、或中斷）就把狀態寫回本檔並 commit**（使用者硬性要求；
> 跨 session 唯一的狀態來源就是本檔）。

## 狀態快照（最後更新 2026-10-21，**runbook 建立，尚未 propose 任何 change**）

| 項目 | 值 |
|---|---|
| `main` HEAD | `1e5e517`（chore(openspec): archive emoji-spots-icons） |
| 已定案決策 | 見下方「使用者已定案（2026-10-21）」三條 |
| 待裁決 | 無：D1～D6 已於 2026-10-21 依 `/goal` 授權採建議值（見「開工前待裁決」） |
| propose | Wave 1（B1～B3）已 propose（`7c3ab72`）；Wave 2 待 S1 通過後 |
| apply | 未開始 |
| CF 資源 | B1～B9 **不需要任何遠端 CF 資源**（全在本機 local D1）；遠端 D1、secrets、staging 皆移到 G1 |
| `main` 品質基線 | 已實測（見「`main` 品質基線」） |
| 工作位置 | 主 repo `main`，工作樹乾淨 |

## 使用者已定案（2026-10-21）

1. **範圍：計分板＋對戰分配機全部**。
   計分板：`scoreboard:current:v1`（比賽狀態、undo 歷史）、`scoreboard:matches:v1`（場次分槽）。
   對戰分配機：`matchmaker:roster:v1`（名單、評分）、`matchmaker:round:v1`（回合、計時）、
   `matchmaker:history:v1`（歷史紀錄；統計頁由此計算）。五個 key 全部要有後端版本。
2. **測試帳號只留在本機**（2026-10-21 修訂，取代原先「本機＋CF staging」）：B1～B9 全部在本機
   `wrangler dev`＋local D1 開發與驗證，測試帳號（email／password）**只在本機啟用**。
   **上線一律走 Google 登入**——任何遠端環境（staging 若要建、正式站）都不開 email 登入，
   遠端部署與 Google 設定全部在 G1 處理。
3. **訪客留本機，登入後可匯入**。未登入時維持現行 LocalStorage 行為（**既有行為與既有 E2E 零迴歸**）；
   登入後以後端為準，提供一次性「匯入本機資料」。不做雙寫同步。

## 開工前待裁決（B1 propose 前處理）

> 每條附 coordinator 建議。裁決結果寫回本節（標註日期）再開始 propose。
>
> **裁決（2026-10-21）**：使用者以 `/goal 跑完這個runbook` 授權 coordinator 不再逐條詢問，
> **D1～D6 全部採下列 coordinator 建議**（D1 = (a) `packages/pickball-core`；D2 計分板前端算＋後端存快照、
> 送出比分後端權威、配對前端算；D3 `version`＋`409`；D4 全程不 push＋env 閘門；D5 seed SQL＋`--local`＋
> `ENVIRONMENT === "development"`；D6 `globalSetup`＋`storageState`＋`d1 execute --local` 清資料）。
> B9 兩項「propose 時與使用者確認」同理採預設：匯入成功後**保留**本機資料；後端已有資料時**拒絕匯入並提示**（不覆寫、不合併）。

**D1. 共用的 zod schema 與計分純函式放哪裡？**（影響 B4 之後全部）
目前 schema 與純函式（`lib/scoreboard/reducer.ts`／`rules.ts`、`lib/matchmaker/rating.ts`／
`round.ts`／`history.ts` 等）全在前端。後端要驗證寫入、甚至自己算評分，就需要同一份邏輯。
- (a) **新增第三個 workspace `packages/pickball-core`**（純 TS＋zod，零瀏覽器 API），前後端都 import。
  **建議採用**。代價：`pnpm-workspace.yaml`、root `CLAUDE.md` 結構圖、前端 `transpilePackages`
  或 build 設定、兩端 tsconfig 要調整；Workers Builds 的 root directory 設定要確認仍能解析 workspace 相依。
- (b) 後端複製一份 schema，以 contract test 確保兩邊一致。簡單但會漂移。
- (c) 後端只存不驗（opaque JSON）。最省事但後端失去把關，**不建議**。

**D2. 計分權威在哪一端？**
- 計分板逐球計分（`RALLY_WON`／`UNDO`）：**建議前端算、後端存快照並以共用 schema 驗證**。
  理由：場邊網路不穩，逐球 round-trip 會讓按鈕延遲；快照 PUT 失敗可重試。
- 對戰分配機送出比分（`submitScore`：驗證比分 → 更新評分 → 寫歷史）：**建議後端權威**，
  單一 `POST` 在 D1 `batch()` 內一次寫完評分與歷史，避免兩台裝置各算一份造成評分分岔。
- 配對產生（`allocation.ts`／`pairing.ts`）：**建議維持前端算、後端存回合結果**（運算重、無一致性風險）。

**D3. 多裝置同時編輯的衝突處理**：建議每筆資料帶 `version`，`PUT` 時比對，不符回 `409`，
前端提示「資料已在其他裝置更新」並重新載入。不做合併。

**D4. 正式站在 G1 完成前的狀態**：本 repo **push 即自動部署正式站**（見 auto-memory
「正式站網址」）。建議：**B1～B9 全程不 push**（比照 M10～M15），G1 完成後才一次上線。
若中途必須 push（例如要修正式站其他 bug），後端在沒有 `ENVIRONMENT=development` 時
`/api/auth/*` 與所有使用者資料 API 回 `404`、前端不顯示登入入口，正式站行為與現在完全相同。
正式站 D1 在 G1 才建立。

**D5. 測試帳號的建立方式**：建議以 seed 腳本用 better-auth 的密碼雜湊函式產生 SQL，
**只**以 `wrangler d1 execute --local` 寫入；帳密放 `hono-pickball/.dev.vars`（已被 gitignore），**不進 git**。
`emailAndPassword` 的啟用條件**反向設計**：只有 `ENVIRONMENT === "development"`（只寫在 `.dev.vars`）
才啟用，缺值或任何其他值一律停用——遠端環境忘了設變數時預設是關的，而不是開的。
`disableSignUp: true`，不開放註冊。**不建議**做「受保護的 seed API 端點」（多一個攻擊面）。

**D6. E2E 的登入態與資料隔離**：既有 624 條 E2E 全部是訪客，必須原樣通過。
登入流程的新 E2E 建議：Playwright `globalSetup` 先對 local D1 跑 migration＋seed 並登入一次存
`storageState`；每個 spec 檔開頭清空該測試帳號的使用者資料（透過 `wrangler d1 execute --local`，
**不新增 reset API**）。

## Pipeline 總覽

```
main@1e5e517
  ── Wave 1（基礎建設＋登入）────────────────────────────
  → B1 backend-d1-foundation ──merge──> main
  → B2 auth-backend-test-account ──merge──> main
  → B3 auth-frontend-session ──merge──> main
  → S1 本機登入檢查點（coordinator 主導，非 change）
  ── Wave 2（資料搬遷，B1～B3 合併後才 propose）───────────
  → B4 pickball-core-package ──merge──> main      （D1 若選 (b)／(c)，本棒改為對應方案或刪除）
  → B5 scoreboard-backend ──merge──> main
  → B6 matchmaker-roster-backend ──merge──> main
  → B7 matchmaker-round-score-backend ──merge──> main
  → B8 matchmaker-history-stats-backend ──merge──> main
  → B9 local-data-import ──merge──> main
  → S2 本機全功能驗收檢查點
  ── 暫緩（上線）───────────────────────────────────────
  → G1 google-oauth（Google Cloud Console 設定完成後才開；含遠端 D1、secrets、部署上線）
```

**為什麼分兩波 propose**：M10～M15 是六個 change 一次 propose 完再序列 apply，
前提是程式架構已穩定。本批 B1～B3 會首次引入 D1、drizzle、better-auth 與 vitest D1 測試夾具，
這些的實際寫法（migration 目錄、測試 setup、`env` 取得方式）要 apply 過才確定；
若 B4～B9 先寫好，大量 design／tasks 會在 apply §1 對齊時整段重寫。

**全程嚴格序列，同一時間只存在一條 `change/*` 分支**（同 M10～M15）。

硬相依：
- B2 需要 B1（D1 binding、migration 流程、測試夾具）。
- B3 需要 B2（`/api/auth/*`、`GET /api/me`）。
- **S1 必須在 Wave 2 propose 前完成**：確認 better-auth 在本機真的能登入、cookie 經 service binding
  與前端 proxy 穿透、`pnpm --filter ./nextjs-pickball preview`（workerd runtime）下同樣成立。S1 不過，Wave 2 不開。
- B5～B8 需要 B4（若 D1 選 (a)）與 B3（登入態）。
- B7 需要 B6（評分寫在球員上）；B8 需要 B7（歷史由送出比分寫入）。
- B9 需要 B5～B8 全部（匯入要涵蓋五個 key）。
- G1 只依賴 B2／B3，**理論上可插在任一棒之後**；但要等使用者完成 Google 端設定。

## 各 change 清單

| # | change id | 內容 | 預估 | branch | 狀態 |
|---|---|---|---|---|---|
| B1 | backend-d1-foundation | D1 binding（local）、drizzle schema／migration 流程、vitest D1 夾具 | 中 | change/backend-d1-foundation | 未 propose |
| B2 | auth-backend-test-account | better-auth 掛 `/api/auth/*`、本機測試帳號、`requireSession`、`GET /api/me` | 中 | change/auth-backend-test-account | 已 propose，未 apply |
| B3 | auth-frontend-session | 登入頁（測試帳號）、session hook、navbar 登入狀態、登入 E2E 夾具 | 中 | change/auth-frontend-session | 已 propose，未 apply |
| B4 | pickball-core-package | 抽出共用 schema＋純函式為 workspace 套件，前端改 import，行為零變更 | 中～大 | change/pickball-core-package | 未 propose |
| B5 | scoreboard-backend | 計分板兩個 key 的後端儲存 API＋前端儲存層切換 | 中 | change/scoreboard-backend | 未 propose |
| B6 | matchmaker-roster-backend | 名單／球員 CRUD API＋`useRosterStore` 切換 | 中 | change/matchmaker-roster-backend | 未 propose |
| B7 | matchmaker-round-score-backend | 回合儲存、後端權威送出比分（評分＋歷史 D1 batch） | 大 | change/matchmaker-round-score-backend | 未 propose |
| B8 | matchmaker-history-stats-backend | 歷史頁區間查詢、統計頁改讀後端 | 中 | change/matchmaker-history-stats-backend | 未 propose |
| B9 | local-data-import | 登入後一次性匯入本機五個 key（沿用 `BackupSchema`） | 中 | change/local-data-import | 未 propose |
| G1 | google-oauth | Google 社群登入、遠端 D1／secrets、部署上線 | 中～大 | — | **暫緩** |

「預估」以 M 系列經驗粗估（50 task ≈ 一棒）；propose 後依 tasks 數改寫成實數。

### B1 backend-d1-foundation

- **範圍**：
  - `hono-pickball/wrangler.jsonc` 加 D1 binding（`DB`），本批只用於本機（`wrangler dev` 與測試的 local D1）。
    `database_id` 的寫法要讓本機可用、又**不會在誤 push 時讓正式部署失敗**——
    **placeholder UUID 會讓遠端部署直接失敗**（`hono-pickball/CLAUDE.md` 已記載）。
    可行做法（例：本機專用的 wrangler env、或 G1 前先建好空的正式 D1 只為了拿 UUID）在 §1 查證後由 design 定案，
    涉及遠端建立資源者須先問使用者。
  - `ENVIRONMENT` 只寫在 `.dev.vars`（值 `development`），`wrangler.jsonc` 的 `vars` 不設，見 D5。
  - drizzle schema 目錄、`drizzle-kit generate` 產 SQL、`wrangler d1 migrations apply --local` 的 package scripts。
  - vitest-pool-workers 的 D1 測試夾具（migration 套用到測試用 D1）。
- **§1 前置確認 MUST 用 Context7 查證**（不憑記憶）：`@cloudflare/vitest-pool-workers` 0.16.x 的
  D1 migration 套用方式（`readD1Migrations`／`applyD1Migrations` 是否仍存在、`env` 改從
  `cloudflare:workers` 取得後的寫法）；`wrangler dev` 與 `--dry-run` 對 D1 `database_id` 的要求。
- **驗收重點**：`pnpm test:api` 中有一條測試真的寫入並讀回 D1；`pnpm --filter ./hono-pickball build`
  （`wrangler deploy --dry-run`）通過；既有 16 條後端測試不變；`.dev.vars.example` 列出所需變數（不含真值）。
- 解除 `hono-pickball/CLAUDE.md`「依賴注意」的 2026-11-12 複審期限（drizzle 開始被 `src/**` 匯入），
  同步改寫該段與 D1 binding 段落。

### B2 auth-backend-test-account

- **範圍**：better-auth（`@better-auth/drizzle-adapter`，`provider: "sqlite"`）。
  - Workers 的 binding 只能在請求內取得，**auth 實例的建立方式**（每請求建立 vs `cloudflare:workers` 的
    模組層 `env`）在 §1 以 Context7 查證後定案寫入 design。
  - D1 沒有互動式 transaction，adapter 的 `transaction` 維持 `false`。
  - `app.on(["GET","POST"], "/api/auth/*", …)`；`baseURL` 為**前端 origin**（service binding 不改寫 host，
    `api-connectivity` spec 已定），`trustedOrigins` 本批只列本機 `http://localhost:3005`（遠端網址於 G1 加入）。
  - `emailAndPassword`：只有 `ENVIRONMENT === "development"` 才啟用（D5），`disableSignUp: true`。
  - `socialProviders.google` **只預留設定結構**，`GOOGLE_CLIENT_ID` 不存在時不註冊（G1 再啟用）。
  - `requireSession` middleware（未登入回 `401`）、`GET /api/me`。
  - 測試帳號 seed 腳本（依 D5）；`BETTER_AUTH_SECRET`、測試帳密放 `.dev.vars`，提供 `.dev.vars.example`。
- **新 capability spec**：`auth`。**修改**：`api-connectivity`（新增端點契約）、`dev-workflow`（seed／migration 指令）。
- **驗收重點**：登入取得 session cookie → `GET /api/me` 回使用者；錯誤密碼 `401`；
  `ENVIRONMENT` 缺值或非 `development` 時 email 登入不可用（**兩種情況都要有測試**）；註冊端點被拒；cookie 經 `/api/[[...route]]` proxy 穿透
  （沿用 `/api/cookie-check` 已驗證的路徑）。

### B3 auth-frontend-session

- **範圍**：登入頁（例：`/login`，只在本機顯示測試帳號表單；G1 再加 Google 按鈕）、`useSession` hook、
  navbar 顯示登入狀態與登出、Playwright 登入夾具（依 D6）。
- **修改**：`site-navbar`、`pickleball-guide-page`（hooks 歸屬清單，`hooksInventory.test.ts` 會擋）。
- **驗收重點**：既有 E2E **全數原樣通過**（訪客路徑零變動）；新 E2E 覆蓋登入、登出、重整後仍登入。
- 前端判斷「是否顯示登入入口」的訊號來源要在 design 定案（建議由後端 `GET /api/me` 或 `/api/health`
  回報環境，而非前端另設 build-time 變數，避免兩端設定不同步）。

### S1 本機登入檢查點（非 change，coordinator 主導）

1. local D1 從零套用 migration、執行 seed。
2. `pnpm dev` 下以測試帳號實際登入、`GET /api/me`、重整後仍登入、登出。
3. `pnpm --filter ./nextjs-pickball preview`（workerd runtime）重複第 2 步，確認 cookie 經 proxy 穿透。
4. 拿掉 `.dev.vars` 的 `ENVIRONMENT` 重啟，確認 email 登入不可用、前端不顯示登入入口。
5. 結果寫回本檔。**不過不開 Wave 2**。

### B4 pickball-core-package（依 D1 裁決，以下假設 (a)）

- 新增 `packages/pickball-core`，搬入 scoreboard 與 matchmaker 的 zod schema 與**純函式**
  （reducer／rules／rating／history／round 的運算部分）。`localStorage` I/O 留在前端 `lib/`。
- **純 refactor，行為零變更**：既有測試是 regression guard，不需要紅燈（依 root `CLAUDE.md`「紅燈要是真的」
  如實標註）。測試要跟著搬或改 import 路徑，**不可刪改任何 it 的斷言**。
- 要動 root `CLAUDE.md` 結構圖、`pnpm-workspace.yaml`、`nextjs-pickball/CLAUDE.md`／`hono-pickball/CLAUDE.md`。
- **驗收重點**：前端單元測試數不減；E2E 全綠；`hono-pickball` 能 import 並通過 `wrangler deploy --dry-run`；
  Workers Builds 能否解析 workspace 相依屬遠端驗證，記為 G1 待辦（G1 使用者步驟第 5 點），本棒不驗。

### B5 scoreboard-backend

- D1 表：每位使用者一筆目前比賽、場次分槽多筆（JSON 欄位以共用 schema 驗證，帶 `version`，依 D3）。
- API（草案，propose 時定案）：`GET/PUT /api/scoreboard/current`、`GET/PUT/DELETE /api/scoreboard/slots/:matchId`。
- 前端：儲存層抽成介面，訪客走現行 `lib/scoreboard/storage.ts`（**程式碼不動**），登入走 API；
  `useScoreboardStore` 依 session 選擇。PUT 失敗的重試與提示行為要在 spec 寫成 Scenario。
- **修改**：`scoreboard`（「localStorage 持久化」Requirement 加登入分支）。
- 同時改寫 `nextjs-pickball/CLAUDE.md` 與 `hono-pickball/CLAUDE.md` 的「matchmaker 為 LocalStorage-only」
  敘述（B5 起不再成立；B5 先改計分板段，matchmaker 段於 B6 改）。

### B6 matchmaker-roster-backend

- D1 表：`players`（含評分、出場數等 `PlayerSchema` 欄位）。API：球員 CRUD。
- `useRosterStore` 依 session 切換。CSV 匯入／匯出（`roster-csv.ts`）在登入態寫入後端。
- **修改**：`player-roster`、`data-transfer`（備份匯出在登入態的資料來源）。

### B7 matchmaker-round-score-backend

- 回合儲存（`RoundSchema` 含 timer、seen signatures）；**送出比分走後端權威**（依 D2）：
  `POST` 一次完成比分驗證、評分更新、歷史寫入（D1 `batch()`），回傳新的回合與評分。
- `useRoundStore` 的 `submitScore` 在登入態改呼叫 API；計時器取樣仍在前端（`useRoundTimer` 不動）。
- **修改**：`round-lifecycle`、`match-rating`（計算位置）、`match-history`（寫入時機）。
- 注意 M15 留下的**平局語意**（`winner: "draw"`、S=0.5）必須在後端完整保留；
  `2026-09-14-matchmaker-draw-followups` 已修正的統計平局行為不可回退。

### B8 matchmaker-history-stats-backend

- `GET /api/matchmaker/history?range=…`（區間切點沿用 `history-range.ts` 的定義，由共用套件提供）；
  統計頁 `/matchmaker/stats` 在登入態改讀後端。損毀紀錄提示（`match-history` spec）在後端的對應行為要定義。
- **修改**：`match-history`、`player-stats`。

### B9 local-data-import

- 登入後偵測本機五個 key 有資料 → 提示「匯入本機資料」→ `POST /api/import`（payload 沿用
  `lib/matchmaker/transfer-types.ts` 的 `BackupSchema`，計分板部分另擴充）。
- 冪等：重複匯入不產生重複歷史；匯入成功後本機資料保留或清除，**由 propose 時與使用者確認**。
- 後端已有資料時的處理（覆寫／合併／拒絕）**由 propose 時與使用者確認**。
- **修改**：`data-transfer`。

### S2 本機全功能驗收檢查點

Wave 2 全部合併後在本機（`pnpm dev` 與 `preview` 各一次），以測試帳號走完：計分板一場完整比賽 → 名單 → 產生回合 → 送出比分（含計時平局）
→ 歷史頁各區間 → 統計頁 → 換裝置（另一個瀏覽器）登入看到同一份資料 → 匯入本機資料。結果寫回本檔。

## G1 暫緩：Google 登入與上線（使用者完成 Google 端設定後才開）

**所有遠端工作都集中在這裡**：B1～B9 不碰任何遠端 CF 資源。

使用者需提供／完成（需要帳號權限，coordinator 不代做）：
1. Google Cloud Console 專案、OAuth 同意畫面（應用名稱、支援信箱、範圍只要 `openid email profile`）。
2. OAuth 用戶端 ID（Web application），Authorized redirect URIs：
   `http://localhost:3005/api/auth/callback/google`、`https://<正式前端網址>/api/auth/callback/google`
   （**是前端網址**，因 `/api/*` 經前端 proxy 轉發）；若決定建 staging，再加 staging 前端網址。
3. `wrangler login`；`wrangler d1 create` 建立正式 D1（若要 staging 另建一個），UUID 交給 coordinator 填入。
4. `wrangler secret put` 設定 `BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`；本機放 `.dev.vars`。
5. 確認 CF Dashboard 兩個 Worker 的 Workers Builds root directory 下，B4 新增的 `packages/` workspace
   能被 `pnpm install` 解析、build 成功——**這是只存在 Dashboard 的設定，git 無法追蹤**
   （root `CLAUDE.md`「CF Dashboard 側設定」）。

G1 change 本身要處理：
- 啟用 `socialProviders.google`、登入頁加 Google 按鈕；`trustedOrigins` 加正式（與 staging）網址。
- **是否建 staging** 由使用者在 G1 propose 時決定；若建，staging 也只走 Google 登入。
  ⚠️ wrangler 的 bindings（`d1_databases`、`services`、`vars`）**不會從 top-level 繼承到 env**，staging 區塊要完整重宣告；
  前端 staging 的 service binding 要指向後端 staging Worker。
- 遠端 D1 套用 migration（`wrangler d1 migrations apply --remote`）。
- **遠端環境 email 登入確實關閉的驗收**（`ENVIRONMENT` 不設即關，D5）。
- 本機測試帳號是否與開發者自己的 Google 帳號連結（account linking）：建議不連結，維持各自獨立。
- 部署順序（後端先、前端後）與 push 時機由使用者決定。

## 風險

- **R1 本機與遠端行為差異**：B1～B9 只在本機驗證，遠端特有的問題（D1 遠端延遲、CPU 時間上限、
  正式網址的 cookie 屬性、Workers Builds 解析 workspace）要到 G1 才會現形。G1 的 tasks 要預留這些驗證，
  不可假設「本機綠＝上線綠」。密碼雜湊的 CPU 成本只發生在本機測試帳號，上線走 Google 不受影響。
- **R2 D1 無互動式 transaction**：多表寫入只能用 `batch()`（單一 batch 內為原子）。B7 的送出比分
  MUST 設計成一個 batch，不可「先寫評分、再寫歷史」分兩次呼叫。
- **R3 既有 E2E 的訪客路徑**：任何 change 只要動到 store 的初始化流程（hydrate 前先查 session），
  就可能改變首屏時序、讓既有 E2E 變慢或閃爍。每棒驗收都要跑全套 E2E。
- **R4 Stop hook 不檢查 `hono-pickball/test/**` 型別**（root `CLAUDE.md` 已記載）：本批後端測試量會暴增，
  coordinator 獨立驗證**必須**跑 `pnpm --filter ./hono-pickball typecheck`（兩段）。
- **R5 自動部署**：push 即部署正式站。本批未經使用者明示前不 push（D4）。

## 模型規定（使用者硬性要求，沿用 M10～M15）

- 每個 change 由**一個 opus leader**（`Agent` tool、`subagent_type: general-purpose`、`model: 'opus'`）執行。
- leader 派工依 `execution-plan.md` 的 Roles：Implementer `sonnet`、Spec Reviewer `sonnet`、
  Code-Quality／Final Reviewer `opus`，升級照 Escalation 規則。
- **每次 Agent 呼叫都必須明確帶 `model` 參數；任何情況不得使用 `fable`**（fable 只允許當 coordinator，不做實作）。
- 後端測試可派 project subagent `hono-test-writer`，但仍須明確帶 `model`。

## 執行模式

- **不用 git worktree**（沿用 2026-09-03 使用者指示：worktree 在專案目錄外，每個檔案操作都會跳權限提示）。
  所有 apply 在主 repo 切 `change/<change-id>` 分支；各 change 的 `environment.md` 宣告主 repo 路徑。
  代價：leader 執行期間 coordinator 不得改動 repo 內任何檔案（含本檔）。若要改用 worktree，須使用者明示。
- **逐組制**：派工單位是 tasks.md 的 `§` 群組；組內逐 task 真紅燈 TDD、逐 task commit（`test:`、`feat:` 各一）；
  Stage 1／Stage 2 整組審；群組間序列。
- 後端行為邏輯（`hono-pickball/src/**`）同樣適用 TDD 三步；D1 schema／migration SQL 屬設定層，
  是否強制紅燈在 B1 design 定案並寫回 `hono-pickball/CLAUDE.md`。

## 每開一個新 change 的標準流程

⚠️ **一次只開一個。前一個合併並刪分支之後才開下一個。**

0. **propose**（每波開頭）：`/opsx:propose` 逐一產出該波的 change（八份 artifact），每份過兩輪審查，
   最後做一次跨 change 交叉檢查（檔案重疊矩陣、Requirement 重疊、矛盾），結果寫入本檔「跨 change 對齊提醒」，
   `DO_NOT_TRACK=1 openspec validate --strict` 全過後 commit 進 `main`。
1. 開工前查殘留 process（兩個指令都要跑）：
   ```bash
   lsof -i :3005 -i :8787
   ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep
   ```
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID（教訓 #8），確認 port 釋放。
2. 開分支：
   ```bash
   git status --porcelain      # 必須為空
   git switch -c change/<change-id> main
   ```
3. 用「Leader prompt 模板」啟動 opus leader。**派出後不結束回合、不改動 repo**；停擺偵測門檻 3 小時。
4. leader 回報完成後，**coordinator 獨立驗證**（不採信回報）：
   ```bash
   git branch --show-current         # change/<change-id>
   git status --porcelain            # 必須為空
   git diff main --stat -- pnpm-lock.yaml '**/package.json'   # 只能出現 proposal 宣告的相依變動
   pnpm -r exec tsc --noEmit         # exit 0
   pnpm --filter ./hono-pickball typecheck   # exit 0（含 test/ 型別，Stop hook 查不到這段）
   pnpm --filter ./nextjs-pickball lint      # 0 errors，warning 數不得多於基線
   pnpm --filter ./hono-pickball db:migrate:local   # migration 可從零套用（B1 後才存在）
   pnpm test                         # 前後端全綠，檔數／測試數 ≥ 前一棒
   pnpm --filter ./hono-pickball build       # tsc＋wrangler deploy --dry-run
   DO_NOT_TRACK=1 openspec validate <change-id> --strict
   pnpm --filter ./nextjs-pickball exec playwright test --workers=1   # 不要用 test:e2e --（教訓 #6）
   ```
   tasks.md 勾選數與 `git log main..HEAD` 對得上；抽 2～3 個 RED commit 用 `git show <commit>^:<path>` 複驗。
   migration 指令的 database 參數以 B1 定案的寫法為準，定案後回填本步驟。
5. 合併回本機 `main`（**不 push**）：
   ```bash
   git switch main
   git merge --no-ff change/<change-id> \
     -m "feat(<scope>): 合併<一句話說明>（<Bn>）" \
     -m "Claude-Session: <當前 session id>"
   ```
   合併後複驗 `pnpm -r exec tsc --noEmit` 與 `pnpm test`，無迴歸才算完成。
6. 刪分支：`git branch -d change/<change-id>`。
7. 更新本檔「狀態快照」「各 change 清單」並 commit（`docs: runbook 記錄 <Bn> 完成`）。
8. 該 change 立即 `/opsx:verify`＋`/opsx:archive`（**本批改為逐棒 archive**：Wave 2 propose 時
   要以已 archive 的主 spec 為基準，避免 M10～M15 那種 archive 順序互相覆寫的風險）。
   archive 後 `DO_NOT_TRACK=1 openspec validate --all --strict` 與主 spec 零重複標題（python 計數法）。
9. 下一棒。

測試不綠就**不合併**，回報使用者。

## Leader prompt 模板

> 佔位符：`<change-id>`、`<Bn>`、`<session id>`。

```
你是 openspec change `<change-id>`（<Bn>）的 apply 階段 leader。你的工作：在主 repo 的
change/<change-id> 分支上，依 /opsx:apply 流程與該 change 的 execution-plan 把全部 task 做完
（TDD、依 execution-plan 逐組派 subagent、兩階段審查、Final Code Review），全部 commit
在 change 分支上，最後回報。

## 環境（已就緒，不要重建）
- 工作位置：主 repo /Users/m2_24gb/Desktop/project/nextjs-pickball，已切到分支
  change/<change-id>（用 git branch --show-current 確認）。本批不用 git worktree：
  禁止 git worktree add、禁止切換分支、禁止 git merge、禁止 git push。
- environment.md 宣告的路徑就是主 repo，apply Step 0 的 cwd 檢查直接通過。
- 禁止改動 backend-scoring-runbook-b1-b9.md 與 openspec/changes/ 下其他 change 的目錄。
- 前端 dev server :3005、後端 :8787。後端 secrets 在 hono-pickball/.dev.vars（已 gitignore），
  禁止把任何密碼、secret 寫進會被 commit 的檔案或 commit 訊息。
- 禁止對遠端 CF 資源執行任何操作（wrangler deploy、d1 create、d1 execute --remote、secret put）；
  只允許 --local 與 --dry-run。測試帳號只存在本機 local D1。遠端操作全部屬於 G1。

## 流程
1. 讀 .claude/commands/opsx/apply.md，照它的步驟執行，change 名稱固定為 <change-id>。
   openspec CLI 在 repo root 執行並帶 DO_NOT_TRACK=1。
2. Step 0：git status --porcelain 乾淨、分支正確；pnpm install（之後 git status 仍須乾淨，
   除非本 change 的 proposal 宣告新增相依）；local D1 套用 migration；跑完整 pnpm test 取得
   baseline，回填 environment.md 的 Verification 並 commit。後端測試若噴
   listen EPERM 127.0.0.1 是沙箱擋 localhost，放行重跑再判定。
3. 完整讀取 change 的所有 artifact。tasks §1 的「對齊 main」與「Context7 查證」每一項都要實際做，
   查證結果與 design 假設不同時，記進 design.md Open Questions 並 commit，再開始 §2。
4. 嚴格照 execution-plan.md 執行逐組派工、兩階段審查、Escalation 與 Final Code Review；
   派工時要求的內容全部貼完整原文給 subagent，不可只給路徑。群組之間序列，禁止平行派 Implementer。
5. 派出 subagent 之後不可以結束回合。等長指令（E2E、mutation sweep）時留在同一回合輪詢，
   不可丟給背景 process 後結束回合。脈絡將盡就在派下一組之前乾淨停止：把狀態寫進
   design.md 的 ## Open Questions 並 commit 後回報。

## 模型規定（使用者硬性要求）
- 你自己跑在 opus。每次呼叫 Agent tool 必須明確帶 model 參數，值依 execution-plan 的 Roles
  （Implementer sonnet、Spec Reviewer sonnet、Code-Quality／Final opus，升級照 Escalation）。
  任何情況不得使用 fable，也不得省略 model 參數。

## 派工單必帶（每張都要）
- **指令裡禁止 cd，一律用絕對路徑**。這條原樣寫進每一張派工單。
- Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」；派工單逐條列出必做變異
  （每個分支、每個欄位、每個 HTTP 狀態碼分支、未登入／他人資料的授權分支）。
- mutation harness 三重落地檢查：src.count(old) == 1、替換後 new != old、
  git --no-pager diff --stat -- <file> 有輸出；另放一條等價變異當對照組。
- Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
- 後端 API 每個端點 MUST 有「未登入 401」與「存取他人資料被拒」的測試。
- 紅燈宣稱一律用 git show <commit>^:<path> 機械複驗；查核不過改標 regression guard。
- 逐 task commit：test: 一個、feat: 一個。註解只寫「為什麼」。
- 編輯器診斷不可信，一律以 tsc exit code 為準；後端另跑 pnpm --filter ./hono-pickball typecheck。
- 跑 E2E 前後用 lsof＋ps 清殘留，只 kill 路徑含本 repo 的 PID，禁止 pkill -f。
  E2E 指令：pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [樣式...]
- E2E 失敗不得自行判定為雜訊，證據上報 coordinator 裁定。

## 專案硬規則
- TDD 三步：先寫失敗測試並在 shell 實際看到紅燈（輸出留存）→ 最小實作至綠 → refactor。
  單檔測試 pnpm --filter ./<workspace> test --run <路徑>，--run 前不可加 --。
- 紅燈要是真的：寫入當下就綠的 it 如實標註 regression guard；嚴禁改斷言偽造紅燈。
- 前端例外層見 nextjs-pickball/CLAUDE.md；後端測試慣例見 hono-pickball/CLAUDE.md
  （test/ 目錄、cloudflare:workers 的 exports、顯式 import vitest、不用 SELF/env from cloudflare:test）。
- 訪客（未登入）路徑的既有程式碼與行為零變更；既有 E2E 原樣通過。
- 新增 hooks/use*.ts 時同步 openspec/specs/pickleball-guide-page/spec.md 的 hooks 歸屬清單
  （照 delta 做；hooksInventory.test.ts 會擋）。
- 改 wrangler.jsonc 後 PostToolUse hook 會自動跑 cf-typegen，產出的 worker-configuration.d.ts 一併 commit。
- 註解與錯誤訊息用繁體中文（台灣用語），識別字用英文。tasks.md checkbox 完成一個勾一個。
- Commit：Conventional Commits、繁體中文，結尾 footer 一行 Claude-Session: <session id>，
  不得加 🤖 Generated 或 Co-Authored-By。
```

## 教訓（M3～M15 實證濃縮，細節見 `matchmaker-runbook-m10-m15.md`「教訓」1～20 與 `docs/matchmaker-runbook-m3-m9.md`）

1. **兩個 leader 同時在同一個工作樹**會互相污染：派新 leader 前確認前一個已停、`ps` 無殘留。
2. **判斷 subagent 卡住**只能看 transcript 最後一筆是「發出 Bash 指令、之後再無後續」且 process 已消失；
   tsc／lint／E2E 本來就會長時間無輸出。
3. **tasks.md 勾選數落後於實際 commit**：續跑前以 `git log main..HEAD` 為準補勾。
4. **Implementer 自述的 mutation 結果不可採信**；重點是「逐分支逐欄位機械盤點」，不是取樣次數。
5. **spec 自身的內部矛盾要到 apply 才現形**：Stage 1 Reviewer 授權裁決，leader 同步回 delta spec。
6. **E2E 指令一律 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`**；
   `test:e2e -- --workers=1` 會被 playwright 當檔案樣式，旗標失效或「No tests found」。
7. **E2E 失敗先看能否隔離重現，再看 `uptime` load average**；`quiz.spec.ts`／`scoreboard-binding.spec.ts`
   在 webkit／mobile-safari 的 `page.goto` 逾時是既有雜訊家族，但仍須隔離重跑才可裁定。
8. **清 process 禁止 `pkill -f`**：同機有其他專案的 Playwright／dev server，只 kill 路徑含本 repo 的 PID。
9. **指令裡的 `cd` 會觸發權限提示**讓背景 agent 卡死：一律絕對路徑，leader 自己也一樣。
10. **schema 新增欄位時 `tsc` 找不到所有 fixture**：E2E 的 `addInitScript` 種子、手寫 JSON 不在型別守備範圍，
    要從「哪些測試會把該資料種進 localStorage／D1」盤點。本批的 D1 seed 與 E2E fixture 同理。
11. **service binding 失敗先找重複的 dev server**（root `CLAUDE.md`），不要把 `~/.wrangler/registry` 不存在當根因。
12. **macOS `uniq` 會誤判中文標題重複**：一律用 root `CLAUDE.md` 的 python 計數法。
13. **主 spec 不可直接編輯**；`hooksInventory.test.ts` 直接讀主 spec，新增 hook 時依 delta 走、
    archive 時核對為 no-op（M14 `4b99156` 前例）。

## `main` 品質基線

> B1 開工前由 coordinator 在 `main` 實測填入；之後每棒合併後重量一次，數字只能增加不能減少（skipped 數不變）。

```
（2026-10-21 於 main@1e5e517 實測）
前端單元   81 檔 / 783 測試
後端單元   4 檔 / 16 測試
tsc        pnpm -r exec tsc --noEmit → exit 0
後端 typecheck  pnpm --filter ./hono-pickball typecheck → exit 0
lint       0 errors / 3 warnings
E2E        660 條：632 passed / 27 skipped / 1 failed（tour mobile-safari「首頁有 CTA 並能導向 tour」，
           當時 load average 114；隔離重跑 tour.spec.ts mobile-safari 6/6 passed → 判定負載雜訊）
```

## 跨 change 對齊提醒

### Wave 1（2026-10-21，propose commit `7c3ab72`；B1 26 tasks、B2 37、B3 36；三棒皆不新增相依）

- **檔案重疊**：`hono-pickball/package.json`（B1 scripts `dev`／`db:generate`／`db:migrate:local`／`cf-typegen`；B2 `db:seed:local`）、
  `hono-pickball/vitest.config.ts`（B1 migration 夾具；B2 注入測試 bindings）、`.dev.vars.example`／`worker-configuration.d.ts`、
  `hono-pickball/CLAUDE.md`（B1、B2 各改一次測試慣例）；`tests/e2e/helpers/test-account.ts`（B2 新增、B3 重用）。全部序列。
- **Requirement 重疊**：`dev-workflow`「後端測試在 workerd runtime 中執行」B1、B2 皆 MODIFIED（B2 以 B1 delta 為底）→
  **archive 順序必須 B1→B2→B3**；B2 tasks 1.2 要比對已 archive 的主 spec 重套。`auth` B2 新增 7 條、B3 新增 4 條，名稱不重複。
- **與 runbook 的差異（已採納）**：
  - B1 D1 binding 只放 wrangler `env.local`（明寫 `name: "hono-pickball"`），top-level 不宣告 → 誤 push 時正式部署與今天相同、不觸發自動建立 D1。
    `dev` script 改走 `--env local`。migration 指令定案：`pnpm --filter ./hono-pickball db:migrate:local`（＝`wrangler d1 migrations apply DB --local --env local`）。
  - B1 定案：D1 schema／migration SQL 屬設定層免紅燈，但每表每約束要有 D1 讀寫測試。better-auth 鎖 1.6.x（1.7 的 `account.issuer` 為 breaking）。
  - B2 auth 每請求建立 `createAuth(env)`；閘門 `isLocalAuthEnabled` 關閉時 `/api/auth/*`、`/api/me` 回 404；`baseURL`／`trustedOrigins` 讀 `BETTER_AUTH_URL`；
    新增永遠 200 的 `GET /api/session`（`{authEnabled, user}`）作為前端登入入口訊號（避免 4xx 造成既有 E2E console error）。
  - B3 不裝 better-auth client，自寫 `useSession`（`useSyncExternalStore`，讀取失敗 fail-closed）；navbar 單一圖示入口；E2E 用 `globalSetup`。
- **待處置**：
  1. B3 窄螢幕（390px）餘裕約 28px，帳號圖示可能擠不下：tasks 1.5 先量，6.3 失敗就停下上報，禁止自行隱藏連結／改文案／漢堡選單。
  2. B2 Open Question：`d1 execute --local` 寫入後執行中的 `wrangler dev` 是否立即可見，B2 §1 實測；不行則 B3 seed 移到 webServer 前。
  3. S1 的 preview 前端埠號可能撞 8787，`BETTER_AUTH_URL` 屆時調整。
  4. D6「每 spec 清空使用者資料」延到 Wave 2 第一個有使用者資料表的 change。
- `hono-pickball/.dev.vars` 已由 coordinator 於 2026-10-21 建立（gitignored、隨機 secret／密碼；欄位：`ENVIRONMENT`、`BETTER_AUTH_SECRET`、
  `BETTER_AUTH_URL`、`TEST_ACCOUNT_EMAIL`／`PASSWORD`／`NAME`）。

<Wave 2 propose 後填>

## commit footer 慣例

每個 commit 結尾加一行 `Claude-Session: <值>`。值的來源只有兩種：
1. 若當前 session 的系統提示明確給了 `Claude-Session: https://claude.ai/code/session_…` footer，逐字用它。
2. 否則填 `CLAUDE_CODE_SESSION_ID`（例：`Claude-Session: 60458cf8-dddc-4a9b-be66-e355eaccfef0`）。

不要自行編造 URL。leader 的派工單要把 coordinator 用的那一行原樣傳下去。
