# Specification: emoji-free-ui

## ADDED Requirements

### Requirement: 原始碼不含 emoji

`nextjs-pickball/` 下 `app/`、`components/`、`data/`、`lib/`、`hooks/` 的 `.ts`／`.tsx`（不含 `*.test.*` 與 `*.spec.*`）SHALL NOT 含 emoji 或 emoji 類符號，**含註解在內**。比對 pattern SHALL 為：

```
/\p{Emoji_Presentation}|️|[✕✓★]/u
```

`\p{Emoji_Presentation}` 涵蓋 🏓🏆💡 等預設以彩色呈現的 emoji 與國旗（區域指示符號）；`️` 捕捉以變體選擇器強制彩色的字元（如 ⚠️）；`[✕✓★]` 補上介面中曾當作圖示使用、但不屬上述兩類的符號。`→`、`↔`、`×`、`–`、`©` 等排版符號不在範圍內。

掃描範圍包含註解，是為了讓守門規則不必分辨字串與註解：程式碼註解中的 `⚠️` SHALL 改寫為「注意：」，描述 tour 犯規印章的「✕ 犯規」SHALL 改寫為「打叉犯規」。測試檔不在掃描範圍（測試名稱與斷言可能需要描述歷史行為）。

本 Requirement 只規範 emoji，SHALL NOT 作為調整配色、字型、版面或動畫的依據 —— 介面除了 emoji 所在位置，其餘呈現 MUST 與變更前一致。

#### Scenario: 原始碼掃描無 emoji

- **WHEN** 以上述 pattern 逐行掃描五個目錄下的非測試 `.ts`／`.tsx`
- **THEN** 命中清單（`檔案:行號`）為空陣列
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「app、components、data、lib、hooks 的原始碼不含 emoji 或 emoji 類符號」

#### Scenario: 品牌產地以純文字呈現

- **WHEN** 讀取 `nextjs-pickball/data/guide/brands.ts` 匯出的每筆品牌資料的 `origin`
- **THEN** 不含區域指示符號（U+1F1E6–U+1F1FF），且以國家或地區名稱開頭（例如「美國・愛達荷州」「台灣本土品牌」）
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「品牌產地不含國旗且以國家或地區名稱開頭」

### Requirement: 自繪符號元件集中於 components/icons

取代 emoji 的自繪符號 SHALL 集中於 `nextjs-pickball/components/icons/`，每個符號為獨立的 React 元件：

| 元件 | 用途 |
|---|---|
| `LogoMark` | navbar logo：球拍輪廓＋一顆球 |
| `ServeDiagonalIcon` | 結論卡「下手發球打對角」：半場俯視圖＋對角虛線箭頭 |
| `DoubleBounceIcon` | 結論卡「前兩拍必須落地」：側視圖＋兩個彈跳弧線與落點 |
| `KitchenZoneIcon` | 結論卡「廚房裡不能截擊」：俯視圖，網子兩側的廚房區以斜線或填色標示 |
| `MythMarkIcon`／`FactMarkIcon` | 迷思列的叉與勾 |
| `StarIcon` | 價位星級的單顆星形 |
| `RotateToLandscapeIcon` | 計分板「建議橫向使用」：手機由直轉橫 |

每個符號元件 SHALL：

- 渲染單一 `<svg>`，預設 `aria-hidden="true"` 與 `focusable="false"`（語意由相鄰文字或外層 `aria-label` 承擔）
- 線條與填色只使用 `currentColor` 或 `none`，由呼叫端以文字色決定顏色；SHALL NOT 寫死色碼、SHALL NOT 使用漸層
- 接受 `className` 並傳遞到 `<svg>` 根元素
- 為靜態圖形，SHALL NOT 帶動畫

`nextjs-pickball/public/icon.svg`（favicon）本來就是 SVG 圖形而非 emoji，本 Requirement 不改動它。

#### Scenario: 每個符號元件預設對輔助科技隱藏

- **WHEN** 逐一渲染 `components/icons/` 匯出的每個符號元件（不傳任何 props）
- **THEN** 每個都恰好渲染一個 `<svg>`，且帶有 `aria-hidden="true"` 與 `focusable="false"`
- **驗收**：`nextjs-pickball/components/icons/icons.test.tsx`，it 名稱「每個符號元件預設渲染對輔助科技隱藏的單一 svg」

#### Scenario: 符號元件只用 currentColor 且不含漸層

- **WHEN** 逐一渲染每個符號元件並讀取其 outerHTML
- **THEN** 不含 `#` 開頭的色碼、不含 `rgb(`、不含 `Gradient`；所有 `stroke` 與 `fill` 屬性值只出現 `currentColor` 或 `none`
- **驗收**：`nextjs-pickball/components/icons/icons.test.tsx`，it 名稱「符號元件只使用 currentColor 且不含漸層」

#### Scenario: className 傳遞到 svg 根元素

