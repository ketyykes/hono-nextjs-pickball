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

## 狀態快照（最後更新 2026-10-24，**B7 已合併，下一棒 B7.5**）

| 項目 | 值 |
|---|---|
| `main` HEAD | `5cdf647`（B7 archive） |
| 已定案決策 | 見下方「使用者已定案（2026-10-21）」三條 |
| 待裁決 | 無：D1～D6 已於 2026-10-21 依 `/goal` 授權採建議值（見「開工前待裁決」） |
| propose | Wave 1 `7c3ab72`；Wave 2 前半 B4～B6 `a595294`、後半 B7～B9 `c2b48fa`（全部已 propose） |
| apply | Wave 1 已合併並 archive；S1 通過；B4 已合併並 archive；B5 已合併並 archive；B6 已合併並 archive；B7 已合併並 archive；**下一棒 B7.5**（B7 archive 後 propose） |
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
| B1 | backend-d1-foundation | D1 binding（local）、drizzle schema／migration 流程、vitest D1 夾具 | 中 | change/backend-d1-foundation | **已合併 `a7866f5`**（28 tasks；後端 6 檔／25；E2E 633/27/0） |
| B2 | auth-backend-test-account | better-auth 掛 `/api/auth/*`、本機測試帳號、`requireSession`、`GET /api/me` | 中 | change/auth-backend-test-account | **已合併 `8cdfa53`**（37 tasks；後端 12 檔／50；E2E 635/35/0） |
| B3 | auth-frontend-session | 登入頁（測試帳號）、session hook、navbar 登入狀態、登入 E2E 夾具 | 中 | change/auth-frontend-session | **已合併 `e08e3cb`**（41 tasks；前端 87 檔／823；E2E 667/38/0） |
| B4 | pickball-core-package | 抽出共用 schema＋純函式為 workspace 套件，前端改 import，行為零變更 | 中～大 | change/pickball-core-package | 已合併 `27f0a26`、archive `d9d9d80` |
| B5 | scoreboard-backend | 計分板兩個 key 的後端儲存 API＋前端儲存層切換 | 中 | change/scoreboard-backend | 已合併 `f8a821f`、archive `fca0b95` |
| B6 | matchmaker-roster-backend | 名單／球員 CRUD API＋`useRosterStore` 切換 | 中 | change/matchmaker-roster-backend | 已合併 `b1dbff8`、archive `11a2dbf` |
| B7 | matchmaker-round-score-backend | 回合儲存、後端權威送出比分（評分＋歷史 D1 batch） | 大 | change/matchmaker-round-score-backend | 已合併 `a94a741`、archive `5cdf647` |
| B7.5 | user-data-account-guard | 跨分頁換帳號防護：使用者資料 API 一律驗 `X-Expected-User-Id`，不符回 401 `ACCOUNT_MISMATCH`；前端 `requestJson` 綁定 store 世代的 userId | 中 | change/user-data-account-guard | 已 propose `862fafa`（30 tasks；design OQ 新問題 1～5 皆採建議值）；apply 中 |
| B8 | matchmaker-history-stats-backend | 歷史頁區間查詢、統計頁改讀後端 | 中 | change/matchmaker-history-stats-backend | 已 propose，未 apply |
| B9 | local-data-import | 登入後一次性匯入本機五個 key（沿用 `BackupSchema`） | 中 | change/local-data-import | 已 propose，未 apply |
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

**S1 結果（2026-10-22，coordinator 實測，全部通過）**
1. local D1 備份移開後從零 `db:migrate:local`（`0000_auth_core.sql` ✅）＋`db:seed:local`：`user` 1 筆（測試帳號）、`account` 1 筆。
2. `pnpm dev`（:3005 經 proxy）：訪客 `/api/session` → `{"authEnabled":true,"user":null}`、`/api/me` 401；錯誤密碼 401；
   登入 200 並取得 1 個 `session_token` cookie；`/api/me`、`/api/session` 回測試帳號；再次請求仍 200；sign-up 400；sign-out 200；登出後 `/api/me` 401。
3. `opennextjs-cloudflare preview --port 8788`（workerd）＋後端 `dev:api`（`BETTER_AUTH_URL` 暫改 `http://localhost:8788`，事後還原並 `cmp` 確認）：
   API 流程結果與第 2 步完全相同；另以真實 chromium 走 navbar「登入」→ `/login` 表單 → navbar 出現「登出」→ reload 仍登入 → 登出回到登入入口，console error 0。
