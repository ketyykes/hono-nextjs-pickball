<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

---

## AGENTS.md（nextjs-pickball workspace）

匹克球指南專案的前端 workspace：Next.js 16 + React 19，經 OpenNext 部署為 Cloudflare Worker。

> 上方 `nextjs-agent-rules` 標記區段由 **Next.js 自行維護**，版本更新或
> `npx @next/codemod agents-md` 會整段覆寫。
> **專案自己的內容一律寫在標記之外**，也就是本行以下。

**本節只放指標，不放規則內文。**
本 workspace 慣例與規則的單一來源是 [`CLAUDE.md`](./CLAUDE.md) —— 檔名雖沿用 Claude Code 慣例，
內容不限特定工具，**所有 coding agent 都請直接讀它**。
這樣做是為了避免兩份文件各自演化、漂移到無法對齊。

### 依序讀這些

| 檔案 | 內容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | **必讀**：本 workspace 的環境、常用指令、架構總覽、目錄約定與測試慣例 |
| [`../AGENTS.md`](../AGENTS.md) | repo root 的 agent 入口，指向 root 層的治理規則 |
| [`../CLAUDE.md`](../CLAUDE.md) | root 層規範的單一來源：openspec change 流程、TDD 規則、跨 workspace 慣例 |

> ⚠️ 若你的工具不會自動跟隨上述連結，請主動把這些檔案讀入 ——
> 只讀本檔等於沒有拿到本專案的規範。

### 要新增規則時

本 workspace 的規則一律寫進 [`CLAUDE.md`](./CLAUDE.md)，跨 workspace 的規則寫進
[`../CLAUDE.md`](../CLAUDE.md)，TDD 相關則寫進 [`../openspec/config.yaml`](../openspec/config.yaml)，
**都不要寫在本檔**，更不要寫進上方的 `nextjs-agent-rules` 標記內（會被覆寫）。
本檔只在「該讀哪些檔案」這件事改變時才需要更新。
