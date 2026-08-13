## Why

commit `0700d34` 把 guide 的價位資訊從實際金額改為 1~10 星級、並移除內容時效年份。這個 commit 有兩個問題，一個是流程的，一個是規格內容的。

**流程**：它**直接編輯了兩份主 spec**（`openspec/specs/pickleball-guide-page/spec.md` 5 處、`openspec/specs/tour-experience/spec.md` 1 處），沒有留下任何 change 提案。`AGENTS.md:16-20` 明文規定：

> **任何行為變更都先走 openspec change 流程**，不要直接改 `openspec/specs/` 下的主 spec。
> 歷史上主 spec 曾被直接編輯（commit `e5b709c`、`c7f4f7e`、`ea7955d`），
> 導致 `changes/archive/` 無法用來重建主 spec —— 不要再製造這種情況。

`0700d34` 是第四次。後果與前三次相同：archived delta 全部仍寫「2025 完全入門指南」與「恰好…六個檔」，用 archive 重播不出現行主 spec。

**規格內容**：真正的行為契約反而沒進規格。實測 `grep -n "NT\$\|US\$\|價格\|金額\|priceStars\|星級\|price" openspec/specs/pickleball-guide-page/spec.md` **零命中** —— 也就是說：

| 已落地的行為 | 規格覆蓋 |
|---|---|
| `brands` / `paddleMaterials` / `twMarketPrices` 欄位為 `priceStars`（1~10 整數） | 無 |
| `PriceStars` 的 round → clamp(1,10) → NaN fallback 與 `aria-label` 語意 | 只有「檔案存在」斷言 |
| **guide 原始碼（含 `app/`）不得殘留 `NT$`／`US$`／`NTD`／`TWD`／`USD` 字樣** | 無 |

最後一條是跨檔守門規則，掃描範圍跨出了 guide capability 邊界（含 `app/`），卻只活在 `nextjs-pickball/data/guide/priceStars.test.ts` 裡。其他 capability 的維護者在 `app/` 下寫一個金額就會踩到，而規格上找不到任何線索。

## What Changes

**本 change 不改動任何程式碼**，只補文件與規格。

1. **把 `0700d34` 的既成主規格編輯正式化**：以**現行主規格全文**作為 MODIFIED 基底，讓那 6 處異動有可追溯的提案紀錄。archive 後主 spec 內容應完全不變（sync 為 no-op）—— 若 archive 後產生 diff，代表 delta 沒抄對。
   - `pickleball-guide-page`：badge 文字「2025 完全入門指南」→「完全入門指南」；shared 元件 6 → 7 個（含 `PriceStars`）；Scenario 標題「shared 目錄含六個共用元件」→「含全部必要共用元件」，斷言由「恰好…六個檔」改為存在式
   - `tour-experience`：Hero Scenario 內的同一處 badge 文字
2. **補上缺席的行為契約**：`pickleball-guide-page` 新增 Requirement「價位以 1~10 星級呈現，不揭露實際金額」，6 條 Scenario 全部錨定到**已存在**的測試 it 名稱。
3. **補完 `0700d34` 漏掉的文件同步**：`nextjs-pickball/CLAUDE.md:63` 仍寫「`shared/` 下 6 個共用元件」，實際 7 個。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `pickleball-guide-page`：2 條 MODIFIED（首頁 badge 文字、拆檔結構的 shared 元件清單與驗收方式）+ 1 條 ADDED（價位星級化的行為契約與金額字樣守門）
- `tour-experience`：1 條 MODIFIED（Hero 入場動畫 Scenario 內的 badge 文字）

## Impact

- **受影響檔案**
  - spec：`openspec/specs/pickleball-guide-page/spec.md`、`openspec/specs/tour-experience/spec.md`（archive 時由 delta 套用；前兩者的 MODIFIED 部分為 no-op，唯一實際新增的是 ADDED Requirement）
  - 文件：`nextjs-pickball/CLAUDE.md`
  - 程式碼：**無**
- **測試影響**：無新增、無修改。ADDED Requirement 的 6 條 Scenario 全部錨定既有測試（`components/guide/shared/PriceStars.test.tsx` 4 個 it、`data/guide/priceStars.test.ts` 2 個 it），性質為 regression guard
- **風險**：低。唯一需要盯的是 archive 後 `git diff openspec/specs/` 必須只出現 ADDED Requirement 一段；其餘任何 diff 都代表 delta 抄錯了現行主規格
- **明確不做**
  - **不回退** `0700d34` 那 6 處主規格文字 —— 它們本身是正確的（去年份化、存在式斷言），要修的是「沒有提案紀錄」而非內容
  - **不竄改** `changes/archive/**` 下三份仍寫舊 badge 文字的 delta —— archived delta 是歷史快照
  - 不為 `PriceStars` 補新測試 —— 4 個 it 已涵蓋 round／clamp／NaN／aria-label 四條路徑
