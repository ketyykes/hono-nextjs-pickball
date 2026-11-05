# Execution Plan: court-score-entry-submit-a11y

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。
（§2 的 RED 為執行期紅燈；但「比分欄位與送出按鈕包在以場地編號命名的群組內」若在測試中傳入 `groupLabel` 以外的新 prop 會造成型別紅燈——測試 MUST 經由 `CourtCard` 的既有 props 渲染，不直接渲染 `ScoreEntry`。）

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、「授權修改的既有測試：無」、範圍說明與標註說明）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭「fixture 的共同要求」「E2E 的共同要求」＋本組用到的指令驗收列。
3. **相關 spec 片段**：§2 → 本 change `specs/match-stage/spec.md` 全文；主 spec `match-stage`「手動輸入比分與送出」與「對戰頁的可用性與無障礙」全文（不得違反的既有規範）。
4. **相關 design 片段**：§2 → Decision 1、2、3、5，Risks 第 1～3 條；§3 → Decision 4、Non-Goals、Migration Plan。
5. **既有介面與範本**（全文貼上）：`nextjs-pickball/components/matchmaker/ScoreEntry.tsx`、`nextjs-pickball/components/matchmaker/CourtCard.tsx`（至少 :160-320）；
   §2 另貼 `CourtCard.test.tsx` 的檔頭 import 與 helper（`buildMatch`、`buildProps`）、「比分欄位為 inputMode numeric…」到「兩隊比分相同時 UI 仍照常委派送出而不自行攔截」之間的全部 it、「已完成場次的比分欄位與送出按鈕皆為 disabled」it，
   以及 `match-stage.spec.ts` 的檔頭 import、`seedRoster` helper 與 test「送出比分失敗時 role=alert 只出現在對應的場地卡片，不會擴散到其他場地」全文。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、並行 proposal（`round-settings-follow-round`、`round-timer-clear`）與前一個 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/court-score-entry-submit-a11y`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`）。
   **`pnpm --dir <root> --filter ./<ws>` 的 filter 以 shell cwd 解析**：cwd 不在 repo root 時會印 "No projects matched" 且 **exit 0**（假綠）；因此一律改用 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> <script>`，SHALL NOT 使用 `--filter ./<ws>`。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（§2）：
   - 按鈕改回 `type="button"`（保留 form `onSubmit`）→ 既有「送出比分會以場次識別與兩隊分數呼叫回合送出函式一次」須轉紅；
   - 移除 `event.preventDefault()` → 以 `-g` 單條跑 E2E「多場地時可依場地群組定位比分欄位並以 Enter 送出」，預期 `toHaveURL(/\/matchmaker$/)` 因原生送出附加 `?` 而轉紅；若存活（瀏覽器未改 URL、狀態由 LocalStorage 還原），如實記錄並由 Stage 2 裁定是否補斷言，不得自行改既有測試；
   - submit handler 改為只傳第一欄（`onSubmitScore(teamAValue, "")`）→「在比分欄位按 Enter 會以場次識別與兩隊分數送出一次」須轉紅；
   - submit handler 改為 `String(Number(teamBValue))` → 「只填一欄比分按 Enter 時與按送出按鈕同樣傳遞原始空字串」須轉紅；
   - `CourtCard` 改傳固定字串 `"第 1 場地比分"` → 「比分欄位與送出按鈕包在以場地編號命名的群組內」須轉紅；
   - 移除兩個 `Input` 的 `disabled` → 「已完成場次的比分欄位按 Enter 不會送出」須轉紅；
   - 另放至少一條等價變異作對照組（例：`aria-label` 改為 `aria-labelledby` 指向內含同字串的隱藏元素，或 `role="group"` 改 `<fieldset>` 加同名 `aria-label`），須維持綠。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。用單檔 vitest（輸出須含 `Test Files`）；需 E2E 驗證的變異在雙鎖下以 `-g` 單條執行。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前後內容相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/lock-fast.sh nextjspickball "<說明>"`（與 `/tmp/heavy-lock.sh` 同一把 mkdir 鎖，每秒輪詢）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。**`/tmp` 下的兩支腳本重開機會消失**：若不存在，回報 coordinator 重建，SHALL NOT 自行略過取鎖。
g. 單檔 vitest：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball test --run components/matchmaker/CourtCard.test.tsx`，**`--run` 前不可加 `--`**。
   單檔 E2E：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/match-stage.spec.ts [-g <test 名稱>]`（雙鎖）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動** `ScoreEntry.tsx`、`CourtCard.tsx` 以外的產品檔（含 `MatchStage.tsx`、`hooks/**`、`app/**`、`lib/**`、後端與核心套件）；`CourtCard.tsx` 只改 `<ScoreEntry>` 呼叫處。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**（本 change 無授權例外）。既有測試轉紅即停止上報。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。UI 文案不得有 emoji。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：一個呈現元件加一層 form／group、一個呼叫端傳 prop、四個 it 與一條 E2E，helper 與範例皆現成。
- **upgrade_to_opus_when**:
  - E2E 新 test 在任一 browser project 的 Enter 行為不一致，或同一 project 連續兩次結果不同。
  - GREEN 後既有 E2E（`match-stage.spec.ts` 的觸控尺寸、可存取名稱 test）出現無法以本 change 解釋的失敗。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者（「已完成場次的比分欄位按 Enter 不會送出」）已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 既有 it／test 一行未改且仍綠。
  - [ ] `git diff main --stat` 只含 `ScoreEntry.tsx`、`CourtCard.tsx`、`CourtCard.test.tsx`、`match-stage.spec.ts`（§3 另含 tasks／environment 紀錄）。
  - [ ] `tsc` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 五個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 為真紅（依 e 機械複驗）；regression guard 有誠實標註；Enter 以 user-event／`press` 觸發而非 `fireEvent.submit`。
  - [ ] 欄位與按鈕名稱未改；版面 className 未改；送出資料流未改（scope creep）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判斷 form 隱式送出、ARIA 角色選擇與 mutation 偵測力，最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是「按鈕改回 type=button」「移除 preventDefault」「固定群組名稱」三條。
  - [ ] `<form>` 未被賦予名稱（避免每場地一個 form landmark）；群組不在 form 元素上（Decision 2）。
  - [ ] 註解說明 Enter 送出與群組的理由；沒有殘留 `onClick`；沒有巢狀三元。
  - [ ] E2E 同步點為 web-first 斷言、沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：一次看完全部 commit，確認範圍不越界、規格與實作一致。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試數＝基線＋4、各 browser project 的 `match-stage.spec.ts`＝基線＋1。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 任何既有 unit／E2E 因本 change 轉紅 → 停止上報 coordinator（方案 (a) 的前提被推翻，屬範圍變更）。
  - 實作上發現必須改 `ScoreEntry.tsx`、`CourtCard.tsx` 以外的產品檔（例：`MatchStage.tsx` 的觸控尺寸選擇器）→ 停止並升級。
  - E2E 新 test 在 RED 階段意外綠燈 → 停止並上報，不得改寫成其他路徑硬造紅燈。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`、不使用 `haiku`**。