4. 移除 `.dev.vars` 的 `ENVIRONMENT` 重啟後端：`/api/session` → `authEnabled:false`；`/api/me`、`/api/auth/sign-in/email` 皆 404；
   preview 首頁 navbar 登入連結 0、登出按鈕 0，console error 0。（「設成其他值」由 B2 單元測試涵蓋。）
- 附註：sign-in 送**格式錯誤的 JSON** 時 better-auth 回 500（非 400）；屬函式庫行為、非安全問題，記錄供 G1 參考。
- preview 的前端埠號定案：`--port 8788`，此時 `BETTER_AUTH_URL` 必須同步改成 8788。

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
   # E2E：依 project 分開跑，webkit／mobile-safari 再各分 3 份（教訓 #14；不要用 test:e2e --，教訓 #6）
   for p in chromium firefox mobile-chrome user-data; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done
   for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done
   ```
   **E2E、lint、全套 `pnpm test`、build 前一律先取共用鎖**（教訓 #15）：
   `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，跑完 `/tmp/heavy-lock.sh release nextjspickball`；取鎖後仍要 `uptime` load < 20。
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
14. **本機 Playwright WebKit 單一 browser 超過 64 個 context 會卡住**（2026-10-22 B3 實證：靜態伺服器 80 context 重現，chromium 不受影響）。
    WebKit 每 project 已 >64 條 test，**不分割跑全套必定在第 64 條後逾時**；且 `--shard` 是依「全部 project 的清單順序」切，
    不加 `--project` 時最後一份幾乎全是 mobile-safari，照樣超標。驗收一律「依 project 分開、WebKit 兩個 project 各 `--shard=i/3`」。
    另外 load average 高（>50）時 WebKit 會整批 `page.goto` 逾時，先看 `uptime` 再判定。
    **2026-10-22 追查（未定論）**：一次跑完全套時，webkit／mobile-safari 固定在各自第 75、139 條（`player-stats:243`、`visual-export:476`）
    的 `beforeEach page.goto("/")` 等不到 load；只跑 webkit 一次（141 條）可全過，但 `--repeat-each=2`（282 條）會重現 → 是同一個 WebKit
    browser 累積後劣化，不是「前面跑過別的 project」。實驗（webkit `--repeat-each=2`，暫時 config 放 `/tmp/wk64/`）：
    關 video → 固定位置逾時消失但仍有 Turbopack `ChunkLoadError`；Playwright 輸出移出專案目錄 → `ChunkLoadError` 消失但固定逾時仍在；
    兩者同時套用那輪 load 117（`mediaanalysisd`、VM、Blender、mini4wd），結果無法判讀。**在機器安靜時重做「兩者同時」實驗**，
    若成立再以 change 修改 `playwright.config.ts`（webkit 類關 video、`outputDir`／report 移出 Next 專案目錄）恢復單一指令跑全套。
    在那之前：**跑 E2E 前先 `uptime`，load average > 20 就等**，再依 project 分開跑。
15. **與 min4wd session 共用高負載互斥鎖**（2026-10-22 使用者指示、min4wd 已同意）：同機的 min4wd session（node v24 vitest 計分、Blender 出圖）
    會把 load 推到 100～460，造成 WebKit E2E 逾時。`/tmp/heavy-lock.sh`（mkdir 原子鎖 `/tmp/heavy-compute.lock`，持有 >2 小時視為過期；
    在 /tmp，重開機需重建）`acquire <owner> <說明>`／`release <owner>`／`status`。本 repo 的 E2E、eslint、全套 vitest、OpenNext／wrangler build
    都要先取鎖（單檔測試除外），派出的 leader／subagent prompt 必須寫入此規則。B4 實證：持鎖＋load 6 重跑 webkit 3/3 47/47 通過。
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

### B1 合併紀錄（2026-10-21）
- coordinator 獨立驗證：tsc／後端 typecheck exit 0；lint 0 errors／3 warnings；前端 81／783、後端 6／25；`db:migrate:local` OK；
  build dry-run OK（`No bindings found.`）；E2E 633 passed／27 skipped／0 failed（20.8m）；RED commit `081d874`、`50cccd8` 複驗為真。
