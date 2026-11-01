# Execution Plan: round-put-completed-immutable

## Mode

`subagent-driven`

**逐組制**：
- tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完。組內逐 task 走 TDD 三步、逐 task commit（regression guard 與 RED 用 `test:`、GREEN 用 `feat:`、refactor 用 `refactor:`、文件用 `docs:`）。
- 整組完成後依序 Stage 1 → Stage 2；全部完成後做 Final Code Review。
- 群組之間**嚴格序列**，SHALL NOT 平行派 Implementer。
- §1 由 leader 自己執行（只有指令與比對，不寫產品程式碼），結果寫進 environment.md 與 design.md Open Questions 並 commit。
- **本 change 在主 repo 進行，Stop hook 遇到主 worktree 的 tsc 紅燈會擋下**：§2 的 RED（2.2）與 GREEN（2.3）MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。2.2 的 RED 是斷言失敗而非型別錯誤，所以 tsc 不會因此轉紅。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**，含檔頭的「訪客路徑零迴歸」與標註說明。
2. **test-plan.md 對應列**：五欄一字不改；另附檔頭說明、「必做 mutation」表全文，以及本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → `round-lifecycle` delta「回合與送出比分的雲端 API」的「完成狀態不可經 PUT 改變」與「判定順序」兩段全文，加上新增的四個 Scenario 與既有 Scenario「回合 PUT 不得改變場次的完成狀態」「回合雲端 API：回合 PUT 以單一 batch 寫入、提高下限並清除分槽」。
   - §3 → 同上兩段（文件要與 spec 一致）。
4. **相關 design 片段**：
   - §2 → Context 的「現況」「缺口」「多裝置的時序」，以及 Decision 1～5、Risks 第 2、3 條。
   - §3 → Decision 3、Open Questions 3。
5. **既有介面**：
   - §2 貼 `hono-pickball/src/matchmaker/round-repository.ts` 全文、`src/routes/matchmaker.ts` 的 `.put("/round", …)` 區塊、`test/helpers/matchmaker-fixtures.ts` 的匯出簽章（`seedAndSignIn`、`makeMatch`、`makeRound`、`makeSlot`、`seedRound`、`seedSlot`、`request`、`rowsOf`）。
     另貼 `test/matchmaker-round.test.ts` 的檔頭匯入、`getRound`／`slotMatchIds` 兩個檔內 helper，以及「回合 PUT 改變場次完成狀態或已完成場次內容時回 400」「回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致」兩個 it 全文（範本）。
   - §3 貼 `hono-pickball/CLAUDE.md`「matchmaker 回合、場次分槽與送出比分 API」第一個子項目全文。
6. **「不給你」清單**：其他群組的 task、其他 change 的 artifact、runbook 全文、未修改 capability 的 spec、前端任何檔案（本 change 不改前端；盤點結論已寫在 design Context）。缺 context 時回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/round-put-completed-immutable`（即 environment.md 的 `Worktree path`）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 test-plan「必做 mutation」M1～M14 與對照組 C1、C2，列出「幾次／改什麼／是否轉紅」。M1～M14 MUST 全數轉紅，C1、C2 MUST 存活；結果與預期不符時回報 `DONE_WITH_CONCERNS` 並附輸出。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原，並確認 `git status` 乾淨。
d. Stage 2 Reviewer MUST 獨立再做 mutation，逐分支機械盤點覆蓋率，不採信 Implementer 的自述。
e. 本 change 不新增端點；既有端點的四類授權測試 MUST 原樣通過，不得修改。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過就改標 regression guard。**嚴禁以「改斷言看紅再改回」偽造紅燈。** 2.1 的三個 it 寫入即綠，MUST 標 regression guard，不得宣稱 RED。
g. 逐 task commit；註解只寫「為什麼」，使用繁體中文。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 與 `pnpm --filter ./hono-pickball typecheck` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`；檔頭已有 `import app from "../src/index"`，不重複。
i. 跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。失敗不得自行判定為雜訊，證據要上報。
j. **重負載雙鎖**：E2E、全套 vitest、build 一律依序執行：
   1. `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`
   2. `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>`
   3. `/tmp/heavy-lock.sh release nextjspickball`

   不得在 heavy.py 內再包 heavy.py。單檔測試免鎖。
