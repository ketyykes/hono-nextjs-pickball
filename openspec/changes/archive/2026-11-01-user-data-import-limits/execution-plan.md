# Execution Plan: user-data-import-limits

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步（真紅燈），逐 task commit
（RED `test:`、GREEN `feat:`；`refactor:`；regression guard `test:`；E2E 與設定層 `test:`／`chore:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「授權修改的既有測試」「訪客路徑零變更」與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；含本組用到的指令驗收列與檔頭的授權覆蓋說明）。
3. **相關 spec 片段**（本 change 的 delta）：
   - §2 → `user-data-sync`「批次寫入端點的筆數與 body 上限」全文；「本機資料匯入雲端的 API」的「大小與筆數上限」段與 Scenario「共用的匯入參數形狀與位元組數」「共用的上限判定」；「使用者資料請求的預期帳號守衛」的錯誤碼段與 Scenario「錯誤碼常數含 ACCOUNT_MISMATCH」；`player-roster`「參賽者雲端 API」的「寫入雲端的參賽者 id」段與 Scenario「寫入雲端的參賽者 schema 只在邊界收緊 id」
   - §3 → `user-data-sync`「本機資料匯入雲端的 API」全文、「批次寫入端點的筆數與 body 上限」全文；`player-roster`「參賽者雲端 API」全文；主 spec `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」
   - §4 → `data-transfer` 兩個 MODIFIED Requirement 全文；`player-roster` Scenario「訪客本機名單照舊保留 id 為空字串的參賽者」
   - §5 → `data-transfer` Scenario「登入時以超過上限的 JSON 備份匯入雲端」；主 spec `dev-workflow`「E2E 登入夾具」
4. **相關 design 片段**：§2 → Decision 1、2、3、6、7；§3 → Decision 3、4、5、6 與「查證紀錄」；§4 → Decision 1（前後端判定一致的前提）、7、8；§5 → Decision 8；全組 → Risks 第 3、4 條。
5. **既有介面**：§2 貼核心 `src/api/{errors,players,import}.ts`、`src/matchmaker/{types,transfer-types}.ts` 全文與 `test/api/{errors,players,import}.test.ts`；
   §3 貼 `src/import/local-import-repository.ts`、`src/routes/{import,matchmaker}.ts`、`src/http/invalid-body.ts` 全文、`test/local-import.test.ts` 檔頭 helper 與「300 位參賽者與 2000 筆歷史可一次匯入」、`test/matchmaker-players.test.ts` 的「匯入遇到非主鍵衝突的資料庫錯誤時回 500」（替身寫法範本）、`test/helpers/matchmaker-fixtures.ts`；
   §4 貼 `lib/sync/{local-import,api-client}.ts`、`components/matchmaker/{local-import-view.ts,JsonBackupSection.tsx}`、`lib/matchmaker/remote-transfer.ts` 全文與各自測試檔的 helper；
   §5 貼 `tests/e2e/user-data/local-import.spec.ts` 全文、`tests/e2e/helpers/user-data.ts`。
