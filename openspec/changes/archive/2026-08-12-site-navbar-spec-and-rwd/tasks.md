# Tasks — site-navbar-spec-and-rwd

> 分類依 design.md。A 與 B 走三步；C 為量測後定稿的 RWD（先寫 E2E 看紅）。

## A. 三步 TDD — `lib/navHeight.ts`

- [x] **A1（紅）** 新增 `lib/navHeight.test.ts`，5 個 it：rem 換算、px 直取、root font-size 變動、變數未定義、無法解析
  - 實測紅燈：`Test Files 1 failed / Tests no tests`（模組不存在）✅
- [x] **A2（綠）** 新增 `lib/navHeight.ts`：`getNavHeightPx()` + `NAV_HEIGHT_FALLBACK_PX`
  - 支援 `rem`（依 root font-size）與 `px`；SSR 或無法解析回 fallback
  - 驗收：5 測全綠 ✅
- [x] **A3（refactor）** 三個分支各自獨立、無重複 → `skipped`

## B. 三步 TDD — SiteNavbar 門檻改讀 CSS 變數

- [x] **B1（紅）** 新增 `components/layout/SiteNavbar.test.tsx`，3 個 it
  - 手法：mock `useScrolledPast` 捕捉傳入的 threshold function，設 `--site-nav-h: 100px` 後呼叫
  - 實測紅燈：`Tests 1 failed | 2 passed (3)`，`expected 744 to be 700` ✅
- [x] **B2（綠）** `SiteNavbar.tsx:25` 改為 `window.innerHeight - getNavHeightPx()`
  - 同步修 `components/guide/TocBar.tsx` 的 `const NAV_HEIGHT = 56`（同一個 Requirement 的管轄對象）
  - 驗收：SiteNavbar 3 測全綠；全套 23 檔 114 測全綠（含 change ② 新增的 `TocBar.test.tsx`）✅
- [x] **B3（refactor）** 換算邏輯已抽為 `lib/navHeight.ts`，兩個使用者共用 → 本身即是 refactor 成果

## C. RWD（決策 D3：A 案）— 先量測，後定稿

- [x] **C1** 用臨時 E2E 量測 navbar 在 320 / 360 / 390 / 430 / 640 / 1280 下的實際佔用
  - **量測推翻了稽核的推估**（見 design.md D-⑥-1）：
    - 不會橫向溢出（`scrollWidth === clientWidth` 恆成立，flex 子元素被壓縮）
    - 真正的破口是**換行**：logo 高度 20→**40px**、連結高度 36→**56px**，塞在固定 `h-14` 內
  - 量測檔為臨時性質，量完即刪
- [x] **C2（紅）** 新增 `tests/e2e/specs/navbar-rwd.spec.ts`，4 個 test（chromium only）
  - ⚠️ 斷言重點是**高度是否倍增**，不是 `scrollWidth <= clientWidth`——後者沒有鑑別力
  - 實測紅燈：`Expected: <= 24, Received: 40`（logo 換行）+ logo 文字未收合 ✅
- [x] **C3（綠）** `SiteNavbar.tsx` 套用 A 案
  - logo 文字包 `<span className="hidden sm:inline">`，只留 🏓
  - 容器 `gap-3 px-4 sm:gap-6 sm:px-6`；nav `gap-0.5 sm:gap-1`；連結 `px-2 sm:px-3`
  - **logo 與連結加 `whitespace-nowrap`** ← 真正的修法
  - logo 加 `shrink-0` 避免被 flex 壓縮
  - 驗收：4 個 E2E test 全綠 ✅
- [x] **C4（refactor）** 純 utility 調整，無邏輯可重構 → `skipped`

## D. 修正 change ④ 造成的 E2E 回歸

- [x] **D1** `playwright.config.ts:32` 的後端 readiness 探測 `http://localhost:8787` → `http://localhost:8787/api/health`
  - **成因**：change ④ 依決策 D2 把 `GET /` 改成 404；Playwright 的 webServer 探測等待 2xx/3xx，
    404 永遠不算 ready → **所有 E2E 一律 120 秒逾時失敗**
  - 已在 config 內留註解說明，避免日後被「順手」改回 `/`
  - 教訓：刪端點前要 grep 誰在依賴它，**包含設定檔不只程式碼**

## 完成驗收

```bash
cd /Users/danny/Desktop/project/hono-nextjs-pickball

pnpm --filter ./nextjs-pickball test --run lib/navHeight.test.ts                    # 5 測
pnpm --filter ./nextjs-pickball test --run components/layout/SiteNavbar.test.tsx    # 3 測
pnpm --filter ./nextjs-pickball test --run components/guide/TocBar.test.tsx         # 3 測（迴歸）
pnpm --filter ./nextjs-pickball test --run                                         # 23 檔 114 測

# E2E（需前後端運行；webServer 會自動帶起，探測已修正）
pnpm --filter ./nextjs-pickball test:e2e --project=chromium tests/e2e/specs/navbar-rwd.spec.ts   # 4 test

# 硬寫數值歸零
grep -n "56" nextjs-pickball/components/layout/SiteNavbar.tsx nextjs-pickball/components/guide/TocBar.tsx | grep -v "h-14\|//"

pnpm lint
DO_NOT_TRACK=1 openspec validate site-navbar-spec-and-rwd --strict
```
