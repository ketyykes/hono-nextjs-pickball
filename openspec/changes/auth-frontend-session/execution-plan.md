# Execution Plan: auth-frontend-session

## Mode

`subagent-driven`

**逐組制**（runbook「執行模式」）：tasks.md 每個 `§` 群組派一個全新 Implementer 一次做完；組內逐 task 走 TDD 三步、逐 task commit
（`test:`／`feat:`；例外層與文件 `chore:`／`docs:`；3.6 的主 spec 同步用 `docs(openspec):`）。整組完成後 Stage 1 → Stage 2；全部完成後 Final Code Review。
群組間**嚴格序列**，SHALL NOT 平行派 Implementer。§1 由 leader 自己執行或派一個 Implementer，結果寫進 design.md Open Questions 並 commit。

## Per-task contract

subagent 不繼承主對話 context。每次派工 MUST **逐字貼進 prompt**：

1. **tasks.md 該組完整文字**（含檔頭的「訪客路徑零迴歸」與例外層說明）。
2. **test-plan.md 對應列**（五欄一字不改；含本組用到的指令驗收列）。
3. **相關 spec 片段**：本組觸及的每個 Requirement 全文與 Scenario。§4、§6 另貼 `openspec/specs/site-navbar/spec.md` 的「窄螢幕導航呈現」全文（既有約束）。
4. **相關 design 片段**（對照表）：
   - §2 → Decision 1、2
   - §3 → Decision 1、6；Risks 第 5 條
   - §4 → Decision 3、6；Risks 第 1 條；Open Questions 1
   - §5 → Decision 4
   - §6 → Decision 5；Risks 第 1、2、3、4 條
   - §7 → Migration Plan
5. **B2 的既有介面**：貼 `hono-pickball/src/index.ts` 中 `/api/session`、`/api/auth/*` 的現況程式碼，與 `nextjs-pickball/tests/e2e/helpers/test-account.ts` 全文。
6. **「不給你」清單**：其他群組 task、B1／B2 的 artifact、runbook 全文、後端 spec。缺 context 回報 `NEEDS_CONTEXT`。
7. **工作位置**：主 repo `/Users/m2_24gb/Desktop/project/nextjs-pickball`，分支 `change/auth-frontend-session`。
   **不用 git worktree**：禁止 `git worktree add`、切換分支、`git merge`、`git push`。

### 派工單必帶（逐條原樣貼進每一張派工單）

a. **指令裡禁止 `cd`，一律用絕對路徑**。
b. Implementer 交件前 MUST 自跑 mutation 並列出「幾次／改什麼／是否轉紅」。本 change 必做變異（依所屬群組）：
   - §2：形狀驗證拿掉 `authEnabled` 型別檢查；catch 改為 rethrow；401／404 對應互換；`Content-Type` 拿掉；signOut 改 GET。
   - §3：訂閱時不發請求（改為模組載入時發）；拿掉「進行中請求共用」；`refresh` 不通知訂閱者；`getServerSnapshot` 回傳 client 快照。
   - §4：loading 時渲染登入連結；未啟用時渲染登入連結；登出後不呼叫 `refresh`；`refresh` 先於 `signOut`；拿掉 `whitespace-nowrap`。
   - §5：成功後 `push` 取代 `replace`；失敗不清密碼；送出期間不 disable；`unavailable` 與 `failed` 文案互換；未啟用時仍顯示表單。
   - **每個狀態分支（loading／未啟用／訪客／已登入）、每個錯誤分支都要有至少一個會轉紅的變異。**
c. mutation harness 三重落地檢查：`src.count(old) == 1`、替換後 `new != old`、`git --no-pager diff --stat -- <file>` 有輸出；另放一條等價變異當對照組。
d. Stage 2 Reviewer MUST 獨立再做 mutation、逐分支逐欄位機械盤點覆蓋率，不採信 Implementer 自述。
e. 後端 API 每個端點 MUST 有「未登入 401」與「存取他人資料被拒」的測試——本 change 不新增後端端點（N/A）；Reviewer 確認 `hono-pickball/**` 零改動。
f. 紅燈宣稱一律用 `git show <commit>^:<path>` 機械複驗；查核不過改標 regression guard。
g. 逐 task commit：`test:` 一個、`feat:` 一個。註解只寫「為什麼」。
h. 編輯器診斷不可信，以 `pnpm -r exec tsc --noEmit` exit code 為準。前端 `tsconfig.json` 的 `types` 不含 `vitest/globals`，`describe`／`it`／`expect`／`vi` MUST 顯式匯入。
i. 跑 E2E／dev server 前後用 `lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep` 清殘留，
   只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 [樣式...]`
   （不要用 `test:e2e --`）。E2E 失敗不得自行判定為雜訊，證據上報。
j. **禁止任何遠端 CF 操作**。
k. **測試帳密禁止寫進任何會被 commit 的檔案或 commit 訊息**；`tests/e2e/.auth/` 不得 commit。
l. 單檔測試 `pnpm --filter ./nextjs-pickball test --run <path>`，**`--run` 前不可加 `--`**。
m. **SHALL NOT 新增任何 npm 相依**（含前端 `better-auth`、SWR、新的 shadcn 元件）；需要時回報 `BLOCKED`。
n. **既有 it／test 的斷言一律不得修改**；`SiteNavbar.test.tsx` 只允許新增 mock 區塊。新增 hook 依 tasks 3.5～3.6 同步主 spec 歸屬清單（`hooksInventory.test.ts` 會擋）。
o. Commit：Conventional Commits、繁體中文，結尾一行 `Claude-Session: <coordinator 傳下的值>`，不得加 Generated 或 Co-Authored-By。
p. 派出 subagent 之後不可結束回合；脈絡將盡就在派下一組**之前**乾淨停止，狀態寫進 design.md `## Open Questions` 並 commit 後回報。