6. **「不給你」清單**：其他群組 task、runbook 全文、其他 change 的 artifact、未修改 capability 的 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**（environment.md）：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/user-data-import-limits`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：`PAYLOAD_TOO_LARGE` 值改成別的字串；`PlayerWriteSchema` 拿掉 `.min(1)`；`PlayerImportRequestSchema` 或 `LocalImportRequestSchema` 改回 `PlayerSchema`；`serializeImportSegments` 任一段少一個欄位、`sortOrder` 改為 index+1、`playedAt` 改為原字串；
     `utf8ByteLength` 的 0x800／0x10000 分界各差一；`checkImportLimits` 的 `>` 改 `>=`、少量一段、改為加總判定、筆數上限差一；任一常數改值。
   - §3：body 上限 middleware 改用預設 `onError`；middleware 移到 `zValidator` 之後；`too-large` 判定移到 `db.batch()` 之後；repository 改回自行 `JSON.stringify`（C8 應抓到）；route 把 `too-large` 對應為 400 或 500；`players/import` 的筆數檢查差一或移除；`players/import` 改回 `PlayerSchema`。
   - §4：`oversize` 改回量原始陣列；`importLocalData` 把 413 歸為 `failed`、或把所有 4xx 歸為 `too-large`；`describeImportOutcome` 的 `too-large` 回 `failed` 文案；`importRemoteRoster` 的 413 回 `importFailed`；`importTooLarge` 內寫死數字（C8 應抓到）。
   - **每個上限、每個分類分支、每個邊界（恰等於與多一）都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 本 change 不新增端點；既有端點的四類授權測試 MUST 原樣通過（test-plan 檔頭）。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit；註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程出處。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm --filter ./packages/pickball-core typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 驗收一律依 project 分開跑：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`
   （chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`、`2/3`、`3/3`）；失敗不得自行判定為雜訊，證據上報。
j. **重負載雙鎖**：E2E、eslint、全套 vitest、build 一律先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，再 `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`，最後 `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py。單檔測試免鎖。
k. **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；只允許 `--local`、`--dry-run`。
l. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit。
m. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
n. **SHALL NOT 新增任何 npm 相依**（`hono/body-limit` 為既有 `hono` 內建）；需要時回報 `BLOCKED`。
o. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的三處；`PlayerSchema`、本機 reader、`backup.ts`、`transfer-storage.ts`、`roster-csv.ts`、`api-client.ts` 一行不改（C9）。
p. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。
q. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
r. **上限數字只在核心**：前後端產品程式碼 SHALL NOT 出現 `1_900_000`、`10_000_000`、`1_000_000`、`500` 等上限字面值；新寫的測試以核心常數組資料（既有測試中與上限無關的填充長度不改）。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：模式都有既有範本（核心 schema 契約、`batchFailingDb` 替身、`requestJson` 分類、view 文案）；難點在邊界資料的精確構造（恰好 1,900,000 位元組）與 workerd 中大型 body 的測試。
- **upgrade_to_opus_when**:
  - §3：大型 body（10MB）在 workerd 測試中逾時、或 `bodyLimit` 與 `zValidator` 的讀取順序與 design Decision 5 不符。
  - §4：「前端判定與後端一致」的測試因 zod 輸出不冪等而無法成立（MUST 先回報，不得放寬斷言）。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 上限數字只在核心（C8）；訪客路徑檔案零 diff（C9）。
  - [ ] 413 一律帶 `{ error: "PAYLOAD_TOO_LARGE" }`；超過上限時沒有任何 D1 寫入。
  - [ ] 三段 typecheck exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] RED 對應正確的 Scenario；GREEN 只滿足該 RED，沒有碰其他 Requirement。
  - [ ] 沒有 scope creep：沒有單筆端點的 body 上限、沒有分批匯入、沒有送出前預檢（design Open Questions 1、4）、沒有收緊 `PlayerSchema`。
  - [ ] 既有測試的修改只有 tasks 檔頭授權的三處。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是邊界（恰等於／多一）與判定位置（validator 前、batch 前）。
  - [ ] body 上限只有 `src/http/body-limit.ts` 一份；序列化只有核心一份。
  - [ ] `utf8ByteLength` 的代理字元處理與 `TextEncoder` 一致。
  - [ ] 錯誤處理：413 不經 `userDataOnError` 的純文字分支。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 三個群組的命名一致（`PAYLOAD_TOO_LARGE`、`too-large`、`tooLarge`、`importTooLarge` 的對應關係清楚）。
  - [ ] 指令驗收 C1～C9 皆有紀錄；E2E 既有 test 數與基線一致、新增 1 條 passed。
  - [ ] `hono-pickball/CLAUDE.md` 不再出現「單段 JSON 參數超過 D1 的 2MB 上限……500」的敘述；`nextjs-pickball/CLAUDE.md` 的 oversize 與結果分類敘述已改為核心判定與 `too-large`。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 需要修改 tasks 檔頭授權範圍以外的既有測試 → 停止並升級。

## Model selection principle

用能勝任該角色的最弱模型：Implementer `sonnet`、Spec Reviewer `sonnet`、Code-Quality Reviewer 與 Final Code Reviewer `opus`；**任何情況不得使用 `fable`**。