- **WHEN** 以 `className="size-6"` 渲染每個符號元件
- **THEN** `<svg>` 根元素的 class 含 `size-6`
- **驗收**：`nextjs-pickball/components/icons/icons.test.tsx`，it 名稱「className 會傳遞到 svg 根元素」

### Requirement: emoji 所在位置改以符號或純文字呈現

原本使用 emoji 的介面位置 SHALL 依下列對應改寫，各位置周邊的配色、字級與版面 MUST 維持原樣：

- `components/layout/SiteNavbar.tsx` 的 logo：🏓 → `LogoMark`，「匹克球指南」文字與斷點收合行為不變
- `components/guide/Conclusion.tsx` 三張卡：🏓🔄🍳 → `ServeDiagonalIcon`、`DoubleBounceIcon`、`KitchenZoneIcon`
- `components/guide/shared/MythRow.tsx`：「常見迷思 ✕」「正確規則 ✓」→ 標籤文字「常見迷思」「正確規則」各搭配 `MythMarkIcon`／`FactMarkIcon`，符號顏色沿用該標籤原本的文字色
- `components/guide/shared/PriceStars.tsx`：每顆 ★ 字元 → `StarIcon`；實心星 `text-amber-400`、空心星 `text-foreground/20`、`data-star` 屬性與 `aria-label` 不變
- `components/quiz/ResultScreen.tsx` 鼓勵文字：去掉結尾的 🏆💪📖，句子本身不變
- `components/scoreboard/GameOverDialog.tsx` 標題：去掉 🏆，只留「我方獲勝」／「對方獲勝」
- `components/scoreboard/OrientationHint.tsx`：💡 → `RotateToLandscapeIcon`，文字「建議橫向使用，體驗更好」不變

#### Scenario: navbar logo 以 LogoMark 呈現

- **WHEN** 渲染 `SiteNavbar`
- **THEN** logo 連結內含一個 `<svg>`，連結文字不含 🏓，「匹克球指南」文字仍存在
- **驗收**：`nextjs-pickball/components/layout/SiteNavbar.test.tsx`，it 名稱「logo 以 LogoMark 符號呈現而非 emoji」

#### Scenario: 結論三張卡各有一個符號

- **WHEN** 渲染 `Conclusion`
- **THEN** 三張卡（以標題「下手發球打對角」「前兩拍必須落地」「廚房裡不能截擊」定位）各含恰好一個 `<svg>`
- **驗收**：`nextjs-pickball/components/guide/Conclusion.test.tsx`，it 名稱「三張結論卡各以一個自繪符號取代 emoji」

#### Scenario: 迷思列標籤以符號表示叉與勾

- **WHEN** 以任意 `myth`、`fact` 渲染 `MythRow`
- **THEN** 頁面含「常見迷思」與「正確規則」兩個標籤，各自所在的標籤元素內含一個 `<svg>`；渲染結果不含 ✕ 與 ✓
- **驗收**：`nextjs-pickball/components/guide/shared/MythRow.test.tsx`，it 名稱「迷思與正確規則標籤以符號取代叉勾字元」

#### Scenario: 價位星以 svg 呈現

- **GIVEN** 以 `stars={4}` 渲染 `PriceStars`
- **WHEN** 檢查 10 個 `[data-star]` 元素
- **THEN** 每個元素內含一個 `<svg>`，渲染結果不含 ★
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「每顆星以 svg 符號呈現而非 ★ 字元」

#### Scenario: 測驗結果鼓勵文字不含 emoji

- **WHEN** 分別以答對 9／10、6／10、2／10 渲染 `ResultScreen`
- **THEN** 依序顯示「太強了！你已經是規則達人了」「不錯！再練習幾次就能完全掌握規則」「繼續加油，回去再讀一次指南吧！」，文字不含 emoji
- **驗收**：`nextjs-pickball/components/quiz/ResultScreen.test.tsx`，it 名稱「三個分數區間的鼓勵文字皆為純文字」

#### Scenario: 比賽結束對話框標題為純文字

- **GIVEN** 計分板狀態為 `finished`，勝方為我方
- **WHEN** 渲染 `GameOverDialog`
- **THEN** 對話框標題的文字內容恰為「我方獲勝」
- **驗收**：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`，it 名稱「獲勝標題為純文字不含獎盃 emoji」

#### Scenario: 橫向提示以符號取代燈泡

- **WHEN** 以 `visible={true}` 渲染 `OrientationHint`（sessionStorage 未記錄關閉）
- **THEN** 提示橫幅含「建議橫向使用，體驗更好」文字與一個 `aria-hidden` 的 `<svg>`（不計關閉按鈕內的圖示），文字不含 💡
- **驗收**：`nextjs-pickball/components/scoreboard/OrientationHint.test.tsx`，it 名稱「提示橫幅以轉向符號取代燈泡 emoji」
