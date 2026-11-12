# Execution Plan: local-fallback-export-reminder

## Mode

`subagent-driven`

本 change 只有**一組**實作（§2：RED 改寫字面值斷言、GREEN 改常數、文件同步），派一個全新 Implementer 一次做完，逐 task commit
（`test:`（RED）、`feat:`（GREEN）、`docs:`）。完成後 Stage 1 → Stage 2；再由 Final Code Review 一次看完整個 diff。
§1 與 §3 由 leader 自己執行。**不用 git worktree**：在主 repo 的 `change/local-fallback-export-reminder` 分支上依序進行。
RED 只是字面值斷言，不產生型別錯誤，Stop hook 不會擋；仍以每個 task 結束時 `tsc` exit 0 為準。

## Per-task contract

subagent 不繼承主對話 context。派工時 MUST **逐字貼進 prompt**：

1. **tasks.md §2 完整文字**，連同檔頭全部說明（TDD 規則、雙鎖寫法、授權改寫的一個既有 it）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「授權改寫的既有測試」＋指令驗收 C6、C8、C9。
3. **相關 spec 片段**：本 change `specs/user-data-sync/spec.md` 的「session 無法確認時的阻擋畫面與本機備援」中「顯示狀態與文案」段落與兩個含新文案的 Scenario（固定值、本機提示只在本機備援時出現）。
4. **相關 design 片段**：Context、Decision「只改 `LOCAL_FALLBACK_NOTICE` 常數的字面值」與「匯入端字樣採實際 UI 字樣」、Risks 的第一條。
5. **既有介面與範本**（全文貼上）：`nextjs-pickball/lib/sync/sync-status.ts`、`nextjs-pickball/lib/sync/sync-status.test.ts` 的「無法確認的顯示狀態」describe、`nextjs-pickball/CLAUDE.md` 儲存三態條目中含「重新整理頁面可再次連線雲端」的那一段。
6. **「不給你」清單**：§1、§3 的 task、與本組無關的 capability spec、前一個 change 的 artifact、overview.md。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/local-fallback-export-reminder`（environment.md）。
   禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir <workspace 絕對路徑>`、`git -C <repo>`）。單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時會 "No projects matched" 且 exit 0）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（單檔 `sync-status.test.ts`）：
   ① `LOCAL_FALLBACK_NOTICE` 改回舊文案；② 新文案的「資料」改成別的名稱（例如「設定」）；③ 新文案漏掉「匯出 JSON 備份」；④ 新文案把「請先」與「重新整理」的順序對調或漏掉句號；
   另放至少一條等價變異作對照組（例：把同一個字串拆成兩段以 `+` 串接、或改成相同內容的模板字串），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同；改寫的既有 it 確認 RED 前為舊字面值、RED 後為新字面值）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 E2E（只在 coordinator 要求時）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec 路徑> [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，**只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`**。**E2E 失敗不得自行判定為雜訊**，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`（`beforeEach`／`afterEach` 亦同）。**E2E SHALL NOT 使用 `waitForTimeout`**。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。**測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
j. **SHALL NOT 新增任何 npm 相依**；SHALL NOT 改動 proposal Impact「不改」清單中的檔案（`components/sync/**`、`components/matchmaker/**`、`hooks/**`、`lib/auth/**`、`lib/matchmaker/**`、`app/**`）、後端與核心套件、`openspec/specs/**` 與 `openspec/schemas/**`。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的 `sync-status.test.ts` 那一個 it 的字面值。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：改一個字面值與一處測試斷言、一處文件，現成範本齊全；沒有邏輯或時序風險，sonnet 足以勝任。
- **upgrade_to_sonnet_when**：（已是 sonnet）
- **upgrade_to_opus_when**:
  - 同一組被同一 reviewer 連續退回 2 次。
  - 單檔 vitest 在 GREEN 後仍紅且無法以字面值差異解釋。
- **self-review checklist**（自查準則，不逐項勾選；實際結果見 tasks.md 各 task 紀錄）：
  - [ ] RED 的紅燈輸出已貼出，標明「改寫既有 it」且為真紅。
  - [ ] 文案與 delta spec 逐字相同（含全形標點、半形空格）。
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` 只含 `sync-status.ts`、`sync-status.test.ts`、`nextjs-pickball/CLAUDE.md` 與本 change artifact。
  - [ ] `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**（審查準則，不逐項勾選；實際結論見 tasks.md 2.5 紀錄）：
  - [ ] 常數字面值與 delta spec 逐字相同；`LOCAL_FALLBACK_ACTION_LABEL` 與 load-failed 文案未變。
  - [ ] RED 對應「固定值」Scenario，且為真紅（依 e 機械複驗）。
  - [ ] GREEN 只改常數字面值：沒有改 `LocalFallbackBanner`、沒有加連結或按鈕、沒有新增文案常數（scope creep）。
  - [ ] 「不改」清單中的檔案未改動。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：與 Final 同為 opus，獨立做 mutation 並確認常數是唯一字面值來源。
- **required first action**：同 Stage 1。
- **review checklist**（審查準則，不逐項勾選；實際結論見 tasks.md 2.5 紀錄）：
  - [ ] 獨立 mutation（b～d），含對照組。
  - [ ] 產品碼與測試中舊文案已消失，其他引用處（`LocalFallbackBanner.test.tsx`、`data-pending.spec.ts`）仍經常數引用而非抄字面值。
  - [ ] `nextjs-pickball/CLAUDE.md` 的敘述與新文案一致，沒有留下舊句。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：確認合併後範圍不越界、指令驗收完整。
- **when**：所有 task 勾完後一次。
- **review checklist**（審查準則，不逐項勾選；實際結論見 tasks.md 3.x 紀錄）：
  - [ ] `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat` ⊆ proposal Impact；主 spec 與 schemas 無任何改動。
  - [ ] C6～C9 的結果與 test-plan 一致；前端測試數與檔數＝基線。
  - [ ] 新文案與 `section-nav.ts` 的「資料」、資料頁實際字樣一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是 `data-pending.spec.ts` 的本機備援那條、mobile project 的可見性斷言）→ 證據上報 coordinator 裁定，不得自行改既有 spec。
  - 實作上發現必須改 proposal「不改」清單中的檔案、加連結或按鈕才能達成 → 停止並升級（屬範圍變更）。

## 合併前流程（coordinator）

1. 全瀏覽器 gate：矩陣檔 `/tmp/cgate-local-fallback-export-reminder.e2e` 由 coordinator 準備，執行 `/tmp/cgate2.sh local-fallback-export-reminder`，結果寫進 tasks §3。
2. Final Code Review（opus）。
3. `/opsx:verify`：critical／warning／suggestion 全部處理完（逐項查證、修正並 commit）才進下一步。
4. `git merge --no-ff change/local-fallback-export-reminder`（在 `main`）→ archive。**不 push**（push 即觸發正式站部署，由使用者決定）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。每次 Agent 呼叫明確帶 `model`。
