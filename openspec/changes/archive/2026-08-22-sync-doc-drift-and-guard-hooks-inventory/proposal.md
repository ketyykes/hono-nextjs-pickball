# Proposal — sync-doc-drift-and-guard-hooks-inventory

## Why

`2026-08-22-sync-hooks-inventory-after-roster-store` 的 verify 階段留下三項 SUGGESTION，
逐項追下去後發現其中一項不是單點過期，而是**一整族指向同一個已搬空檔案的死指標**。

### 1. hooks 歸屬清單只有散文規則守著，已失效兩次

`openspec/specs/pickleball-guide-page/spec.md` 的 hook 歸屬清單是跨 capability 的單一來源，
規格內已明文要求「新增方 SHALL 一併更新此清單」。該規則寫下後仍再次失效
（`4c5b724` 漏 `useFocusMode`、`add-player-roster` 漏 `useRosterStore`）。
同 repo 內同性質的跨檔耦合（`data/guide/tocItems.ts` 的 id、guide 原始碼的金額字樣）
都已有守衛測試，唯獨這條沒有。

### 2. `openspec/config.yaml` 的角色已變，但 19 處指標仍指向它（散落 16 個檔案）

commit `a1e0afd` 之後，`openspec/config.yaml` 只承載 `schema` 與 `context` 兩項設定；
TDD 三步與紅燈規則在 root `CLAUDE.md`，前端適用範圍與例外層在 `nextjs-pickball/CLAUDE.md`。
但下列位置仍宣稱它是 TDD 規則／單檔測試指令的來源：

| 位置 | 現況寫的 | 實際 |
|---|---|---|
| `openspec/specs/dev-workflow/spec.md:15` | 單檔指令正確形式的來源之一 | 該檔已無任何指令內容 |
| `openspec/specs/dev-workflow/spec.md:36` | 歷史檔的失效註記應指向它 | 指向後找不到正確形式 |
| `openspec/specs/dev-workflow/spec.md:152` | AGENTS.md 應指向它「（TDD 規則）」 | 角色已變為 schema + 輸出語言 |
| `AGENTS.md`（表格列 + 「要新增規則時」段） | 「TDD 規則的權威來源」 | 同上 |
| `nextjs-pickball/AGENTS.md:38`、`hono-pickball/AGENTS.md:24` | 「TDD 相關則寫進 config.yaml」 | 同上 |
| `CLAUDE.md:112` | 「目前只有一行 `schema:`」 | 另有 `context:` 區塊 |
| `nextjs-pickball/CLAUDE.md:69` | 「該檔現在只指定 workflow schema」 | 同上 |
| `docs/superpowers/plans/*.md`（5 份）＋ `specs/` 1 份的頁首註記 | 「正確形式見 `openspec/config.yaml`」 | 死指標 |
| `docs/superpowers/specs/2026-05-08-scroll-driven-tour-design.md:237` | 「依 `openspec/config.yaml` 規則」，且**全檔沒有已被取代的頁首標註** | 讀者會當成現行規則 |
| `.claude/agents/hono-test-writer.md:48` | 「權威來源：`openspec/config.yaml`」 | 該檔已無 TDD 內文 |
| `.claude/agents/code-reviewer-readonly.md:65` | 「例外層見 `openspec/config.yaml`」 | 同上 |
| `.claude/agent-memory/code-reviewer-readonly/project_matchmaker_allocation_engine.md:245` | 引用 `config.yaml:24`、`config.yaml:18` 兩個行號 | 行號已不存在 |

死指標比沒有指標更糟：讀者會真的去開那個檔，然後在裡面找一段不存在的內容。

### 3. `nextjs-pickball/README.md` 的結構區塊過期

`:44-46` 只列出 `ui/` 與 `guide/` 兩個子目錄，實際有 7 個
（另有 `layout/`、`matchmaker/`、`quiz/`、`scoreboard/`、`tour/`）。
同區塊的「11 個 shadcn 元件」與「7 個 TS 資料檔」實測正確，不動。

## What Changes

1. **新增守衛測試** `nextjs-pickball/hooks/hooksInventory.test.ts`：雙向驗證 hooks 目錄與規格清單
   （目錄→清單、清單→目錄），任一方漏更新即轉紅
2. `pickleball-guide-page` 的 hooks Requirement 補上守衛義務與兩條驗收 Scenario
3. `dev-workflow` 兩條 Requirement 改正 `openspec/config.yaml` 的角色描述，
   並明訂「SHALL NOT 被任何入口文件描述為 TDD 規則來源」
4. 同步所有指標：5 份入口／規範文件（root `AGENTS.md`、兩個 workspace `AGENTS.md`、root `CLAUDE.md`、
   `nextjs-pickball/CLAUDE.md`）、6 份歷史文件的頁首註記、2 份 `.claude/agents/` 定義、
   1 份 `.claude/agent-memory/` 紀錄；並為唯一一份缺頁首標註的歷史設計文件補上「已被 openspec 取代」
5. 補正 `nextjs-pickball/README.md` 的 `components/` 結構區塊

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `pickleball-guide-page`：1 條 MODIFIED（hooks Requirement 補守衛義務 + 2 條 Scenario）
- `dev-workflow`：2 條 MODIFIED（單檔測試指令來源、agent 資產與文件單一來源）

## Impact

- **受影響程式碼**：`nextjs-pickball/hooks/hooksInventory.test.ts`（新增，唯一的程式碼異動）
- **受影響文件**：`AGENTS.md`、`nextjs-pickball/AGENTS.md`、`hono-pickball/AGENTS.md`、
  `CLAUDE.md`、`nextjs-pickball/CLAUDE.md`、`nextjs-pickball/README.md`、
  `docs/superpowers/plans/` 下 5 份 + `docs/superpowers/specs/` 下 2 份歷史文件、
  `.claude/agents/hono-test-writer.md`、`.claude/agents/code-reviewer-readonly.md`、
  `.claude/agent-memory/code-reviewer-readonly/project_matchmaker_allocation_engine.md`
- **測試影響**：新增 2 個 test case，皆為 **regression guard**（行為已正確，測試寫下即綠，
  依 root `CLAUDE.md` 誠實標註，不偽造紅燈）
- **風險**：低。守衛測試讀取 `../openspec/`，跨出 workspace 邊界——以 `process.cwd()` 相對定位，
  vitest root 固定為 `nextjs-pickball/`，見 design D3
- **明確不做**
  - **不改** `docs/superpowers/plans/*.md` 的指令原文——歷史紀錄的原文不得竄改，
    只更新頁首註記的指標目標
  - **不動** `openspec/changes/archive/**`
  - **不改** `nextjs-pickball/README.md` 的其他行（「11 個」與「7 個」實測正確）
  - **不把守衛測試放進 `dev-workflow`** capability（歸屬理由見 design D2）
