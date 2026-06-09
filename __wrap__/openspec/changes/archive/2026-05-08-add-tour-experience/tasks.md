## 1. lib/scrollTimeline（行為邏輯，TDD）

- [ ] 1.1 紅燈：新增 `lib/scrollTimeline.test.ts`，寫三條失敗 it：
  - `it('在 CSS.supports 兩條件皆為 true 時回傳 true')`
  - `it('在 CSS.supports 任一條件為 false 時回傳 false')`
  - `it('在 CSS 物件不存在時回傳 false 不拋例外')`
  - 執行 `pnpm test -- --run lib/scrollTimeline.test.ts`，於 shell 看到紅燈後再進入 1.2
- [ ] 1.2 綠燈：新增 `lib/scrollTimeline.ts` 實作 `supportsScrollTimeline()`，最小實作至 `pnpm test -- --run lib/scrollTimeline.test.ts` 全綠
- [ ] 1.3 refactor：檢視 `lib/scrollTimeline.ts`，若無壞味道則註記 skipped；若有則重構並重跑測試保持綠燈

## 2. hooks/useReducedMotion（行為邏輯，TDD）

- [ ] 2.1 紅燈：新增 `hooks/useReducedMotion.test.ts`，寫三條失敗 it：
  - `it('在 prefers-reduced-motion: reduce 啟用時回傳 true')`
  - `it('於 matchMedia change 事件後回傳新值')`
  - `it('卸載時移除 matchMedia 監聽')`
  - 執行 `pnpm test -- --run hooks/useReducedMotion.test.ts` 看到紅燈
- [ ] 2.2 綠燈：新增 `hooks/useReducedMotion.ts`，最小實作至全綠
- [ ] 2.3 refactor：依規則檢視，註記 skipped 或重構

## 3. hooks/useScrollLinkedProgress（行為邏輯，TDD）

- [ ] 3.1 紅燈：新增 `hooks/useScrollLinkedProgress.test.ts`，寫一條失敗 it：
  - `it('回傳 motion value 並於卸載時 unsubscribe')`
  - 執行 `pnpm test -- --run hooks/useScrollLinkedProgress.test.ts` 看到紅燈
- [ ] 3.2 綠燈：新增 `hooks/useScrollLinkedProgress.ts`，包裝 motion `useScroll`，預設 `offset: ["start end", "end start"]`，最小實作至全綠
- [ ] 3.3 refactor：依規則檢視，註記 skipped 或重構

## 4. data/tour/playerGrowth（行為邏輯，TDD）

- [ ] 4.1 紅燈：新增 `data/tour/playerGrowth.test.ts`，寫一條失敗 it：
  - `it('提供至少 6 筆年度資料且年份與人數均遞增')`
  - 執行 `pnpm test -- --run data/tour/playerGrowth.test.ts` 看到紅燈
- [ ] 4.2 綠燈：新增 `data/tour/playerGrowth.ts`，匯出 readonly 陣列含 `year`／`players` 兩欄、至少 2020–2025 共 6 筆資料、人數遞增；最小實作至全綠
- [ ] 4.3 refactor：依規則檢視，註記 skipped 或重構

## 5. ScrollTimelineProvider 與 useStageProgress（共用層，行為邏輯）

- [ ] 5.1 紅燈：新增 `components/tour/shared/ScrollTimelineProvider.test.tsx`，寫兩條失敗 it：
  - `it('於初次掛載偵測一次並透過 context 提供結果')`
  - `it('useScrollTimelineSupport 在 Provider 外呼叫時回傳 false 預設值')`
  - 執行 `pnpm test -- --run components/tour/shared/ScrollTimelineProvider.test.tsx` 看到紅燈
- [ ] 5.2 綠燈：新增 `components/tour/shared/ScrollTimelineProvider.tsx`（含 Provider 元件、`useScrollTimelineSupport` hook、與依 reduced-motion／支援度回 `null` 或 motion value 的 `useStageProgress` hook），最小實作至全綠
- [ ] 5.3 refactor：依規則檢視，註記 skipped 或重構

## 6. TourStage layout container（例外層：純展示元件 + E2E 驗收）

- [ ] 6.1 新增 `components/tour/TourStage.tsx`：負責 100vh、`scroll-snap-align: start`、`data-stage-id`、`aria-label`、把當前 stage 進度回報給 `TourProgressRail`
- [ ] 6.2 驗收：於 task 13.1 之 E2E 中以 `data-stage-id` 取得 6 個 stage 容器，並驗證 stage-2 至 stage-6 在捲動後依序出現於視窗中央

## 7. 6 個 stage 元件（例外層：純展示）

- [ ] 7.1 `components/tour/stages/CourtSizeStage.tsx`：球場大小對比 SVG + 計數器，文案內聯
- [ ] 7.2 `components/tour/stages/PlayerGrowthStage.tsx`：折線圖 SVG，使用 `data/tour/playerGrowth.ts`
- [ ] 7.3 `components/tour/stages/TwoBounceStage.tsx`：側視球軌跡 SVG（虛線 dashoffset 補間）
- [ ] 7.4 `components/tour/stages/KitchenViolationStage.tsx`：俯視場地 + 紅區 + 腳印 SVG
- [ ] 7.5 `components/tour/stages/MaterialsSpectrumStage.tsx`：三張材質卡片水平 pin 推移 + 雷達圖
- [ ] 7.6 `components/tour/stages/ClosingStage.tsx`：球員收拍 SVG + 「回到完整指南」按鈕（觸發 `addTransitionType('back')` 與 `router.push('/')`）
- [ ] 7.7 驗收：於 task 13.1 E2E 中驗證每個 stage 標題文字可被 `getByText` 找到

