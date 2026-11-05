# Execution Plan: round-timer-clear

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、範圍說明與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「fixture 的共同要求」「E2E 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：本 change `specs/round-lifecycle/spec.md`「回合計時器」中的取消計時規範段，以及該組對應的 Scenario（§2：前四個；§3：後三個）。
4. **相關 design 片段**：§2 → Decision 1、2，Risks 2、3；§3 → Decision 2、3，Risk 1、Non-Goals。
5. **既有介面與範本**（全文貼上）：
   - §2：`packages/pickball-core/src/matchmaker/round.ts` 的「計時設定」段（`SET_TIMER_DURATION_FAILURE_CODE` 至 `setTimerDuration` 結尾）；`nextjs-pickball/lib/matchmaker/round.test.ts` 的 `describe("setTimerDuration")` 全文與檔頭 helper；
     `hooks/useRoundStore.ts` 與 `hooks/useRemoteRoundStore.ts` 的 `setTimerDuration` 函式與介面宣告；兩個 store 測試檔中現有呼叫 `setTimerDuration(10)` 的 it 全文（含 fixture／fetch mock）。
   - §3：`components/matchmaker/RoundControls.tsx` 的 props 介面、`handleTimerDurationChange`、`handleTimerKeyDown`；`RoundControls.test.tsx` 的 `buildProps`／`buildRound` 與 it「計時變更契約：…」「計時方向鍵以畫面選中值起算…」全文；
     `tests/e2e/specs/round-timer.spec.ts` 的 `beforeEach`、helper 與 test「開始計時後快轉至到期會顯示時間到並觸發一次提示音」全文。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、`round-settings-follow-round` 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/round-timer-clear`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`）。`pnpm --dir <root> --filter ./<ws>` 的 filter 以 shell cwd 解析，cwd 不在 repo root 時會 "No projects matched" 且 exit 0（假綠）——**一律改用 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> <script>`**。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：`null` 分支改回 `{ durationMinutes, startedAt: null }` → 「setTimerDuration 傳入 null 時…」與兩個 store it 轉紅；
     `null` 分支只在 `startedAt === null` 時清除（已開始時保留原 timer）→「…計時已開始亦同」轉紅；
     鎖定檢查移到 `null` 分支之後（`null` 先回傳成功）→「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕…」轉紅；
     `null` 分支回傳 `{ ...round, timer: undefined }` → `timer === null` 斷言轉紅；
     等價對照組：以 `durationMinutes === null ? null : {…}` 改寫為 if／else 兩個 return → 須維持綠。
   - §3：還原 `if (durationMinutes === null) return;` → 兩個新 it 轉紅；
     改為 `commitTimerDuration(10)` 取代 `null` → 參數斷言轉紅；
     回合存在時 `null` 改走 `onSettingsChange` → 「onSettingsChange 未被呼叫」轉紅；
     `handleTimerKeyDown` 對索引 0 不呼叫 handler → 方向鍵 it 轉紅；
     等價對照組：handler 內把回合分支的兩行合併為一行 → 須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。`/tmp` 腳本重開機會消失，缺檔時回報 coordinator 重建，不得自行改寫。
g. 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run <path>`，**`--run` 前不可加 `--`**。
   單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/round-timer.spec.ts [-g <test 名稱>]`。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 與 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動**下列以外的產品檔：§2 → `packages/pickball-core/src/matchmaker/round.ts`、`nextjs-pickball/hooks/useRoundStore.ts`、`nextjs-pickball/hooks/useRemoteRoundStore.ts`；§3 → `nextjs-pickball/components/matchmaker/RoundControls.tsx`（若 §2 放寬型別後 `RoundControls.tsx` 的 prop 型別造成 tsc 紅，§2 可只放寬該 prop 型別一行）。後端、`app/**`、其他核心模組一律不動。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**（本 change 無授權修改的既有測試）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：一個分支條件、兩處型別放寬、一個 handler 與現成 helper 的測試；sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - E2E 新 test 在同一 project 連續兩次結果不同。
  - 雲端 store 的 fetch mock 無法攔到 PUT body 而需要新的測試基礎建設。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者（「已有場次離開 pending 時 setTimerDuration 傳入 null 亦拒絕且不改動回合」）已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 既有 it／test 一行未改且仍綠。
  - [ ] `git diff main --stat` 只含派工單 j 允許的產品檔與對應測試檔。
  - [ ] 兩段 typecheck exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 七個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 為真紅（依 e 機械複驗）；regression guard 有誠實標註。
  - [ ] 沒有新增 `clearTimer` 等第二個入口、沒有複製鎖定判定（Decision 1）。
  - [ ] 倒數已開始時仍可取消（Decision 2）；鎖定時 UI 仍 disabled。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判斷 null 分支的邊界、型別放寬的連鎖與 mutation 偵測力。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d）。
  - [ ] `setTimerDuration` JSDoc 說明 `null` 的語意與為何已開始仍允許；`RoundControls` 的 ⚠️ 暫行處置註解已移除、無殘留「尚未定案」字樣。
  - [ ] 沒有巢狀三元運算；E2E 無 `waitForTimeout`、同步點為 web-first 斷言。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋6、各 browser project 的兩檔 E2E＝基線＋2。
  - [ ] 訪客與雲端路徑皆經同一純函式。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - `main` 尚未含 `round-settings-follow-round` → §1 停止並上報，不開工。
  - E2E「取消本輪計時後產生下一輪仍為不計時」在 GREEN 後仍紅且根因在設定列解析 → 停止上報（屬相依 change 範圍），不得改 `page.tsx` 或改寫測試。
  - 時間到提示音或倒數在 `timer` 變 `null` 後殘留 → 停止上報（範圍變更）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。
