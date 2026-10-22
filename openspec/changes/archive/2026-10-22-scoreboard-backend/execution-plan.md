# Execution Plan: scoreboard-backend

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；`refactor:`；設定層與例外層 `chore:`；文件 `docs:`；6.4 的主 spec 同步用 `docs(openspec):`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本批在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「訪客路徑零迴歸」與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；後端組另貼「後端 API 授權覆蓋表」；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2 → `user-data-sync`「版本化讀寫契約」
   - §3 → `user-data-sync`「使用者資料 API 的路由、授權與停用閘門」「使用者資料表的命名與欄位慣例」；`backend-database`「計分板目前比賽資料表由 migration 建立」；主 spec `backend-database`「auth 核心資料表由 migration 建立」（既有範本）
   - §4 → `user-data-sync` 前兩個 Requirement；`scoreboard`「登入時獨立計分板以雲端為準」中後端相關段落與 Scenario「後端拒絕寫入綁定場次的狀態」
   - §5 → `user-data-sync`「前端依 session 選擇儲存模式」「前端 API 請求的結果分類」「最新優先的雲端儲存與自動重試」「同步狀態與提示」
   - §6 → `scoreboard` 兩個 Requirement 全文；`pickleball-guide-page` MODIFIED 全文；`user-data-sync`「前端依 session 選擇儲存模式」
   - §7 → `scoreboard`「登入時獨立計分板以雲端為準」的 E2E Scenario；`dev-workflow`「E2E 登入夾具」全文；`user-data-sync`「同步狀態與提示」
4. **相關 design 片段**（對照表）：
   - §2 → Decision 3、9
   - §3 → Decision 2、4；Risks 第 6 條
   - §4 → Decision 2、3；Open Questions 1（給 B7，不在本組處理）
   - §5 → Decision 5、6、7
   - §6 → Decision 1、5、6、7；Risks 第 1、2 條
   - §7 → Decision 7、8；Risks 第 3、4、5 條
   - §8 → 「交接給 B6～B9」全文、Migration Plan
5. **既有介面**：§3、§4 貼 `hono-pickball/src/index.ts`、`src/auth/require-session.ts` 全文與 `test/auth-me.test.ts` 的 seed／signIn 段；
   §5、§6 貼 `lib/auth/session-store.ts` 的 `SessionSnapshot` 型別、`hooks/useSession.ts` 全文、`hooks/useScoreboardStore.ts` 全文；
   §7 貼 `playwright.config.ts` 全文、`tests/e2e/helpers/{test-account,storage-state}.ts` 全文、`tests/e2e/specs/auth-session.spec.ts` 的 skip／storageState 寫法。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B4 的 artifact、對戰分配機的 spec 與程式碼。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/scoreboard-backend`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：envelope 的 `version` 拿掉 `.int()`／`.nonnegative()`；write schema 的 `data` 改為 `.nullable()`。
   - §3：`requireSession` 改回 `createMiddleware<AuthAppEnv 合併型別>`（typecheck 須轉紅）；schema 拿掉 `onDelete: "cascade"`、拿掉 `.references(...)`；`USER_DATA_TABLES` 少一項。
   - §4：update 的 `where` 拿掉 `eq(version, expected)`；insert 拿掉 `onConflictDoNothing`（改為會拋錯的 insert）；回應 `version` 不加 1；
     handler 以 body 內的欄位取代 `c.var.user.id`；sub-app 拿掉 `localAuth`、拿掉 `requireSession`；`matchId` 檢查拿掉；hook 回 422 取代 400。
   - §5：`resolveStorageMode` 忽略 `authEnabled`；409 與 401 分類互換；5xx 分到 rejected；catch 改 rethrow；GET 拿掉 keepalive；
     saver：在途時直接送出（不排隊）、保留第一份而非最新、退避表改為固定 1 秒、conflict 時繼續重試、`dispose` 不清計時器。
   - §6：`HYDRATE` 後也寫回；衝突時不重新 GET；401 不呼叫 `onUnauthorized`；選擇器忽略 `matchId`；`enabled` 為 false 時仍 GET。
   - §7：`clearTestAccountUserData` 多刪 `session`（E2E「清空使用者資料後仍為登入態」須轉紅）；`data-sync-status` 在 local 也渲染（訪客 spec 須轉紅）。
   - **每個狀態碼分支、每個 `SyncStatus` 轉換都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」三類測試（test-plan 授權覆蓋表）；Reviewer 逐列核對 it 存在且斷言到位。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。型別 RED（3.1）以 typecheck 輸出為證。
g. 逐 task commit；註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 與 `pnpm --filter ./hono-pickball typecheck` 的 exit code 為準。前端 `describe`／`it`／`expect`／`vi` MUST 顯式匯入；後端同。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 一律 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> [樣式...]`；
   失敗不得自行判定為雜訊，證據上報。