## 8. TourProgressRail 與 TourSkipButton（例外層：純展示，含小邏輯）

- [ ] 8.1 新增 `components/tour/TourProgressRail.tsx`：左側 fixed 直條，6 格依當前 stage 高亮，`aria-valuemin`/`aria-valuemax`/`aria-valuenow` 同步更新
- [ ] 8.2 新增 `components/tour/TourSkipButton.tsx`：右下角 fixed 按鈕，點擊呼叫 `addTransitionType('back')` 後 `router.push('/#court')`
- [ ] 8.3 驗收：於 task 13.1 E2E 中驗證 progress rail 與 skip button 的存在與行為

## 9. `app/tour/page.tsx` 組裝（入口層）

- [ ] 9.1 新增 `app/tour/page.tsx`：以 `<ScrollTimelineProvider>` 包覆，依序組合 6 個 stage、`TourProgressRail`、`TourSkipButton`；外層 `scroll-snap-type: y mandatory`
- [ ] 9.2 加入 `export const metadata = { title: '匹克球新手完全入門 · 互動體驗 | 匹克球指南', description: '用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手' }`
- [ ] 9.3 驗收：開發伺服器訪問 `/tour` 可見全部 6 個 stage；E2E 於 task 13.1

## 10. ViewTransition 接 `/` ↔ `/tour`（入口層）

- [ ] 10.1 評估 React 19 `<ViewTransition>` 在 Next.js 16 App Router 的可用性：先以 `vercel-react-view-transitions` skill 確認 API 與是否需 experimental flag
- [ ] 10.2 修改 `app/layout.tsx`：以 `<ViewTransition>` 包覆主內容；於 `app/globals.css` 加入 `::view-transition-*(forward)` 與 `::view-transition-*(back)` 兩組方向滑入動畫
- [ ] 10.3 若 task 10.1 顯示需 experimental flag 且穩定性低，降級方案：以 motion 手刻 `/` ↔ `/tour` page transition，並於 spec 標註此降級
- [ ] 10.4 驗收：手動切換 `/` ↔ `/tour` 觀察方向性過場；E2E 於 task 13.1 驗證 URL 變動

## 11. `app/globals.css` keyframes 與 utility（樣式層）

- [ ] 11.1 新增 keyframes：`stage-fade`、`stage-pin` 等對應 stage 動畫所需
- [ ] 11.2 新增 `@utility animation-timeline-view` 與 `@utility animation-range-cover`
- [ ] 11.3 驗收：於 task 13.1 E2E 中以 reduced-motion mode 驗證動畫關閉、預設 mode 驗證動畫存在

## 12. Hero scroll-driven 升級與首頁 CTA（既有檔修改）

- [ ] 12.1 修改 `components/guide/Hero.tsx`：依 `useReducedMotion()` 與 `useScrollTimelineSupport()` 三分支渲染（CSS scroll-timeline／motion fallback／既有 staggerChildren）；保留 badge、主標題、三項統計於頁面載入後可見以滿足既有 `pickleball-guide-page` 規格
- [ ] 12.2 修改 `app/page.tsx`：於 Hero 結束位置（TocBar 之前）新增「進入完整體驗 →」CTA 按鈕；onClick 呼叫 `addTransitionType('forward')` 後 `router.push('/tour')`
- [ ] 12.3 確認既有 Hero 相關 unit test 仍通過；若有 test 需更新，依 TDD 三步走（先紅後綠）

## 13. Playwright E2E（例外層：E2E 驗收）

- [ ] 13.1 新增 `tests/e2e/specs/tour.spec.ts`，涵蓋以下 case：
  - 首頁有「進入完整體驗 →」按鈕
  - 點擊後 URL 變為 `/tour`
  - `/tour` 載入後第一眼可見 Stage 1 標題「比網球更小，但同樣激烈」
  - DOM 中可找到 6 個 `data-stage-id` 容器
  - 捲動到底可見 ClosingStage 與「回到完整指南」按鈕
  - 點 Skip 後 URL 變為 `/#court` 且滾動位置位於 court section
  - `prefers-reduced-motion: reduce` 啟用時，Hero 與 Tour 動畫關閉但 6 個 stage 內容仍可達
- [ ] 13.2 執行 `pnpm test:e2e -- tests/e2e/specs/tour.spec.ts` 全部通過

## 14. 收尾

- [ ] 14.1 全套測試：`pnpm lint && pnpm exec tsc --noEmit && pnpm test -- --run && pnpm test:e2e`
- [ ] 14.2 視覺驗收：開發伺服器手動跑 `/` 與 `/tour` 完整流程，含 reduced-motion 與 mobile viewport
- [ ] 14.3 archive 變更：依 OpenSpec 流程將 `add-tour-experience` 由 `openspec/changes/` 移入 archive、sync delta 至 `openspec/specs/tour-experience/`
