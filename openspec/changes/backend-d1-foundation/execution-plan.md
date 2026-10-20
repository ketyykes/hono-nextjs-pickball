# Execution Plan: backend-d1-foundation

## Mode

`subagent-driven`

派工單位採**逐組制**（本專案自 M4 起的既有做法，runbook「執行模式」）：tasks.md 的每個 `§` 群組派一個全新的
Implementer subagent 一次做完；組內仍**逐 task 依序**走 TDD 三步，逐 task commit（`test:` 一個、`feat:` 一個；
設定層 task 用 `chore:`／`build:`／`docs:`）。整組完成後跑 Stage 1（規格）→ Stage 2（品質）；全部群組完成後跑 Final Code Review。
群組之間**嚴格序列**，SHALL NOT 平行派 Implementer（共用同一個工作樹）。

§1 為「對齊 main＋Context7 查證」，由 leader 自己執行或派一個 Implementer；不寫產品程式碼，結果寫進 design.md Open Questions。

## Per-task contract

subagent **不繼承主對話 context**。每次派工下列項目 MUST **逐字貼進 prompt**，SHALL NOT 只給路徑：

1. **tasks.md 該組完整文字**（所有 task，含「設定層」「驗收（指令）」標註）。
2. **test-plan.md 對應列**（五欄一字不改；含「指令驗收」表中本組用到的列）。
3. **相關 spec 片段**：本組觸及的每個 Requirement 全文與 Scenario。
4. **相關 design 片段**（對照表）：
   - §2（wrangler／scripts／drizzle 設定／`.dev.vars.example`）→ Decision 1、2、3；Risks 第 1、5 條；Open Questions 1、2
   - §3（測試夾具＋schema＋migration）→ Decision 3、5、6、7；Risks 第 2、4 條
   - §4（`getDb`）→ Decision 4
   - §5（文件與總驗收）→ Decision 6；Migration Plan；Open Questions 3
5. **明確的「不給你」清單**：其他群組的 task、B2／B3 的任何 artifact、runbook 全文、前端 spec。缺 context 時回報
   `NEEDS_CONTEXT`，SHALL NOT 自行去翻。
6. **工作位置**（environment.md）：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/backend-d1-foundation`。
   **本批不用 git worktree**：禁止 `git worktree add`、禁止切換分支、禁止 `git merge`、禁止 `git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 的必做變異：
   `getDb` 的缺 `DB` 分支（拿掉 throw、改成回傳 `drizzle(undefined)`）、錯誤訊息拿掉 `DB` 字樣；
   migration SQL 中 `user.email` 的 unique index、`session`／`account` 的 `ON DELETE cascade`（各自獨立一次；
   測試夾具讀的就是 `drizzle/*.sql`，直接暫改該 SQL 檔即可讓測試讀到變異，結束後 `git checkout` 還原並確認 `git status` 乾淨）；
   夾具拿掉 `setupFiles`。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；
   另放一條等價變異當對照組（例如錯誤訊息改寫但仍含 `DB`，測試應維持綠）。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」與「存取他人資料被拒」的測試——**本 change 不新增端點**，此條記為 N/A，
   但 Reviewer 須確認 `src/index.ts` 零改動。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit：`test:` 一個、`feat:` 一個；設定層用 `build:`／`chore:`。註解只寫「為什麼」。
h. 編輯器診斷不可信，一律以 `tsc` exit code 為準；後端另跑 `pnpm --filter ./hono-pickball typecheck`（兩段）。
i. 跑 E2E／啟動 dev server 前後用 `lsof -i :3005 -i :8787 -i :8790` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep`
   清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 指令：
   `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [樣式...]`。E2E 失敗不得自行判定為雜訊，證據上報。
j. 禁止任何遠端 CF 操作（`wrangler deploy`、`d1 create`、`--remote`、`secret put`、`wrangler login`）；只允許 `--local` 與 `--dry-run`。
k. 改 `wrangler.jsonc` 後 PostToolUse hook 會自動跑 `cf-typegen`，產出的 `worker-configuration.d.ts` 一併 commit；
   **`cf-typegen` script 與 `.dev.vars.example` MUST 先於 `wrangler.jsonc` 的編輯 commit**（design Decision 2「注意順序」）。
l. 單檔測試 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`，**`--run` 前不可加 `--`**。
   後端測試噴 `listen EPERM 127.0.0.1` 是沙箱擋 localhost，放行重跑再判定。
