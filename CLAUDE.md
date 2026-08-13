# CLAUDE.md（repo root）

匹克球指南專案的 pnpm monorepo。本檔只描述 root 層慣例，workspace 細節見各自的 CLAUDE.md。

## 結構

```
hono-nextjs-pickball/
├─ nextjs-pickball/   ← 前端：Next.js 16 + React 19，經 OpenNext 部署為 Cloudflare Worker
├─ hono-pickball/     ← 後端：Hono API on Cloudflare Workers，所有後端邏輯都放這裡
├─ openspec/          ← OpenSpec 規格與變更（spec-driven 工作流程）
├─ docs/              ← 設計文件與實作計畫（superpowers/）；已被 openspec 取代者於頁首標註
├─ .claude/           ← Claude Code 專案設定（settings.json 含 lint / cf-typegen hooks）
├─ .agents/           ← agent 相關設定（**唯一來源，不在 workspace 內複製**）
├─ AGENTS.md          ← 非 Claude agent 的入口；**只放指標不放內容**，規則以本檔為準
└─ skills-lock.json   ← 外部 skill 的版本鎖定（root 單一份）
```

> `docs/` 與 `openspec/` 的分工：`openspec/specs/` 是**正式規格**，
> `docs/superpowers/` 是設計脈絡與實作計畫的歷史紀錄。
> 任何行為變更以 openspec change 為準，不要在 `docs/` 下新增平行規格。

## 不可省略的規則

本節是所有 coding agent（不限 Claude Code）的行為約束，root `AGENTS.md` 以引用方式指向這裡；
要改規則只改本檔，不要在 `AGENTS.md` 內另寫一份。

**任何行為變更都先走 openspec change 流程**，不要直接改 `openspec/specs/` 下的主 spec。
流程為 propose → 產出 proposal / design / tasks / delta spec → 實作 → verify → archive。
歷史上主 spec 曾被直接編輯（commit `e5b709c`、`c7f4f7e`、`ea7955d`），
導致 `changes/archive/` 無法用來重建主 spec —— 不要再製造這種情況。

**行為邏輯一律 TDD 三步**：① 先寫失敗測試並在 shell 實際看到紅燈 ② 最小實作至綠
③ refactor（無壞味道註記 skipped）。適用範圍、例外層與測試工具的權威來源是
[`openspec/config.yaml`](./openspec/config.yaml)。單檔測試指令見下方「常用指令」。

**紅燈要是真的**。若某項行為早已實作，先寫測試會直接綠燈 —— 那是 regression guard 不是 TDD，
請在 tasks.md 誠實標註，**不要用 mutation check（改斷言看紅再改回）偽造紅燈**。

## 環境

- Node `22.22.1`：root 與 workspace 各有 `.node-version`，**以 root 為準**
- pnpm `10.17.0`（root `package.json` 的 `packageManager`）
- `pnpm-workspace.yaml` 的 `onlyBuiltDependencies: esbuild, workerd` 不可移除，否則 wrangler dev 與 OpenNext build 會失敗

## 常用指令（在 root 執行）

| 指令 | 行為 |
|---|---|
| `pnpm dev` | 並行啟動前端（:3005）與後端（:8787），dev registry 自動接通 service binding |
| `pnpm dev:web` | 只啟動 Next.js dev server |
| `pnpm dev:api` | 只啟動 wrangler dev |
| `pnpm build` | `pnpm -r build`，兩個 workspace 都真的建置（後端為 `tsc --noEmit && wrangler deploy --dry-run`） |
| `pnpm lint` | 跑 nextjs-pickball ESLint |
| `pnpm typecheck` | `pnpm -r exec tsc --noEmit` |
| `pnpm test` | `pnpm -r test`：前端 Vitest（happy-dom）+ 後端 Vitest（workerd runtime） |
| `pnpm test:web` / `pnpm test:api` | 只跑單一 workspace 的單元測試 |
| `pnpm test:e2e` | 跑 nextjs-pickball Playwright E2E（webServer 會自動帶起前後端兩個 server） |

