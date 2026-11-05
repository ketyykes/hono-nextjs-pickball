# Execution Plan: site-not-found-and-nav-active

## Mode

`subagent-driven`

**逐組制**：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`（RED）、`feat:`（GREEN）各一；`refactor:`；文件 `docs:`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果回填 environment.md 並 commit。
**本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈**：§2、§3 的 RED 會 import 尚不存在的模組（型別錯誤），每個 RED 與其 GREEN MUST 在同一張派工單內完成，leader 在該組交件前不結束回合。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的 TDD 規則、標註說明、範圍、授權修改的既有測試清單）。
2. **test-plan.md 對應列**（五欄一字不改）＋檔頭四條「共同要求」（class 斷言、`aria-current` 斷言、pathname mock、E2E 查找範圍）＋本組用到的指令驗收列。
3. **相關 spec 片段**：
   - §2 → 本 change `specs/site-navbar/spec.md` 全文；主 spec `openspec/specs/site-navbar/spec.md` 的「測驗連結」「對戰分配連結」兩條 Requirement（確認新行為不違反）。
   - §3 → 本 change `specs/site-not-found/spec.md` 全文；主 spec `site-navbar`「全域 navbar 高度以 CSS variable 暴露」；主 spec `emoji-free-ui`「介面文字不含 emoji，國旗除外」。
4. **相關 design 片段**：§2 → Context（前三點）、Decision 1、2、3、7，Risks 3、5；§3 → Context（Next.js 16 慣例查證全段）、Decision 5、6、7，Risks 1、2、4；§4 → Migration Plan。
5. **既有介面與範本**（全文貼上）：
   - §2：`nextjs-pickball/components/layout/SiteNavbar.tsx`、`SiteNavbar.test.tsx`、`navItemStyles.ts`、`nextjs-pickball/lib/navHeight.ts`（同層命名與檔頭註解範本）、`nextjs-pickball/lib/matchmaker/section-nav.ts`（純函式範本）、`nextjs-pickball/components/matchmaker/MatchmakerTabs.tsx`（`aria-current` 寫法範本）、`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 第 111～166 行（區段導覽 `aria-current` E2E 寫法）。
   - §3：`nextjs-pickball/app/quiz/page.tsx`（版面 token 範本）、`nextjs-pickball/app/login/page.tsx` 與 `app/login/page.test.ts`（metadata 測試範本）、`nextjs-pickball/components/guide/HeroTourCta.tsx`（Server Component 用 `Button asChild` 包 `Link` 的範本）、`nextjs-pickball/components/ui/button.tsx`、`nextjs-pickball/app/layout.tsx`、`nextjs-pickball/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`（`nextjs-pickball/AGENTS.md` 要求先讀本機 Next 文件）。
6. **「不給你」清單**：其他群組 task、其他 capability 的 spec、其他並行 change 的目錄（`scoreboard-bound-game-over`、`target-score-lock-current-round`）、前一個 change 的 artifact、runbook 全文。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/site-not-found-and-nav-active`（environment.md）。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**（`pnpm --dir`、`git -C`、`pnpm --filter ./<workspace>`）。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異：
   - §2（`lib/navActive.ts`、`SiteNavbar.tsx`）：
     ① 非首頁分支改為 `pathname.startsWith(href)`（不加 `/`）→「前綴相似但非子路由時不為 active」須轉紅；
     ② 首頁分支改為 `pathname.startsWith("/")` → 「首頁連結只在 pathname 恰為 / 時為 active」須轉紅；
     ③ `SiteNavbar` 的 active 判定改回 `pathname === link.href` → `it.each` 四列須轉紅；
     ④ 非 active 時輸出 `aria-current="false"`（`active ? "page" : "false"`）→「完全相等時只有 active 連結帶 aria-current=page」與 `it.each` 須轉紅；
     ⑤ 保留 `aria-current` 但移除 active class 追加 → `it.each` 須轉紅；
     ⑥ logo 連結無條件加 `aria-current="page"` →「完全相等時只有 active 連結帶 aria-current=page」須轉紅；
     對照組（等價變異，須維持綠）：移除首頁特判、讓 `/` 走通用規則（`"/" + "/"` 為 `//`，結果等價）。
   - §3（`app/not-found.tsx`）：
     ① `metadata.title` 改為英文 `"Not Found"` → metadata it 須轉紅；
     ② 「前往對戰分配」的 `href` 改為 `/scoreboard` → render it 須轉紅；
     ③ 拿掉 `Button asChild`、改為裸 `Link` → render it（`data-slot`）須轉紅；
     ④ `pt-(--site-nav-h)` 改為 `pt-14` → render it 須轉紅；
     ⑤ `h1` 改為 `h2` → render it 須轉紅。
     對照組（等價變異，須維持綠）：調換兩個按鈕的先後順序。
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；每次變異後還原並確認 `git status` 乾淨。單元層用單檔 vitest（輸出須含 `Test Files`）。
d. Stage 2 Reviewer MUST 獨立再做 mutation，不採信 Implementer 自述。
e. 紅燈宣稱一律用 `git show <RED commit>^:<path>` 機械複驗（產品檔在 RED 前不存在或內容與 RED 後相同、測試檔在 RED 前不含新 it 名稱）；查核不過改標 regression guard。
f. **重負載雙鎖**：E2E、eslint 全套、全套 vitest、build 一律 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"` → `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；
   不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