m. **SHALL NOT 新增或升級任何 npm 相依**（含 better-auth 升到 1.7）；需要時回報 `BLOCKED`。
n. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
o. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，把狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`**（runbook「模型規定」與 M4 經驗：haiku 被連續退回反而更貴）。
每次呼叫 Agent tool MUST 明確帶 `model` 參數。

### Implementer

- **default_model**: `sonnet`
- **rationale**：本 change 多為設定與照官方範例接線，規則已由 design 定死；`sonnet` 足以勝任。
- **upgrade_to_opus_when**:
  - §3 夾具接不起來（`env.DB` 不存在、`TEST_MIGRATIONS` 型別或 `wrangler.environment` 行為與 design 不符），需要讀 pool 原始碼判斷。
  - §1／§2 的實測結果推翻 design Decision 1 或 2（需要改選替代方案）。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出，失敗原因是「模組／表／binding 不存在」或斷言不符，不是打錯字。
  - [ ] it 名稱與 spec 驗收錨點逐字相同。
  - [ ] `git diff main --stat -- pnpm-lock.yaml '**/package.json'` 只有 `hono-pickball/package.json` 的 scripts 變動。
  - [ ] `hono-pickball/src/index.ts`、`nextjs-pickball/**` 零改動。
  - [ ] `drizzle/**` 由 `db:generate` 產生、未手改。
  - [ ] `pnpm --filter ./hono-pickball typecheck` exit 0。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上就回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有測試或指令驗收紀錄，名稱逐字對應。
  - [ ] top-level `wrangler.jsonc` 沒有 `d1_databases`、沒有 `vars`；`env.local` 有 `name: "hono-pickball"`、沒有看似真實的 UUID。
  - [ ] 測試沒有手寫 `CREATE TABLE`；`env` 只來自 `cloudflare:workers`。
  - [ ] schema 欄位與 design Decision 5 一致（無 `issuer`）。
  - [ ] 沒有 scope creep：沒有 better-auth 設定、沒有新端點、沒有讀 `ENVIRONMENT`。
  - [ ] regression guard 有誠實標註。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（派工單必帶 b～d），回報存活數；逐約束盤點（unique、兩條 cascade、缺 DB 分支）。
  - [ ] `getDb` 是 `src/**` 唯一呼叫 `drizzle(` 的地方（`grep` 機械確認）。
  - [ ] `test/env.d.ts` 只補 `TEST_MIGRATIONS`，沒有重複宣告 `DB`（`DB` 由 `worker-configuration.d.ts` 提供）。
  - [ ] 測試資料彼此不碰撞（同檔共用 storage）。
  - [ ] 註解說明「為什麼」（env.local 的 name 覆寫、cf-typegen 讀範例檔、schema 屬設定層）。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` 的檔案清單 ⊆ proposal 的 Impact。
  - [ ] `hono-pickball/CLAUDE.md` 的 D1 段落、依賴注意、測試慣例、設定層定案四處已同步，且沒有殘留「D1 binding 暫時移除」等過期敘述。
  - [ ] 指令驗收 C1～C8 皆有實跑紀錄寫在 tasks.md。
  - [ ] 既有 16 個後端測試名稱與斷言零變動（`git diff main -- hono-pickball/test/{smoke,routing,api-health,api-cookie-check}.test.ts` 為空）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派；SHALL NOT 同模型同條件重試。
- Spec Reviewer 判斷前後不一致 → 規格有歧義，升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 任何方案需要遠端 CF 操作才能成立（例如 wrangler 堅持要真實 `database_id`）→ **立即停止**，升級給人類，SHALL NOT 自行 `wrangler login`。
  - `env.local` 無法讓 worker 名稱維持 `hono-pickball` → 停止並升級（會連帶影響 B3 與 S1）。
  - E2E 回歸出現新失敗 → 證據上報 coordinator 裁定，SHALL NOT 自行判定為雜訊。

## Model selection principle

用能勝任該角色的最弱模型；本批 Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