## Roles

**任何角色 SHALL NOT 使用 `fable`；不使用 `haiku`。** 每次呼叫 Agent tool MUST 明確帶 `model`。

### Implementer

- **default_model**: `sonnet`
- **rationale**：client／store／元件皆為小模組，行為已由 spec 定死。
- **upgrade_to_opus_when**:
  - §3：`useSyncExternalStore` 出現 hydration 警告或 React 19 的快照快取問題（`getSnapshot` 必須回傳穩定參考）。
  - §6：E2E 夾具或時序問題（globalSetup 與 webServer、多 project、reuseExistingServer）需要跨工具診斷。
  - 同一群組被同一 reviewer 連續退回 2 次。
- **self-review checklist**：
  - [ ] 每個 RED 的紅燈輸出已貼出。
  - [ ] it／test 名稱與 spec 驗收錨點逐字相同。
  - [ ] 既有測試檔除 `SiteNavbar.test.tsx` 的 mock 外零改動（`git diff main --stat -- '**/*.test.*' 'tests/e2e/specs/*'` 只列新增檔與該檔）。
  - [ ] `NAV_LINKS` 零改動；`/login` 不在其中。
  - [ ] `getSnapshot` 回傳穩定參考（未變更時同一物件）。
  - [ ] `pnpm -r exec tsc --noEmit` exit 0、`pnpm --filter ./nextjs-pickball lint` 0 errors。

### Spec Reviewer（Stage 1）

- **default_model**: `sonnet`
- **required first action**：覆述收到的 spec／test-plan 片段標題；對不上回報 `NEEDS_CONTEXT`。
- **review checklist**：
  - [ ] 每個 Scenario 都有對應測試或指令驗收，名稱逐字相同。
  - [ ] 未啟用／載入中時 navbar 不渲染任何元素（訪客零迴歸的核心）。
  - [ ] 前端沒有讀 cookie 名稱、沒有 build-time 變數判斷登入入口、沒有各自呼叫 `/api/session`。
  - [ ] 既有 project 未加 `storageState`；登出測試不使用共用 storage state。
  - [ ] 沒有 scope creep：沒有 Google 按鈕、使用者選單、資料清空、任何後端改動。
  - [ ] regression guard 有誠實標註（特別是 6.2）。
- **SHALL NOT**：評論命名與結構。

### Code-Quality Reviewer（Stage 2）

- **default_model**: `opus`
- **required first action**：同 Stage 1。
- **review checklist**：
  - [ ] 獨立 mutation（派工單必帶 b～d），逐狀態分支、逐錯誤分支盤點存活數。
  - [ ] fetch 只在 `lib/auth/session-client.ts`（`grep -rn "/api/session\|/api/auth" nextjs-pickball --include=*.ts* | grep -v test` 只命中該檔）。
  - [ ] 配色與內距與既有 navbar 連結一致，沒有第二套寫死的色彩判斷。
  - [ ] 無障礙：圖示 `aria-hidden`、可及名稱由 `aria-label` 提供、錯誤 `role="alert"`、表單 label 與 input 關聯。
  - [ ] 單元測試沒有真實網路請求（`SiteNavbar.test.tsx` 已 mock）。
- **SHALL NOT**：重新爭論規格。風格分歧時既有 codebase 風格勝出。

### Final Code Reviewer

- **default_model**: `opus`
- **when**：所有 task 勾完後一次。
- **review checklist**：
  - [ ] `git diff main --stat` ⊆ proposal Impact；`hono-pickball/**` 零改動；主 spec 只有 3.6 授權的一句。
  - [ ] 指令驗收 C1～C5 皆有紀錄；完整 E2E（C2）既有 test 數與基線一致。
  - [ ] `nextjs-pickball/CLAUDE.md` 已同步（`/login`、hooks 歸屬、`lib/auth/`、E2E 夾具）。
  - [ ] `useSession` 的介面足以讓 Wave 2 的儲存層依 `status`／`user` 切換（不需要再開第二個 session 來源）。
- **SHALL NOT**：重審單一 task 細節。

## Escalation

- 同一群組被同一 reviewer **連續退回 3 次** → Implementer 升 `opus` 重派。
- Spec Reviewer 判斷前後不一致 → 升級給人類，結論補進 design.md Open Questions。
- Code-Quality 與 Implementer 風格分歧 → 既有 codebase 風格勝出。
- 任一階段 BLOCKED 超過 30 分鐘 → 升級給人類。
- **本 change 專屬**：
  - **窄螢幕擠不下**（tasks 6.3）：停止並升級給人類，附量測與截圖；候選方案見 design Open Questions 1，SHALL NOT 自行選擇。
  - 既有 E2E 在 `.dev.vars` 齊備時出現任何新失敗 → 證據上報 coordinator 裁定。
  - B2 的回應契約與本 design Context 不同、需要改後端 → 停止並升級（後端改動不屬本 change）。
  - `.dev.vars` 不齊備導致 auth spec 只能 skip → 停止並向 coordinator 索取，SHALL NOT 以 skip 當作通過。

## Model selection principle

用能勝任該角色的最弱模型；Implementer 下限 `sonnet`、審查 `sonnet`／`opus`，**任何情況不得使用 `fable`**。
