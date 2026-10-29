# Execution Plan: site-navbar-account-entry

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走真紅燈 TDD、逐 task commit
（RED → `test:`、GREEN → `feat:`；REFACTOR 有改動時 `refactor:`；environment／design 回填 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**（§1 → §2 → §3 → §4），SHALL NOT 平行派 Implementer。§1 與 §4 可由 leader 自行執行。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**，含檔頭（TDD 三步、雙鎖指令、允許修改的既有測試 ①～③、訪客路徑說明）。
2. **test-plan.md 對應列**（五欄一字不改）與本組用到的指令驗收列。
3. **相關 spec 片段**（delta）：
   - §2 → `site-navbar`「navbar 帳號入口於各寬度可見且預留固定寬度」全文（重點：前兩條「帳號入口：」Scenario 與「session 回應前後導航連結位置不變」）。
   - §3 → `site-navbar` 上述 Requirement 全文 ＋「窄螢幕導航呈現」（MODIFIED）全文；`auth`「本機測試帳號登入頁」（MODIFIED）全文。
4. **相關 design 片段**：§1 → Decision 3、Risk 1、Open Questions 3；§2 → Decision 1、3、5、Risk 1；§3 → Decision 2、4、5、Risk 2、4；§4 → Risk 5、6、Migration Plan。
5. **既有程式碼**（全文）：`components/layout/{AccountEntry,SiteNavbar}.tsx`、`navItemStyles.ts`、`AccountEntry.test.tsx`、`SiteNavbar.test.tsx`、
   `hooks/useSession.ts`、`lib/auth/session-client.ts` 的 `fetchSession`；§2／§3 另貼 `tests/e2e/specs/navbar-rwd.spec.ts`（量測與 `test.skip` 範本）、
   `tests/e2e/specs/auth-session.spec.ts`；§3 另貼 `components/auth/LoginForm.tsx`。
6. **「不給你」清單**：其他群組的 task、與本 change 無關的 capability spec、`docs/` 的 runbook 全文、其他 change 的 artifact。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**（environment.md）：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/site-navbar-account-entry`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. 指令裡禁止 `cd`，一律用絕對路徑（`pnpm --dir`、`git -C`、`pnpm --filter ./nextjs-pickball`）。
b. 單元單檔 `pnpm --filter ./nextjs-pickball test --run <path>`（**`--run` 前不可加 `--`**，免鎖）。E2E、eslint、全套 vitest、build 一律雙鎖：
   `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py。
c. 紅燈要是真的：RED 的失敗輸出 MUST 貼出；先綠者點名標 regression guard；**嚴禁以 mutation（改斷言看紅再改回）偽造紅燈**。紅燈宣稱以 `git show <commit>^:<path>` 機械複驗。
d. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」（只用來檢驗測試強度，不是製造紅燈）。本 change 必做變異：
   - §2：佔位元素拿掉 `invisible`；拿掉 `aria-hidden`；改用 `null`（只 disabled 分支）；佔位內層 `size-4` 改 `size-3`；佔位 class 少 `NAV_ITEM_BASE`；登出按鈕 class 多一個 `px-*`。
   - §3：`NAV_ITEM_BASE` 改回 `px-2`；`max-[375px]:px-1` 改回 `px-1.5`；容器 `gap-1` 改回 `gap-3`；`AccountEntry` 加回 `hidden sm:inline-flex`。
   每項變異後還原並確認 `git status` 乾淨；另放一條等價變異（例如 class 順序對調）當對照組。
e. it／test 名稱與 delta spec 驗收錨點逐字相同；測試一律顯式 `import { describe, it, expect, vi } from "vitest"`。
f. 既有 it／test 的名稱與斷言一律不得修改，唯一例外為 tasks 檔頭 ①～③。`navbar-rwd.spec.ts` 一行不改。
g. E2E 前後以 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。
   E2E 指令 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p> <spec>`；失敗不得自行判定為雜訊，證據上報。E2E 不得使用 `waitForTimeout`。
h. 禁止任何遠端 CF 操作；SHALL NOT 新增任何 npm 相依（需要時回報 `BLOCKED`）；SHALL NOT 改 `fetchSession`（含 `keepalive`）、session store、後端。
i. 若任一寬度量得溢出或換行，停止並回報（design Risk 2），SHALL NOT 自行縮文案、隱藏連結、改 logo 規則或加漢堡選單。
j. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` exit code 為準；`pnpm lint` 0 errors。
k. 逐 task commit；Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 milestone 編號或審查流程出處。
l. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：改動集中在 3 個元件檔、class 值與單一狀態分支；難點在 E2E 的 `page.route` 時序與 bounding box 量測，`sonnet` 足以勝任。
- **upgrade_to_opus_when**:
  - §1 spike 發現 `page.route` 攔不到 keepalive fetch，需改 `addInitScript` 備案。
  - §3 實測任一寬度溢出而需重新分析版面（此時先升級給人類，見 i）。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同；既有測試只動了 ①～③。
  - [ ] 三種狀態的根元素共用同一個版面 class 常數；`>= sm` 的 class（`sm:gap-6`、`sm:px-6`、`sm:px-3`）零變更。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0；`pnpm lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 spec 與程式需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario；GREEN 只滿足該 RED，沒有碰無關 Requirement。
  - [ ] 沒有 scope creep：無下拉選單、無姓名顯示、無文案變更、無 logo 規則變更、無新 hook／相依。
  - [ ] 佔位元素不可聚焦、不進無障礙樹；登入／登出的可及名稱不變。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：版面一致性與 E2E 時序的邊角最需要最強模型。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立再做 mutation（派工單 d），不採信 Implementer 自述。
  - [ ] 內距只有 `NAV_ITEM_BASE` 一個來源；`AccountEntry` 沒有另寫一份內距。
  - [ ] E2E 以 DOM 狀態等待（`data-account-entry`、role），沒有 `waitForTimeout`；`page.route` handler 在測試結束時不會懸置。
  - [ ] 命名、註解、測試寫法與既有 `navbar-rwd.spec.ts`／`AccountEntry.test.tsx` 一致。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec（`openspec/specs/**`）無任何改動。
  - [ ] 指令驗收 C1～C6 皆有紀錄；E2E 既有 test 數與基線一致（扣除例外 ② 的 1 條）、新增 test 依 test-plan C3 的各 project 預期範圍 passed；`nextjs-pickball/CLAUDE.md` 已同步。
  - [ ] §2 與 §3 對 `AccountEntry.tsx` 的改動彼此一致（佔位 class 也跟著去掉了 `hidden`）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 任一寬度溢出或換行 → 停止並升級給人類（design Risk 2、Open Questions 2）。
  - 既有 E2E 出現任何新失敗 → 證據上報 coordinator 裁定。
  - `.dev.vars` 不齊備導致 auth E2E 只能 skip → 停止並向 coordinator 索取。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
