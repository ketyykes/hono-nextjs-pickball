---
name: env_playwright-cli-not-installed
description: playwright-cli skill 假設全域已安裝該 CLI，但本機環境實測未安裝且 npx --no-install 會失敗；改用 @playwright/test 的 chromium 寫探索腳本、且必須在 nextjs-pickball workspace 內執行才能解析到套件
metadata:
  type: project
---

playwright-cli skill（`.claude/skills/playwright-cli`）文件假設 `playwright-cli` 指令已全域
可用，但在本機（2026-08-16 實測）：

- `which playwright-cli` 找不到。
- `npx --no-install playwright-cli --version` 直接失敗（`could not determine executable to
  run`）。
- 全域 npm／pnpm global 套件清單裡也沒有 `@playwright/cli` 或同義套件。

## 替代做法（本次任務實際使用、確認可行）

1. workspace 只有 `@playwright/test`（`nextjs-pickball/node_modules/.bin/playwright` 存在），
   沒有獨立的 `playwright` package，所以探索腳本要 `import { chromium } from "@playwright/test"`
   （不是 `from "playwright"`）。
2. **腳本必須在 `nextjs-pickball/` 內執行**（例如寫在該目錄下用 `node xxx.mjs` 跑），在別處
   （包含 scratchpad 目錄）執行會因 Node ESM 模組解析找不到 `@playwright/test` 而
   `ERR_MODULE_NOT_FOUND`——`pnpm --filter` 只保證指令的 cwd 對，不代表任意路徑的臨時腳本也能
   解析到 workspace 的 node_modules。
3. 用 `page.locator("body").ariaSnapshot()`（或縮小範圍到 `"main"`）取得跟 playwright-cli
   `snapshot` 指令等價的 accessibility tree 文字輸出，足以確認 role／accessible name／
   dialog 是否正確 wiring，不需要 playwright-cli 本身。
4. 探索腳本用完務必 `rm` 掉，不要留在 workspace 裡（會被 git status 抓到，也不是測試檔）。

## How to apply

下次要走 §6 spec-driven 流程但 `playwright-cli` 指令跑不動時，不用花時間排查安裝問題——
直接照上面 4 步用 `@playwright/test` 寫一支一次性腳本探索真實 DOM／accessible name，
跟 playwright-cli 的 `snapshot` 達到同樣效果。若之後某次環境確認 `playwright-cli` 已裝好，
再優先用 skill 原生流程即可，這則記憶只是備援手法。
