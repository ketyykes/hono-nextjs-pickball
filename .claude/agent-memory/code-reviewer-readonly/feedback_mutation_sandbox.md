---
name: mutation-sandbox-method
description: 在 scratchpad 跑 mutation 驗證的作法，以及「重建檔放進沙箱內會污染 vitest 路徑過濾」這個會產生假存活結論的陷阱
metadata:
  type: feedback
---

審查 `nextjs-pickball` 的純函式模組時，mutation 驗證一律在 scratchpad 沙箱做，不動專案檔。
可運作的最小組合：scratchpad 建目錄 → 複製受測模組與其相依（含 `tests/setup.ts`）→
`ln -s` 專案的 `node_modules` → 複製 `vitest.config.ts` / `package.json` / `tsconfig.json` →
以 `./node_modules/.bin/vitest --run <相對路徑>` 執行。另存一份 `*.orig` 當還原基準，
用 python 腳本逐項 patch／跑測／還原並收集 `Tests N failed` 與 `×` 行。

**陷阱：`vitest --run <path>` 的參數是「路徑子字串過濾」，不是精確路徑。**
把「重建某個 TDD 步驟紅燈」用的副本目錄放在沙箱**內部**（例如 `<沙箱>/step21/lib/matchmaker/`），
該目錄下的 `rating.test.ts` 會一起被匹配執行。重建版刻意缺少實作 → 固定貢獻數個 failed，
於是每個 mutant 看起來都「殺死」，基線也不再是 0 failed。

**Why**：2026-08-17 審評分引擎第 1 批時實際踩到。第二批 10 項 mutation 全部回報 KILLED、
且失敗的 it 名稱每次一模一樣（都是 `expectedScore` 那三個，與被改的敗方程式碼無關），
還原後 `failed=3` 才發現。移出重建目錄後重跑，其中 **4 項其實是存活的**。
若沒察覺，會把「敗方側完全沒有測試覆蓋」這個真正的缺口寫成「測試殺傷力充足」。

**How to apply**：兩個檢查點——① 每批 mutation 前後都印基線，基線必須是 `0 failed`，
還原後也必須回到 `0 failed`；② 若不同 mutant 的失敗 it 名稱清單完全相同、或失敗的 it
與被改的程式碼在邏輯上無關，就是污染，先查沙箱內有沒有第二份同名測試檔
（`find <沙箱> -name '*.test.ts'`），別急著下結論。重建用的副本一律放在沙箱**外**的同層目錄。
