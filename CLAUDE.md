# CLAUDE.md（repo root）

匹克球指南專案的 pnpm monorepo。本檔只描述 root 層慣例，workspace 細節見各自的 CLAUDE.md。

## 結構

```
hono-nextjs-pickball/     ← repo 與 root package 名稱
├─ nextjs-pickball/   ← 前端：Next.js 16 + React 19，經 OpenNext 部署為 Cloudflare Worker
├─ hono-pickball/     ← 後端：Hono API on Cloudflare Workers，所有後端邏輯都放這裡
├─ openspec/          ← OpenSpec 規格與變更；schemas/ 為 GENERATED 檔案（見「OpenSpec 慣例」）
├─ docs/              ← 設計文件歷史紀錄（superpowers/、prd.md）；已被 openspec 取代者於頁首標註。
│                       prd.md 為「對戰分配機」PRD（M1～M9 已完成並 archive，2026-09-03 歸檔至此）：
│                       commit / tasks 中的 4.2、5.1～5.6 等數字編號指該檔章節；
│                       M 編號（M1 等）則指 milestone 或 tasks 內的修正項次，
│                       定義在 openspec change 文件，不在該檔
├─ README.md          ← 含「部署前手動檢查清單」——本專案無 CI，這是唯一部署關卡
├─ .claude/           ← settings.json（hooks，見下）、agents/（四個 project subagent 定義）、
│                       agent-memory/（各 agent 長期記憶，**唯一來源**；workspace 內若長出
│                       `.claude/agent-memory/` 複本請直接刪除——複本會各自演化，
│                       過時結論會被當成事實引用）
├─ .agents/           ← agent 相關設定（唯一來源，不在 workspace 內複製）
├─ AGENTS.md          ← 非 Claude agent 的入口；**只放指標不放內容**，規則以本檔為準
└─ skills-lock.json   ← 外部 skill 的版本鎖定（root 單一份）
```

> 文件分工：`openspec/specs/` 是**正式規格**；`docs/`（superpowers/ 與歸檔後的 prd.md）
> 是歷史紀錄。任何行為變更以 openspec change 為準，不要在 `docs/` 下新增平行規格。

## 不可省略的規則

本節是所有 coding agent（不限 Claude Code）的行為約束，root `AGENTS.md` 以引用方式指向這裡；
要改規則只改本檔，不要在 `AGENTS.md` 內另寫一份。

**任何行為變更都先走 openspec change 流程**，不要直接改 `openspec/specs/` 下的主 spec。
流程仍為 propose → 產出 artifacts → 實作（apply）→ verify → archive，但 artifact 清單與
apply 規範由 `openspec/config.yaml` 指定的 schema 定義（目前為 `tdd-subagent-worktree`，
詳見 `openspec/schemas/tdd-subagent-worktree/schema.yaml`：含 test-plan、execution-plan、
environment 等 artifact，apply 階段強制 git worktree 隔離與 subagent 派工）。
歷史上主 spec 曾被直接編輯（commit `e5b709c`、`c7f4f7e`、`ea7955d`），
導致 `changes/archive/` 無法用來重建主 spec —— 不要再製造這種情況。

**行為邏輯一律 TDD 三步**：① 先寫失敗測試並在 shell 實際看到紅燈 ② 最小實作至綠
③ refactor（無壞味道註記 skipped）。適用範圍與例外層記載於
`nextjs-pickball/CLAUDE.md` 的 TDD 節（前端）；後端為 `hono-pickball/src/**` 的行為邏輯。
單檔測試指令見下方「常用指令」。

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

## Hooks（`.claude/settings.json` 已自動強制的規則）

- **逐檔 ESLint**（PostToolUse on Write|Edit）：編輯前端檔後自動 lint 該檔，錯誤以 exit 2 擋下
  —— 編輯被擋時先讀 lint 輸出，不是工具故障。因 repo 路徑含 `nextjs-pickball` 字樣，
  編輯 hono-pickball 檔案也會觸發一次空跑（輸出 "File ignored"，無害；後端本來就沒裝 eslint）。
  matcher 不含 MultiEdit。
- **wrangler → cf-typegen**（PostToolUse）：改任一 workspace 的 `wrangler.(jsonc|json|toml)`
  後自動重跑該 workspace 的 `pnpm cf-typegen`，不必手動跑。
