## Context

`2026-08-13-agents-md-by-reference` 建立了 root 層的「AGENTS.md 只放指標、CLAUDE.md 是單一來源」模式，但那次的 Requirement 主詞是 root，workspace 層沒被涵蓋。現況（實測）：

| 目錄 | `CLAUDE.md` | `AGENTS.md` | 非 Claude agent 從這裡進來會拿到 |
|---|---|---|---|
| repo root | ✅ | ✅ 指標檔 | 完整治理規則入口 |
| `nextjs-pickball/` | ✅ | ⚠️ 只有 vendor 區塊 | 一句 Next.js 版本警語 |
| `hono-pickball/` | ✅ | ❌ 不存在 | 什麼都沒有 |

`nextjs-pickball/AGENTS.md` 全檔 5 行，`<!-- BEGIN:nextjs-agent-rules -->` 與 `<!-- END:nextjs-agent-rules -->` 之間是 Next.js 的 vendor 內容，**標記外一個字都沒有**。

三項硬約束框住了設計空間：

1. **vendor 標記內的內容不歸專案管。** `nextjs-pickball/node_modules/next/dist/docs/01-app/02-guides/ai-agents.md:99` 明文：標記界定 Next.js 管理的區段，專案自己的指示要寫在標記外才不會被未來更新覆寫。
2. **`@AGENTS.md` 只對 Claude Code 生效。** `nextjs-pickball/CLAUDE.md:1` 那行是官方建議用法（同檔 `:76-80`），但它解決的是「Claude Code 使用者不必重複內容」，方向是 CLAUDE.md ← AGENTS.md。要救的非 Claude agent 走的是反方向。
3. **root spec 已定調 CLAUDE.md 必須自足。** `openspec/specs/dev-workflow/spec.md:154`：「root `CLAUDE.md` MUST 自足：SHALL NOT 為取得任何規範內文而回指 `AGENTS.md`」。任何新設計不能違反這個「不互指」原則。

## Goals / Non-Goals

**Goals:**

- 讓只認 `AGENTS.md` 的 agent 從**任一** workspace 進來都能走到該層 `CLAUDE.md` 與 root 治理入口
- 把這個義務寫進 `dev-workflow` spec，讓下次文件稽核不會再合法跳過 workspace 層
- 指標段對 Next.js 的 vendor 更新免疫
- 前後端兩個 workspace 的入口設計對稱

**Non-Goals:**

- **不把規範內文複製進任何 `AGENTS.md`** —— 那正是 root change 要消滅的漂移源
- **不動 root `AGENTS.md`**，它已符合現行 Requirement
- **不刪 `nextjs-pickball/AGENTS.md` 的 vendor 區塊** —— Next.js 16 的 breaking change 提醒對前端 agent 仍有價值（沿用 `2026-08-12-docs-and-agent-tree-consolidation/design.md:80` 的既有決定）
- **不動 `nextjs-pickball/CLAUDE.md:1` 的 `@AGENTS.md`**，那是官方建議用法且目前運作正常
- 不處理 `docs/`、`.agents/`、`skills-lock.json` 的歸屬，那些在前兩個 change 已收斂

## Decisions

### D-1｜指標段寫在 `<!-- END:nextjs-agent-rules -->` 之後，不寫在標記內

**理由**：官方明講標記內會被覆寫（`ai-agents.md:99`），且 16.1 以前的 `npx @next/codemod@latest agents-md` 就是整段重寫。指標段一旦被吃掉，這個 change 就白做了。

**替代方案**：
- 寫在標記內 —— 被覆寫風險，直接淘汰。
- 移除 vendor 標記、把 Next.js 警語手抄成自己的內容 —— 等於接手維護框架的版本提醒，next 升級時會漂掉，而且違反「AGENTS.md 不放內容」的既有原則。

**連帶**：delta spec 的 Scenario 驗收「標記外存在指向 `./CLAUDE.md` 的連結」，**不驗收標記內的特定文字**，否則 next 一升版 spec 就失效。

### D-2｜vendor 區塊文字同步為 16.2.9 官方現行範本

現況是舊版措辭 `# This is NOT the Next.js you know`；已安裝 next 為 `16.2.9`，官方現行範本（`ai-agents.md:66-74`）為：

```
<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->
```

**理由**：標記內既然歸 Next.js 管，就應該與官方一致；留著舊措辭只會在未來某次 codemod 產生無謂 diff。這是一次性對齊，不建立長期維護義務 —— **spec 不驗收這段文字**（見 D-1）。

**這段保持英文**：它是 vendor 內容，不是專案註解，`~/.claude/rules/coding-style.md` 的繁中規則不適用。標記外的指標段則用繁中，與 root `AGENTS.md` 一致。

