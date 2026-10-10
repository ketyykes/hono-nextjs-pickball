# Tasks: emoji-spots-icons

<!--
  路徑皆相對 nextjs-pickball/；單檔測試：pnpm --filter ./nextjs-pickball test --run <path>
  RED 與 GREEN 分開 commit；已存在行為的測試標註為 regression guard。
-->

## 1. 開工確認

- [x] 1.1 確認目前分支為 `change/emoji-spots-icons`、工作樹乾淨；實跑 `pnpm test` 記錄 baseline，填入 environment.md 的 Verification

## 2. 國旗例外
Depends on: §1

- [x] 2.1 RED: write test `國旗 emoji 不視為違規，落單的區域指示符號仍會被攔下`（`app/emojiFree.test.ts`）
- [x] 2.2 RED: write test `品牌產地以國旗 emoji 加國家或地區名稱開頭`（取代舊 it「品牌產地不含國旗且以國家或地區名稱開頭」）
- [x] 2.3 GREEN: 掃描函式套用 pattern 前移除成對的區域指示符號；`git checkout main -- nextjs-pickball/data/guide/brands.ts` 還原國旗；既有守門 it 維持綠燈（regression guard）

## 3. 純文字處補圖示
Depends on: §1

- [x] 3.1 RED: write test `三個分數區間的鼓勵文字各搭配對應的 lucide 圖示`（取代 `ResultScreen.test.tsx` 舊 it）
- [x] 3.2 GREEN: `ResultScreen` 依分數區間回傳文字與 lucide 圖示（`Trophy`／`BicepsFlexed`／`BookOpen`），圖示放句尾、`size-5`
- [x] 3.3 RED: write test `獲勝標題以 lucide 獎盃圖示搭配勝方文字`（取代 `GameOverDialog.test.tsx` 舊 it）
- [x] 3.4 GREEN: `GameOverDialog` 標題前加 lucide `Trophy`（`size-5`），對齊維持手機置中、sm 以上靠左

## 4. 收尾驗證
Depends on: §2, §3

- [x] 4.1 實跑 `pnpm lint`、`pnpm typecheck`、`pnpm test` 全綠；chromium E2E 的 `quiz`、`scoreboard`、`scoreboard-binding` spec 全綠
- [x] 4.2 起 dev server 截圖 `/quiz` 結果頁三個分數區間、`/scoreboard` 獲勝對話框（390px 與 1280px）、首頁品牌卡國旗，目視確認；看完依 PID 關閉

> 收尾紀錄（2026-10-10）：`pnpm lint`、`pnpm typecheck` exit 0；`pnpm test` 後端 16／前端 783 全綠；chromium E2E `quiz`、`scoreboard`、`scoreboard-binding` 41 passed；
> Stage 1／Stage 2 皆 PASS（採納建議：lucide class 斷言改用 `classList.contains`）。截圖確認：`/quiz` 5/10 結果句尾 BicepsFlexed、
> 獲勝對話框 390px 置中與 1280px 靠左的 Trophy＋「我方獲勝」、首頁品牌卡國旗 emoji 均正常。