- **Stop → tsc**（Stop）：session 停止時跑 `.claude/hooks/stop-typecheck.sh`，
  對**所有 git worktree**（主 repo ＋ 所有 linked worktree）各跑一次 `pnpm -r exec tsc --noEmit`。
  分級處置：**主 worktree 失敗以 exit 2 擋下**；**linked worktree 失敗只以 systemMessage 提示、不擋**。
  linked worktree 不擋是刻意的——前端 tsconfig 的 include 為 `**/*.ts`，測試檔全在範圍內，
  而 TDD 的 RED（測試 import 尚不存在的模組）本身就是型別錯誤且會單獨 commit；
  在 worktree 擋下等於逼 agent 跳過或偽造紅燈。理由全文見該腳本開頭註解。
  ⚠️ 三個限制：① 此指令**不含 `hono-pickball/test/**` 的型別**（那段只在該 workspace
  `pnpm typecheck` 的第二段）—— Stop hook 綠燈不代表後端測試檔型別無誤。
  ② linked worktree 只提示不擋，**綠燈不代表 worktree 型別無誤**，合併前仍須自行實跑。
  ③ 提示走 `systemMessage`，只顯示在終端機，**不會進入 Claude 的 context**。
  **不要改回 settings.json 內的一行 `pnpm -r exec tsc --noEmit`**——`pnpm -r` 的範圍由
  cwd 的 `pnpm-workspace.yaml` 決定（只含兩個相對路徑的 workspace），當 session 開在主 repo、
  實作卻在 linked worktree 內進行時（本專案 openspec apply 的常態），它檢查的是沒被改動的主 repo。

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

本專案不使用 CI，改以 root `README.md` 的「部署前手動檢查清單」七步把關
（lint → tsc → 前端 unit → 後端 unit → e2e → preview → 部署順序）。推送前請實際跑過。

## OpenSpec 慣例

- `openspec/` 位於 repo root；openspec CLI 與 Claude Code session **一律從 repo root 執行**，建議帶 `DO_NOT_TRACK=1`
- `openspec/config.yaml` 只有兩項設定：`schema`（選定 workflow schema 變體，目前為 `tdd-subagent-worktree`）
  與 `context`（注入所有 artifact 的產出指示，本專案用它要求繁體中文輸出）。
  **TDD 規則內文不在此檔** —— 三步與紅燈規則在本檔，各 workspace 的適用範圍與例外層在該 workspace 的 `CLAUDE.md`
- `openspec/schemas/**` 為 **GENERATED 檔案，不可手改**：來源是 repo 外的
  `openspec-custom-schemas` 專案（改 `src/` 後以 `node src/build.mjs` 重建）；手改會在下次重建時被覆寫
- `openspec/specs/` 是各 capability 的正式規格；主 spec 不可直接編輯，見上方「不可省略的規則」
- 前端補充見 [`nextjs-pickball/CLAUDE.md`](./nextjs-pickball/CLAUDE.md)

## 執行環境注意

- 前端 dev server 在 **:3005**（不是 3000），後端在 **:8787**
- 後端測試跑在真正的 workerd runtime；在受限沙箱中會噴 `listen EPERM 127.0.0.1`，
  那是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可
- E2E 的 `webServer` 有兩組，會自動先起後端再起前端；service binding 需兩者同時運行才通
- **service binding 失敗（`Worker "hono-pickball" not found`）時，先找有沒有重複的 dev server**。
  `playwright.config.ts` 的 `reuseExistingServer: !process.env.CI` 會重用既有 server，
  但多次中斷的 session 容易留下**多組** `wrangler dev` 互搶 `:8787`，
  此時後端在「有 process」的情況下其實已經壞掉（`curl :8787/api/health` 完全無回應）。
  診斷順序是 `lsof -i :3005 -i :8787` 與 `ps aux | grep -E "wrangler|workerd|next"`
  找出**所有**殘留 process 全數 kill，確認 port 釋放後再起單一組。
  **不要把 `~/.wrangler/registry` 目錄不存在當成根因** —— wrangler 4.99 不靠該路徑做本機服務發現，
  後端單獨啟動且回應正常時它依然不存在（2026-08-17 實測，曾據此誤判）。
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
