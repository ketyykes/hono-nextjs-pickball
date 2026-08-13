## MODIFIED Requirements

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供三支 scroll / observer React hooks：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`，分別位於 `nextjs-pickball/hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。`useScrolledPast` SHALL 接受 `threshold: number | (() => number)`：為 `number` 時以該值為固定門檻，為 function 時於每次 scroll 事件呼叫以取得當前門檻（供動態讀取 `window.innerHeight - navHeight` 等情境）。

本 capability 只擁有上述三支；`nextjs-pickball/hooks/` 下其餘 hook 歸屬其他 capability（`useQuiz` → quiz；`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode` → scoreboard；`useEnterAnimationProgress`、`useReducedMotion` → tour-experience）。

此歸屬清單為 `nextjs-pickball/hooks/` 跨 capability 分工的**單一來源**。其他 capability 於該目錄新增 hook 時，其 change SHALL 一併更新此清單 —— 否則本 capability 的規格會單邊失真（先例：`4c5b724` 新增 `useFocusMode` 時只更新了 `scoreboard` 規格，此處漏更新）。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`nextjs-pickball/hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrolledPast(500)`
- **WHEN** `window.scrollY` 設為 600 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應在 scrollY 超過固定 threshold 時回傳 true」

#### Scenario: useScrolledPast 以 function threshold 動態判定
- **GIVEN** 測試環境呼叫 `useScrolledPast(() => window.innerHeight - 56)`，並將 `window.innerHeight` 設為 800（門檻 = 744）
- **WHEN** `window.scrollY` 設為 800 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應以 function threshold 動態判定是否已捲過門檻」

### Requirement: 拆檔結構符合 components / data / hooks 三層

系統 SHALL 將實作拆成下列檔案結構：

- `nextjs-pickball/app/page.tsx`：純組合，不含資料宣告
- `nextjs-pickball/components/guide/`：頂層至少包含 10 個 `*Section`（`CourtSection`、`ServeSection`、`ScoringSection`、`FoulsSection`、`KitchenSection`、`MaterialsSection`、`SpecsSection`、`BrandsSection`、`TwMarketSection`、`StarterSection`）與 `Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`；另有 `HeroTourCta`，其行為由 tour-experience capability 規範
- `nextjs-pickball/components/guide/shared/`：7 個共用元件（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`、`PriceStars`）
- `nextjs-pickball/data/guide/`：7 個資料檔（tocItems、courtComparison、paddleMaterials、paddleWeights、brands、twMarketPrices、kitchenMyths）
- `nextjs-pickball/hooks/`：本 capability 擁有 3 支（useScrollShadow、useScrollSpy、useScrolledPast）+ 各自 `.test.ts`；目錄下另有歸屬其他 capability 的 hook，清單見「互動行為由三支 hooks 提供且各有 smoke test」Requirement。該數量會隨其他 capability 增修而變動，SHALL NOT 於此寫死

驗收 SHALL 以「必要檔案是否存在」表述，SHALL NOT 使用「恰好 N 個檔」的數量斷言 —— 後者會在其他 capability 於同目錄新增檔案時誤報。

#### Scenario: HomePage 不含資料宣告

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/page.tsx`
- **THEN** 檔案不含品牌資料、表格資料或 myth/fact 資料的 inline 陣列；所有 list-driven 內容由對應 `nextjs-pickball/data/guide/*.ts` 匯入

#### Scenario: 每個 data 檔以 named export 提供常數

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/data/guide/` 下任一檔案
- **THEN** 提供至少一個具型別標註的 named export 常數，可被 section 元件 import

#### Scenario: shared 目錄含全部必要共用元件

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/shared/` 下的 `.tsx` 檔（不含 `*.test.tsx`）
- **THEN** `BrandCard.tsx`、`TipCard.tsx`、`HighlightBox.tsx`、`MythRow.tsx`、`Section.tsx`、`ComparisonTable.tsx`、`PriceStars.tsx` 皆存在

#### Scenario: guide 目錄頂層含全部必要元件檔

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/` 下的 `.tsx` 檔（不含 `shared/` 與 `*.test.tsx`）
- **THEN** 10 個 `*Section.tsx` 與 `Hero.tsx`、`TocBar.tsx`、`PartDivider.tsx`、`Conclusion.tsx`、`CourtDiagram.tsx` 皆存在
