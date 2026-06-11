## 1. 新增 useScrolledPast hook（行為邏輯，TDD）

- [x] 1.1 ① 新增失敗測試：建立 `src/hooks/useScrolledPast.test.ts`，加入兩個 it：
  - 「應在 scrollY 超過固定 threshold 時回傳 true」（對應 spec scenario：固定 threshold）
  - 「應以 function threshold 動態判定是否已捲過門檻」（對應 spec scenario：function threshold）
  - 執行 `pnpm test -- --run src/hooks/useScrolledPast.test.ts` 確認紅燈（hook 尚未存在）
- [x] 1.2 ② 最小實作：建立 `src/hooks/useScrolledPast.ts`，簽名 `useScrolledPast(threshold: number | (() => number)): boolean`：
  - 於 `useEffect` 內註冊 passive scroll listener
  - listener 內呼叫 `typeof threshold === 'function' ? threshold() : threshold` 取得當前門檻，比較 `window.scrollY > current`
  - 初始化時立即呼叫一次避免初次渲染錯誤
  - unmount 時 removeEventListener
  - 執行 `pnpm test -- --run src/hooks/useScrolledPast.test.ts` 確認綠燈
- [x] 1.3 ③ refactor：檢視 `useScrolledPast.ts`，無壞味道（skipped）

## 2. 改造 TocBar 為 fixed overlay + 雙狀態（例外層，元件）

- [x] 2.1 修改 `src/components/guide/TocBar.tsx`：
  - 引入 `useScrolledPast`；宣告 `const NAV_HEIGHT = 56`
  - 移除 `useScrollShadow` 引用
  - 取得 `pastHero = useScrolledPast(() => window.innerHeight - NAV_HEIGHT)`
  - 根 `<nav>` className 改為 `fixed top-0 left-0 right-0 z-[100] transition-[background-color,box-shadow,backdrop-filter] duration-300`
  - 依 `pastHero` 條件組合：
    - false（Hero 內）：`bg-slate-900/20 backdrop-blur-sm border-b border-white/10`
    - true（捲離 Hero）：`bg-background/90 backdrop-blur shadow-md border-b border-border`
  - 「目錄」標籤文字色依狀態切換（白 / slate-900）；邊界線 `border-white/20` / `border-border`
  - 連結文字色依狀態切換：false → `text-white/70 hover:text-white`；true → `text-muted-foreground hover:text-slate-900`
  - active 底線固定 `border-b-lime-400`；文字色依狀態切換（white / slate-900）
- [x] 2.2 驗收：啟動 `pnpm dev`，手動瀏覽 `http://localhost:5173/`：
  - 頁面載入時 nav 即顯示在頂端，呈現 State A（透明 + blur、白字）
  - 緩慢捲動超過 Hero 後 nav 切換為 State B（白底 + shadow、深字）
  - active 底線仍正確對應當前 section
  - 視窗 resize 後狀態切換門檻跟著改變（mobile viewport 下也正確）

## 3. Spec 同步（spec 檔，例外層）

- [x] 3.1 確認 `openspec/changes/make-tocbar-fixed-overlay/specs/pickleball-guide-page/spec.md` 已就位（於 propose 階段建立）
- [x] 3.2 跑 `openspec validate make-tocbar-fixed-overlay` 確認 delta spec 格式正確、可順利 diff

## 4. 驗證與全量測試（全域驗收）

- [x] 4.1 執行 `pnpm test -- --run` 確認所有單元測試通過（含新增的 useScrolledPast test、既有三支 hooks test、其他元件 test）
- [x] 4.2 執行 `pnpm lint` 無錯誤（2 個 pre-existing warning 與本次改動無關）
- [x] 4.3 執行 `pnpm build` 型別檢查與建置成功
- [x] 4.4 （可選）手動在 Chrome / Safari / Mobile viewport 確認雙狀態切換視覺正確、無閃爍
