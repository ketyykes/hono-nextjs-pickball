# Execution Plan: scoreboard-bound-game-over

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：2.1 的 RED 會讓 tsc 失敗（對 `GameOverDialog` 傳入尚不存在的 `matchId` prop），每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、範圍、既有測試一行不改與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「元件測試的共同要求」「E2E 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/scoreboard/spec.md` 的 ADDED「比賽結束對話框的動作」全文；MODIFIED「賽前設定與階段鎖定」中被修改的 RESET 那一段（只貼該段＋Scenario「重置需二次確認且解除鎖定」）；主 spec `scoreboard`「對戰場次綁定與失效處理」的「返回動線」與「失效處理」兩段。
   - §3 → 本 change `specs/scoreboard/spec.md` 全文（驗收 C7 用）。
4. **相關 design 片段**：§2 → Decision 1、2、4、5，Risks 第 1、2、4、6 條；§3 → Migration Plan、Risks 第 1 條。
5. **既有介面與範本**（全文貼上）：`components/scoreboard/GameOverDialog.tsx`、`GameOverDialog.test.tsx`、`components/scoreboard/Scoreboard.tsx`、`components/scoreboard/ScoreboardSetup.tsx`（「返回對戰」連結寫法的範本）、`lib/matchmaker/section-nav.ts` 的 `MATCHMAKER_ROUTE` 匯出；
   §2 另貼 `tests/e2e/specs/scoreboard-binding.spec.ts` 的 `/matchmaker 對戰頁的計分板接線` describe 全文（helper `seedRoster`、`generateRound`、`courtMatchId`、`clickWin` 沿用，不另寫）與 test「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」作為斷言範本。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、其他並行 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/scoreboard-bound-game-over`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2（元件層，單檔 vitest）：綁定判斷反轉（`matchId === null` 視為綁定）；綁定模式仍渲染「再來一局」；「返回對戰」`href` 改為 `"/matchmaker/players"`；綁定模式移除「關閉」；獨立模式也渲染「返回對戰」；獨立模式「再來一局」改為不呼叫 `onPlayAgain`。
   - §2（接線層，單檔 E2E chromium）：`Scoreboard` 不把 `matchId` 傳給 `GameOverDialog`；「返回對戰」加上 `onClick={onPlayAgain}`（先 RESET 再導航，應由「比分已回填」斷言轉紅）。
   - **對照組（預期存活的等價變異）**：`Scoreboard` 改傳 `state.matchId`（比賽結束時兩者相等，design Decision 1）；另放一條調換兩個互斥條件書寫順序的變異。存活時照實記錄，不視為缺口。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。元件層用單檔 vitest（輸出須含 `Test Files`）；接線層用單檔 E2E（雙鎖、`--project=chromium -g <test 名稱>`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it／test 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run components/scoreboard/GameOverDialog.test.tsx`，**`--run` 前不可加 `--`**。單檔 E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-binding.spec.ts [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動** `GameOverDialog.tsx`、`Scoreboard.tsx` 以外的產品檔（含 `ScoreboardSetup.tsx`、`MatchBindingNotice.tsx`、`components/ui/**`、`hooks/**`、`lib/**`、`app/**`、後端與核心套件）。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**（本 change 無例外；`GameOverDialog.test.tsx` 既有 it 的 `render` 呼叫也不改）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：只改一個呈現元件的 footer 分支與一行接線，外加 3 個元件 it、2 條 E2E，皆有現成範本；sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - 既有 test「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」或 `round-sync.spec.ts` 出現 strict mode violation（design Risks 第 1 條），且無法在不改既有 test 的前提下解釋。
  - 新 E2E 在同一 project 連續兩次結果不同。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者（預期 2 個 it）已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 既有 it／test 一行未改。
  - [ ] `git diff main --stat` 只含 `GameOverDialog.tsx`、`GameOverDialog.test.tsx`、`Scoreboard.tsx`、`scoreboard-binding.spec.ts`（與 `openspec/changes/scoreboard-bound-game-over/**` 的紀錄）。
  - [ ] 「返回對戰」以 `MATCHMAKER_ROUTE` 匯入、無 `onClick`、無 `transitionTypes`。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 誠實標註。
  - [ ] GREEN 只滿足 RED：獨立模式 footer 未變、沒有為「再來一局」加確認、沒有傳 `bindingStatus`、沒有改 `ScoreboardSetup`（scope creep）。
  - [ ] 綁定判斷來源為 `matchId` prop（Decision 1），不是 `state.matchId`。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：需要獨立 mutation 與判斷 E2E 時序（對話框淡出、strict mode）是否可靠。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是「`Scoreboard` 不傳 `matchId`」與「返回對戰加 `onClick={onPlayAgain}`」兩條必須轉紅。
  - [ ] 沒有巢狀三元運算（專案編碼風格：改用 if/else 或具名變數，例 `isBound`）。
  - [ ] 「返回對戰」寫法與 `ScoreboardSetup` 一致（`Button asChild` ＋ `Link` ＋ `MATCHMAKER_ROUTE`）。
  - [ ] E2E 以 `page.getByRole("dialog")` 為範圍、沒有 `waitForTimeout`、沿用既有 helper。
  - [ ] `GameOverDialog` 檔頭註解已更新為兩種模式的動作（只寫理由）。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：一次看完全部 commit，確認範圍不越界、指令驗收齊全。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋3、C5 各 project 數量符合期望且全綠。
  - [ ] `nextjs-pickball/CLAUDE.md` 的處理（不需更新）理由成立。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是 strict mode violation）→ 不得修改既有 test，證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 user-data spec 只能 skip → 停止並向 coordinator 索取。
  - 實作上發現必須改 `GameOverDialog.tsx`、`Scoreboard.tsx` 以外的產品檔才能達成 → 停止並升級（屬範圍變更）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。