要在 root 執行特定 workspace 的任意 script，慣例為 `pnpm --filter ./<workspace> <script>`，例如 `pnpm --filter ./nextjs-pickball preview`。

執行單一測試檔用 `pnpm --filter ./<workspace> test --run <path>`。**`--run` 前不可加 `--`** —— `test -- --run <path>` 會讓 vitest 收不到路徑而跑完整套，TDD 的紅燈證據會被既有綠燈淹沒。

## Cloudflare Workers 部署架構

- 兩個 Worker：`nextjs-pickball`（OpenNext adapter `@opennextjs/cloudflare`）與 `hono-pickball`（wrangler）
- 前端 `wrangler.jsonc` 宣告 service binding `HONO_API → hono-pickball`；`/api/*` 由 Next.js catch-all route 原樣轉發給 Hono，瀏覽器視角為 same-origin
- 部署走 CF Dashboard Workers Builds（Git 整合），兩個 Worker 連同一個 repo、各設 root directory
- **部署順序必須先 hono-pickball 後 nextjs-pickball**，否則 binding 目標不存在會部署失敗
- 整合驗證用 `pnpm --filter ./nextjs-pickball preview`（workerd runtime）

### CF Dashboard 側設定（不在 repo 內）

以下設定只存在於 CF Dashboard，git 無法追蹤，改動時需人工同步：

- 每個 Worker 的 **root directory** 與 **build command**：Dashboard → 該 Worker → Settings → Builds
- `wrangler.jsonc` 的 `name` **必須與 Dashboard 上的 Worker 名稱一致**，否則會部署到錯的 Worker
- 新增 `build` script 到某個 workspace 時要留意：Workers Builds 可能因此改用不同的 build command

### 部署前檢查

本專案不使用 CI，改以 root `README.md` 的「部署前手動檢查清單」六步把關（lint → tsc → unit → e2e → preview → 部署順序）。推送前請實際跑過。

## OpenSpec 慣例

- `openspec/` 位於 repo root；openspec CLI 與 Claude Code session **一律從 repo root 執行**，建議帶 `DO_NOT_TRACK=1`
- [`openspec/config.yaml`](./openspec/config.yaml) 是 TDD 規則（適用範圍、例外層、三步驟、測試工具）的權威來源
- [`openspec/specs/`](./openspec/specs/) 是各 capability 的正式規格；主 spec 不可直接編輯，見上方「不可省略的規則」
- 前端補充見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)

## 執行環境注意

- 前端 dev server 在 **:3005**（不是 3000），後端在 **:8787**
- 後端測試跑在真正的 workerd runtime；在受限沙箱中會噴 `listen EPERM 127.0.0.1`，
  那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可
- E2E 的 `webServer` 有兩組，會自動先起後端再起前端；service binding 需兩者同時運行才通
- macOS 的 BSD `uniq` 在預設 locale 下會把**內容不同的中文標題誤判為重複**。稽核 spec／文件
  有無重複條目時**不要用 `sort | uniq -d`**（實測它同時謊報主 spec 的某個 Requirement 與某個
  Scenario 重複，但兩者 `grep -c` 皆為 1），改用 `LC_ALL=C sort | LC_ALL=C uniq -d`，
  或直接逐標題計數：
  ```bash
  python3 -c "
  import collections,sys
  lines=open(sys.argv[1],encoding='utf-8').read().splitlines()
  c=collections.Counter(l for l in lines if l.startswith(('### Requirement:','#### Scenario:')))
  print([(k,v) for k,v in c.items() if v>1] or '無重複')
  " openspec/specs/<capability>/spec.md
  ```

## Workspace 細節

- 前端：[`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)
- 後端：[`hono-pickball/CLAUDE.md`](./hono-pickball/CLAUDE.md)
