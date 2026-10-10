# Specification: emoji-free-ui

## ADDED Requirements

### Requirement: 介面文字不含 emoji，國旗除外

`nextjs-pickball/` 下 `app/`、`components/`、`data/`、`lib/`、`hooks/` 的 `.ts`／`.tsx`（不含 `*.test.*` 與 `*.spec.*`）中，**會出現在介面上的文字** SHALL NOT 含 emoji 或 emoji 類符號。「介面文字」定義為下列 AST 節點：字串常值（`StringLiteral`）、樣板字串的各段文字（`NoSubstitutionTemplateLiteral`、`TemplateHead`／`TemplateMiddle`／`TemplateTail`）與 JSX 文字（`JsxText`）。比對 pattern SHALL 為：

```
/\p{Emoji_Presentation}|\uFE0F|[✕✓★]/u
```

`\p{Emoji_Presentation}` 涵蓋 🏓🏆💡 等預設以彩色呈現的 emoji 與國旗（區域指示符號）；`\uFE0F` 捕捉以變體選擇器強制彩色的字元（如 ⚠️）；`[✕✓★]` 補上介面中曾當作圖示使用、但不屬上述兩類的符號。`→`、`↔`、`×`、`–`、`©` 等排版符號不在範圍內。

**國旗允許 emoji**：國旗（兩個區域指示符號 U+1F1E6–U+1F1FF 組成的序列）是品牌產地的資訊本身，SHALL 允許以 emoji 呈現；判定時 MUST 先移除成對的區域指示符號再套用上述 pattern。落單的區域指示符號不屬國旗，仍視為違規。

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

#### Scenario: 國旗 emoji 不視為違規

- **GIVEN** 一段原始碼片段，第 1 行字串常值為 `"🇺🇸 美國・加州"`，第 2 行 JSX 文字為 `🇹🇼 台灣本土品牌`，第 3 行字串常值只含一個落單的區域指示符號
- **WHEN** 以掃描函式檢查該片段
- **THEN** 命中清單恰為第 3 行
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「國旗 emoji 不視為違規，落單的區域指示符號仍會被攔下」

#### Scenario: 品牌產地保留國旗 emoji

- **WHEN** 讀取 `nextjs-pickball/data/guide/brands.ts` 匯出的每筆品牌資料的 `origin`
- **THEN** 以「國旗 emoji＋空白＋國家或地區名稱」開頭（例如「🇺🇸 美國・愛達荷州」「🇹🇼 台灣本土品牌」）
- **驗收**：`nextjs-pickball/app/emojiFree.test.ts`，it 名稱「品牌產地以國旗 emoji 加國家或地區名稱開頭」

### Requirement: emoji 所在位置改以圖示呈現

原本使用 emoji 的介面位置 SHALL 一律改以圖示呈現，SHALL NOT 只刪除 emoji 而留下純文字；依下列對應改寫，各位置周邊的配色、字級與版面 MUST 維持原樣：

- `components/layout/SiteNavbar.tsx` 的 logo：🏓 → `LogoMark`，「匹克球指南」文字與斷點收合行為不變
- `components/guide/Conclusion.tsx` 三張卡：🏓🔄🍳 → `ServeDiagonalIcon`、`DoubleBounceIcon`、`KitchenZoneIcon`
- `components/guide/shared/MythRow.tsx`：「常見迷思 ✕」「正確規則 ✓」→ 標籤文字「常見迷思」「正確規則」各搭配 lucide 的 `X`／`Check`，圖示顏色沿用該標籤原本的文字色
- `components/guide/shared/PriceStars.tsx`：每顆 ★ 字元 → lucide 的 `Star`，以 `fill-current` 填滿成實心星形；實心星 `text-amber-400`、空心星 `text-foreground/20`、`data-star` 屬性與 `aria-label` 不變
- `components/quiz/ResultScreen.tsx` 鼓勵文字：結尾的 🏆💪📖 → 依分數區間分別改為 lucide `Trophy`、`BicepsFlexed`、`BookOpen`，置於句尾原本 emoji 的位置；句子本身不變
- `components/scoreboard/GameOverDialog.tsx` 標題：開頭的 🏆 → lucide `Trophy`，置於「我方獲勝」／「對方獲勝」之前
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

#### Scenario: 測驗結果鼓勵文字搭配對應圖示

- **WHEN** 分別以答對 9／10、6／10、2／10 渲染 `ResultScreen`
- **THEN** 依序顯示「太強了！你已經是規則達人了」「不錯！再練習幾次就能完全掌握規則」「繼續加油，回去再讀一次指南吧！」，文字不含 emoji；同一段落內各含一個 `<svg>`，class 依序含 `lucide-trophy`、`lucide-biceps-flexed`、`lucide-book-open`
- **驗收**：`nextjs-pickball/components/quiz/ResultScreen.test.tsx`，it 名稱「三個分數區間的鼓勵文字各搭配對應的 lucide 圖示」

#### Scenario: 比賽結束對話框標題搭配獎盃圖示

- **GIVEN** 計分板狀態為 `finished`，勝方為我方
- **WHEN** 渲染 `GameOverDialog`
- **THEN** 對話框標題的文字內容恰為「我方獲勝」（不含 emoji），且標題內含一個 class 含 `lucide-trophy` 的 `<svg>`
- **驗收**：`nextjs-pickball/components/scoreboard/GameOverDialog.test.tsx`，it 名稱「獲勝標題以 lucide 獎盃圖示搭配勝方文字」

#### Scenario: 橫向提示以符號取代燈泡

- **WHEN** 以 `visible={true}` 渲染 `OrientationHint`（sessionStorage 未記錄關閉）
- **THEN** 提示橫幅含「建議橫向使用，體驗更好」文字與一個 `aria-hidden` 的 `<svg>`（不計關閉按鈕內的圖示），文字不含 💡
- **驗收**：`nextjs-pickball/components/scoreboard/OrientationHint.test.tsx`，it 名稱「提示橫幅以轉向符號取代燈泡 emoji」

## REMOVED Requirements

### Requirement: 介面文字不含 emoji

**Reason**: 使用者指示國旗可以用 emoji；原條文的「品牌產地以純文字呈現」Scenario 與此相反，且 Scenario 名稱無法以 MODIFIED 改寫（validate 會判為刪除既有 Scenario）。

**Migration**: 由 ADDED 的「介面文字不含 emoji，國旗除外」取代：其餘規則（AST 判定、註解放行、pattern）不變，新增國旗例外；`brands.ts` 的 `origin` 還原為國旗 emoji 開頭。

### Requirement: emoji 所在位置改以符號或純文字呈現

**Reason**: 使用者指示原本是 emoji 的地方要換成圖示（SVG、套件圖示或生圖），不要換成純文字；原條文的測驗結果與獲勝對話框是純文字。

**Migration**: 由 ADDED 的「emoji 所在位置改以圖示呈現」取代：測驗結果三句改搭配 lucide `Trophy`／`BicepsFlexed`／`BookOpen`，獲勝對話框標題加 lucide `Trophy`；其餘五處（navbar、結論卡、迷思列、價位星、橫向提示）不變。
