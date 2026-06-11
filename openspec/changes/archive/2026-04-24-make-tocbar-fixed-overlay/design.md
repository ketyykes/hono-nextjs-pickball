## Context

現有 `TocBar` 使用 `sticky top-0 z-[100]`，位於文件流中 Hero 下方；Hero 為 `min-h-screen` 滿版視覺，使用者需先捲過整個 Hero 才看得到章節導覽。現有 `useScrollShadow(100)` 僅負責在 scrollY>100 時切換陰影；`useScrollSpy` 的 `rootMargin = "-80px 0px -60% 0px"`，`-80px` 上邊距剛好對應固定 nav 高度預算。`pickleball-guide-page` spec 已將互動約束於三支 hooks（useScrollShadow / useScrollSpy / useFadeInOnView）。

本次改動的核心是重新定位 TocBar（sticky → fixed overlay）並加入雙視覺狀態（Hero 範圍內透明 + 輕 blur；離開 Hero 後白底 + shadow），同時不破壞現有 scroll-spy / fade-in 行為。

## Goals / Non-Goals

**Goals:**
- TocBar 從頁面載入即顯示在視窗頂端，提供隨時跳章節的便利
- Hero 範圍內維持沉浸感：透明底 + 極輕 backdrop-blur 讓文字在 Hero 浮球/光暈上可讀、但不截斷 Hero 視覺
- 捲離 Hero 後切換成既有白底 + shadow 樣式，使用者清楚知道已進入內文區
- 門檻判定採動態視窗高度（Hero 是 `min-h-screen` → 實際等於 `window.innerHeight`），避免寫死 px 值
- 將「scrollY 是否超過 X」抽為獨立 hook `useScrolledPast`，與「scrollY 是否超過 X 時加陰影」的 `useScrollShadow` 在語意上區隔
- 沿用 spec 中「互動由 hooks 提供」的約束，維持元件薄、邏輯可測試

**Non-Goals:**
- 不重構 `useScrollShadow`（保留原 API 與回傳值）
- 不更改 `useScrollSpy` rootMargin（`-80px` 已涵蓋固定 nav 的上邊距）
- 不更動 Hero 結構或 `min-h-screen`
- 不補 skip-to-content a11y 連結（可另案處理）
- 不新增全域 Provider 或 Context

## Decisions

### 決策 1：新增獨立 hook `useScrolledPast`，不擴充 `useScrollShadow`

**選擇**：新增 `src/hooks/useScrolledPast.ts`，簽名 `useScrolledPast(threshold: number | (() => number)): boolean`。

**考慮過的替代方案**：
- A. 擴充 `useScrollShadow` 接受 `number | (() => number)`：會讓名稱與行為脫鉤（shadow ≠ past-hero），測試與讀者易誤解
- B. 在 `TocBar` 內部以 `useEffect` 直接監聽 scroll：違反 spec「互動由 hooks 提供」；未來若其他元件也需要「是否捲離某段」邏輯會重複造輪
- C. 新增 hook（選擇這個）：語意乾淨，smoke test 簡單（mock `window.scrollY` 與 `innerHeight`）

**為什麼 threshold 支援 `() => number`**：Hero 高度等於 viewport，而 viewport 可能隨視窗縮放改變；若只接受固定 number，resize 後會錯判。Lazy getter 於每次 scroll 事件時呼叫，確保用最新值。

### 決策 2：雙狀態用 `useScrolledPast(() => window.innerHeight - NAV_HEIGHT)` 切換

**選擇**：TocBar 內宣告常數 `NAV_HEIGHT = 56`（對應 Tailwind `h-14`，實際按最終樣式調整），傳入 `useScrolledPast`。

- State A（回傳 false / 未捲離 Hero）：`bg-slate-900/20 backdrop-blur-sm`、`text-white/70`、active/hover 為 `text-white` + `border-b-lime-400`、無 shadow
- State B（回傳 true / 已捲離 Hero）：維持現有 `bg-background/90 backdrop-blur shadow-md`、`text-muted-foreground`、active 為 `text-slate-900` + `border-b-lime-400`

**為什麼 backdrop-blur-sm 而非完全透明**：Hero 有浮球（lime-400 + glow）與 radial-gradient 背景光暈，若完全透明，連結文字在浮球經過時對比不足。`backdrop-blur-sm` + 20% 深色底 提供足夠的可讀性又不破壞 Hero 視覺。

**為什麼 `-NAV_HEIGHT`**：避免在過渡瞬間 nav 自身區域（overlay 在 Hero 底部那 56px）穿插錯誤狀態。減掉 nav 高度後，State B 啟動時機恰好是 Hero 剩餘可視內容正要離開視窗頂端下方的時刻。

### 決策 3：TocBar 由 `sticky top-0 z-[100]` 改為 `fixed top-0 left-0 right-0 z-[100]`

**連帶影響**：
- `fixed` 脫離文件流，不再佔用版位。Hero 仍是 `min-h-screen`，其底部不再自動「推走」TocBar（因 TocBar 已 fixed）。Hero 內主文案靠 `items-center` 垂直置中，被 nav 遮住的是 Hero 頂端的背景場地線條上緣 — 視覺可接受（已與使用者確認）。
- `z-[100]` 沿用不變；Hero 內浮球等元素 z-index 在 Hero `z-[2]` 以下，不衝突。

### 決策 4：不動 `useScrollSpy` rootMargin

`rootMargin = "-80px 0px -60% 0px"` 的上邊距 `-80px` 原本就是為固定 nav 高度預留的緩衝；改成 fixed 後這個語意更貼切。若未來 nav 實際高度超過 80px，可考慮調整，但目前 `h-14` (56px) + padding 仍在範圍內。

### 決策 5：分類 TDD / 例外層

- **行為邏輯（TDD）**：
  - `src/hooks/useScrolledPast.ts` — 新增 hook，先寫失敗測試 `src/hooks/useScrolledPast.test.ts` → 實作至通過 → refactor
- **例外層（不強制 TDD，但驗收方式明確）**：
  - `src/components/guide/TocBar.tsx` — 元件屬視覺 + 組合 hooks，本身邏輯極淺；驗收以 spec 場景（Given/When/Then 對應視覺）+ 手動瀏覽驗證為主。若補元件測試則放 `src/components/guide/__tests__/TocBar.test.tsx`（可選）

## Risks / Trade-offs

- **[風險] Hero 頂端被 nav 遮住視覺**
  - → 緩解：採透明 + 極輕 backdrop-blur 融入 Hero；nav 遮的是背景場地線條頂緣，非主文案
- **[風險] 低版本 Safari 對 `backdrop-filter: blur()` 支援不完整**
  - → 緩解：Tailwind `backdrop-blur-sm` 已由現行瀏覽器主流支援；降級時僅失去 blur，半透明底仍提供基本可讀性
- **[風險] resize 時門檻變更導致狀態瞬間切換閃爍**
  - → 緩解：`useScrolledPast` 的 lazy threshold 在每次 scroll 觸發，resize 不直接觸發重判；但使用者正在 resize 時切換也是預期行為，不做額外消抖
- **[Trade-off] nav 一開始就顯示，犧牲 Hero 的「無 UI 純敘事」開場感**
  - → 已與使用者討論，接受此犧牲換取便利性；B 方案透明樣式已將衝擊降到最小
- **[風險] spec 的 MODIFIED 區塊要原樣複製 Requirement 再編修，漏改會導致 archive 時遺失細節**
  - → 緩解：specs.md 中完整列出三個 Requirement 的更新後內容，不使用 partial rewrite
