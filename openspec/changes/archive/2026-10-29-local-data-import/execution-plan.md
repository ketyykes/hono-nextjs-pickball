# Execution Plan: local-data-import

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；`refactor:`；設定層與例外層 `chore:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本批在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「使用者定案」「訪客路徑零迴歸」與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；後端組另貼「後端 API 授權覆蓋表」；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2、§3 → `user-data-sync`「本機資料匯入雲端的 API」全文；主 spec `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」「使用者資料 API 的路由、授權與停用閘門」
   - §4 → `data-transfer`「登入後匯入本機資料到雲端」全文
   - §5 → `data-transfer` 兩個 Requirement 全文；主 spec `dev-workflow`「E2E 登入夾具」
4. **相關 design 片段**（對照表）：§2 → Decision 6；§3 → Decision 1、2、Risks 第 1、2 條、Open Questions 1、2；§4 → Decision 3、4；§5 → Decision 4、5、Open Questions 3；§6 → Migration Plan。
5. **既有介面**：§3 貼 B7 的 `src/matchmaker/batch-guard.ts`、`score-repository.ts`（範本）、`src/routes/matchmaker.ts` 的 sub-app 宣告段、`test/helpers/session.ts`、`test/matchmaker-score.test.ts` 的授權三類 it（範本）、
   核心 `transfer-types.ts`、`api/round.ts`；§4 貼 `lib/sync/api-client.ts` 的匯出簽章、本機 reader（`readRoster`、`readRound`、`readHistory`、`readScoreboard`）的簽章、`lib/matchmaker/backup.ts` 的 `parseBackup` 簽章；
   §5 貼 `components/matchmaker/JsonBackupSection.tsx` 全文、`app/matchmaker/{data,players}/page.tsx` 全文、`tests/e2e/user-data/history-sync.spec.ts`（範本）、`tests/e2e/helpers/user-data.ts`。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B8 的 artifact、未修改 capability 的 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/local-data-import`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：拿掉任一 `superRefine` 檢查（重複參賽者 id、重複歷史 matchId、孤兒分槽、已完成場次的分槽、空匯入）。
   - §3：守衛條件少一張表；守衛條件加入 `scoreboard_current`；守衛移到 batch 最後；任一 `json_each` 插入改為逐筆 `values`（應在大量資料 it 轉紅）；
     歷史插入拿掉 `ORDER BY key` 或 `played_at` 改用 0；獨立計分板改為覆寫（`DO UPDATE`）；任一插入拿掉 `user_id`；`version` 改為 0；sub-app 拿掉 `requireSession`；sub-app 拿掉 `requireExpectedUser`；守衛樣本表拿掉 `POST /api/import`；`skipped` 與 `imported` 對調。
   - §4：分槽改為也讀取已完成場次；歷史不去重或保留最後一筆；`oversize` 門檻改為 2,000,000 以上；成功後清除本機任一 key；409 分類為 `failed`；401 分類為 `failed`；`expectedUserId` 改為固定字串或不傳。
   - §5：本機模式也渲染匯入區塊；參賽者頁在雲端名單非空時仍顯示提示；JSON 還原的雲端分支寫入本機；兩個元件未授權時不呼叫 `refresh()`；以固定或過期的 user id 呼叫；user id 為 `null` 時仍送出。
   - **每個拒絕條件、每個分類分支、每個使用者定案都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」「X-Expected-User-Id 缺少／不符 401 ACCOUNT_MISMATCH」四類測試（test-plan 授權覆蓋表）。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit；註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 與 `pnpm --filter ./hono-pickball typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。單檔 E2E 一律 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> [樣式...]`；
   完整 E2E 依 runbook「每開一個新 change 的標準流程」第 4 步；失敗不得自行判定為雜訊，證據上報。
j. **禁止任何遠端 CF 操作**；`wrangler d1` 一律帶 `--local --env local`。
k. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit；E2E 的備份 fixture 不得含任何帳密。
l. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
m. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
n. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的一條 E2E；本機 reader 一行不改。
o. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By；apply §1 依使用者指示修正）。
p. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
q. **使用者定案不得變更**：匯入成功後保留本機資料；雲端已有對戰分配機資料時拒絕（不覆寫、不合併）。實作上遇到與定案衝突的需要時停止並升級。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：沿用 B7 的守衛與 B5～B8 的 sub-app 樣式；新的難點是 `json_each` 插入的 drizzle 寫法與 E2E 的本機資料 seed。
- **upgrade_to_opus_when**:
  - §3：`json_each` 插入或 `RETURNING` 在 batch 中的行為與 design 不符，或大量資料 it 超過 D1 限制。
  - §5：E2E 在登入態下 seed 本機資料的時序不穩定。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 本機 reader 與 `JsonBackupSection` 本機分支零改動；匯入流程沒有任何本機寫入或清除。
  - [ ] 所有 SQL 都帶 `user_id = c.var.user.id`；batch 的陳述式數量不隨資料筆數增加。
  - [ ] 三段 typecheck exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 授權覆蓋表三欄齊備（e）。
  - [ ] 三個使用者定案各有 integration 與 e2e 測試。
  - [ ] 沒有 scope creep：沒有覆寫／合併選項、沒有自動匯入、沒有新錯誤碼、沒有新 hook。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是守衛條件的範圍與 `json_each` 的順序。
  - [ ] 守衛與錯誤分類重用 `batch-guard.ts`，沒有第二份。
  - [ ] fetch 只經 `requestJson`；匯入路徑字串只在 `lib/sync/local-import.ts`。
  - [ ] E2E 沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動（本 change 無授權同步）。
  - [ ] 指令驗收 C1～C7 皆有紀錄；E2E 既有 test 數與基線一致（扣除授權刪除的 1 條）、新增 5 條全 passed。
  - [ ] 兩份 CLAUDE.md 已更新；B1～B9 全部完成後的「登入前後資料流」敘述前後一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 任何與使用者定案（保留本機、拒絕不覆寫不合併）衝突的需要 → 停止並升級給人類。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