- 遺留給 G1：Workers Builds 若設 `CLOUDFLARE_ENV=local` 或 deploy 帶 `--env` 會讀到無 `database_id` 的 `env.local` 而可能遠端自動建 D1——須人工確認 Dashboard。
- 給 B2：`ENVIRONMENT` 型別被產為必填 `string`（遠端實為 undefined），只能用 `=== "development"` 判斷。

### B2 合併紀錄（2026-10-21）
- coordinator 獨立驗證：tsc／後端 typecheck exit 0；lint 0／3；前端 81／783、後端 12／50；build dry-run OK；RED `c877512`、`a096c4e` 複驗為真。
- E2E 全套：629 passed／35 skipped／6 failed（load average 最高 181）；6 條（firefox data-transfer×2、player-stats console、visual-export 網路請求、
  webkit roster 空白狀態、mobile-chrome tour skip）**隔離重跑 6/6 passed** → 判定負載雜訊。leader 自跑為 635/35/0。skipped 由 27 增為 35＝新 `auth-proxy.spec.ts` 只跑 chromium（+2 pass、+8 skip）。
- 查證：`d1 execute --local` 寫入對執行中 `wrangler dev` **立即可見**。經前端 proxy 的 sign-in 不帶 `Origin` 回 403。
- **給 B3**：seed 會 DELETE 同 email user 並 cascade 刪 session → seed 必須統一移到 Playwright `globalSetup`（在存 storageState 之前）；不支援跨 worker 並行 seed（SQLITE_BUSY）。
- 給 Wave 2：`localAuth` middleware 建議移到 `src/auth/`；`AuthAppEnv` 的 user／session 型別非 optional，未掛 middleware 的路由讀取不會報型別錯。
- commit footer：自 B2 合併起 session 系統提示給了 `Claude-Session: https://claude.ai/code/session_01NzuJP5v7c6dK6fVXxFPy3b`，依本檔慣例 1 改用此值。

### B3 合併紀錄（2026-10-22）
- 窄螢幕裁決（coordinator，2026-10-21，依 `/goal` 授權）：帳號入口 `< sm`（640px）隱藏（`hidden sm:inline-flex`），窄螢幕經 `/login` 登入／登出；
  **行動裝置登入入口列為 G1 待辦**。裁決前實測 320px 超出 10px、375px 超出 11px、390px 只剩 4px。
- `fetchSession` 改用 `keepalive: true`：WebKit 換頁時會拒絕已開始卸載頁面發出的 fetch 並記 console error，觸發既有 spec 的 console 守衛。
- session store refresh 改遞增 requestId（以最新請求為準）；seed 統一移到 Playwright `globalSetup`（B2 移交已完成）。
- coordinator 獨立驗證：tsc／後端 typecheck 0；lint 0／3；前端 87／823、後端 12／50；E2E 依 project 分開 667 passed／38 skipped／0 failed。
- 已知風險（未處理）：高負載下 dev 模式偶發 Turbopack `ChunkLoadError`（layout chunk），不在 console 守衛白名單，只出現於 dev。

### Wave 2（2026-10-22，B4 20 tasks、B5 45、B6 35、B7 46、B8 30、B9 22；皆不新增第三方相依）
- **跨 change 慣例（B4／B5 定案，B6～B9 沿用）**：表 `<feature>_<entity>`＋`user_id`/`data`(JSON)/`version`/`updated_at`，清單 `USER_DATA_TABLES`（核心套件）；
  路由 `src/routes/<feature>.ts`＋`localAuth`/`requireSession`（B5 移到 `src/auth/`，型別拆 `AuthAppEnv`／`SessionAppEnv`）；GET `{data|null,version}`、
  PUT version 比對 409 `VERSION_CONFLICT`／400 `INVALID_BODY`；前端 `lib/sync`（`resolveStorageMode`、`requestJson`、`createLatestWinsSaver`、`SyncStatus`）、
  `useLocal<X>Store`／`useRemote<X>Store`／原名改選擇器；E2E 新增第六個 project `user-data`（workers 1）＋`clearTestAccountUserData()`（只刪資料表列，不刪 user／session）。
