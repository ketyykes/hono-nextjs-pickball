# Design — sync-doc-drift-and-guard-hooks-inventory

## Context

三件事共用同一個根因：**規格與文件之間的指標，沒有任何機制驗證它指到的東西還在**。
hooks 歸屬清單漏更新兩次、`openspec/config.yaml` 搬空後留下 11 處死指標、
`README.md` 的目錄樹在新增 5 個子目錄後沒人回頭改——三者都是人讀規則守不住的縫。

本 change 補其中最會復發的一條（hooks 清單）為自動化守衛，其餘兩條以文字同步收斂。

## Goals / Non-Goals

**Goals**

- hooks 歸屬清單的漏更新在測試階段就轉紅，不再靠 code review 抓
- `openspec/config.yaml` 不再被任何文件描述為 TDD 規則來源
- 規格明訂「檔案角色變更時，指標 MUST 一併更新」，讓下次搬移有規則可依

**Non-Goals**

- 不為 `AGENTS.md` 指標寫自動化守衛（`dev-workflow` 的既有 Scenario 已以人工檢查表述，
  改為自動化是另一個獨立決策，不在本 change）
- 不重寫 `README.md` 的其他區塊
- 不動任何歷史檔的指令原文

## Decisions

### D1：本 change 以 `tdd-sequential` schema 執行

`openspec/config.yaml` 選定 `tdd-subagent-worktree`，其 apply 流程強制
「每個 task 派一個 Implementer subagent + Stage 1 spec review + Stage 2 code review」
並要求 git worktree 隔離。

本 change 的程式碼異動是**一支測試檔、兩個 test case**，其餘全是文字同步。
派工與 worktree 的成本遠高於工作本身，且本 session 未取得 subagent 派工授權。

**替代方案**：
- `tdd-subagent-worktree`（config 預設）—— 需要 subagent 派工，本 session 不執行
- `tdd-sequential-lite` —— 無 design.md，但本 change 有三個需要記錄的決策（D1-D3）

**採用**：`tdd-sequential`（proposal / specs / design / test-plan / overview / tasks，
單一 agent 依序執行，無 worktree）。理由寫進 `.openspec.yaml` 註解。

### D2：守衛測試歸 `pickleball-guide-page`，不歸 `dev-workflow`

守衛的對象是 `pickleball-guide-page` 規格內的一段清單，失真的也是這份規格。
`dev-workflow` 管的是流程與文件治理，不管單一 capability 的規格內容正確性。

同 repo 的先例一致：`data/guide/tocItems.test.ts` 守 TOC id 與 section 元件的耦合、
`data/guide/priceStars.test.ts` 守 `app/` 下的金額字樣——兩者掃描的檔案都不全屬本 capability，
但**清單的擁有者就是守衛的擁有者**。

### D3：守衛測試以 `process.cwd()` 相對定位跨出 workspace 讀 `openspec/`

vitest 的 root 固定為 `nextjs-pickball/`（`vitest.config.ts` 所在目錄），
故 `join(process.cwd(), "..", "openspec", "specs", ...)` 穩定成立。

**比對範圍限定在該 Requirement 區塊內**（`### Requirement: 互動行為由三支 hooks...`
到下一個 `### Requirement:` 之前），不是整份 spec.md——否則某支 hook 只要在檔案別處
被順帶提到就會誤判為「已列入清單」。

**替代方案**：把清單抽成 `hooks/inventory.ts` 之類的資料檔，測試比對資料檔而非 markdown。
不採用：那會讓規格與程式碼各存一份清單，等於製造第三個會漂移的地方。
直接讀規格文字雖然脆弱（規格改寫標題就會壞），但**壞掉時是紅燈，不是靜默失真**。

### D4：歷史文件只改頁首註記的指標，不改指令原文

`docs/superpowers/plans/*.md` 的頁首註記是後來由 change 補上的編輯性中介文字，
指向「正確形式在哪裡」；正文的失效指令原文屬歷史紀錄，`dev-workflow` 規格明文要求不得竄改。
本 change 只把註記的目標從 `openspec/config.yaml` 改為 root `CLAUDE.md`。

## Risks / Trade-offs

- [守衛測試依賴規格 markdown 的標題文字，改標題會使測試轉紅] → 這是刻意的：
  標題是 delta 比對的 anchor，改它本來就該走 change 並同步測試
- [MODIFIED 貼漏內容導致 archive 時規格掉細節] → 三份 delta 皆以腳本從主規格逐字擷取後定點取代，
  每處取代都斷言命中數為 1；archive 後再以 `git diff` 對帳
- [文件同步漏一處] → tasks 的驗收以 `grep -rn` 掃全 repo，不逐檔目視

## Migration Plan

不適用。回退方式為 `git revert` 該 commit。

## Open Questions

無。
