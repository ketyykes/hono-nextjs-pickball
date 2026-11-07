# Execution Plan: google-oauth-launch

## Mode

`subagent-driven`

**逐組制**：tasks.md 的 §2（後端）、§3（前端）、§4（文件與指令驗收）各派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`／`fix:`（GREEN）各一；設定層 `chore:`；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；§2～§4 全部完成後 Final Code Review。
群組間**嚴格序列**（§3 依賴 §2 的 `/api/session` 形狀），SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**§5 為使用者上線步驟（人工）**：任何 agent SHALL NOT 執行，leader 只在 archive 時依 design Decision 11 加註。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
（後端 `test/**` 不在 Stop hook 的 tsc 範圍，但 §2 的 RED 引用尚不存在的 `isGoogleSignInConfigured`／`isAuthEnabled`，同樣以「同一張派工單內完成 RED→GREEN」處理。）

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、授權修改的既有測試清單、憑證與遠端操作禁令）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「後端 env 的共同要求」「前端 mock 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/auth/spec.md`「本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用」「GET /api/session 狀態探針永遠回 200」「Google 登入只在 client id 與 secret 皆有值時啟用」全文；`specs/user-data-sync/spec.md` 全文；`specs/backend-database/spec.md` 全文；`specs/dev-workflow/spec.md`「後端 binding 型別由 wrangler types 產生且 DB 為必填」「測試帳號 seed 與本機 auth 變數」。
   - §3 → 本 change `specs/auth/spec.md`「GET /api/session 狀態探針永遠回 200」（只取回應形狀段落）「前端以 /api/session 作為登入狀態的唯一來源」「本機測試帳號登入頁」「前端 Google 登入的請求契約」全文；`specs/api-connectivity/spec.md` 全文。
   - §4 → 本 change `specs/dev-workflow/spec.md` 全文、`specs/backend-database/spec.md` ADDED Requirement；proposal「Impact」。
4. **相關 design 片段**：§2 → Decision 1、2、3、7、8、9、10；Risks「secret 只設一部分」「遠端誤設 ENVIRONMENT」「本機 account linking」。§3 → Decision 3、4、5、6、10；Risks「proxy 在 workerd 正式環境是否真的不跟隨轉址」「next dev 的 miniflare binding」「主 repo 的 Stop hook」。§4 → Decision 8、9、11、12、Migration Plan、Risks 全文。
5. **既有介面與範本**（全文貼上）：
   - §2：`hono-pickball/src/auth/local-auth.ts`、`local-auth-middleware.ts`、`create-auth.ts`、`src/index.ts`、`src/db/client.ts`、`wrangler.jsonc`、`.dev.vars.example`、`vitest.config.ts`；測試範本 `test/auth-config.test.ts`、`test/auth-gating.test.ts`、`test/auth-session.test.ts`、`test/expected-user-guard.test.ts`（只為說明 `app.routes` 列舉，不得修改）、`test/db-client.test.ts`。
   - §3：`nextjs-pickball/lib/auth/session-client.ts`＋`.test.ts`、`lib/auth/session-store.ts`＋`.test.ts`、`hooks/useSession.ts`、`components/auth/LoginForm.tsx`＋`.test.tsx`、`app/login/page.tsx`、`app/api/[[...route]]/route.ts`＋`route.test.ts`、`tests/e2e/specs/auth-session.spec.ts`、`tests/e2e/specs/auth-proxy.spec.ts`、`playwright.config.ts` 的 projects 段。
   - §4：root `README.md` 的「部署」節、root `CLAUDE.md`「Cloudflare Workers 部署架構」節、`hono-pickball/CLAUDE.md` 的 auth／wrangler／D1 相關節、`nextjs-pickball/CLAUDE.md` 的 `/login` 相關段落。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、前一個 change 的 artifact、`docs/backend-scoring-runbook-b1-b9.md` 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/google-oauth-launch`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace>`、`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：① `localAuth` 閘門改回 `isLocalAuthEnabled`（B3、B4、B6 須轉紅）；② `isGoogleSignInConfigured` 只檢查 client id（B1、B5 須轉紅）；③ `disabledPaths` 移除 `"/sign-up/email"`（B7 須轉紅）；④ `disabledPaths` 改為恆為空陣列、只留 `emailAndPassword.enabled: false`（B7 與 disabledPaths it 須轉紅——證明第一道防線獨立被測）；⑤ `/api/session` 的 `emailPassword` 寫死為 `true`（B4 須轉紅）；⑥ 移除 `prompt: "select_account"`（B3 須轉紅）。
   - §3：① `fetchSession` 不驗證 `signInMethods` 形狀而原樣回傳（F2 須轉紅）；② session store 快照改回只挑 `authEnabled`／`user`（F12 須轉紅）；③ Google 按鈕改為只看 `authEnabled`（F7 須轉紅）；④ 缺省值改為 `{ google: false, emailPassword: false }`（F7 與既有 LoginForm it 須轉紅）；⑤ `startGoogleSignIn` 移除 `https:` 檢查（F4 須轉紅）；⑥ `route.ts` 移除 `redirect: "manual"`（F10 須轉紅）。
   - 另放至少一條等價變異作對照組（例：§2 調換 `isAuthEnabled` 中 `||` 兩側運算元；§3 調換 `fetchSession` 兩個型別檢查的順序），須維持全綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。單元層用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build、`preview` 一律先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> test --run <path>`，**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**（cwd 不在 root 時 "No projects matched" 且 exit 0）。
   單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec>`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 與 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（`wrangler deploy`、`d1 create`、任何 `--remote`、`secret put`／`secret list`／`secret delete`、`wrangler login`）；只允許 `--local`、`--dry-run`。
   **測試帳密與 Google OAuth Client ID／Secret 禁止寫進任何會被 commit 的檔案或 commit 訊息**；測試用的假值固定為 `fake-client-id`／`fake-client-secret`。SHALL NOT 讀取或修改開發者的 `hono-pickball/.dev.vars`（只可檢查其中是否有 `GOOGLE_` 開頭的鍵，不得輸出值）。
j. **SHALL NOT 新增任何 npm 相依**（含 `better-auth/react` 等 client）；**SHALL NOT 改動** `packages/**`、`hono-pickball/src/routes/**`、`hono-pickball/drizzle/**`、`hono-pickball/src/db/schema.ts`、`nextjs-pickball/components/layout/**`、`nextjs-pickball/lib/sync/**`、`nextjs-pickball/hooks/**`、`playwright.config.ts`、`openspec/specs/**`。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的兩處（`auth-session.test.ts` 三個 it 的期望物件增列 `signInMethods`；`LoginForm.test.tsx` mock factory 增列 `startGoogleSignIn: vi.fn()`）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：後端是三個小函式、一個 better-auth 選項與一個回應欄位；前端是兩個 fetch 函式、一個按鈕與一個 fetch init；皆有既有測試範本可照抄。難點在「哪條 RED 是真紅」與 workerd 測試的 env 注入，tasks 已逐條寫明。
- **upgrade_to_opus_when**:
  - `POST /api/auth/sign-in/social` 在 workerd 測試中無法回 200（例：better-auth 要求網路或 state 寫入失敗），且無法以 test-plan 的 env 注入解釋。
  - 型別收窄後後端 typecheck 第二段仍有無法以 `DB?: D1Database` 解釋的錯誤。
  - E2E「經 proxy 呼叫 OAuth callback」在同一 project 連續兩次結果不同。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只改了 tasks 檔頭授權的兩處既有測試；`expected-user-guard.test.ts` 一行未改且仍綠。
  - [ ] `git diff main --stat` ⊆ proposal Impact；`git log -p main..HEAD` 不含 `apps.googleusercontent.com`、`GOCSPX-`、測試帳密值。
  - [ ] 前端 `tsc` 與後端 typecheck 兩段 exit 0；改動的前端檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增與 MODIFIED 新增的 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；B7 與 disabledPaths it 確實在第一輪 GREEN 之後才寫。
  - [ ] GREEN 只滿足 RED：沒有引入 better-auth client、沒有改 `AccountEntry`／`resolveStorageMode`、沒有 Google 錯誤原因提示、沒有改 `localAuth` 名稱（scope creep）。
  - [ ] Decision 1 真值表四列皆有測試覆蓋；fail-closed（Google 只設一半）時整組停用。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：auth 閘門與 proxy 轉址屬安全邊界，需要最強模型抓「某一層被誤刪時另一層是否仍擋住」這類邊界。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是 §2 ④（只剩 better-auth 第二道防線）與 §3 ⑤（https 檢查）。
  - [ ] `isGoogleSignInConfigured` 的判斷只寫一處，`createAuth` 與閘門共用；沒有第二份 truthy 判斷。
  - [ ] `startGoogleSignIn` 絕不 throw、不導向非 https；沒有 spy `window.location`。
  - [ ] 沒有巢狀三元運算（專案編碼風格：改用 if/else 或具名變數）；`disabledPaths` 的條件以具名常數或 if/else 表達。
  - [ ] 註解只寫理由；`local-auth-middleware.ts` 與 `app/login/page.tsx` 的舊註解已依新行為更新。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完前後端全部 commit，確認 `/api/session` 形狀前後端一致、上線文件與實作一致、無憑證外洩。
- **when**：§2～§4 全部勾完後一次（§5 不在審查範圍）。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動；`packages/**` 零變更。
  - [ ] 後端 `/api/session` 三個分支與前端 `isValidPayload` 的接受條件一致（新後端的每種回應前端都接受）。
  - [ ] 指令驗收 C1～C10 皆有紀錄；前端測試數＝基線＋12、後端＝基線＋8、核心不變；E2E 依 C5 的期望數。
  - [ ] README「正式站上線步驟」與 tasks §5 的指令逐字一致；四個 secret 名稱與 `createAuth` 讀取的變數名一致。
  - [ ] C8 憑證檢查無輸出。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有測試或 E2E（含 `user-data` project）出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 E2E 只能 skip，或 `.dev.vars` 含 `GOOGLE_*` 鍵（C5 前提不成立）→ 停止並向 coordinator 索取／請 coordinator 處理，agent 不得自行改該檔。
  - better-auth 1.6.15 的 `disabledPaths` 或 `sign-in/social` 行為與 design Context 的查證不符 → 停止並回報（屬設計前提失效）。
  - 任何步驟看似需要遠端操作才能驗證 → 停止，改列入 §5 或 design Risks，不得自行執行。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
