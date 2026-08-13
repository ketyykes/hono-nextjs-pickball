## MODIFIED Requirements

### Requirement: Hero 入場動畫直接顯示全部內容

系統 SHALL 在 `nextjs-pickball/components/guide/Hero.tsx` 以 motion `staggerChildren` 變體於頁面載入時依序帶出全部內容（badge / 主標題 / 副標 / 三項統計 / CTA），不依賴 scroll 進度控制顯示時機。所有元素 SHALL 於頁面載入後 1 秒內全部進場完成、永遠可見。

新增之入場動畫 SHALL NOT 違反既有 `pickleball-guide-page` 規格之 Hero 既有要求（badge、主標題、三項統計仍須於頁面載入後可見）。

> 原 design 規劃 Hero 為 scroll-driven（progress 約 90% 浮現 CTA），實作期間因 motion `useScroll` 在內部 scroll container 的 progress 計算與 CTA 在 viewport 中的時機難以對齊（CTA 永遠看不到），已簡化為直接 staggerChildren 全部載入。詳見 design doc 末尾 Implementation Changelog 第 3 項。

#### Scenario: 載入 `/` 後 Hero 全部內容可見

- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成、stagger 入場動畫播完（約 1 秒內）
- **THEN** 視窗內可見 badge「完全入門指南」、主標題「匹克球新手完全入門」、副標、三項統計、與「進入完整體驗 →」CTA

#### Scenario: reduced motion 下 Hero 行為向下相容

- **GIVEN** 使用者瀏覽器 `prefers-reduced-motion: reduce` 啟用
- **WHEN** 使用者開啟 `/`
- **THEN** Hero 顯示 badge、主標題與三項統計（與既有 `pickleball-guide-page` 規格一致）
