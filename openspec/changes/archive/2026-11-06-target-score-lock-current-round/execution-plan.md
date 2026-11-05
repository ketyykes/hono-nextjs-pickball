# Execution Plan: target-score-lock-current-round

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`fix:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、授權修改的既有測試清單、範圍說明與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「fixture 的共同要求」「E2E 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：§2 → 本 change `specs/round-lifecycle/spec.md`「開始計分後鎖定本輪目標分數」全文；主 spec `round-lifecycle`「計分板結果的自動回填共用送出 pipeline」的「回填條件」三點（以鍵比對的同源依據）。
4. **相關 design 片段**：§2 → Decision 1、2、5，Risks 第 1～3 條；§3 → Decision 3、4、Non-Goals、Migration Plan。
5. **既有介面與範本**（全文貼上）：`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`、`nextjs-pickball/lib/scoreboard/match-slots.ts` 的 `MatchSlots` 型別與 `writeMatchSlot`；
   §2 另貼 `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts` 的檔頭 helper（`makeRound`、`makeMatch`）、`makeSlot` 與「isTargetScoreLocked」相關的全部 it（約 :563-679），以及 `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts` 的 describe「/matchmaker 對戰頁的計分板接線」從開頭到 test「本輪開始計分後目標分數控制項停用並說明原因」（含 helper 與 `beforeEach`）。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、前一個 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/target-score-lock-current-round`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（§2）：
   - 移除本輪過濾（第二條回到 `Object.values(slots)` 掃全部槽）→ 三個真紅 it 須轉紅；
   - 改讀槽內容的 `matchId` 欄位比對本輪（`slot.matchId` 而非鍵）→「鎖定判定以槽集合的鍵比對本輪場次而非槽內容的 matchId」須轉紅；
   - 過濾只比對本輪第一場（例：`round.matches[0]?.id === key`）→「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」須轉紅；
   - 過濾條件反向（只計入**不在**本輪的槽）→ 既有「任一場次的計分板槽非 setup 時目標分數鎖定」須轉紅；
   - 第二條改為 `status === "playing"`（漏掉 `finished`）→ 既有「鎖定判定掃描全部場次與全部槽而非只看第一筆」須轉紅；
   - 另放至少一條等價變異作對照組（例：以 `round.matches.some((m) => m.id === key)` 取代 `Set.has`），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run lib/matchmaker/scoreboard-binding.test.ts`，**`--run` 前不可加 `--`**。單檔 E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-binding.spec.ts [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動** `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 以外的產品檔（含 `components/**`、`hooks/**`、`app/**`、`lib/scoreboard/**`、後端與核心套件）。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的一處（刪除 it「槽已不在回合中但非 setup 時仍判定為鎖定」連同其上方說明註解）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：只改一個純函式的一條條件與 JSDoc、一個單元測試檔與一個 E2E 檔，且 helper 與範例 it 皆現成；sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - E2E 新 test 在同一 project 連續兩次結果不同。
  - GREEN 後既有 E2E（`match-stage.spec.ts`、`scoreboard-binding.spec.ts`）出現無法以本 change 解釋的失敗。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者（「本輪場次的槽已開始時仍鎖定且不受殘留槽影響」）已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只刪除了 tasks 檔頭授權的那一個 it；其餘既有 it／test 一行未改且仍綠。
  - [ ] `git diff main --stat` 只含 `scoreboard-binding.ts`、`scoreboard-binding.test.ts`、`scoreboard-binding.spec.ts`（§3 另含 tasks／environment 紀錄）。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 五個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 有誠實標註。
  - [ ] GREEN 只改 `isTargetScoreLocked` 第二條：沒有清槽、沒有改 `useRoundStore`／`page.tsx`／`RoundControls`、沒有動第一條（scope creep）。
  - [ ] 比對以槽集合的鍵為準（Decision 1）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判斷過濾的邊界（鍵與內容、多場次、`finished`）與 mutation 偵測力，最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是「改讀槽內容 matchId」與「只比對第一場」兩條。
  - [ ] JSDoc 已改寫為「本輪場次的槽」並說明為何以鍵比對、為何非本輪槽不計入；舊的「任一計分板槽」字樣不再殘留。
  - [ ] 沒有巢狀三元運算；具名變數清楚（例：`roundMatchIds`）。
  - [ ] E2E 同步點為 web-first 斷言、沒有 `waitForTimeout`、沒有斷言 LocalStorage 殘留槽。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：一次看完全部 commit，確認範圍不越界、規格與實作一致。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋3、各 browser project 的兩檔 E2E＝基線＋1。
  - [ ] `isTargetScoreLocked` 與 `collectFinishedSubmissions` 對「是否屬於本輪」的判定來源一致（皆為鍵）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - 實作上發現必須改 `scoreboard-binding.ts` 以外的產品檔才能達成 → 停止並升級（屬範圍變更）。
  - E2E 新 test 在 RED 階段意外綠燈（例如 `main` 已含清槽的提交）→ 停止並上報，不得改寫成其他路徑硬造紅燈。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。
