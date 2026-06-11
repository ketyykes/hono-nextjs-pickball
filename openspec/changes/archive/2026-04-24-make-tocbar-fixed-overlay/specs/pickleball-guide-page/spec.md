## MODIFIED Requirements

### Requirement: 首頁顯示完整匹克球指南

系統 SHALL 在路由 `/` 直接渲染完整匹克球新手指南，包含 Hero、TOC、Part 01（規則 5 段）、Part 02（選購 5 段）、Conclusion 區塊，與原型 `pickleball-guide.html` 結構一致。TocBar SHALL 以 fixed overlay 方式於頁面載入即顯示於視窗頂端，而非 sticky（非捲動後才出現）。

#### Scenario: 訪問首頁可看到 Hero badge 與主標題
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成
- **THEN** 畫面顯示「2025 完全入門指南」badge、主標題「匹克球新手完全入門」與三項統計數字（14萬+、¼、11）

#### Scenario: TocBar 於頁面載入即顯示並列出 10 個 section 連結
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成且 `window.scrollY === 0`
- **THEN** TocBar 即時可見於視窗頂端，列出 court / serve / scoring / fouls / kitchen / materials / specs / brands / tw-market / starter 共 10 個錨點連結

#### Scenario: 每個 section 都有對應錨點 id
- **GIVEN** 頁面渲染完成
- **WHEN** DOM 解析完成
- **THEN** 存在 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` 共 10 個 id

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供四支 React hooks：`useScrollShadow`、`useScrollSpy`、`useFadeInOnView`、`useScrolledPast`，分別位於 `src/hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。`useScrolledPast` SHALL 接受 `threshold: number | (() => number)`：為 `number` 時以該值為固定門檻，為 function 時於每次 scroll 事件呼叫以取得當前門檻（供動態讀取 `window.innerHeight - navHeight` 等情境）。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`src/hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`src/hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useFadeInOnView 在元素進入視窗時將 isVisible 設為 true
- **GIVEN** 測試 mock 了 IntersectionObserver 並 render 一個使用 `useFadeInOnView()` 的測試元件
- **WHEN** 模擬目標元素進入視窗
- **THEN** hook 回傳的 `isVisible` 為 `true`
- **驗收**：`src/hooks/useFadeInOnView.test.ts`，it 名稱「應在元素進入視窗時將 isVisible 設為 true」

#### Scenario: useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrolledPast(500)`
- **WHEN** `window.scrollY` 設為 600 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`src/hooks/useScrolledPast.test.ts`，it 名稱「應在 scrollY 超過固定 threshold 時回傳 true」

#### Scenario: useScrolledPast 以 function threshold 動態判定
- **GIVEN** 測試環境呼叫 `useScrolledPast(() => window.innerHeight - 56)`，並將 `window.innerHeight` 設為 800（門檻 = 744）
- **WHEN** `window.scrollY` 設為 800 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`src/hooks/useScrolledPast.test.ts`，it 名稱「應以 function threshold 動態判定是否已捲過門檻」

### Requirement: 沿用 hooks 控制 sticky shadow / 主動 TOC link / scroll fade-in

`HomePage` 與 `TocBar` 與 section 元件 SHALL 透過 `useScrollShadow`、`useScrollSpy`、`useFadeInOnView`、`useScrolledPast` 四支 hooks 提供等同於原型的互動體驗。TocBar SHALL 以 `useScrolledPast(() => window.innerHeight - navHeight)` 判定是否已捲離 Hero，並以此切換兩種視覺狀態：Hero 範圍內為透明底 + 極輕 backdrop-blur + 白色/半透明白文字；捲離 Hero 後為白底 + shadow-md + 深色文字。`useScrollShadow` 保留供「單純 scrollY 超過固定門檻即加陰影」情境使用，TocBar 本次改動後不再直接依賴此 hook。

#### Scenario: TocBar 在 Hero 範圍內顯示為透明底 + 極輕 backdrop-blur
- **GIVEN** 使用者位於首頁且 `window.scrollY` 未超過 `window.innerHeight - navHeight`
- **WHEN** 渲染 TocBar
- **THEN** TocBar 根元素的 className 組合對應透明/半透明底（例如包含 `bg-slate-900/20` 或等價 utility）與 `backdrop-blur-sm`，且文字顏色為白色系（例如 `text-white` / `text-white/70`），不含 `shadow-md`

#### Scenario: TocBar 在捲離 Hero 後切換為白底 + shadow-md
- **GIVEN** 使用者位於首頁
- **WHEN** `window.scrollY > window.innerHeight - navHeight` 並 dispatch `scroll` 事件
- **THEN** TocBar 根元素的 className 組合對應白底（例如包含 `bg-background/90` 或等價 utility）與 `shadow-md`，且文字顏色為深色系（例如 `text-muted-foreground` / active `text-slate-900`）

#### Scenario: TOC link 在對應 section 進入視窗時高亮
- **GIVEN** 使用者捲動到 `#kitchen` section
- **WHEN** IntersectionObserver 判定 `#kitchen` 為目前可視 section
- **THEN** TocBar 中 `href="#kitchen"` 的連結具有 active style（由 `useScrollSpy` 回傳值控制；底線顏色為 `lime-400`）

#### Scenario: section 內容捲入視窗時淡入
- **GIVEN** 使用者捲動頁面
- **WHEN** 任一掛載 `useFadeInOnView` 的元素進入視窗
- **THEN** 該元素由 `opacity-0 translate-y-6` 過渡為 `opacity-100 translate-y-0`