- **與 runbook 草案差異**：`scoreboard:matches:v1` 由 B5 移到 B7；B5 只有 `/api/scoreboard/current`；B8 改 `from`/`to`（前端以核心 `rangeBounds` 算台灣時區切點，Workers 為 UTC）；
  B6 登入時 JSON 還原暫停、B9 改為「從 JSON 備份匯入到雲端」。B6 合併後到 B7 合併前，登入態名單在雲端、回合／歷史仍在本機（不 push，正式站不受影響）。
- **B7 batch 版本保護**：batch 首條 `INSERT INTO sync_batch_guards … VALUES (?, CASE WHEN <條件> THEN 1 END, ?)`，條件不成立觸發 NOT NULL 讓整批回滾，末條刪除守衛列。
- **B9**：`POST /api/import`；四張 matchmaker 表任一有本人資料即 409 整份不寫入；計分板已有時只略過並標 `skipped`；本機資料一律保留。
- **archive 順序必須 B4→B9 依序**（B5 建 `user-data-sync`，B6～B9 ADDED／MODIFIED 皆以前一棒 archive 後的主 spec 為底；各棒 tasks §1 會重新對齊）。
- 待 apply §1 實測：D1 Free 方案 50 query 上限是否逐陳述式計數；`json_extract` 讀回等價性；batch 內 `RETURNING` 寫法。
- 各棒 tasks 的 E2E 驗收寫「依標準流程第 4 步指令（含 `user-data` project）」；B4～B6 tasks 內寫死的 shard 指令以第 4 步為準。

### B4 紀錄（2026-10-22，合併 `27f0a26`，archive `d9d9d80` → `2026-10-22-pickball-core-package`；新主 spec `pickball-core`、改 `dev-workflow`）
- 20/20 tasks；18 模組 `git mv` 至 `packages/pickball-core/src`（R100），前端 84 檔只改 import；後端 `workspace:*` 相依＋workerd 匯入測試（RED→GREEN）。
- 測試：前端 87/823（不變，既有 it 名稱與斷言機械比對逐字不變）、後端 13/51（+1）、核心 1/2；lint 0 errors／3 warnings；`playwright --list` 705。
- lockfile 只多三段 importers，`packages:`／`snapshots:` 零改動；`pnpm install` 會把 eslint-plugin-import peer 後綴展開，需還原（已還原後 `--frozen-lockfile` 穩定）。
- E2E 667/38/0：webkit 3/3 首跑 1 失敗（`scoreboard.spec.ts:187` 15 分制 11-0 跳出 GameOverDialog，疑 hydration 前點擊遺失），load 28；
  持鎖 load 6 重跑 47/47、coordinator 再跑 scoreboard.spec webkit＋mobile-safari 34/34 → 判定負載雜訊。
- 合併後需 `pnpm install` 重建 workspace 連結。**Playwright 以路徑含 `/node_modules/` 決定是否轉譯 TS**，任何工具加 `--preserve-symlinks` 會讓 E2E 壞（見核心套件 CLAUDE.md）。
- 待後續 change：`scoreboard.spec.ts:187` 點選後補 `aria-checked` 斷言；`stop-typecheck.sh` 檔頭與 `code-reviewer-readonly.md` 仍寫「兩個 workspace」、
  核心套件無 `AGENTS.md`；`emojiFree.test.ts` 掃描範圍擴及核心套件（`labels.ts`）。G1 第 5 點：Workers Builds 能否解析 workspace 相依（遠端驗證）。

### B5 紀錄（2026-10-22，合併 `f8a821f`，archive `fca0b95` → `2026-10-22-scoreboard-backend`；新主 spec `user-data-sync`，改 `backend-database`／`scoreboard`／`dev-workflow`）
- 45/45 tasks、52 commits＋coordinator docs `a3c1edf`（核心 CLAUDE.md `CORE_MODULES` 21 項、README E2E 6 個 project）。中途遇 API rate limit 中斷，SendMessage 續跑成功。
- 測試：前端 92/846、後端 16/69、核心 2/4；lint 0/3；無新相依。E2E（coordinator 持鎖、load < 7 自跑）678 passed／38 skipped／0 failed（既有 5 project 各 +1 訪客 spec，`user-data` 6）。
  load 低時整輪約 12 分鐘。E2E log 中的 `[Better Auth]: Invalid password` 是錯誤密碼測試的預期輸出。
