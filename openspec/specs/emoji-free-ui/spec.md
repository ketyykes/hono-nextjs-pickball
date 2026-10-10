# emoji-free-ui Specification

## Purpose
規範介面上不使用 emoji：會出現在畫面上的文字（字串、樣板字串、JSX 文字）不含 emoji 或 emoji 類符號，註解與文件等文字敘述則允許。取代 emoji 的圖示依用途選擇來源——通用記號用 `lucide-react`，球場與品牌專屬圖形自繪於 `nextjs-pickball/components/icons/`。由 change `remove-emoji`（2026-10-10）建立。

## Requirements

### Requirement: 介面文字不含 emoji

`nextjs-pickball/` 下 `app/`、`components/`、`data/`、`lib/`、`hooks/` 的 `.ts`／`.tsx`（不含 `*.test.*` 與 `*.spec.*`）中，**會出現在介面上的文字** SHALL NOT 含 emoji 或 emoji 類符號。「介面文字」定義為下列 AST 節點：字串常值（`StringLiteral`）、樣板字串的各段文字（`NoSubstitutionTemplateLiteral`、`TemplateHead`／`TemplateMiddle`／`TemplateTail`）與 JSX 文字（`JsxText`）。比對 pattern SHALL 為：

```
/\p{Emoji_Presentation}|\uFE0F|[✕✓★]/u
```

`\p{Emoji_Presentation}` 涵蓋 🏓🏆💡 等預設以彩色呈現的 emoji 與國旗（區域指示符號）；`\uFE0F` 捕捉以變體選擇器強制彩色的字元（如 ⚠️）；`[✕✓★]` 補上介面中曾當作圖示使用、但不屬上述兩類的符號。`→`、`↔`、`×`、`–`、`©` 等排版符號不在範圍內。

**文字敘述允許 emoji**：程式碼註解（`//`、`/* */`、JSX 中的 `{/* */}`）不屬介面文字，SHALL NOT 列入檢查 —— 例如註解中的 `⚠️`、描述 tour 犯規印章的「✕ 犯規」皆保留原文。openspec 規格與文件同理，不受本 Requirement 限制。

判定 MUST 以 TypeScript 編譯器 API（`typescript` 套件，已是既有相依）解析 AST 後走訪上述節點，SHALL NOT 以逐行 regex 搭配「略過 `//` 開頭的行」之類的啟發式 —— 後者會漏掉區塊註解與 JSX 註解，也會誤放行字串中出現的 `//`。測試檔不在掃描範圍（測試名稱與斷言可能需要描述歷史行為）。

本 Requirement 只規範 emoji，SHALL NOT 作為調整配色、字型、版面或動畫的依據 —— 介面除了 emoji 所在位置，其餘呈現 MUST 與變更前一致。

#### Scenario: 介面文字掃描無 emoji

- **WHEN** 以 AST 走訪五個目錄下的非測試 `.ts`／`.tsx`，對每個介面文字節點套用上述 pattern
- **THEN** 命中清單（`檔案:行號`）為空陣列
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號」

#### Scenario: 註解中的 emoji 不視為違規

- **GIVEN** 一段原始碼片段，emoji 只出現在 `//` 行註解、`/* */` 區塊註解與 JSX 的 `{/* */}` 註解中（例如 `// ⚠️ 注意`、`{/* 「✕ 犯規」印章 */}`）
- **WHEN** 以掃描函式檢查該片段
- **THEN** 命中清單為空陣列
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「註解中的 emoji 不視為違規」

#### Scenario: 字串、樣板字串與 JSX 文字中的 emoji 會被攔下

- **GIVEN** 一段原始碼片段，在第 1 行字串常值、第 2 行樣板字串、第 3 行 JSX 文字各含一個 emoji 類符號，且同一片段另有一行 `const url = "https://x"; // ⚠️`
- **WHEN** 以掃描函式檢查該片段
- **THEN** 命中清單恰為第 1、2、3 行，含 `https://` 的那一行不命中
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「字串、樣板字串與 JSX 文字中的 emoji 會被攔下」

#### Scenario: 品牌產地以純文字呈現

- **WHEN** 讀取 `nextjs-pickball/data/guide/brands.ts` 匯出的每筆品牌資料的 `origin`
- **THEN** 不含區域指示符號（U+1F1E6–U+1F1FF），且以國家或地區名稱開頭（例如「美國・愛達荷州」「台灣本土品牌」）
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「品牌產地不含國旗且以國家或地區名稱開頭」