g. 單檔 vitest：`pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加 `--`**。單檔 E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium <spec path>`（雙鎖；RED／GREEN 證據以 chromium 為準，五個 project 全跑留給 §4 C5）。
   跑 E2E 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E 失敗不得自行判定為雜訊，證據上報。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` 的 exit code 為準。測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。E2E SHALL NOT 使用 `waitForTimeout`。
i. **禁止任何遠端 CF 操作**（deploy、d1 create、`--remote`、secret put）；只允許 `--local`、`--dry-run`。測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息。
j. **SHALL NOT 新增任何 npm 相依**；**SHALL NOT 改動** `components/matchmaker/**`（含 `MatchmakerTabs.tsx`）、`lib/matchmaker/**`（含 `section-nav.ts`）、`hooks/**`、`app/layout.tsx`、`app/globals.css`、`components/ui/**`、`components/layout/navItemStyles.ts`、`components/layout/AccountEntry.tsx`、後端與核心套件。需要時回報 `BLOCKED`。
k. **既有 it／test 的名稱與斷言一律不得修改**，唯一例外為 tasks 檔頭列出的一處（`SiteNavbar.test.tsx` 的 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」的 pathname、註解與新增一行）。
l. Commit：Conventional Commits、繁體中文；**commit 訊息不得加任何 attribution／footer 行**（不加 Claude-Session、Generated、Co-Authored-By）。註解只寫「為什麼」，不寫 change 名稱、task 編號或審查流程。
m. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：一個十行內的純函式、元件一行判定與一個屬性、一個靜態 Server Component，各有現成範本；難點只在 E2E 的 locator 範圍，sonnet 足以勝任。
- **upgrade_to_opus_when**:
  - 404 的 `metadata.title` 在 E2E 未生效、或狀態碼不是 404（design Risk 1、2），且無法以 Next 文件解釋。
  - 新增 `aria-current` 後既有 E2E 出現多重命中（strict mode violation）而無法以縮小 locator 範圍解決（不得改既有 test）。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出（單檔 vitest、單檔 E2E）；先綠者已點名標 regression guard。
  - [ ] it／test 名稱與 delta spec 驗收錨點逐字相同。
  - [ ] 只改了 tasks 檔頭授權的一處既有 it（pathname、註解、新增一行）；其餘既有 it 一行未改且仍綠。
  - [ ] `git diff main --stat` 只含 proposal Impact 列出的檔案。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **rationale**：對照 Scenario 與測試名稱、檢查是否越界，需要中等判斷力。
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個新增 Scenario 都有對應測試，名稱逐字相同。
  - [ ] RED 對應正確 Scenario，且為真紅（依 e 機械複驗）。
  - [ ] GREEN 只滿足 RED：沒有改 navbar 視覺、沒有改 `MatchmakerTabs`／`section-nav.ts`、沒有加 `error.tsx`／`loading.tsx`／Open Graph（scope creep）。
  - [ ] 授權修改的既有 it 只改了 pathname、註解與新增一行，名稱與既有兩行斷言未變。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **rationale**：判定式的邊界（尾斜線、前綴相似、首頁特判）與 a11y 屬性輸出細節，需要最強模型抓邊界。
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（b～d），特別是 §2 ①④ 與 §3 ③④。
  - [ ] `lib/navActive.ts` 不 import React／`next/navigation`；`SiteNavbar` 不再有內聯比對式。
  - [ ] `aria-current` 寫法與 `MatchmakerTabs` 一致（`active ? "page" : undefined`）。
  - [ ] `not-found.tsx` 沒有 `"use client"`、沒有硬寫 navbar 高度、沒有巢狀三元運算；註解只寫理由。
  - [ ] E2E 的 locator 皆限定在 `main`／`banner`／具名 navigation 內；沒有 `waitForTimeout`。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **rationale**：需要一次看完全部 commit，確認兩組的寫法一致、合併後範圍不越界。
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；主 spec 無任何改動。
  - [ ] 指令驗收 C1～C7 皆有紀錄；前端測試檔數＝基線＋2、測試數＝基線＋12、五個 browser project 各＝基線＋3 且全綠、user-data 不變且全綠。
  - [ ] `nextjs-pickball/CLAUDE.md` 的敘述與新行為一致。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - 既有 E2E 出現任何新失敗（特別是 `aria-current` 造成的多重命中）→ 證據上報 coordinator 裁定，不得自行改既有 test。
  - 404 的 title 或狀態碼與 spec 不符 → 停止並回報 `BLOCKED`，不得改用 `global-not-found.tsx` 或 client 端改 `document.title`（design Risk 1）。
  - 實作上發現必須改 `app/layout.tsx`、`MatchmakerTabs` 或 navbar 視覺才能達成 → 停止並升級（屬範圍變更）。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
