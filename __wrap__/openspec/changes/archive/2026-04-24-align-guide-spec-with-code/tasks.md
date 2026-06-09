## 1. 驗證 delta spec 與程式碼一致

- [x] 1.1 執行 `ls components/guide/shared/ | grep -c '\.tsx$'` 應為 6；確認名單為 `BrandCard`、`ComparisonTable`、`HighlightBox`、`MythRow`、`Section`、`TipCard`
- [x] 1.2 執行 `ls components/guide/*.tsx | wc -l` 應為 15；確認含 10 個 `*Section` + `Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`
- [x] 1.3 執行 `grep -c '^@keyframes' app/globals.css` 應為 6；確認名單為 `fadeIn`、`slideUp`、`scaleIn`、`floatBall`、`bounceDown`、`fadeUp`
- [x] 1.4 執行 `grep -n 'animate-bounce-down' components/guide/Hero.tsx` 確認 scroll indicator 實際套用 `animate-bounce-down`
- [x] 1.5 執行 `grep -nE '^\s*(ghost|link):' components/ui/badge.tsx` 確認 badge.tsx 已含 `ghost`、`link` variant（與 shadcn CLI 當前產出一致）

## 2. 驗證 OpenSpec change

- [x] 2.1 執行 `openspec validate align-guide-spec-with-code --strict`，驗證通過（驗收：輸出 `Change '...' is valid`）
- [x] 2.2 執行 `openspec show align-guide-spec-with-code` 肉眼確認四處 MODIFIED Requirement 的前後差異符合 proposal 描述

## 3. 交付

- [x] 3.1 本次 change 無程式碼修改，無 Vitest / Playwright 測試需更新；驗收方式僅以 `openspec validate` 與 `openspec show` 為主
- [ ] 3.2 等待使用者執行 `/opsx:archive align-guide-spec-with-code` 將 delta 合併進 `openspec/specs/pickleball-guide-page/spec.md`
