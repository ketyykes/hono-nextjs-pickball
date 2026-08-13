# AGENTS.md（hono-pickball workspace）

匹克球指南專案的後端 workspace：Hono API on Cloudflare Workers。

**本檔只放指標，不放內容。**
本 workspace 慣例與規則的單一來源是 [`CLAUDE.md`](./CLAUDE.md) —— 檔名雖沿用 Claude Code 慣例，
內容不限特定工具，**所有 coding agent 都請直接讀它**。
這樣做是為了避免兩份文件各自演化、漂移到無法對齊。

## 依序讀這些

| 檔案 | 內容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | **必讀**：本 workspace 的環境、常用指令、架構、測試慣例與部署設定 |
| [`../AGENTS.md`](../AGENTS.md) | repo root 的 agent 入口，指向 root 層的治理規則 |
| [`../CLAUDE.md`](../CLAUDE.md) | root 層規範的單一來源：openspec change 流程、TDD 規則、跨 workspace 慣例 |

> ⚠️ 若你的工具不會自動跟隨上述連結，請主動把這些檔案讀入 ——
> 只讀本檔等於沒有拿到本專案的規範。

## 要新增規則時

本 workspace 的規則一律寫進 [`CLAUDE.md`](./CLAUDE.md)，跨 workspace 的規則寫進
[`../CLAUDE.md`](../CLAUDE.md)，TDD 相關則寫進 [`../openspec/config.yaml`](../openspec/config.yaml)，
**都不要寫在本檔**。本檔只在「該讀哪些檔案」這件事改變時才需要更新。
