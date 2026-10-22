# Execution Plan: matchmaker-history-stats-backend

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；`refactor:`；設定層與例外層 `chore:`；文件 `docs:`；4.6 的主 spec 同步用 `docs(openspec):`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**本批在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「訪客路徑零迴歸」、允許修改的既有 it 清單與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改；後端組另貼「後端 API 授權覆蓋表」；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2 → `match-history`「登入時歷史以雲端為準」中 `rangeBounds` 與 schema 段落；主 spec `match-history`「歷史區間切點計算」「五個區間互斥且完整覆蓋」
   - §3 → `match-history`「登入時歷史以雲端為準」全文；主 spec `user-data-sync` 全文
   - §4 → 同上；`pickleball-guide-page` MODIFIED 全文
   - §5 → `match-history` 三個 Requirement 全文；`player-stats` 三個 MODIFIED 全文；主 spec `player-stats`「出場、勝負與勝率的計算」（平局）
   - §6 → `data-transfer` MODIFIED 全文；`player-roster` MODIFIED 全文
   - §7 → 上列 E2E Scenario；主 spec `dev-workflow`「E2E 登入夾具」
4. **相關 design 片段**（對照表）：§2 → Decision 1、6；§3 → Decision 2、Open Questions 1；§4 → Decision 1、3；§5 → Decision 3；§6 → Decision 4、5；§7 → Decision 3、Open Questions 2；§8 → 「交接給 B9」、Migration Plan。
5. **既有介面**：§2 貼核心 `history-range.ts` 全文；§3 貼 B7 的 `src/routes/matchmaker.ts`、`test/matchmaker-score.test.ts` 的 seed 與授權三類 it（範本）；
   §4 貼 `lib/sync/{api-client,sync-status,storage-mode}.ts` 的匯出簽章、`hooks/useRemoteRoundStore.ts`（範本）；
   §5 貼 `components/matchmaker/{HistoryView,EmptyHistory,HistoryRangeFilter,PlayerStatsTable}.tsx` 全文、`app/matchmaker/stats/page.tsx` 全文、`lib/matchmaker/player-stats.ts` 的匯出簽章；
   §6 貼 `lib/matchmaker/remote-transfer.ts`、`hooks/useRemoteRosterStore.ts` 的重置段、`lib/matchmaker/storage.ts`、`components/matchmaker/HistoryCsvSection.tsx` 全文；
   §7 貼 `tests/e2e/user-data/round-sync.spec.ts`（範本與 helper）、`tests/e2e/specs/{matchmaker-history,player-stats,round-timer}.spec.ts` 的操作 helper 段。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B7 的 artifact、B9 的 artifact、未修改 capability 的 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/matchmaker-history-stats-backend`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：`rangeBounds` 的任一界線改用相鄰切點、`today.to` 改為 `now`；`HistoryQuerySchema` 拿掉 `from < to`；回應 schema 的 `winner` 拿掉 `"draw"`。
   - §3：拿掉 `user_id` 條件；`from` 改為 `>`、`to` 改為 `<=`；`desc` 的次排序改為 `rowid DESC`；`total` 改為篩選後筆數；損毀列改為丟出 500 或刪除該列；`order` 參數被忽略；`zValidator` 拿掉。
   - §4：包裝的查詢字串少帶 `to`；hook 不以 `rangeBounds` 而以 `computeRangeCutoffs` 直接取錯一個切點；不丟棄過期回應；401 不呼叫 `onUnauthorized`；停用時仍請求。
   - §5：損毀提示文案改一字；`total === 0` 判定改為 `items.length === 0`；雲端統計改為只算勝負不算和局（以 `winner === "teamA"` 判定勝方以外皆敗）。
   - §6：快照的 `history` 取本機或以 `desc` 請求；CSV 取本機；重置仍清本機歷史。
   - §7：頁面在本機模式也渲染雲端元件；統計頁雲端內容仍掛 `useRoundStore`。
   - **每個查詢參數、每個狀態碼分支、每個 `SyncStatus` 轉換都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組；每次變異後還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」三類測試（test-plan 授權覆蓋表）。
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
n. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的三個 it；本機元件與 `history-range.ts` 既有函式一行不改。
o. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
p. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
q. **後端 SHALL NOT 計算區間切點**（Workers 為 UTC）；區間只經核心 `rangeBounds`。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：唯讀端點與 hook 為 B5～B7 樣式的簡化版；難點只有區間界線的等價與競態。
- **upgrade_to_opus_when**:
  - §2：`rangeBounds` 與 `rangeOfTime` 的等價測試在跨月週或月初樣本失敗，且一次修正未果。
  - §7：E2E 的計時回合平局流程不穩定。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 本機元件零改動（`git diff main -- components/matchmaker/HistoryView.tsx` 無輸出；`history-range.ts` 只見新增）。
  - [ ] 所有 SQL 都帶 `user_id = c.var.user.id`；後端沒有任何 `new Date(y, m, d)`。
  - [ ] 三段 typecheck exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 授權覆蓋表三欄齊備（e）。
  - [ ] 雲端歷史端點沒有任何寫入路徑；統計頁雲端內容不掛回合 store。
  - [ ] 平局統計在雲端路徑有 E2E 守住，draw-followups 的 it 原樣通過。
  - [ ] 沒有 scope creep：沒有後端統計、沒有分頁、沒有匯入。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是界線的含／不含與次排序。
  - [ ] 過期回應的丟棄沒有遺留未取消的 Promise 造成 setState on unmounted。
  - [ ] fetch 只經 `requestJson`；歷史路徑字串只在 `lib/sync/history-api.ts`。
  - [ ] E2E 沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 只有 4.6 授權的一句；`rg resetLocalMatchProgress` 無結果。
  - [ ] 指令驗收 C1～C7 皆有紀錄；E2E 既有 test 數與基線一致、新增 6 條全 passed；8.2 平局守衛輸出已貼。
  - [ ] 兩份 CLAUDE.md 已更新；「交接給 B9」寫入文件。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E（尤其 `matchmaker-history.spec.ts`、`player-stats.spec.ts`）出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 需要改動本機 `HistoryView` 或 `history-range.ts` 既有函式才能完成 → 停止並升級。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
