# Execution Plan: matchmaker-round-score-backend

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；`refactor:`；設定層與例外層 `chore:`；文件 `docs:`；8.6 的主 spec 同步用 `docs(openspec):`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本批在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「訪客路徑零迴歸」、允許修改的既有 it 清單與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；後端組另貼「後端 API 授權覆蓋表」；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2 → `user-data-sync`「多筆使用者資料的逐筆版本化契約」；`round-lifecycle`「回合與送出比分的雲端 API」的 schema 段落
   - §3 → `backend-database` ADDED 全文；`user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」全文；主 spec `user-data-sync`「使用者資料表的命名與欄位慣例」
   - §4 → `round-lifecycle`「回合與送出比分的雲端 API」全文；`match-history` MODIFIED 全文；主 spec `user-data-sync` 全文
   - §5 → 同 §4；`round-lifecycle`「比分送出的完成流程」MODIFIED 全文；`match-rating` MODIFIED 全文；`user-data-sync`「後端多表寫入…」全文
   - §6 → `round-lifecycle`「登入時回合與場次分槽以雲端為準」全文；`player-roster` 兩個 MODIFIED 全文
   - §7 → `round-lifecycle`「登入時回合與場次分槽以雲端為準」與「回合與歷史的持久化與損壞降級」全文
   - §8 → `scoreboard` 兩個 MODIFIED 全文；`pickleball-guide-page` MODIFIED 全文
   - §9 → `data-transfer` MODIFIED 全文
   - §10 → 上列 E2E Scenario；主 spec `dev-workflow`「E2E 登入夾具」；`round-lifecycle`「計分板結果的自動回填共用送出 pipeline」與「開始計分後鎖定本輪目標分數」（主 spec，未修改）
4. **相關 design 片段**（對照表）：
   - §2 → Decision 11
   - §3 → Decision 1、2；Open Questions 1、3
   - §4 → Decision 4、5；Open Questions 2
   - §5 → Decision 2、3、10；Risks 第 1、6 條
   - §6 → Decision 6、7、10
   - §7 → Decision 6、7、8、9；Risks 第 3、5 條
   - §8 → Decision 8、9
   - §9 → Decision 10
   - §10 → Decision 8；Risks 第 2 條；Open Questions 4
   - §11 → 「交接給 B8～B9」全文、Migration Plan
5. **既有介面**：§3～§5 貼 B6 的 `src/routes/matchmaker.ts`、`src/matchmaker/players-repository.ts`、`test/helpers/session.ts`、`test/matchmaker-players.test.ts` 的授權三類 it（範本）、
   核心 `submitScore` 的型別與失敗碼；§6～§8 貼 `lib/sync/{api-client,latest-wins-saver,sync-status,storage-mode}.ts` 的匯出簽章、`hooks/useRemoteRosterStore.ts` 與 `hooks/useRemoteScoreboardStore.ts` 全文（範本）、
   `hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、`hooks/useRosterStore.ts` 全文、`lib/matchmaker/scoreboard-binding.ts` 的匯出簽章；§9 貼 `lib/matchmaker/remote-transfer.ts` 全文；
   §10 貼 `app/matchmaker/page.tsx`、`components/matchmaker/CourtCard.tsx` 全文、`tests/e2e/user-data/roster-sync.spec.ts`（範本）、`tests/e2e/specs/{match-stage,scoreboard-binding}.spec.ts` 的操作 helper 段。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B6 的 artifact、B8／B9 的 artifact、`player-stats` 等未修改 capability 的 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/matchmaker-round-score-backend`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：分槽 schema 的 `matchId` 改為 `nullable`；`roundVersion` 改為 `nonnegative`。
   - §3：任一新表拿掉 `onDelete: "cascade"`；分槽或歷史的主鍵改為單一 `match_id`；守衛表 `version` 拿掉 `notNull`；守衛陳述式改為 `INSERT OR IGNORE`；守衛的 `CASE` 改為恆真；
     `isBatchGuardViolation` 改為「任何錯誤皆為 true」。
   - §4：回合 PUT 拿掉完成狀態比對；孤兒分槽 DELETE 拿掉（或移出 batch 改為獨立 `run()`）、拿掉 `status != 'completed'`、拿掉 `user_id` 條件；分槽 v0 拿掉 `WHERE EXISTS`；
     分槽 PUT 拿掉 path 與 `data.matchId` 的比對；回合 update 的 `where` 拿掉版本條件；sub-app 拿掉 `requireSession`。
   - §5：守衛移到 batch 最後一條（應因讀到新 version 而失效轉紅）；守衛條件拿掉球員版本或回合版本任一項；歷史插入改為 `onConflictDoNothing`；拿掉刪除分槽；
     `now` 改用請求 body 的時間；失敗碼對應互換（400／409）；reset batch 少刪任一表；reset 拿掉 `user_id` 條件。
   - §6：包裝路徑互換；佇列不合併（每個 transform 各送一次）、合併 submit、送出時不重新套用（用排入時的回合資料）、`failed` 不重試、`conflict` 不清空；
     `applyRemotePlayers` 送出 PUT、遇到待送變更不重載；`resetLocalMatchProgress` 多移除回合 key。
   - §7：雲端 `submitScore` 經 `updatePlayer` 寫評分；休息次數在 PUT 前結算；同一場次重複排入；409 不呼叫 `reloadRemotePlayers`；load-failed 時仍送出；選擇器忽略 session；雲端模式寫入本機 key。
   - §8：分槽 hook 在 `missing` 時仍 PUT；409 重載回 null 時不轉 `missing`；選擇器在帶 `matchId` 時仍走本機。
   - §9：快照的 `currentRound` 取本機；回合讀取失敗時仍回傳快照。
   - §10：雲端模式回填後仍呼叫 `clearMatchSlots`；`CourtCard` 不等待 PUT 即導向；頁面在 local 也渲染 `data-sync-status`。
   - **每個端點、每個狀態碼分支、每個 `SyncStatus` 轉換、每條 batch 陳述式都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」三類測試（test-plan 授權覆蓋表）；以迴圈涵蓋多端點的 it，Reviewer MUST 確認迴圈內每個端點各自斷言（不是只斷言最後一個）。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit；註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 與 `pnpm --filter ./hono-pickball typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。單檔 E2E 一律 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> [樣式...]`；
   完整 E2E 依 runbook「每開一個新 change 的標準流程」第 4 步；失敗不得自行判定為雜訊，證據上報。
j. **禁止任何遠端 CF 操作**；`wrangler d1` 一律帶 `--local --env local`。
k. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit。
l. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
m. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
n. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的四個 it；本機 hook 本體一行不改。
o. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
p. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
q. **多表寫入 MUST 是單一 `db.batch()`**；SHALL NOT 以多次 `run()` 加 try/catch 補償達成原子性；守衛 SHALL NOT 用 `OR IGNORE`／`OR REPLACE`。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：後端端點與 hook 大多照抄 B5／B6；新的難點集中在整批守衛 SQL、命令佇列的重新套用與 React 19 Strict Mode 下的請求次數。
- **upgrade_to_opus_when**:
  - §3／§5：守衛 batch 的行為與 design Decision 2 不符（例：NOT NULL 違反未使整批回滾、錯誤訊息無法分類），或 drizzle 無法在 batch 中表達守衛陳述式。
  - §6／§7：命令佇列的重新套用與樂觀顯示在 Strict Mode 下出現重複請求或顯示錯亂，且一次修正未果。
  - §10：自動回填與雲端送出的時序在 E2E 中不穩定。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 本機實作零改動（`git diff main -- hooks/useRoundStore.ts` 只見函式名稱一行與新增部分；`round-storage.ts`、`match-slots.ts`、`scoreboard-binding.ts`、核心 `round.ts`／`rating.ts` 無 diff）。
  - [ ] 所有 SQL 都帶 `user_id = c.var.user.id`；所有多表寫入是單一 batch 且守衛在第一條。
  - [ ] 三段 typecheck exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 授權覆蓋表六個端點三欄齊備（e）。
  - [ ] 雲端模式下前端沒有任何寫入評分、完成狀態或歷史的路徑；`updatePlayer` 只剩休息次數。
  - [ ] 平局（`"draw"`、`S = 0.5`）在雲端路徑有測試守住。
  - [ ] 沒有 scope creep：沒有歷史讀取 API、沒有匯入、沒有新錯誤碼。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是守衛位置與條件的變異。
  - [ ] 守衛條件只讀資料庫目前內容，沒有把 batch 外讀到的值當成「已驗證」。
  - [ ] 命令佇列在卸載與衝突時清乾淨，沒有遺留計時器；退避表不是第二份常數。
  - [ ] fetch 只經 `requestJson`；回合／分槽路徑字串只在 `lib/sync/round-api.ts`。
  - [ ] E2E 沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出（B5／B6 建立的 `lib/sync` 樣式即為既有風格）。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 只有 8.6 授權的一句。
  - [ ] 指令驗收 C1～C7 皆有紀錄；E2E 既有 test 數與基線一致、新增 6 條全 passed。
  - [ ] 兩份 CLAUDE.md 已更新，`hono-pickball/CLAUDE.md` 有整批守衛段落；「交接給 B8～B9」寫入文件。
  - [ ] B5～B7 的雲端 hook、repository、測試 helper 命名與結構一致（B8、B9 作者會照抄）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 守衛失敗未使整批回滾（1.4 實測與 Context7 不符）→ **停止並升級**，SHALL NOT 改用逐筆寫入＋手動補償，也 SHALL NOT 改用 trigger。
  - 需要改動本機 hook 本體或核心純函式才能完成 → 停止並升級。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
