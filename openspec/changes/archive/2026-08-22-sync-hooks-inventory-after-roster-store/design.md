# Design — sync-hooks-inventory-after-roster-store

## Context

`nextjs-pickball/hooks/` 由多個 capability 共用，但只有一份跨 capability 歸屬清單，
維護在 `openspec/specs/pickleball-guide-page/spec.md` 的
「互動行為由三支 hooks 提供且各有 smoke test」Requirement 內。

`add-player-roster`（M1）新增 `useRosterStore` 時只更新了自己的 `player-roster` 規格，
清單維護方那一側沒同步。這與 `4c5b724` 漏更新 `useFocusMode` 是同一個根因，
差別在於：那次之後規格已明文寫下「新增方 SHALL 一併更新此清單」，這次仍然發生。

## Goals / Non-Goals

**Goals**

- 讓 `hooks/` 目錄下 11 支 hook 在規格清單中全數有歸屬
- 讓規格自己記住這個根因失敗過兩次，而不只是補上一個名字

**Non-Goals**

- 不改任何 `.ts` / `.tsx`，不動任何測試
- 不改 `player-roster` 規格（它那側是對的）
- 不回頭修 archived change 的錯誤宣告
- 不在本 change 引入自動化守衛（見 Open Questions）

## Decisions

### D1：本 change 以 `spec-driven` schema 執行，不用 config.yaml 的 `tdd-subagent-worktree`

`openspec/config.yaml` 選定 `tdd-subagent-worktree`，其 `apply.requires` 為
`[proposal, specs, design, test-plan, execution-plan, tasks, environment]`，
且 tasks.md 明文禁止「沒有對應 RED 測試的實作 task」。

本 change 零程式碼、零測試，硬套會產生三個不誠實的產物：一份沒有任何測試列的 test-plan.md、
一份沒有 Implementer 可派的 execution-plan.md，以及一個為了改兩行文字而開的 git worktree。

**替代方案**：
- 硬套 `tdd-subagent-worktree` —— 產出上述空殼 artifact，違反「紅燈要是真的」的同一精神（不偽造流程證據）
- 改用 `tdd-sequential-lite` —— 仍要求 test-plan.md，同樣落空

**採用**：per-change `.openspec.yaml` 覆寫為 `spec-driven`（proposal / specs / design / tasks）。
這是 CLI 一級支援的解析順序（explicit → `.openspec.yaml` → `config.yaml` → 預設），
且與同性質先例 `2026-08-13-sync-hooks-inventory-after-focus-mode` 一致。
覆寫理由寫在 `.openspec.yaml` 註解內，避免下次有人以為是漏設。

### D2：只出 1 條 MODIFIED，不動「拆檔結構符合 components / data / hooks 三層」

上一次先例已把該 Requirement 的「另有 6 支」去數字化，改為指向歸屬清單。
現在新增一支 hook 不會使它失真，故不需再改——**改得越少，delta 與主規格的逐字比對越可信**。

### D3：不動 `player-roster` 規格

沿用先例對 `scoreboard` 的判準：新增方那側的宣告是完整的，錯的是清單維護方沒收到同步。
把修正放在失真的那一份規格內，責任邊界才清楚。

### D4：先例欄記兩筆，並點名 proposal 的錯誤宣告

`add-player-roster` 的 proposal 明寫「對既有 capability `pickleball-guide-page` **無影響**」。
那句話是這次漏更新的直接原因：作者確實檢查過影響範圍，只是不知道清單在那裡。
只補名字會讓下一個人重蹈覆轍，故把「連宣告無影響都可能是錯的」寫進規格。

## Risks / Trade-offs

- [MODIFIED 貼漏內容導致 archive 時規格掉細節] → tasks A2 要求 archive 後 `git diff` 只出現兩處刻意修改，
  以 `--numstat` 逐項對帳
- [散文規則第三次失效] → 本 change 不解決此風險，改以 Open Questions 移交後續 change

## Migration Plan

不適用（純文字變更，無部署與資料影響）。回退方式為 `git revert` 該 commit。

## Open Questions

- **是否為歸屬清單加自動化守衛測試？** 形式為：掃 `nextjs-pickball/hooks/*.ts*`（排除 `*.test.*`），
  逐支檢查其名稱是否出現在 `openspec/specs/pickleball-guide-page/spec.md`，缺一即紅。
  它會把「散文規則」升級成 CI 級的跨檔耦合守衛，性質同 `data/guide/tocItems.test.ts` 的 id 守衛。
  代價：新增測試檔屬行為邏輯，須走 TDD 三步，且守衛對象是 openspec 檔案而非產品程式碼，
  歸屬 capability 需先釐清（`dev-workflow` 或 `pickleball-guide-page`）。
  **本 change 不做**，留待獨立 change 決定。
