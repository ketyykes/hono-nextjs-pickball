# AGENTS.md（repo root）

匹克球指南專案的 pnpm monorepo。

**本檔只放指標，不放內容。**
root 層慣例與規則的單一來源是 [`CLAUDE.md`](./CLAUDE.md) —— 檔名雖沿用 Claude Code 慣例，
內容不限特定工具，**所有 coding agent 都請直接讀它**。
這樣做是為了避免兩份文件各自演化、漂移到無法對齊。

## 依序讀這些

| 檔案 | 內容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | **必讀**：不可省略的規則（openspec change 流程、TDD 三步、紅燈規則）、結構、常用指令、Cloudflare 部署架構、執行環境注意 |
| [`openspec/config.yaml`](./openspec/config.yaml) | openspec workflow schema 的選定（`schema`）與 artifact 輸出語言（`context`）兩項設定；**不含 TDD 規則內文** |
| [`openspec/specs/`](./openspec/specs/) | 各 capability 的正式規格 |
| [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md) | 前端 workspace 細節 |
| [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md) | 後端 workspace 細節 |

> ⚠️ 若你的工具不會自動跟隨上述連結，請主動把 [`CLAUDE.md`](./CLAUDE.md) 讀入 ——
> 沒讀到它就等於沒有拿到本專案的規範。

## 要新增規則時

一律寫進 [`CLAUDE.md`](./CLAUDE.md) —— TDD 規則同樣寫在該檔，各 workspace 的適用範圍與例外層
寫進該 workspace 的 `CLAUDE.md`（例如 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)）。
**不要寫在本檔**，也不要寫進 [`openspec/config.yaml`](./openspec/config.yaml)。
本檔只在「該讀哪些檔案」這件事改變時才需要更新。
