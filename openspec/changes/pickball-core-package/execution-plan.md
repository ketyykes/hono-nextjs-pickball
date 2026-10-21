# Execution Plan: pickball-core-package

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（RED `test:`、GREEN `refactor:`（純搬移，非新功能）、3.2 `chore:`、設定層 `chore:`、文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。
**§2 的 2.1～2.3 MUST 在同一張派工單內完成**（tasks.md 檔頭：中間狀態 tsc 為紅）。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的標註說明與 Stop hook 段落）。
2. **test-plan.md 對應列**（五欄一字不改；含本組用到的指令驗收列）。
3. **相關 spec 片段**：
   - §2 → `pickball-core` 全部四個 Requirement；`dev-workflow`「根層彙總指令必須涵蓋所有 workspace」。
   - §3 → `pickball-core`「共用核心套件的位置、名稱與匯出方式」。
   - §4 → `dev-workflow` 兩個 MODIFIED Requirement；`pickball-core`「既有規格中舊模組路徑的對照」。
4. **相關 design 片段**（對照表）：
   - §2 → Decision 1、2、3、5、6、8；Risks 第 1、2、4 條；Open Questions 2
   - §3 → Decision 1、7；Risks 第 3 條
   - §4 → Decision 3、4；Migration Plan；Risks 第 6 條
5. **§1 的查證紀錄**（design.md「apply §1 查證紀錄」全文）與 §1 盤點出的前端檔案清單。
6. **「不給你」清單**：其他群組 task、runbook 全文、B1～B3 的 artifact、其他 capability 的主 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/pickball-core-package`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2：`CORE_MODULES` 少一項、多一項（皆須轉紅）；在任一核心模組頂層加一行 `globalThis.window.location`（node 測試須轉紅）；
     在任一核心模組加 `export const x = typeof document;`（核心套件 tsc 須轉紅）；把一個核心模組的匯出全部移除（「至少一個具名匯出」須轉紅）。
   - §3：把測試中的 schema 匯入改為不存在的子路徑（須轉紅）；`PlayerSchema.safeParse({})` 改為合法 Player（對照組，應轉紅）。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組。每次變異後 MUST 還原並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」「存取他人資料被拒」「auth 停用 404」的測試——本 change 不新增後端端點（N/A）；Reviewer 確認 `hono-pickball/src/**` 零改動。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗（RED commit 的上一個 commit 中受測模組／相依不存在）；查核不過改標 regression guard。
g. 逐 task commit；註解只寫「為什麼」。
h. 編輯器診斷不可信（worktree／symlink 套件尤其常誤報），以 `pnpm -r exec tsc --noEmit` exit code 為準。核心套件與後端的測試 MUST 顯式匯入 `describe`／`it`／`expect`。
i. **純搬移**：被搬模組內容零修改（`git diff -M100%` 為 R100）；前端既有檔案只改 import／export 的模組指定字串；**既有 it／test 的名稱、斷言、mock 一律不得修改**；不得留下 re-export 轉址殼。
j. 跑 E2E／dev server／OpenNext build 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 依 project 分開執行（tasks 4.9 指令），失敗不得自行判定為雜訊，證據上報。
k. **禁止任何遠端 CF 操作**；`wrangler deploy` 只允許帶 `--dry-run`。
l. 單檔測試 `pnpm --filter ./<workspace> test --run <path>`，**`--run` 前不可加 `--`**。
m. **SHALL NOT 新增任何第三方 npm 套件或升級版本**；lockfile 只允許新增 workspace importer／link 與既有套件的解析變體。需要時回報 `BLOCKED`。
n. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
o. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。
p. 測試帳密與 secret 不得寫進任何會被 commit 的檔案或 commit 訊息。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：搬移與 import 改寫是機械工作，風險在工具鏈解析；sonnet 足以執行並如實回報。
- **upgrade_to_opus_when**:
  - Turbopack／vitest-pool-workers／Playwright／OpenNext 任一工具鏈無法解析核心套件，需要跨工具診斷。
  - lockfile 出現預期外的套件變動。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出。
  - [ ] it 名稱與 spec 驗收錨點逐字相同。
  - [ ] `git diff -M100% --name-status main` 的 18 個模組皆為 R100。
  - [ ] 前端測試檔數／測試數＝基線。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0、`pnpm lint` 不多於基線。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收紀錄。
  - [ ] 路徑對照表 18 列與 `CORE_MODULES` 逐一對應（C6 的腳本比對之外再人工抽查）。
  - [ ] 搬移範圍恰為 design Decision 2 的 18 個模組，沒有多搬或少搬。
  - [ ] 沒有 scope creep：沒有新 API、資料表、行為變更；`hono-pickball/src/**` 零改動。
  - [ ] RED 是真紅燈（f）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d）。
  - [ ] 核心套件 tsconfig 確實不含 DOM（`lib`、`types`），且 `typecheck` 兩段都會跑。
  - [ ] 改寫後的 import 沒有混用 `@/lib/...` 與 `@pickball/core/...` 指向同一模組；沒有 `../../packages` 相對路徑。
  - [ ] `vitest.config.ts`、`package.json` 沒有多餘設定（如 `--passWithNoTests`、未使用的 devDeps）。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 零改動。
  - [ ] 指令驗收 C1～C10 皆有紀錄；E2E 合計與基線一致。
  - [ ] 三份 CLAUDE.md、AGENTS.md、README 與實作一致（workspace 數、指令、測試位置）。
  - [ ] B5 作者能直接在 `hono-pickball/src/**` 匯入 `@pickball/core/scoreboard/types`（不需額外設定）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - Playwright（C5）或 OpenNext（C4）無法載入核心套件，且 1.3 查證沒有記載的設定可解 → 停止並升級，SHALL NOT 以「改回相對路徑／留轉址殼／把模組複製回前端」繞過。
  - lockfile 出現新套件名稱或版本 → 停止並升級（違反「不新增相依」）。
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
