---
name: playwright-core-standalone-script-resolution
description: 在 nextjs-pickball 寫獨立 node 腳本呼叫 playwright-core（不透過 playwright test runner）時的 module 解析陷阱與解法
type: project
---

## 問題

想快速量測頁面 computed style（例如 gap/padding/margin）而不想跑整個
`playwright test`（不需要 webServer、不需要 assertion，只是想開瀏覽器讀
`getComputedStyle`），直覺會寫一支 `.mjs` 用 `import { chromium } from
"playwright-core"`。這在 pnpm workspace 下會直接噴
`ERR_MODULE_NOT_FOUND`，即使 `nextjs-pickball/node_modules/@playwright/test`
存在。

**原因**：`nextjs-pickball/package.json` 只把 `@playwright/test` 列為
devDependency，`playwright-core` 是它的間接依賴，pnpm 的嚴格 node_modules
不會把間接依賴提升到可被任意檔案 `import` 到的位置；而且 Node ESM 的模組
解析是以「匯入者檔案自身的路徑」為基準查找 `node_modules`，不是以 cwd 為
基準——即使腳本放進 `nextjs-pickball/` 目錄下、用 `pnpm --filter ./nextjs-pickball
exec node script.mjs` 執行也一樣會失敗，因為 pnpm exec 只調整 PATH／環境變數，
不會改變 ESM 的解析演算法。

**解法**：用 `require.resolve` 從 `@playwright/test` 的實際安裝路徑往下解析
出 `playwright-core` 的絕對路徑，再用該絕對路徑 import：

```js
node -e "console.log(require.resolve('playwright-core', {paths: [require.resolve('@playwright/test', {paths:['/path/to/nextjs-pickball']})]}))"
// -> /path/to/repo/node_modules/.pnpm/playwright-core@X.Y.Z/node_modules/playwright-core/index.js
```

腳本裡改用該路徑的 `.mjs` 版本（同目錄下有 `index.mjs`）：

```js
import { chromium } from "/path/to/repo/node_modules/.pnpm/playwright-core@X.Y.Z/node_modules/playwright-core/index.mjs";
```

**How to apply**：日後只要需要「開瀏覽器讀 DOM/CSS，但不想跑完整 E2E suite」
（例如快速比對 clamp() 參數調整前後的 computed style），都可以用這招省去
起兩個 webServer 的等待時間。腳本務必放在 `nextjs-pickball/` 內以 `.scratch-*`
命名（不 commit），用完刪除——本專案 sandbox 會擋 localhost，這類腳本需要
`dangerouslyDisableSandbox: true` 才能連上 dev server。定案後仍要跑一次
`playwright test` 正式套件驗證，這招只適合快速迭代階段。