### Requirement: 圖示來源依用途選擇，自繪符號集中於 components/icons

取代 emoji 的圖示 SHALL 依用途選擇來源：

- **通用介面記號**（叉、勾、星等任何圖示庫都有的形狀）SHALL 使用既有相依 `lucide-react` 的圖示，與專案其他按鈕圖示（如計分板關閉鈕的 `X`）一致，SHALL NOT 另行自繪
- **球場與品牌專屬圖形**（logo、規則示意、手機轉向）圖示庫沒有對應形狀，SHALL 自繪並集中於 `nextjs-pickball/components/icons/`
- 本 change SHALL NOT 使用 AI 產生的點陣圖（如 Codex 產圖）：點陣圖無法跟隨 `currentColor` 變色，且比向量圖示重；日後若需要精緻版 logo 或插圖，另案評估

`components/icons/` 匯出的自繪符號 SHALL 恰為下列五個：

| 元件 | 用途 |
|---|---|
| `LogoMark` | navbar logo：球拍輪廓＋一顆球 |
| `ServeDiagonalIcon` | 結論卡「下手發球打對角」：半場俯視圖＋對角虛線箭頭 |
| `DoubleBounceIcon` | 結論卡「前兩拍必須落地」：側視圖＋兩個彈跳弧線與落點 |
| `KitchenZoneIcon` | 結論卡「廚房裡不能截擊」：俯視圖，網子兩側的廚房區以斜線或填色標示 |
| `RotateToLandscapeIcon` | 計分板「建議橫向使用」：手機由直轉橫 |

每個自繪符號元件 SHALL：

- 渲染單一 `<svg>`，預設 `aria-hidden="true"` 與 `focusable="false"`（語意由相鄰文字或外層 `aria-label` 承擔）
- 線條與填色只使用 `currentColor` 或 `none`，由呼叫端以文字色決定顏色；SHALL NOT 寫死色碼、SHALL NOT 使用漸層
- 接受 `className` 並傳遞到 `<svg>` 根元素
- 為靜態圖形，SHALL NOT 帶動畫

`nextjs-pickball/public/icon.svg`（favicon）本來就是 SVG 圖形而非 emoji，本 Requirement 不改動它。

#### Scenario: 自繪符號只涵蓋專屬圖形

- **WHEN** 讀取 `nextjs-pickball/components/icons/index.ts` 的所有具名匯出
- **THEN** 恰為 `LogoMark`、`ServeDiagonalIcon`、`DoubleBounceIcon`、`KitchenZoneIcon`、`RotateToLandscapeIcon` 五個（順序不拘），不含叉、勾、星的自繪版本
- **驗收**：`nextjs-pickball/components/icons/icons.test.tsx`，it 名稱「自繪符號只涵蓋球場與品牌專屬圖形」

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
- `components/guide/shared/MythRow.tsx`：「常見迷思 ✕」「正確規則 ✓」→ 標籤文字「常見迷思」「正確規則」各搭配 lucide 的 `X`／`Check`，圖示顏色沿用該標籤原本的文字色
- `components/guide/shared/PriceStars.tsx`：每顆 ★ 字元 → lucide 的 `Star`，以 `fill-current` 填滿成實心星形；實心星 `text-amber-400`、空心星 `text-foreground/20`、`data-star` 屬性與 `aria-label` 不變
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

#### Scenario: 迷思列標籤以 lucide 圖示表示叉與勾

- **WHEN** 以任意 `myth`、`fact` 渲染 `MythRow`
- **THEN** 頁面含「常見迷思」與「正確規則」兩個標籤，各自所在的標籤元素內含一個 `<svg>`，其 class 分別含 `lucide-x` 與 `lucide-check`；渲染結果不含 ✕ 與 ✓
- **驗收**：`nextjs-pickball/components/guide/shared/MythRow.test.tsx`，it 名稱「迷思與正確規則標籤以 lucide 叉勾圖示取代字元」

#### Scenario: 價位星以 lucide Star 呈現

- **GIVEN** 以 `stars={4}` 渲染 `PriceStars`
- **WHEN** 檢查 10 個 `[data-star]` 元素
- **THEN** 每個元素內含一個 `<svg>`，其 class 含 `lucide-star`；渲染結果不含 ★
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「每顆星以 lucide Star 圖示呈現而非 ★ 字元」

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
