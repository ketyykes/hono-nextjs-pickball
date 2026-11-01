# Execution Plan: history-filter-retention

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、授權修改的既有測試清單、訪客路徑零變更與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「焦點斷言的共同要求」「E2E 攔截的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/match-history/spec.md`「登入時歷史以雲端為準」中 `RemoteHistoryView` 的段落與四個新增 Scenario、改寫的「雲端歷史：載入失敗時歷史頁顯示錯誤」、既有「雲端歷史：兩種空狀態」「損毀提示：雲端回應的 droppedCount 大於 0 時顯示相同提示」（主 spec「損毀歷史紀錄的可見提示」）。
   - §3 → 本 change `specs/player-stats/spec.md`「統計依區間篩選」全文；主 spec `player-stats`「空狀態的呈現」。
4. **相關 design 片段**：§2 → Decision 1、2、5，Risks 第 2、4 條；§3 → Decision 1、3、4、5，Risks 第 1、2、4 條；§4 → Migration Plan。
5. **既有介面與範本**（全文貼上）：`components/matchmaker/RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`、`HistoryRangeFilter.tsx`、`components/sync/SyncStatusNotice.tsx`、`lib/sync/sync-status.ts`、`hooks/useRemoteHistory.ts` 的匯出型別；
   §2 另貼 `RemoteHistoryView.test.tsx` 全文，§3 另貼 `RemoteStatsContent.test.tsx` 全文；§2、§3 皆貼 `tests/e2e/user-data/history-sync.spec.ts` 全文（helper `seedCloudPlayers`、`playOneMatch`、`isHistoryGet` 沿用，不另寫）。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、前一個 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/history-filter-retention`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：阻斷分支改回 early return（不含篩選器）；阻斷時改用另一份篩選器實例（包進不同的父元素）；阻斷時移除損毀提示槽位（改走不同結構，使篩選器的子節點索引改變）；阻斷時顯示損毀提示；阻斷時仍渲染紀錄卡片或空狀態；`data-sync-status` 寫死為 `synced`；篩選器 `onChange` 改為 no-op。
   - §3：歷史阻斷分支改回 early return；名單阻斷也改為保留標題與篩選器（應由既有名單阻斷 it 轉紅）；歷史阻斷時不顯示標題；歷史阻斷時仍渲染排行榜；`total === 0` 時也顯示篩選器（應由既有 regression guard 轉紅）；篩選器槽位條件改為只看 `total !== 0`（`loading`／`load-failed` 且 `total === 0` 時隱藏篩選器，須轉紅）；阻斷時改用另一份篩選器實例；名單／歷史優先序對調。
   - 另放至少一條等價變異作對照組（例：調換兩個互斥條件的書寫順序）。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。元件層用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加 `--`**。單檔 E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/history-sync.spec.ts`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動** `HistoryView.tsx`、`LocalStatsContent.tsx`、`HistoryRangeFilter.tsx`、`components/sync/**`、`hooks/**`、`lib/**`、`app/**`、後端與核心套件。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的三處。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：只改兩個元件的 JSX 結構與兩個測試檔、一個 E2E 檔，有現成範本；難點只在「篩選器位置穩定」與 E2E 依區間攔截請求，sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - E2E 的請求暫停／放行在 `user-data` project 不穩定（同一條 test 連續兩次結果不同）。
  - 焦點 it 在 GREEN 後仍紅、且無法以 React 樹結構解釋。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只改了 tasks 檔頭授權的三處既有斷言；名單阻斷 it 與 `roster-sync.spec.ts` 一行未改且仍綠。
  - [ ] `git diff main --stat` 只含兩個元件、兩個元件測試檔、`history-sync.spec.ts`（§4 另含 `nextjs-pickball/CLAUDE.md`）。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增與改寫的 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）。
  - [ ] GREEN 只滿足 RED：沒有重試按鈕、沒有改 hook、沒有改文案、沒有動訪客元件（scope creep）。
  - [ ] 名單阻斷維持整段取代（Decision 3 界線）；`total === 0` 時統計頁不顯示篩選器（Decision 4）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：React 樹位置穩定與焦點這類細節，最需要最強模型抓邊界。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是「另一份篩選器實例」與「名單阻斷併入保留分支」兩條。
  - [ ] 篩選器在各狀態下位於同一父元素的同一位置；沒有以 `useEffect`／`ref.focus()` 補焦點。
  - [ ] 沒有巢狀三元運算（專案編碼風格：改用 if/else 或具名變數）；條件式命名清楚（例：`isHistoryBlocking`）。
  - [ ] E2E 依區間攔截而非依次數；暫停有放行；沒有 `waitForTimeout`。
  - [ ] 註解只寫理由，舊註解「標題只在有可信資料時顯示」已依 Decision 3 更新。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完全部 commit，確認兩個元件的寫法一致、合併後範圍不越界。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 兩個元件的阻斷判定與內容槽寫法一致，沒有各自發明一套。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋8、user-data E2E＝基線＋2、五個 browser project 數量不變且全綠。
  - [ ] `nextjs-pickball/CLAUDE.md` 的敘述與新行為一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 實作上發現必須改 hook、共用元件或訪客元件才能達成 → 停止並升級（屬範圍變更）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
