# Execution Plan: user-data-version-monotonic

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（RED `test:`、GREEN `feat:`；refactor `refactor:`；設定層 `chore:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「允許修改的既有測試」「訪客路徑零迴歸」與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；含本組用到的指令驗收列與檔頭說明）。
3. **相關 spec 片段**：
   - §2 → `backend-database` delta「版本下限資料表由 migration 建立」全文；主 spec `user-data-sync`「使用者資料表的命名與欄位慣例」
   - §3、§4 → `user-data-sync` delta「刪除後重建的使用者資料版本不得重複」全文；`user-data-sync` delta 三個 MODIFIED Requirement 中被修改的段落；`round-lifecycle` delta「回合與送出比分的雲端 API」的「分槽清理」「送出比分」「重置」三段與最後一個 Scenario；
     主 spec `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」
   - §5 → 無（文件與指令驗收）
4. **相關 design 片段**（對照表）：§1 → Context7 查證紀錄、Open Questions 3；§2 → Decision 2、7、Migration Plan；§3 → Context 全部（盤點、ABA 情境 R1～R4）、Decision 1、3、4、5、Risks 第 2、5 條；
   §4 → Context「ABA 情境」R5、Decision 1（「只在重置時提高下限」不選的理由）、Decision 3、Risks 第 1、3、5 條；§5 → Risks 第 1、6 條、Migration Plan。
5. **既有介面**：§2 貼 `src/db/schema.ts` 的 `syncBatchGuards` 宣告、`test/d1-schema.test.ts` 的「sync_batch_guards 的 version 不可為 NULL」「刪除使用者時其回合、分槽與歷史一併刪除」兩個 it（範本）、
   `packages/pickball-core/src/api/user-data-tables.ts` 全文；§3、§4 貼 `src/matchmaker/{batch-guard,players-repository,round-repository,slots-repository,score-repository}.ts` 與 `src/import/local-import-repository.ts` 全文、
   `test/helpers/{matchmaker-fixtures,session}.ts` 的匯出簽章、`test/matchmaker-players.test.ts`「重置以單一 D1 batch 送出四條刪除」與 `test/matchmaker-round.test.ts`「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」全文（spy D1 範本）、
   `test/local-import.test.ts` 的 `makePayload`／`postImport`／`makePlayer` 寫法；§5 貼 `hono-pickball/CLAUDE.md`「使用者資料 API」與「多表寫入用整批守衛」兩節。
6. **「不給你」清單**：其他群組的 task、B1～B9 的 artifact、runbook 全文、未修改 capability 的 spec、前端任何檔案（本 change 不改前端）。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/user-data-version-monotonic`（environment.md 的 `Worktree path`）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：`version` 加 `DEFAULT 0`（應在「version 不可為 NULL」轉紅）；FK 拿掉 `onDelete: "cascade"`；`USER_DATA_TABLES` 拿掉新表。
   - §3：重置 batch 拿掉提高下限的陳述式；提高下限放到四條 DELETE 之後；`UNION ALL` 少任一張表（players／round／slots 各一次）；拿掉外層 `WHERE v IS NOT NULL`（應在空資料重置轉紅：NULL 違反 NOT NULL）；改為 `coalesce(max(v), 0)` 且無外層 WHERE（應在「一位使用者的下限不影響他人」或「沒有任何資料時重置…」的「無下限列」斷言轉紅）；
     upsert 的 `max(既有, excluded)` 改為直接覆寫 `excluded.version`；下限查詢拿掉 `user_id` 條件；任一建立路徑的初始 version 改回常數 `1`（`putRound`、`putPlayer`、`importPlayers`、`putSlot`、`importLocalData` 三段各一次）；
     `importPlayers` 回應改回 JS 寫死的 `version: 1`；`importLocalData` 的歷史段改用下限（應在「歷史 version 為 1」轉紅）；匯入守衛條件加入 `sync_version_floors`；重置的 DELETE 加入 `sync_version_floors`。
   - §4：`deletePlayer` 拿掉提高下限（或改回單一陳述式不走 batch）；`deletePlayer` 的下限選取改為其他 id；`putRound` 拿掉提高下限；`putRound` 的下限選取條件與孤兒 DELETE 相反（`NOT IN` 改 `IN`）；
     `submitScoreForUser` 拿掉提高下限；下限陳述式移到刪除分槽之後；下限選取改為其他 `match_id`。
     註：「下限選取範圍比刪除範圍**大**」（例：選該使用者全部分槽）只會讓下限更高，屬安全方向、測試無法觀察，不列為必轉紅；但 Stage 2 MUST 確認實作的選取條件與刪除條件為同一份 SQL 片段或逐字相同。
   - **每條刪除路徑、每條建立路徑都要有至少一個會轉紅的變異**；另放一條等價變異當對照組（例：`WHERE v IS NOT NULL` 改為 `WHERE v NOT NULL`）。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 本 change 不新增端點；既有端點的四類授權測試 MUST 原樣通過（後端全套），不得修改。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。**嚴禁以「改斷言看紅再改回」偽造紅燈。**
g. 逐 task commit；註解只寫「為什麼」，繁體中文。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 與 `pnpm --filter ./hono-pickball typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；檔頭 `import "../src/index"`。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 依 project 分開跑：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`
   （chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`--shard=3/3`）；失敗不得自行判定為雜訊，證據上報。
j. **重負載雙鎖**：E2E、eslint、全套 vitest、build 一律先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，再 `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`，
   最後 `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py。單檔測試免鎖。
