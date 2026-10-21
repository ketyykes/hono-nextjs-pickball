# Execution Plan: auth-backend-test-account

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；設定層 `build:`／`chore:`／`docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**。
2. **test-plan.md 對應列**（五欄一字不改；含開頭的「後端 API 授權覆蓋表」與本組用到的指令驗收列）。
3. **相關 spec 片段**：本組觸及的每個 Requirement 全文與 Scenario。
4. **相關 design 片段**（對照表）：
   - §2 → Decision 2
   - §3 → Decision 1、3、4、6；Risks 第 2 條
   - §4 → Decision 7
   - §5 → Decision 1、2、6；Risks 第 3、4、5 條；Open Questions 1
   - §6 → Decision 5（`/api/me` 部分）
   - §7 → Decision 5（`/api/session` 部分、降級只在探針）
   - §8 → Decision 7；Open Questions 3
   - §9 → Decision 8；Risks 第 1 條
   - §10 → Migration Plan
5. **B1 的既有介面**（貼 `hono-pickball/src/db/client.ts` 與 `src/db/schema.ts` 的現況全文，不只路徑）。
6. **「不給你」清單**：其他群組 task、B1／B3 的 artifact、runbook 全文、前端 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/auth-backend-test-account`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：`=== "development"` 改為 `!== "production"`、改為 `.toLowerCase() === "development"`。
   - §3：拿掉缺 secret／缺 URL 的 throw（各一次）；`trustedOrigins` 改為空陣列；`disableSignUp` 改 `false`；
     `emailAndPassword.enabled` 改 `true`；Google 條件改為只檢查 `GOOGLE_CLIENT_ID`。
   - §4：拿掉單引號跳脫；改為寫入明文密碼；拿掉開頭的 DELETE。
   - §5：gate 拿掉（直接 `next()`）；gate 改為只擋 POST；gate 放到 `createAuth` 之後。
   - §6：`requireSession` 無 session 時改為 `next()`；401 改 403；投影多帶 `emailVerified`；以 `c.req.query("userId")` 覆寫 user（模擬越權）。
   - §7：停用分支改為呼叫 `createAuth`；拿掉 try/catch；降級改回 500；投影多帶欄位。
   - **每個 HTTP 狀態碼分支、未登入分支、他人資料分支都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；
   另放一條等價變異當對照組（例如 401 的 JSON key 順序調換，測試應維持綠）。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. **後端 API 每個端點 MUST 有「未登入 401」與「存取他人資料被拒」的測試**；本 change 的對應關係見 test-plan「後端 API 授權覆蓋表」，
   `/api/session` 的「永遠 200」是 spec 明定的例外，Reviewer 須確認它沒有被任何授權邏輯依賴。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit：`test:` 一個、`feat:` 一個。註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `tsc` exit code 為準；後端另跑 `pnpm --filter ./hono-pickball typecheck`（兩段）。
i. 跑 E2E／啟動 dev server 前後用 `lsof -i :3005 -i :8787 -i :8790` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep`
   清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [樣式...]`。
   E2E 失敗不得自行判定為雜訊，證據上報。
j. **禁止任何遠端 CF 操作**；只允許 `--local` 與 `--dry-run`。
k. **測試帳密、`BETTER_AUTH_SECRET` 的真值禁止寫進任何會被 commit 的檔案或 commit 訊息**；`vitest.config.ts` 只放明顯為測試用的假值。
l. 單檔測試 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`，**`--run` 前不可加 `--`**；`listen EPERM 127.0.0.1` 放行後重跑。
m. **SHALL NOT 新增或升級任何 npm 相依**（含 better-auth 1.7、`tsx`、`@better-auth/cli`）；需要時回報 `BLOCKED`。
n. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
o. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。後端測試可派 project subagent
`hono-test-writer`，仍須明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：設定與端點接線大多照 Context7 範例，且決策已在 design 定死。
- **upgrade_to_opus_when**:
  - §5～§7：better-auth 的實際行為（狀態碼、cookie、origin 檢查）與 design 不符，需要讀套件原始碼判斷。
  - §9：E2E 在 proxy 通路失敗且非殘留 process 造成（需要跨 Next.js／miniflare／workerd 診斷）。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出，原因為「功能不存在」（404、模組不存在）或斷言不符。
  - [ ] it 名稱與 spec 驗收錨點逐字相同。
  - [ ] `src/index.ts` 中 `/api/health`、`/api/cookie-check` 零改動。
  - [ ] gate 在 `createAuth`／`getDb` 之前；`/api/session` 停用分支不呼叫二者。
  - [ ] 沒有任何真實帳密或 secret 進入 diff。
  - [ ] `pnpm --filter ./hono-pickball typecheck` exit 0。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收紀錄，名稱逐字相同。
  - [ ] `ENVIRONMENT` 缺值與 `production` 兩種停用情況都有測試（runbook 硬性要求）。
  - [ ] `/api/me` 有未登入 401、偽造 cookie 401、他人資料、登出後 401 四類測試。
  - [ ] `/api/session` 任何分支都不回 4xx／5xx。
  - [ ] 沒有 scope creep：沒有前端產品程式碼、沒有使用者資料表、沒有 seed／reset API、沒有啟用 Google。
  - [ ] regression guard 有誠實標註（特別是 9.1 與「帳號不存在與密碼錯誤回應相同」）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（派工單必帶 b～d），逐 HTTP 狀態碼、逐分支盤點存活數。
  - [ ] `isLocalAuthEnabled` 是唯一的啟用判斷（`grep "ENVIRONMENT"` 於 `src/**` 只出現在 `local-auth.ts`）。
  - [ ] `createAuth` 每請求只建立一次；`{ id, email, name }` 投影只有一個具名函式。
  - [ ] `requireSession` 不吞例外；降級只在 `/api/session`。
  - [ ] seed 純函式只 import 套件、型別 import 用 `import type`（Node type stripping 相容）。
  - [ ] Hono `Variables` 型別宣告與既有 `Bindings` 寫法一致。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；`nextjs-pickball` 只動 `tests/e2e/**`。
  - [ ] `hono-pickball/CLAUDE.md` 四處同步（路由、依賴、測試慣例、本機登入步驟），無過期敘述。
  - [ ] 指令驗收 C1～C6 皆有紀錄，且紀錄中無真實帳密。
  - [ ] B1 的既有測試與 `getDb` 介面零變動。
  - [ ] `auth-proxy.spec.ts` 的 helper 介面足以讓 B3 的 `globalSetup` 直接重用（不需複製 `.dev.vars` 解析）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - B1 未合併或其介面與本 design 前提不符而需要改 B1 的程式碼 → 停止並升級。
  - better-auth 1.6 無法在 D1（`transaction: false`）下完成登入、或需要升級到 1.7 → 停止並升級，SHALL NOT 自行升級。
  - `.dev.vars` 不齊備導致 E2E 只能 skip → 停止並向 coordinator 索取，SHALL NOT 以 skip 當作通過。
  - 任何方案需要遠端 CF 操作 → 立即停止並升級。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