j. **禁止任何遠端 CF 操作**；`wrangler d1` 一律帶 `--local --env local`。
k. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit。
l. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
m. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
n. **既有 it／test 的名稱與斷言一律不得修改**；`useScoreboardStore.test.tsx` 只允許新增 mock 區塊與新 it；`d1-schema.test.ts` 只允許新增 it；本機 hook 本體一行不改（`git diff` 只見函式名稱一行）。
o. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
p. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：各模組小且契約已由 spec 定死；複雜度在狀態機與測試替身，sonnet 可勝任。
- **upgrade_to_opus_when**:
  - §4：drizzle 的 `returning()`／`onConflictDoNothing()` 在 D1 的行為與 design 不符，需要改 SQL 策略。
  - §6：React 19 Strict Mode 下雲端 hook 重複請求或 `HYDRATE` 被寫回，且一次修正未果。
  - §7：E2E 時序或 `user-data` project 與 globalSetup 的互動問題需要跨工具診斷。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 本機 hook、`lib/scoreboard/storage.ts`、`match-slots.ts` 零改動（`git diff main -- <files>` 只見允許的那一行）。
  - [ ] 使用者 id 只來自 `c.var.user.id`。
  - [ ] `pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck` exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 授權覆蓋表三欄齊備（e）。
  - [ ] 訪客路徑零迴歸：`resolveStorageMode` 在 loading 時為 local；local 模式不渲染同步元素。
  - [ ] 沒有 scope creep：沒有場次分槽上雲、沒有合併邏輯、沒有 DELETE API、沒有對戰分配機改動。
  - [ ] regression guard 有誠實標註（4.2 的 404、6.5、7.2 的訪客 spec）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），逐狀態碼分支、逐 `SyncStatus` 轉換盤點存活數。
  - [ ] 版本比對為單一條件式 SQL，沒有先讀再寫。
  - [ ] fetch 只在 `lib/sync/api-client.ts`（`grep -rn "/api/scoreboard" nextjs-pickball --include=*.ts* | grep -v test` 只命中雲端 hook 的路徑字串，且實際請求經 `requestJson`）。
  - [ ] 計時器在卸載時清除；沒有 setState-after-unmount 警告。
  - [ ] E2E 沒有 `waitForTimeout`；以 `data-sync-status` 或文案等待。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 只有 6.4 授權的一句。
  - [ ] 指令驗收 C1～C8 皆有紀錄；E2E 既有 test 數與基線一致、新增 test 全 passed。
  - [ ] 兩份 CLAUDE.md 已同步，且「交接給 B6～B9」的六點在文件中找得到對應段落。
  - [ ] 前後端、核心套件三處的命名一致（`VERSION_CONFLICT`、`INVALID_BODY`、`SyncStatus` 值）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取，SHALL NOT 以 skip 當作通過。
  - 需要改動本機 hook 本體或 `lib/scoreboard/storage.ts` 才能完成 → 停止並升級（違反零迴歸前提）。
  - 需要新增 npm 相依 → 停止並升級。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
