## Why

`openspec/specs/pickleball-guide-page/spec.md` 自 `add-pickleball-guide-page` 與 `make-tocbar-fixed-overlay` 兩次 change 歸檔後，程式碼持續微幅演進（抽出 `Section`、`ComparisonTable` 共用元件；新增 `PartDivider`、`CourtDiagram` 結構元件；`app/globals.css` 新增兩組動畫 utility；`badge.tsx` 隨 shadcn CLI 升版新增 `ghost`、`link` variant），使現行規格已與實際結構脫鉤。本 change 僅更新規格敘述使其與現況一致，不修改任何應用程式程式碼。

## What Changes

- 更新「拆檔結構符合 components / data / hooks 三層」Requirement：`components/guide/` 頂層列出 10 個 `*Section` + `Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`（15 個）；`shared/` 從 5 個改為 6 個（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`），移除 `ConclusionCard` 的描述
- 更新「共用展示元件全部建構於 shadcn 元件之上」Requirement：以 shadcn `Card` 為基底的清單為 `BrandCard`、`TipCard`、`HighlightBox`、`MythRow`；移除已不存在的 `ConclusionCard` 項
- 更新「4 組 keyframes 與 utility 寫在 app/globals.css」Requirement：改為 6 組 keyframes（`fadeIn`、`slideUp`、`scaleIn`、`floatBall`、`bounceDown`、`fadeUp`），並將 scroll indicator 對應 utility 明列為 `animate-bounce-down`
- 放寬「Badge 不擴充 variants」Scenario 的比對方式：改為「與 `pnpm dlx shadcn@latest add badge` **目前**產出一致」，不再硬列具體 variant 數量，允許 shadcn 上游更新引入的 `ghost`、`link` 等 variant
- **非破壞性**：不新增、不移除既有 Requirement；只校正描述與計數

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `pickleball-guide-page`: 校正「共用元件清單 / shared 元件數量」、「頂層元件列表」、「keyframes 組數與命名」、「Badge variant 比對方式」四處描述使其與現行程式碼一致

## Impact

- 只影響 `openspec/specs/pickleball-guide-page/spec.md` 文件本身
- 不涉及任何應用程式程式碼、測試、設定檔變動
- 現有 Vitest 與 Playwright 測試不受影響
- 後續開發者閱讀 spec 時不會再發現規格與實作對不上
