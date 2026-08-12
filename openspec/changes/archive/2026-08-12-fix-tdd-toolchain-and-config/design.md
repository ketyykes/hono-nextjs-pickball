## Context

本 change 是 8 個規格債 change 的第一個，也是唯一一個「修工具本身」的。
它的正確性無法靠後續 change 驗證 —— 相反，後續每個 change 的 TDD 證據都建立在它之上。
因此設計原則是：**範圍極小、零行為變更、每一步都有可機械驗證的 exit code**。

## TDD 分層判定

依 `openspec/config.yaml:12-16` 的例外清單逐條標註：

| 檔案類別 | 分類 | 依據 | 驗收方式 |
|---|---|---|---|
| `openspec/config.yaml`、`openspec/schemas/**` | **例外層** | 非 `nextjs-pickball/{app,components,hooks,lib,data}/**`，不含行為邏輯 | `openspec validate --all` + grep 命中數 |
| `.claude/**`（settings、agents、skills） | **例外層** | 同上，屬工具設定 | grep 命中數歸零 |
| `*.md`（CLAUDE.md、README.md） | **例外層** | 純文件 | grep 命中數 + 人工複讀 |
| `nextjs-pickball/.gitignore`、`tsconfig.json`、`eslint.config.mjs` | **例外層** | `config.yaml:15`「入口與配置」 | `pnpm lint` exit 0 |
| `nextjs-pickball/vitest.config.ts` | **例外層** | 同上（測試 runner 設定，非受測邏輯） | 全套測試 15 檔 77 測不變 |
| `nextjs-pickball/.env.local.example` | **例外層** | 範例檔，零程式碼引用 | grep 歸零 |

**結論：本 change 無任何行為邏輯模組，全數例外層，不套三步 TDD。**
依 `config.yaml:28`「例外層 task 不強制三步拆分，但至少要指定驗收方式」，
每個 task 在 tasks.md 明列驗收指令與期望輸出。

> 這個判定必須寫清楚，否則 apply 階段會被誤判為「漏做 TDD」。

## 關鍵決策

### D-①-1｜歷史檔加註記，不改指令原文

archive tasks（14 處）與 docs/superpowers 計畫（57 處）合計 71 處壞指令，佔全部 81 處的 88%。

**不改的理由**：`openspec/changes/archive/` 是歷史紀錄。
commit `24e5093` 的 message 已明示決策「changes/archive/ and schemas/ untouched (historical records)」，
且該 commit 確實未動 archive 任何檔案。改寫歷史檔的指令等於竄改當時實際執行過的內容。
docs/superpowers 的計畫文件同理 —— 那些是當時的執行紀錄。

**代價**：`grep -rn "test -- --run" .` 之後仍會有 71 處命中，不能用「全 repo 歸零」當驗收條件。
驗收改為**限定活躍權威檔歸零**（見 tasks.md 的驗收指令）。

**補償措施**：每個歷史檔頁首加一行失效註記，讓任何人（或 agent）讀到那些指令時立刻知道不能照抄。

### D-①-2｜`config.yaml` 的 workspace 名稱泛化

現行寫死 `pnpm --filter ./nextjs-pickball test -- --run <path>`。
④ 會加入後端 TDD，屆時指令是 `pnpm --filter ./hono-pickball test --run <path>`。

本 change 一併把 rules 段的指令改為 `pnpm --filter ./<workspace> test --run <path>` 泛化形式，
避免 ④ 再改一次同一行造成 diff 衝突。

> **與 ④ 的邊界（衝突處理 C-1）**：① 只動 `rules.tasks` 的指令字串與 `context` 的 CF 架構描述；
> ④ 只在 `context` **追加**後端段落。兩者嚴格序列化，④ 開工前必須重讀 `config.yaml`。

### D-①-3｜`.claude/` 的授權邊界

`.claude/` 在 sandbox deny 清單內，6 個檔案的修改需要使用者逐次授權。

這些檔案**不能跳過**：`subagent-tdd-flow` 的 3 個 prompt template 是 apply 階段
subagent 逐字照抄的內容，`playwright-e2e-runner.md` 會讓 agent 去查錯誤的 port 3000 佔用。
若使用者拒絕授權，本 change 必須標記為部分完成並在 tasks.md 註明未修的項目，
**不可以視為完成後進入 ②**。

### D-①-4｜CI 的替代品必須落地

使用者明確排除 CI（`.github/workflows`、branch protection、husky）。
但「排除 CI」不等於「排除品質門檻」—— 否則本 change 等於只做了文件美化。

替代品是 root README 的六步手動檢查清單。這份清單同時是未來要寫 workflow 時的 job 清單，
順序刻意由快到慢（lint → tsc → unit → e2e → preview），讓失敗盡早出現。

## 不做的事

- **不碰結構圖**（root `README.md` / `CLAUDE.md` 的目錄樹）→ 歸 ⑦，因為 ⑦ 會搬動 `docs/` 與 `.agents/`，
  結構圖必須等檔案搬完才畫，先畫會畫錯兩次
- **不碰 hooks / 元件數量**（`nextjs-pickball/CLAUDE.md` 的「4 支 hooks」「11 個 Section」）→ 歸 ②，
  因為那些數字同時出現在 spec 與文件，必須在同一個 change 內一次定案，分開改會再度自相矛盾
- **不修 `pnpm build` / `pnpm test` 的實際行為** → 歸 ④，本 change 只在文件記錄「現況與宣稱不符」
- **不移除 hono-pickball 的零使用依賴** → 已於決策 D5 定案為保留，且屬 ④ 範圍
