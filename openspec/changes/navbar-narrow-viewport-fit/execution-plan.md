# Execution Plan: navbar-narrow-viewport-fit

## Mode

subagent-driven

> **規模說明**：實作只有一個群組（§2，兩組 RED/GREEN，皆改同一個元件的 className），
> 依本 repo 自 M4 起的「逐組」慣例，§2 整組派**一個** Implementer，組內仍逐 task 走 TDD 三步；
> 整組完成後跑一次 Stage 1 → Stage 2，最後一次 Final Code Reviewer。

## Per-task contract

subagent 不繼承主對話 context，派工時 MUST 逐字貼入：

1. tasks.md §2 的全部 task 文字（RED + GREEN 配對，依原順序）
2. test-plan.md 的兩列表格（五欄一字不改）與開頭的「範圍說明」
3. `openspec/changes/navbar-narrow-viewport-fit/specs/site-navbar/spec.md` 的
   「窄螢幕導航呈現」Requirement 全文（含所有 Scenario 與驗收錨點）
4. design.md 的 Context 量測表、Decision 1～3、Risks 全文
5. 不給：其他 capability 的 spec、`openspec/specs/**` 主 spec 全文、全站改版相關討論
6. 工作目錄絕對路徑：`/Users/m2_24gb/Desktop/project/nextjs-pickball`（**不使用 git worktree**，
   在 `change/navbar-narrow-viewport-fit` 分支上施工；SHALL NOT `git worktree add`、
   SHALL NOT 切換分支、SHALL NOT `git merge`）
7. 固定紀律（每次都貼）：
   - TDD 三步，每個 task 各走一輪：先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ 最小實作至綠 → refactor
   - 紅燈要是真的；加入即綠者 MUST 標註 regression guard，SHALL NOT 改斷言偽造紅燈
   - E2E 指令 MUST 為 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/navbar-rwd.spec.ts`
   - test 名稱 MUST 與 spec 驗收錨點逐字一致
   - 註解用繁體中文（台灣用語），只寫「為什麼」
   - SHALL NOT 新增 npm 相依
   - E2E 需要前後端兩個 server；若 `Worker "hono-pickball" not found`，以 `lsof -i :3005 -i :8787` 與
     `ps aux | grep -E "next-server|wrangler|workerd"` 找出殘留 process 後逐一 `kill <PID>`，
     SHALL NOT 用 `pkill -f`；跑完立刻清掉自己起的 process

## Roles

### Implementer

- **default_model**: `sonnet`
- **rationale**：本 repo 使用者硬性規定 Implementer 用 sonnet（見 auto-memory `matchmaker-apply-runbook`），不使用 haiku
- **upgrade_to_opus_when**:
  - Redispatched after BLOCKED
  - E2E 紅綠結果與 design Context 量測不符，需要判斷原因

### Spec Reviewer (Stage 1)

- **default_model**: `sonnet`
- **Review checklist**:
  - [ ] 兩條新 Scenario 都有對應 test，且名稱逐字一致？
  - [ ] RED 的失敗輸出確實來自 `toBeInViewport`／logo hidden 斷言，而非環境錯誤？
  - [ ] ≥ 375px 的 className 零差異（只新增 `max-[375px]:` 前綴的 class）？
  - [ ] 沒有改文案、字級或其他 Requirement 的行為？
- **Never reviews**: naming / structure / quality

### Code-Quality Reviewer (Stage 2)

- **default_model**: `opus`
- **Review checklist**:
  - [ ] className 排列與既有 `sm:` 寫法一致、可讀？
  - [ ] 既有註解是否需同步更新（例如「窄螢幕：收合 logo 文字」那段）？
  - [ ] E2E 與既有 test 的 helper／常數（`NARROW`、`WIDE`）風格一致、無重複？
- **Never reviews**: whether the spec is right

### Final Code Reviewer (integration)

- **default_model**: `opus`
- **Review checklist**:
  - [ ] 合併 diff 只觸及 `SiteNavbar.tsx`、`navbar-rwd.spec.ts` 與本 change 的 artifacts？
  - [ ] `navbar-rwd.spec.ts` 全檔（含既有 390px test）在 chromium 全綠？
  - [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test:web` 全綠？
- **Never reviews**: single-task details

## Escalation

- Implementer 被同一 reviewer 連續退回 3 次 → 升級模型重派
- Spec Reviewer 判斷前後不一致 → 回主對話由人類釐清 spec
- Code-Quality 與 Implementer 風格爭議 → 以既有程式碼風格為準
- 任一階段 BLOCKED 超過 30 分鐘 → 回報人類
- 每次 Agent 呼叫 MUST 明確帶 `model`；任何情況 SHALL NOT 用 `fable` 做實作
