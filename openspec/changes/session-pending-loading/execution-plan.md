# Execution Plan: session-pending-loading

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組（§2、§3、§4）派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 與 §5 由 leader 自己執行或各派一個 Implementer，§1 結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成（§2.1 的 RED import 尚不存在的模組，是型別紅燈），leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**，連同檔頭全部說明（TDD 規則、雙鎖寫法、授權修改的既有測試清單、Stop hook 注意事項）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「等待中 mock 的共同寫法」「localStorage 隔離」「E2E 攔截的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/auth/spec.md` 全文、`specs/user-data-sync/spec.md` 的「前端依 session 選擇儲存模式」、`specs/data-transfer/spec.md` 新增的「不屬清除範圍的 key」段落與 Scenario。
   - §3 → `specs/user-data-sync/spec.md`「session 確認前的等待中畫面」的選擇器段落與前四個 Scenario、三個 E2E Scenario；`specs/player-roster/spec.md`、`specs/round-lifecycle/spec.md` 改寫的第一段；主 spec `scoreboard`「登入時獨立計分板以雲端為準」第一段。
   - §4 → `specs/user-data-sync/spec.md`「session 確認前的等待中畫面」的頁面與元件段落與對應六個 Scenario。
4. **相關 design 片段**：§2 → Decision 1、2、3、4、7、8、9，Risks 第 2、3、7 條；§3 → Decision 5、9，Context 第 6 點（回填 effect），Risks 第 5、8 條；§4 → Decision 1 表格、Decision 6；§5 → Migration Plan、Non-Goals。
5. **既有介面與範本**（全文貼上）：
   - §2：`lib/auth/session-store.ts`、`lib/auth/session-client.ts`、`lib/sync/storage-mode.ts`、`hooks/useSession.ts` 與四個對應測試檔全文；`lib/matchmaker/storage-keys.ts`（命名慣例與 `hasLocalStorage` 寫法）；`lib/matchmaker/transfer-storage.ts` 的 `CLEAR_ALL_KEYS` 段落與其測試檔的 `clearAllLocalData` 相關 it。
   - §3：`hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`（選擇器段落與 `UseRoundStoreResult`）、`hooks/useScoreboardStore.ts` 全文；三個測試檔的「儲存模式選擇器」describe 全文；
     `hooks/useRemoteRosterStore.ts`、`hooks/useRemoteRoundStore.ts` 的回傳段落與未就緒防線；`app/matchmaker/players/page.tsx` 的 loading 分支；`tests/e2e/user-data/roster-sync.spec.ts` 檔頭與 helper；`tests/e2e/specs/matchmaker-local-mode.spec.ts`（訪客 spec 寫法）；`tests/e2e/specs/navbar-account-entry.spec.ts` 的 `/api/session` 攔截 helper（暫停與放行範本）。
   - §4：`components/matchmaker/HistoryModeSwitch.tsx`、`HistoryView.tsx`（根元素）、`app/matchmaker/stats/page.tsx`、`LocalStatsContent.tsx` 的 loading 分支、`JsonBackupSection.tsx`、`HistoryCsvSection.tsx`、`RosterCsvImportSection.tsx`、`LocalDataImportSection.tsx` 與既有三個測試檔全文；`components/sync/SyncStatusNotice.tsx`；`app/not-found.test.tsx`（頁面測試範本）。
6. **「不給你」清單**：其他群組 task、與本組無關的 capability spec、前一個 change 的 artifact、runbook 全文、overview.md。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/session-pending-loading`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir <workspace 絕對路徑>`、`git -C <repo>`）。單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：① `resolveStorageMode` 的 loading 分支忽略提示（恆回 `"local"`）；② `getServerSnapshot` 改回傳 client 快照（帶提示）；③ 採用回應時不論是否登入都寫入提示；④ 把提示的寫入／清除移到 `requestId` 守衛之前；⑤ 逾時計時器到期不通知訂閱者（或不排計時器）；⑥ `signOut` 不論成功與否都清除提示。
   - §3：① 名單等待中改回傳本機結果（只把 `syncStatus` 改成 `loading`）；② 名單等待中 `syncStatus` 改回 `local`；③ 回合等待中改回傳本機結果（`round` 非 null）；④ 計分板等待中綁定狀態改用本機判定（`missing`）；⑤ 計分板等待中 `dispatch` 改用本機 dispatch；⑥ 名單在 session 確認為未登入後仍回傳等待中結果。
   - §4：① `HistoryModeSwitch` 等待中改掛 `HistoryView`；② 統計頁入口等待中改掛 `RemoteStatsContent`；③ `JsonBackupSection` 等待中改走本機分支；④ `HistoryCsvSection` 等待中仍渲染「匯出 CSV」；⑤ `RosterCsvImportSection` 等待中仍渲染選檔；⑥ `LocalDataImportSection` 的 `isRemote` 改為 `mode !== "local"`（由 regression guard 轉紅）。另：把提示加入 `CLEAR_ALL_KEYS`（§2 的 regression guard 須轉紅，§2 一併做）。
   - 每組另放至少一條等價變異作對照組（例：把 `mode === "pending"` 改寫為 `mode !== "local" && mode !== "remote"`、或調換兩個互斥分支的書寫順序），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，**只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`**。**E2E 失敗不得自行判定為雜訊**，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`／`afterEach` 亦同）。**E2E SHALL NOT 使用 `waitForTimeout`**。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。**測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
j. **SHALL NOT 新增任何 npm 相依**；SHALL NOT 改動 proposal Impact「不改」清單中的檔案（`hooks/useSession.ts`、`LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、`lib/matchmaker/transfer-storage.ts`、雲端 hook、`components/sync/**`、`lib/sync/sync-status.ts`、`Scoreboard.tsx`、參賽者與對戰頁的 `page.tsx`）、後端與核心套件。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的兩處 `beforeEach` 加 `localStorage.clear()`。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：每組都有現成範本（session store 既有 resolver 測試、選擇器既有 describe、區塊元件既有 mock），難點集中在 hydration 測試、fake timers 與 E2E 攔截，sonnet 足以勝任。
- **upgrade_to_sonnet_when**：（已是 sonnet）
- **upgrade_to_opus_when**:
  - hydration it 在 GREEN 後仍紅、或出現無法以 `useSyncExternalStore` 行為解釋的 hydration 警告。
  - E2E 在 `user-data` 或 webkit 系 project 同一條連續兩次結果不同。
  - 既有 E2E 出現新失敗且原因不明。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只做了 tasks 檔頭授權的兩處既有測試修改。
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` 只含本組在 proposal Impact 中的檔案。
  - [ ] `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。
  - [ ] 沒有新增文案、沒有巢狀三元運算、註解只寫理由。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 已誠實標註。
  - [ ] GREEN 只滿足 RED：沒有新文案、沒有新 hook、沒有改後端、沒有順手改登入入口或匯入流程（scope creep）。
  - [ ] 提示只存 `"1"`、不含個資；server snapshot 不帶提示；逾時為 10 秒；`signOut` 只在 2xx 清除（§2）。
  - [ ] 等待中三個選擇器都不啟用雲端 hook，回合等待中 `round` 為 `null`，計分板綁定為 `pending`（§3）。
  - [ ] `LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、`transfer-storage.ts` 未改動（§2、§4）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：hydration、計時器與 module 層級狀態的邊界（測試隔離、快取參考穩定、計時器清除）最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是 §2 ② ④、§3 ③ ⑤、§4 ⑥ 與對照組。
  - [ ] `getSnapshot` 在未變更時回傳同一個參考；模組載入時不碰 localStorage；`resetSessionStoreForTests` 清除計時器與快取。
  - [ ] 提示讀寫只經 `session-hint.ts`；所有 localStorage 例外都被吞下。
  - [ ] 三態分流沒有巢狀三元運算（專案編碼風格）；判斷位於所有 hook 呼叫之後。
  - [ ] E2E 以 Promise resolver 暫停、`try／finally` 放行、`unrouteAll` 收尾；斷言順序先以等待中元素確認 hydration 完成；沒有 `waitForTimeout`。
  - [ ] 舊註解（「session 載入中一律視為本機」「session 載入中視為本機，訪客首屏時序不因等待 /api/session 而改變」等）已依新行為更新。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完三組 commit，確認三態在 lib、hooks、元件三層的寫法一致、合併後範圍不越界。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] C6 使用端清單恰為 9 處且每處都有測試；沒有第十個使用端漏掉 `pending`。
  - [ ] 三層對 `pending` 的命名與判斷寫法一致，沒有各自發明一套（例：有的比 `"pending"`、有的比 `status === "loading"`）。
  - [ ] 指令驗收 C1～C8 皆有紀錄；前端測試數＝基線＋20、檔數＝基線＋4；user-data E2E＝基線＋1；五個 browser project 各＝基線＋2 且全綠。
  - [ ] `nextjs-pickball/CLAUDE.md` 的敘述與新行為一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是 `user-data` 中 reload 後的斷言，design Risks 第 5 條）→ 證據上報 coordinator 裁定，不得自行改既有 spec。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 實作上發現必須改 proposal「不改」清單中的檔案、新增文案或新增 hook 才能達成 → 停止並升級（屬範圍變更）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。每次 Agent 呼叫明確帶 `model`。