- 與 design 差異（design OQ6～11）：畸形 JSON 由 sub-app `onError` 轉 400 `INVALID_BODY`；enabled true→false→true 拿到 `data:null` 殘留舊比分已修；
  訪客 spec 不可斷言 `role=status` 為 0（`OrientationHint` 本身是 status）；衝突 E2E 讓 A 得 2 分（1 分時 1:1 無法分辨），spec 措辭不改；
  訪客面板容器多一個 `relative` class（畫面無差，接受）。
- **待使用者確認（UX）**：同步提示在 375px 以下直式畫面會蓋住「我方 · 11 分制」標籤（不蓋按鈕與比分）。
- **帶到 B6 的待辦**：① 後端測試補強（OQ7）：`NOT LIKE '_cf_%'` 的 `_` 是萬用字元、不接受 query／body 帶 `userId` 的守護、`getSession` 例外回 500 的守護、GET 斷言 200。
  （verify 另建議：sub-app 的 `onError`＋`zValidator` hook 抽到 `src/http/` 共用。）
  ② 跨分頁換帳號（OQ10 ①）：別的分頁換帳號後本分頁 `enabled` 不變，版本號相同時可能把 A 的比分寫進 B；auth 僅本機，風險低，B6 對齊時處理或明列為 G1 前必修。

- **B7 delta 必修**：B5 archive 後 `openspec validate --all --strict` 對 `matchmaker-round-score-backend` 失敗——
  `MODIFIED "localStorage 持久化" omits scenario(s) the current spec still has: "登入但帶 matchId 時仍走本機分槽"`。
  B7 本意是以「登入且帶 matchId 時不寫入本機分槽」取代，tasks §1 對齊時要在 delta 明確處理該舊 Scenario（MODIFIED 全文不含即移除，需確認寫法）。

### B6 紀錄（2026-10-23，合併 `b1dbff8`，archive `11a2dbf` → `2026-10-23-matchmaker-roster-backend`；改 `backend-database`／`data-transfer`／`player-roster`／`user-data-sync`）
- 36 tasks（leader 新增 3.6）、56 commits＋coordinator `96d3c3f`（delta「LocalStorage 持久化」改為「雲端模式下使用者操作不改變 `matchmaker:roster:v1`；本機實作仍掛載並依逐筆降級規則回寫」，原句與實作不符）。
  leader 兩次被系統要求中途交回，都以 SendMessage 續跑成功（它會在背景審查員回報後自動恢復，不必重派）。
- 測試：前端 95/895、後端 17/97、核心 3/6；lint 0/3；無新相依。E2E（coordinator 持鎖、load < 13）705 passed／38 skipped／0 failed（`user-data` 18）。
- B5 帶來三項：後端守護補齊（`user-data-tables.test.ts` 改 `NOT GLOB '_cf_*'`）、`src/http/invalid-body.ts` 共用 onError＋zValidator hook、跨分頁換帳號列 **G1 前必修**（design OQ6）。
- `isConstraintError` 收斂：只有主鍵／UNIQUE 衝突回 409，FK／NOT NULL 回 500。remote hook 用 `useState`＋`playersRef`（非 reducer）。
- 接受維持現狀（design OQ11、OQ13）：p1 被拒後 p2 成功即回 synced；重置在途卸載不清本機回合／歷史（B7 reset batch 會消除）；重置在途 401 丟棄結果；對戰頁回填在雲端名單載入期間延後。
- **帶到 B7**：`reset()` 前未 `disposeAll()`，重置時若某參賽者 v0 PUT 正在重試，可能在雲端讓該參賽者復活。
- **帶到 G1**：import 無筆數／body 大小上限、`PlayerSchema.id` 接受空字串；同 mount 換帳號閃一幀前帳號名單；B5 主 spec `scoreboard/spec.md` 約 135 行同樣宣稱雲端模式不讀寫本機 key（與實作不符，需另開 change 修正措辭）。
  低優先：import `sort_order` 併發可能重複、前端 PUT 回應 version 下限比後端寬、回應遺失重試出現假 conflict。
