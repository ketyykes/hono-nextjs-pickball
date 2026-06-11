## Why

目前 `TocBar` 使用 `sticky top-0`，在文件流中位於 Hero 下方；Hero 是 `min-h-screen` 滿版視覺，使用者必須先捲過整個 Hero 才看得到章節導覽。這犧牲了「隨時可跳章節」的便利性，對一頁式長文尤其明顯。改為 fixed overlay 後，導覽自頁面載入即顯示在頂端，並以透明 + 極輕 backdrop-blur 融入 Hero 視覺、捲離 Hero 後切換為白底 + shadow 的實色樣式，兼顧沉浸感與便利性。

## What Changes

- `TocBar` 從 `sticky top-0` 改為 `fixed top-0 left-0 right-0`，自頁面載入即顯示在視窗頂端
- `TocBar` 新增雙視覺狀態：
  - **State A（Hero 範圍內）**：透明底 + 極輕 backdrop-blur（確保連結文字在 Hero 浮球/背景光暈上仍可讀）、白色/半透明白字、active 底線 lime-400
  - **State B（捲離 Hero 後）**：沿用現有白底 + backdrop-blur + shadow-md、深色字、active 底線 lime-400
- 新增 `useScrolledPast(threshold)` hook：判定 `window.scrollY` 是否已超過指定門檻；`threshold` 參數接受 `number` 或 `() => number`（供動態讀 `window.innerHeight - navHeight`）。附 smoke test
- `useScrollShadow` 語意與 API 不變，保留給「單純 scrollY>N 切換陰影」的場景
- `useScrollSpy` 的 `rootMargin`（`-80px 0px -60% 0px`）不變：原本的 80px 上邊距剛好對應固定 nav 高度
- Hero `min-h-screen` 不動：nav 疊在 Hero 上，主文案仍由 `items-center` 垂直置中呈現
- **BREAKING**：`pickleball-guide-page` spec 中「TocBar 於 Hero 下方才出現」的 scenario 移除；新增「頁面載入即顯示」「雙狀態視覺」「四支 hooks（新增 useScrolledPast）」相關 scenario

## Capabilities

### New Capabilities

（無新 capability — 本次只擴充既有 `pickleball-guide-page` spec）

### Modified Capabilities

- `pickleball-guide-page`：調整 TocBar 的顯示時機與視覺狀態描述；將互動 hooks 由三支擴為四支

## Impact

- 程式碼
  - `src/components/guide/TocBar.tsx`：定位方式與 className 組合異動
  - `src/hooks/useScrolledPast.ts`（新）、`src/hooks/useScrolledPast.test.ts`（新）
  - `src/components/guide/TocBar.tsx` 若有對應測試則需同步更新（目前無，視需要補）
- Spec
  - `openspec/specs/pickleball-guide-page/spec.md`：移除 1 條 scenario、新增 ≥2 條 scenario、hooks 清單由 3 改 4
- 無外部 API / 套件異動；無資料結構異動
- a11y 面：nav 從一開始即可被鍵盤聚焦（可視為微小改進，不在本次強制補 skip-link）
