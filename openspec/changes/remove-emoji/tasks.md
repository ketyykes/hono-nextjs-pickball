# Tasks: remove-emoji

<!--
  路徑皆相對 nextjs-pickball/；單檔測試：pnpm --filter ./nextjs-pickball test --run <path>
  RED 與 GREEN 分開 commit；已存在行為的測試標註為 regression guard。
-->

## 1. 開工確認

- [x] 1.1 確認目前分支為 `change/remove-emoji`、工作樹乾淨；實跑 `pnpm test` 記錄 baseline，填入 environment.md 的 Verification

## 2. 守門測試
Depends on: §1

- [x] 2.1 RED: write test `app、components、data、lib、hooks 的原始碼不含 emoji 或 emoji 類符號`（`app/emojiFree.test.ts`；預期紅燈列出約 30 行命中，此測試要到 §6 完成才會轉綠，期間保持紅燈屬預期）
- [x] 2.2 RED: write test `品牌產地不含國旗且以國家或地區名稱開頭`（`app/emojiFree.test.ts`）
- [x] 2.3 GREEN: `data/guide/brands.ts` 的 6 筆 `origin` 拿掉國旗與其後的空白

## 3. 符號元件
Depends on: §1

- [x] 3.1 RED: write test `每個符號元件預設渲染對輔助科技隱藏的單一 svg`（`components/icons/icons.test.tsx`）
- [x] 3.2 RED: write test `符號元件只使用 currentColor 且不含漸層`
- [x] 3.3 RED: write test `className 會傳遞到 svg 根元素`
- [x] 3.4 GREEN: 建立 `components/icons/IconSvg.tsx` 與 8 個符號元件（參考 `git show change/site-editorial-redesign:nextjs-pickball/components/icons/<檔名>` 的路徑，改為靜態、只用 currentColor；`StarIcon` 為新圖形）及 `index.ts` 匯出

## 4. 套用到介面
Depends on: §3

- [x] 4.1 RED: write test `logo 以 LogoMark 符號呈現而非 emoji`（`components/layout/SiteNavbar.test.tsx`）
- [x] 4.2 GREEN: `SiteNavbar` logo 改用 `LogoMark`（`size-4`，對齊 `text-sm` 行高）
- [x] 4.3 RED: write test `三張結論卡各以一個自繪符號取代 emoji`（`components/guide/Conclusion.test.tsx`）
- [x] 4.4 GREEN: `Conclusion` 三張卡改用三個符號，放在 `text-lime-400` 容器內，卡片其餘 class 不變
- [x] 4.5 RED: write test `迷思與正確規則標籤以符號取代叉勾字元`（`components/guide/shared/MythRow.test.tsx`）
- [x] 4.6 GREEN: `MythRow` 標籤改為文字＋`MythMarkIcon`／`FactMarkIcon`，顏色沿用標籤原本的 `text-orange-500`／`text-emerald-700`
- [x] 4.7 RED: write test `每顆星以 svg 符號呈現而非 ★ 字元`（`components/guide/shared/PriceStars.test.tsx`；既有 4 條為 regression guard）
- [x] 4.8 GREEN: `PriceStars` 每顆星改用 `StarIcon`（`size-[1em]`），`data-star`、顏色 class 與 `aria-label` 不變；註解的 `⚠️` 改「注意：」
- [x] 4.9 RED: write test `三個分數區間的鼓勵文字皆為純文字`（`components/quiz/ResultScreen.test.tsx`）
- [x] 4.10 GREEN: `ResultScreen` 三句鼓勵文字去掉結尾 emoji
- [x] 4.11 RED: write test `獲勝標題為純文字不含獎盃 emoji`（`components/scoreboard/GameOverDialog.test.tsx`）
- [x] 4.12 GREEN: `GameOverDialog` 標題去掉 🏆
- [x] 4.13 RED: write test `提示橫幅以轉向符號取代燈泡 emoji`（`components/scoreboard/OrientationHint.test.tsx`）
- [x] 4.14 GREEN: `OrientationHint` 💡 改為 `RotateToLandscapeIcon`

## 5. E2E 名稱同步
Depends on: §4

- [x] 5.1 RED: regression guard（非 TDD）— `tests/e2e/specs/scoreboard.spec.ts` 兩個 test 改名去掉 💡、🏆，斷言不變；與 `navbar-rwd.spec.ts` 一起以 chromium 實跑確認綠燈
- [x] 5.2 GREEN: 無需實作（E2E 綠燈即完成；若 navbar 高度基準失敗，回 4.2 調整符號尺寸）