k. **禁止任何遠端 CF 操作**（deploy、`d1 create`、`--remote`、`secret put`）；`wrangler d1` 一律帶 `--local --env local`。只允許 `--local`、`--dry-run`。
l. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**。
m. 單檔測試用 `pnpm --filter ./hono-pickball test --run test/matchmaker-round.test.ts`，**`--run` 前不可加 `--`**。
n. **SHALL NOT 新增任何 npm 相依**；需要時回報 `BLOCKED`。
o. **既有 it 的名稱與斷言一律不得修改**；前端（`nextjs-pickball/**`）、核心套件、路由檔、`src/db/**`、`drizzle/**` 一行都不改。
p. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。
q. 派出 subagent 之後不可結束回合。脈絡將盡時，在派下一組**之前**乾淨停止，把狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`，也不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：改動集中在單一 repository 函式的判斷邏輯，加上 4 個沿用既有夾具的整合測試。難點在判定順序與 mutation 覆蓋，sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - 2.3 GREEN 後任何既有的 `matchmaker-*.test.ts` it 轉紅，且原因不是本 change 預期的行為。
  - M1～M14 任一變異無法以 test-plan 列出的 it 轉紅，需要重新設計測試。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 2.1 的三個 it 已點名標 regression guard，並貼出寫入即綠的輸出；2.2 的紅燈輸出已貼出（第一個 PUT 200 ≠ 400；之後兩個在現況為 409）。
  - [ ] it 名稱與 spec 驗收錨點逐字相同。
  - [ ] 反向規則只在 `current !== null && current.version === expectedVersion` 時檢查；違反時在 batch 之前回 `invalid`。
  - [ ] 反向規則只看目前回合中 completed 的場次，以 id 對應、對新資料中每一場同 id 場次逐一比較（不用 `find` 只取第一筆），比較沿用同檔的 `isDeepEqual`；正向規則的程式碼與位置不變。
  - [ ] `PutRoundResult`、路由檔、`orphanSlotCondition`、batch 內容皆未改；JSDoc 寫明兩個方向的規則與判定順序。
  - [ ] 兩段 typecheck exit 0。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：Scenario 數量少、斷言具體（狀態碼、version、分槽清單、下限列），逐一對照即可。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上時回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 四個新 Scenario 都有對應 it，名稱逐字相同，斷言（400／409／200、version、分槽、下限列）與 Scenario 一致。
  - [ ] RED 對應正確的 Scenario；2.1 的 it 誠實標為 regression guard。
  - [ ] 判定順序與 spec「判定順序」段落一致：正向不看版本、反向只在版本相符時檢查。
  - [ ] 沒有 scope creep：沒有改前端、沒有改正向規則的順序（OQ16）、沒有加歷史表檢查（Open Questions 2）、沒有加寫入條件強化（Open Questions 4）、沒有新增端點。
  - [ ] 既有 it 的名稱與斷言零修改。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判定順序與版本閘門的錯誤不容易從綠燈看出，需要最強模型獨立做 mutation。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立跑 M1～M14 與 C1、C2（b～d），特別是 M4、M5、M14（版本閘門）、M7（拒絕時不送 batch）、M8、M9、M13（id 對應）、M12（只看 completed）。
  - [ ] 只有一份 `isDeepEqual`／`sortKeys`，沒有重複的比較邏輯；正向與反向規則的命名與 JSDoc 一看就能分辨。
  - [ ] `current` 只讀一次，沒有多出 D1 查詢。
  - [ ] 新測試沿用檔內 helper 與夾具，不重複造輪子；每個 it 使用獨立 email。
- **SHALL NOT**：重新爭論規格。風格分歧時，既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完所有 commit，確認改動範圍、文件與 spec 一致。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact（`round-repository.ts`、`matchmaker-round.test.ts`、`hono-pickball/CLAUDE.md`、本 change 的 artifact）；主 spec 無任何改動。
  - [ ] `hono-pickball/CLAUDE.md` 的判定順序與 delta spec 一致，並保留「不要自行對調正向規則與版本比對」的警語。
  - [ ] 指令驗收 C1～C5 皆有紀錄；E2E（user-data）數量與基線一致且全數 passed。
- **SHALL NOT**：重審單一 task 的細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有後端測試出現任何新紅燈 → 停止，證據上報 coordinator。
  - E2E（user-data）出現任何新失敗 → 停止，證據上報 coordinator 裁定。特別留意多裝置的 `round-sync.spec.ts`。
  - coordinator 對 design Open Questions 1（部分移除）改採「全有全無」→ 依該條列出的三處修改 artifact 後再派 §2。
  - 需要改前端、改正向規則順序或新增端點才能完成 → 停止並升級（超出 proposal 範圍）。

## Model selection principle

用能勝任該角色的最弱模型：Implementer 與 Spec Reviewer 用 `sonnet`，Code-Quality 與 Final 用 `opus`。**任何情況都不得使用 `fable`**，也不用 `haiku`。