- **B6 archive 後 validate 新失敗（各棒 §1 對齊時修 delta，把主 spec 新增的 Scenario 帶進 MODIFIED 區塊或明確取代）**：
  - B7、B8：`player-roster` MODIFIED「重置名單與二次確認」缺「resetLocalMatchProgress 只清除本次活動的進度」。
  - B9：`data-transfer` MODIFIED「登入時的資料工具頁」缺「登入時 JSON 還原停用」。
  - （B7 另有 B5 留下的 `scoreboard`「localStorage 持久化」缺「登入但帶 matchId 時仍走本機分槽」。）
- **主 spec 同名 Scenario（跨 Requirement，strict validate 不擋，但違反零重複慣例）**：`backend-database`「user_id 必須參照既有使用者」×2（B5／B6 各一）、
  `player-roster`「刪除參賽者」×2（原有／B6）。主 spec 不可直接改；B7～B9 若 MODIFIED 到這些 Requirement 就順手改名，否則 B9 後以一個小 change 統一改名。
  後續各棒 delta 的 Scenario 標題要加 Requirement 專屬前綴，避免再撞名。

### B7 紀錄（2026-10-24，合併 `a94a741`，archive `5cdf647` → `2026-10-24-matchmaker-round-score-backend`；改 `backend-database`／`data-transfer`／`player-roster`／`round-lifecycle`／`scoreboard`／`user-data-sync` 等）
- 46 tasks；leader 三任（第一任 17h 迴圈重複交回、第二任電腦睡眠後 3.5h 無進展，皆 TaskStop 重派）。Final Code Review（opus）APPROVE WITH NITS、無必修；文件小問題 coordinator 修於 `03d2550`。
- 測試：前端 100/985、後端 21/149、核心 4/11；lint 0/3；無新相依。E2E（coordinator 持鎖、load 3.9～6.1）713 passed／38 skipped／1 failed（`user-data` 27）。
- **唯一失敗＝既有競態，非 B7 回歸**：webkit `quiz.spec.ts:49` 點 navbar「測驗」偶發不導覽。根因 `AccountEntry` loading 時不佔寬度（主 spec site-navbar 明定），
  `/api/session` 回應後 navbar 左移，mousedown／mouseup 落在不同連結、click 派給 `<nav>`。發生率約 3～9%；首頁 chunk 與 main 逐檔無差異。
  **後續 change**：site-navbar loading 時預留入口寬度（改主 spec，一併消除使用者誤點與 CLS）。在那之前此條失敗以隔離重跑判讀，診斷資料 `/tmp/qdbg/`。
- coordinator 裁定：既有 `roster-sync.spec.ts`「登入時送出比分後評分寫入雲端名單」改等 `POST …/score` 並加「無逐人 PUT」斷言（tasks 例外清單第五個）。
- 維持現狀／後續：OQ16 舊回合重排先得 400 而非 409；reset 後 version 從 1 起算的 ABA（G1 前評估）；rejected 時樂觀顯示不回滾；`updatedPlayers` 為空的 `sql.join` 防禦；
  ~~CourtCard 遇 unauthorized 不 refresh~~（B7.5 處理）；`seedAndSignIn` 兩份本地複本（B8／B9 新測試改用 `test/helpers/matchmaker-fixtures.ts`）。
- **B7 archive 後 validate 失敗（各棒 §1 修）**：B8 `player-roster` MODIFIED「重置名單與二次確認」缺「resetLocalMatchProgress 只清除本次活動的進度」與「登入時重置名單前停止所有待送與重試中的變更」；
  B9 `data-transfer` MODIFIED「登入時的資料工具頁」缺「登入時 JSON 還原停用」（同 B6 後，未新增）。
- **交接給 B8～B9**：見 B7 design「交接給 B8～B9」與 hono-pickball/CLAUDE.md「後續 change 須知」三點。

## commit footer 慣例

**2026-10-24 起停用：commit 訊息與派工單一律不加任何 attribution／footer 行**（含 `Claude-Session`、Co-Authored-By）。以下為舊慣例，僅供對照歷史 commit：
1. 若當前 session 的系統提示明確給了 `Claude-Session: https://claude.ai/code/session_…` footer，逐字用它。
2. 否則填 `CLAUDE_CODE_SESSION_ID`（例：`Claude-Session: 60458cf8-dddc-4a9b-be66-e355eaccfef0`）。

不要自行編造 URL。leader 的派工單要把 coordinator 用的那一行原樣傳下去。
