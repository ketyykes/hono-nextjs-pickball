# AGENTS.md（repo root）

匹克球指南專案的 pnpm monorepo。本檔給所有 coding agent 讀，不限特定工具。

## 先讀這些

| 檔案 | 內容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | root 層慣例、常用指令、Cloudflare 部署架構 |
| [`openspec/config.yaml`](./openspec/config.yaml) | **TDD 規則的權威來源**：適用範圍、例外層、三步驟要求、測試工具 |
| [`openspec/specs/`](./openspec/specs/) | 各 capability 的正式規格 |
| [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md) | 前端 workspace 細節 |
| [`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md) | 後端 workspace 細節 |

## 不可省略的規則

**任何行為變更都先走 openspec change 流程**，不要直接改 `openspec/specs/` 下的主 spec。
流程為 propose → 產出 proposal / design / tasks / delta spec → 實作 → verify → archive。
歷史上主 spec 曾被直接編輯（commit `e5b709c`、`c7f4f7e`、`ea7955d`），
導致 `changes/archive/` 無法用來重建主 spec —— 不要再製造這種情況。

**行為邏輯一律 TDD 三步**：① 先寫失敗測試並在 shell 實際看到紅燈 ② 最小實作至綠 ③ refactor（無壞味道註記 skipped）。

**紅燈要是真的**。若某項行為早已實作，先寫測試會直接綠燈 —— 那是 regression guard 不是 TDD，
請在 tasks.md 誠實標註，**不要用 mutation check（改斷言看紅再改回）偽造紅燈**。

**單檔測試指令**：`pnpm --filter ./<workspace> test --run <path>`。
**`--run` 前不可加 `--`** —— `test -- --run <path>` 會讓 vitest 收不到路徑而跑完整套，
紅燈證據會被既有綠燈淹沒。

## 執行環境注意

- openspec CLI 一律從 **repo root** 執行，建議帶 `DO_NOT_TRACK=1`
- 後端測試跑在真正的 workerd runtime；在受限沙箱中會噴 `listen EPERM 127.0.0.1`，
  那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**
- 前端 dev server 在 **:3005**（不是 3000），後端在 :8787
- E2E 的 `webServer` 有兩組，會自動先起後端再起前端；service binding 需兩者同時運行才通

## 目錄約定

- agent 資產（`.agents/`、`skills-lock.json`）**一律放 repo root**，不在 workspace 內複製
- 設計文件放 root `docs/`；正式規格放 `openspec/specs/`。
  `docs/` 內的文件若已被 openspec 取代，檔案頁首會有標註
