# Execution Plan: round-settings-follow-round

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`／`fix:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：§2 的 RED 會 import 尚不存在的 `resolveRoundSettings`，RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
規模以一個晚上（約 1.5 小時 apply）為度：產品碼群組 2 組（§2、§3）。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、授權修改的既有測試清單（本 change 為「無」）、範圍說明與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「fixture 的共同要求」「E2E 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：本 change `specs/match-stage/spec.md`「本輪設定跟隨目前回合」全文；主 spec `match-stage`「本輪設定控制項的預設值與範圍」第一段與 Scenario「預設為單打與 1 個場地」、「產生本輪與重設／再排的操作入口」的 Scenario「產生本輪委派回合 capability」。
4. **相關 design 片段**：§2 → Decision 1、2、3、6，Risks 第 1～4、6 條；§3 → Decision 4；§4 → Risk 1、Migration Plan。
5. **既有介面與範本**（全文貼上）：
   - §2：`nextjs-pickball/lib/matchmaker/round-settings.ts` 全文、`round-settings.test.ts` 全文、`packages/pickball-core/src/matchmaker/round-types.ts` 的 `RoundSchema`／`RoundTimerSchema`／`Round` 型別段落、`nextjs-pickball/app/matchmaker/page.tsx` 的 :1-100 與 `RoundControls`／`EmptyStage` 兩處 JSX、
     `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 的 :1-110（import、`buildTestPlayer`、`seedRoster`、`beforeEach`、第一條 test）與 test「區段導覽可在對戰頁與參賽者名單頁之間來回切換」全文。
   - §3：`nextjs-pickball/components/matchmaker/RoundControls.tsx` :88-185、`RoundControls.test.tsx` 的 :1-85（helper）與 it「計時方向鍵以畫面選中值起算，而非以尚未同步的 settings 起算」全文（含上方註解，作為新 it 的範本）。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、前一個 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/round-settings-follow-round`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`）。**`pnpm --dir <root> --filter ./<ws>` 的 filter 以 shell cwd 解析，cwd 不在 repo root 時會 "No projects matched" 且 exit 0**——一律改用 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> <script>`。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2（`resolveRoundSettings`，單檔 vitest）：
     - 回合存在時忽略回合（一律 `draft ?? createRoundSettings()`）→「回合存在且未變更過設定時取回合的…」須轉紅；
     - 回合存在時目標分數／計時改取 `draft`（`draft !== null` 時）→「變更過設定時對戰方式與場地數取變更值，目標分數與計時仍取回合」與「回合不計時時解析出的計時為不計時…」須轉紅；
     - 回合存在時對戰方式／場地數一律取回合（忽略 `draft`）→「變更過設定時…」須轉紅；
     - 計時映射改為 `round.timer === null ? draft?.timerDurationMinutes ?? null : …` →「回合不計時時…」須轉紅；
     - 無回合時忽略 `draft`（一律預設）→「沒有回合時取變更過的設定…」須轉紅；
     - 另放至少一條等價變異作對照組（例：以 `round.timer?.durationMinutes ?? null` 與 `round.timer === null ? null : round.timer.durationMinutes` 互換），須維持綠。
   - §2（`page.tsx` 接線，E2E chromium `-g` 單條，雙鎖、一次鎖時段內跑完）：把傳給 `RoundControls` 的 `settings` 改回 `draft ?? createRoundSettings()` → 「離開對戰頁再回來時本輪設定與目前回合一致」與「回合存在時變更的目標分數與計時沿用到下一輪」須轉紅。
   - §3（`RoundControls`，單檔 vitest）：起算值改回 `settings.targetScore` → 新 it 須轉紅；起算值改為 `round?.targetScore ?? settings.targetScore`（等價對照組）須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。單檔 vitest 輸出須含 `Test Files`。
d. Stage 2 Reviewer MUST 獨立再做 mutation（至少 §2 的單元變異與 §3 的變異），不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/lock-fast.sh nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。`/tmp/lock-fast.sh` 與 `/tmp/heavy-lock.sh` 為同一把 mkdir 鎖（前者每秒輪詢）；**`/tmp` 下的腳本重開機會消失**，不存在時回報 `BLOCKED` 由 coordinator 重建，SHALL NOT 自行略過鎖。
g. 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run lib/matchmaker/round-settings.test.ts`（或 `components/matchmaker/RoundControls.test.tsx`），**`--run` 前不可加 `--`**。
   單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/match-stage.spec.ts [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依、任何儲存 key**；**SHALL NOT 改動** 本組列出的產品檔以外的檔案（§2：`lib/matchmaker/round-settings.ts`、`app/matchmaker/page.tsx`；§3：`components/matchmaker/RoundControls.tsx`；一律不碰 `hooks/**`、`lib/scoreboard/**`、後端與核心套件）。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**（本 change 無授權例外）。既有測試轉紅時停止並上報，不得改既有測試讓它變綠。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：一個小純函式、頁面兩處接線、一行元件改動與兩條 E2E；範本 it 與 helper 皆現成。
- **upgrade_to_opus_when**:
  - E2E 新 test 在同一 project 連續兩次結果不同。
  - GREEN 後既有 E2E（`match-stage.spec.ts`、`scoreboard-binding.spec.ts`、`round-timer.spec.ts`）出現無法以本 change 解釋的失敗。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；若有先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 既有 it／test 一行未改且仍綠。
  - [ ] `git diff main --name-only` 只含本組允許的檔案（與 test-plan C6 一致）。
  - [ ] `pnpm --dir <repo> -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors（PostToolUse hook 已逐檔 lint）。
  - [ ] `page.tsx` 沒有新增 `useEffect`、沒有新增 LocalStorage 讀寫。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 本組負責的 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）；regression guard 有誠實標註。
  - [ ] GREEN 沒有：新增儲存 key、新增 effect、改 `RoundControls` 的 `handleTargetScoreChange`／`handleTimerDurationChange`、處理「不計時」缺口、加確認對話框（scope creep）。
  - [ ] 頁面傳給 `RoundControls` 與 `EmptyStage` 的設定皆為 `resolveRoundSettings` 的回傳值（Decision 1）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判斷 `draft` 語意、回合更新時是否覆蓋使用者變更、與 mutation 偵測力，最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d）。
  - [ ] `resolveRoundSettings` 的 JSDoc 說明「為何目標分數與計時一律取回合」與「`draft` 為 null 的意義」；沒有巢狀三元運算（改 if/else）。
  - [ ] `page.tsx` 的變數命名清楚表達 `draft` 與解析後 `settings` 的差別；既有註解未被改寫。
  - [ ] E2E 同步點為 web-first 斷言、沒有 `waitForTimeout`、區段導覽以 role＋name 定位。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：一次看完全部 commit，確認範圍不越界、規格與實作一致。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋5、各 browser project 的三檔 E2E＝基線＋2。
  - [ ] 設定列顯示值與「產生本輪對戰」送出值在頁面上只有一個來源（`resolveRoundSettings` 的回傳值）。
  - [ ] tasks §4 已記錄「不計時」缺口為建議的後續 change（design Risk 1）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 或單元測試出現任何新失敗（特別是依賴「回到對戰頁後設定為預設值」的斷言，design Risk 4）→ 停止並上報 coordinator 裁定，不得改既有測試。
  - 實作上發現必須改 `hooks/**` 或核心套件才能達成 → 停止並升級（屬範圍變更）。
  - E2E 新 test 在 RED 階段意外綠燈 → 停止並上報，不得改寫成其他路徑硬造紅燈。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。