## 6. 註解改寫與守門轉綠
Depends on: §2, §4

- [x] 6.1 RED: 確認 2.1 守門測試目前只剩註解命中（`RoundControls.tsx`、`export-scene.ts`、`roster.ts`、`scoreboard-binding.ts` 的 ⚠️；`KitchenViolationStage.tsx`、`kitchenScene.ts` 的「✕ 犯規」）
- [x] 6.2 GREEN: 註解 `⚠️` 改「注意：」、「✕ 犯規」改「打叉犯規」；2.1 轉綠

## 7. 收尾驗證
Depends on: §5, §6

- [x] 7.1 實跑 `pnpm lint`、`pnpm typecheck`、`pnpm test`，全綠
- [x] 7.2 實跑 chromium E2E：`navbar-rwd`、`scoreboard`、`scoreboard-binding`、`quiz`、首頁相關 spec，全綠
- [x] 7.3 `git diff main --stat` 確認未動 `app/globals.css`、`app/layout.tsx`、`public/icon.svg`、`components/ui/**`、`package.json`、`pnpm-lock.yaml`
- [x] 7.4 起 dev server 截圖首頁（結論卡、迷思列、價位星、navbar）、`/quiz` 結果、`/scoreboard` 直式提示與獲勝框，目視確認配色與原本一致；看完依 PID 關閉

> 收尾紀錄（2026-10-10）：`pnpm lint` exit 0、`pnpm typecheck` exit 0、`pnpm test` 後端 16／前端 778 全綠；
> chromium E2E 全套 132 passed；`git diff main...HEAD` 禁區檔案零變更；Final Code Reviewer PASS。
> 7.4 截圖（首頁 navbar、結論卡、迷思列、價位星、`/scoreboard` 直式提示與獲勝框）目視確認配色與原本一致。

## 8. 依使用者回饋調整：文字敘述允許 emoji、圖示來源依用途選擇
Depends on: §7

> 2026-10-10 使用者回饋：①文字敘述（如註解中的 ⚠️）允許 emoji；②取代 emoji 時依情況選擇自繪 SVG、套件圖示或 AI 產圖。
> 經確認：註解還原為原文；叉、勾、星改用 lucide，logo、結論三卡、橫向提示維持自繪，本次不用 AI 產圖。

- [ ] 8.1 RED: write test `註解中的 emoji 不視為違規`（`app/emojiFree.test.ts`，呼叫尚不存在的掃描函式）
- [ ] 8.2 RED: write test `字串、樣板字串與 JSX 文字中的 emoji 會被攔下`
- [ ] 8.3 GREEN: 以 `typescript` 的 `createSourceFile` 實作掃描函式（只走訪 StringLiteral、樣板字串各段、JsxText），守門 it 改名為 `app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號` 並改用該函式
- [ ] 8.4 RED: regression guard（非 TDD）— 把 §6.2 與 c695884 改寫過的 9 行註解還原為原文（`RoundControls.tsx`、`export-scene.ts`、`roster.ts`、`scoreboard-binding.ts` 的 `⚠️`；`KitchenViolationStage.tsx`、`kitchenScene.ts` 的「✕ 犯規」），確認 8.3 的守門仍綠。`PriceStars.tsx` 的舊警告註解已因改用 svg 而失效、被新說明取代，不還原
- [ ] 8.5 GREEN: 無需實作（守門綠燈即完成）
- [ ] 8.6 RED: write test `自繪符號只涵蓋球場與品牌專屬圖形`（`components/icons/icons.test.tsx`）
- [ ] 8.7 RED: write test `迷思與正確規則標籤以 lucide 叉勾圖示取代字元`（取代 `MythRow.test.tsx` 的第一版 it）
- [ ] 8.8 RED: write test `每顆星以 lucide Star 圖示呈現而非 ★ 字元`（取代 `PriceStars.test.tsx` 的第一版 it）
- [ ] 8.9 GREEN: `MythRow` 改用 lucide `X`／`Check`、`PriceStars` 改用 lucide `Star`（`fill-current`）；刪除 `MythMarkIcon`、`FactMarkIcon`、`StarIcon` 與其匯出，`icons.test.tsx` 的元件清單同步為 5 個；若 `IconSvg` 的 `variant`／`strokeWidth` 已無使用者則一併移除
- [ ] 8.10 收尾：`pnpm lint`、`pnpm typecheck`、`pnpm test` 全綠；chromium E2E 全套全綠；截圖確認迷思列與價位星