k. **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；`wrangler d1` 一律帶 `--local --env local`；只允許 `--local`、`--dry-run`。
l. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
m. 單檔測試 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`，**`--run` 前不可加 `--`**。
n. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
o. **既有 it 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的兩條 batch 大小斷言；前端（`nextjs-pickball/**`）一行不改。
p. Migration 只能由 `pnpm --filter ./hono-pickball db:generate --name sync_version_floors` 產生，SHALL NOT 手寫或手改 `drizzle/**`；產生後 MUST 執行 `db:migrate:local`。
q. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。
r. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：改動集中在後端 repository 的 SQL 陳述式與 batch 排列，沿用 B7 守衛與 B9 `json_each` 的既有寫法；難點是 drizzle 的 `insert().select().onConflictDoUpdate()` 與測試情境的建構，sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - §1 實測或 §3 GREEN 發現 drizzle 在 batch 內無法產生 design Decision 3 的 upsert（需要改寫 Decision）。
  - §4 `submitScoreForUser` 加入下限陳述式後既有守衛測試（`matchmaker-score.test.ts`）任一轉紅。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者（「沒有任何資料時重置…」「一位使用者的重置…」及既有 it）已點名標 regression guard。
  - [ ] it 名稱與 spec 驗收錨點逐字相同。
  - [ ] 每條提高下限的陳述式都在刪除之前、與刪除同一個 batch，選取條件與刪除條件相同；`putRound` 中在回合寫入之後。
  - [ ] 每條建立路徑的初始 version 都是同一條陳述式內的子查詢；回應的 version 為實際寫入值。
  - [ ] `scoreboard_current`、`matchmaker_history`、`sync_batch_guards` 的寫入未改；匯入守衛與重置 DELETE 不含 `sync_version_floors`。
  - [ ] 三段 typecheck exit 0；`git status --porcelain hono-pickball/drizzle` 在再跑一次 `db:generate` 後為空。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：比對 spec 與測試、實作需要中等判斷；本 change 的 scenario 數字（version 3、4、6）精確，逐一對照即可。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試，名稱逐字相同，斷言的 version 數值與 Scenario 相同。
  - [ ] RED 對應正確的 Scenario；GREEN 只為該 RED 所需，沒有順手改其他路徑。
  - [ ] 沒有 scope creep：沒有改前端、沒有改 `scoreboard_current`／`matchmaker_history`／`sync_batch_guards` 的寫入、沒有修 design Open Questions 2 的回合 PUT 缺口、沒有新端點。
  - [ ] 允許修改的既有斷言只有兩條。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：batch 內陳述式順序與 SQL 條件一致性的錯誤不易從測試結果看出，需要最強模型獨立做 mutation。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是陳述式順序、選取條件與刪除條件一致、空集合零列、`max` upsert。
  - [ ] 下限邏輯只有 `version-floor.ts` 一份；`putRound` 的孤兒條件只有一份 SQL 片段。
  - [ ] 守衛仍是 `submitScoreForUser` batch 的第一條、釋放守衛仍是最後一條。
  - [ ] 沒有 `db.run`／`db.all`（drizzle batch 限制）；`INSERT … SELECT` 搭配 upsert 時有 `WHERE`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完所有 commit，確認刪除／建立路徑全數涵蓋且沒有重複的下限實作。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] `grep` `hono-pickball/src` 中所有對 `matchmakerPlayers`／`matchmakerRound`／`matchmakerMatchSlots` 的 `delete(` 都在提高下限之後的同一個 batch；所有對三表的建立都用 `initialVersion`。
  - [ ] 指令驗收 C1～C7 皆有紀錄；E2E 數量與基線一致且全數 passed。
  - [ ] `hono-pickball/CLAUDE.md` 已加入版本下限規則，且與 delta spec 一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有後端測試（除兩條允許修改的 batch 大小斷言外）出現任何新紅燈 → 停止，證據上報 coordinator。
  - 既有 E2E 出現任何新失敗 → 先確認本機 D1 已套用 0004，再證據上報 coordinator 裁定。
  - 需要改前端或新增端點才能完成 → 停止並升級（超出 proposal 範圍）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 與 Spec Reviewer 用 `sonnet`、Code-Quality 與 Final 用 `opus`，**任何情況不得使用 `fable`**，也不用 `haiku`。