### D-3｜Requirement 的適用範圍寫成「含 `CLAUDE.md` 的目錄」，而非「workspace 目錄」

**理由**：可驗證性。「workspace」在 spec 裡沒有機器可判定的定義，但「含 `CLAUDE.md` 的目錄」可以用 `git ls-files "*CLAUDE.md"` 精確列舉（實測命中 3 個：root、`nextjs-pickball/`、`hono-pickball/`）。

**副作用（正面）**：`.agents/skills/` 下那兩份受版控的第三方 `AGENTS.md`（`vercel-react-best-practices`、`vercel-react-view-transitions`）所在目錄**沒有** `CLAUDE.md`，因此天然落在義務之外，不需要另立例外條款。spec 仍會明寫一句排除，避免日後有人反向誤讀成「所有 AGENTS.md 都要改」。

**替代方案**：列舉具名路徑（`nextjs-pickball/`、`hono-pickball/`）—— 之後新增 workspace 時 spec 會靜默失效，正是這次要修的那類漏洞。

### D-4｜`hono-pickball/CLAUDE.md` **不**加 `@AGENTS.md`

前端那行是有意義的：`nextjs-pickball/AGENTS.md` 有 vendor 內容，import 進來 Claude Code 才拿得到 Next.js 警語。後端的 `AGENTS.md` 是**純指標**，import 進 `CLAUDE.md` 只會變成「CLAUDE.md 指向 AGENTS.md、AGENTS.md 指回 CLAUDE.md」的循環，且違反 `openspec/specs/dev-workflow/spec.md:154` 的不互指原則。

**結論**：`@AGENTS.md` 的存在與否取決於該 `AGENTS.md` 是否含 vendor 內容，不強求對稱。spec 不對此設義務。

### D-5｜全部屬例外層，驗收用 grep/ls 而非 TDD 三步

本 change 只動 `.md`。`openspec/config.yaml` 的 TDD 範圍是 `nextjs-pickball/{app,components,hooks,lib,data}/**` 與 `hono-pickball/src/**`，`.md` 完全不在內，**連可以掛測試的模組都沒有**。

依 config 的「例外層 task 不強制三步拆分，但至少要指定驗收方式」，每個 task 指定一條可在 shell 執行的 `grep` / `ls` 指令與期望輸出。

**明確禁止**：不得為了湊三步而寫「先讓 grep 失敗再讓它成功」。root `CLAUDE.md` 的「紅燈要是真的」規則同樣適用於這裡 —— 對著一個還沒寫的檔案跑 grep 必然失敗，那不是紅燈，是廢話。

## Risks / Trade-offs

| 風險 | 緩解 |
|---|---|
| Next.js 更新或 codemod 覆寫 `nextjs-pickball/AGENTS.md` 的標記區段 | 指標段放標記外（D-1）；spec 只驗收標記外內容，不鎖定 vendor 文字（D-1、D-2） |
| 指標段與 root `AGENTS.md`、`README.md` 的連結清單各自漂移 | 指標段只列「該讀哪些檔案」，不列規則內文；連結清單變動本來就低頻。delta spec 的 Scenario 驗收「每個連結路徑在檔案系統上實際存在」，斷連會被抓到 |
| 新增 workspace 時忘了補 `AGENTS.md` | Requirement 用「含 `CLAUDE.md` 的目錄」表述（D-3），新 workspace 一建 `CLAUDE.md` 就自動落入義務，稽核指令能列舉出缺口 |
| 修 `README.md:72` 時把後端也寫成「規範見 AGENTS.md」，重蹈措辭不實 | 兩處措辭統一為「規範見 `CLAUDE.md`；`AGENTS.md` 為非 Claude agent 的入口指標」，明確區分角色 |
| Requirement 被誤讀成 `.agents/skills/` 下的第三方 AGENTS.md 也要改 | D-3 的表述天然排除，spec 另加一句明文排除雙重保險 |

## Migration Plan

無資料遷移、無部署順序考量、無 rollback 機制需求 —— 四個檔案的文字變更，`git revert` 即可完全還原。

實作順序：先建 `hono-pickball/AGENTS.md`（新檔，無依賴）→ 改 `nextjs-pickball/AGENTS.md`（vendor 同步 + 指標段）→ 改 `README.md`（此時兩個連結目標都已存在，連結檢查才會過）→ 最後同步 delta spec 至主 spec。

## Open Questions

無。適用範圍已於提案階段確認涵蓋 `hono-pickball/`（原提案只含 `nextjs-pickball/`）。
