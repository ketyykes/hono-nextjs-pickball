## Why

兩個問題，都與「高度／寬度的單一事實來源」有關。

### 1. 窄螢幕零 RWD 規格，實作也零斷點

`grep -cE "sm:|md:|lg:|xl:|hidden" nextjs-pickball/components/layout/SiteNavbar.tsx` → **0**。
header、容器 `gap-6 px-6`、logo、nav `gap-1` 全是單一尺寸。
`openspec/specs/site-navbar/spec.md` 全文 67 行也沒有任何 RWD Scenario。

但 Playwright 有 **mobile-chrome（Pixel 5）與 mobile-safari（iPhone 12）兩個 project 全量跑**
—— 有測試環境、沒有規格，等於窄螢幕的行為從來沒被定義過。

**實測結果推翻了原本的假設。** 稽核時預估「內容約 434px > 390px 會橫向溢出」，
實際量測（chromium, vw=390）發現：

| | 修正前 | 說明 |
|---|---|---|
| `scrollWidth` vs `clientWidth` | 390 = 390 | **不溢出** —— header 是 flex 容器，子元素被壓縮到剛好填滿 |
| logo 高度 | 20px → **40px** | **斷成兩行** |
| 連結高度 | 36px → **56px** | **斷成兩行** |

真正的破口是**文字在固定 `h-14`（56px）的 bar 內換行**，不是橫向溢出。
原本打算用的「不溢出」斷言在修正前後皆恆成立，**驗不出任何問題**。

### 2. nav 高度硬寫在兩個元件裡

`site-navbar/spec.md:38` 已要求「其他 layout 元件 SHALL 透過 `var(--site-nav-h)` 取用」，
但該句主詞是「**其他**」，不含 SiteNavbar 自身；TocBar 也不在列舉的「Hero、TourShell 等」內。
結果兩者各自硬寫 `56`：

- `components/layout/SiteNavbar.tsx:25` — `useScrolledPast(() => window.innerHeight - 56)`
- `components/guide/TocBar.tsx:9` — `const NAV_HEIGHT = 56;`

改 `--site-nav-h` 不會影響這兩處，「單一事實來源」名存實亡。

## What Changes

### RWD（決策 D3：A 案，不做漢堡選單）

- logo 文字「匹克球指南」於 `sm` 以下收合，只留 🏓
- 容器 `gap-6 px-6` → `gap-3 px-4 sm:gap-6 sm:px-6`
- 連結 `px-3` → `px-2 sm:px-3`，nav `gap-1` → `gap-0.5 sm:gap-1`
- **logo 與所有連結加 `whitespace-nowrap`** —— 這才是真正的修法
- 新增 `tests/e2e/specs/navbar-rwd.spec.ts`，4 個 test（chromium only）

### nav 高度單一來源

- 新增 `lib/navHeight.ts` 的 `getNavHeightPx()`：支援 `rem` / `px`，無法解析時回 fallback
- `SiteNavbar.tsx` 與 `TocBar.tsx` 改用該函式
- 新增 `lib/navHeight.test.ts`（5 it）與 `components/layout/SiteNavbar.test.tsx`（3 it）

### 順帶修正 Playwright readiness 探測（change ④ 的回歸）

`playwright.config.ts:32` 用 `http://localhost:8787` 當後端 readiness 探測。
change ④ 依決策 D2 把 `GET /` 改成 404 後，Playwright 永遠等不到 2xx，
**所有 E2E 一律 120 秒逾時失敗**。改為探測 `http://localhost:8787/api/health`。

> 這是本批 change 中唯一一個「前一個 change 造成、被下一個 change 抓到」的回歸。
> 稽核與計畫都沒預料到 —— 因為沒有人把「readiness 探測依賴 root path 回 2xx」寫在任何地方。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `site-navbar`：1 條 ADDED（窄螢幕導航呈現）+ 1 條 MODIFIED（統一 nav 高度變數，主詞擴及所有 layout 元件）

## Impact

- **受影響檔案**
  - 新增：`lib/navHeight.ts`、`lib/navHeight.test.ts`、`components/layout/SiteNavbar.test.tsx`、`tests/e2e/specs/navbar-rwd.spec.ts`
  - 修改：`components/layout/SiteNavbar.tsx`、`components/guide/TocBar.tsx`、`playwright.config.ts`
- **測試影響**：前端 21 檔 106 測 → **23 檔 114 測**；E2E 新增 4 個 test
- **行為變更**
  - 窄螢幕（< 640px）logo 只顯示 🏓
  - `--site-nav-h` 改值後，SiteNavbar 與 TocBar 的捲動門檻會跟著變（先前不會）
- **風險**
  - `TocBar.tsx` 屬 `pickleball-guide-page` capability，本 change 動它是因為它違反的是
    **site-navbar 的** `--site-nav-h` Requirement。已確認 `TocBar.test.tsx`（change ② 新增）全綠
  - `getNavHeightPx()` 在每次 scroll 事件被呼叫（透過 `useScrolledPast` 的 function threshold）。
    `getComputedStyle` 有成本，但這正是 function threshold 存在的目的（支援動態值），
    且實測 114 個單元測試與 4 個 E2E 皆無效能問題
- **明確不做**
  - **不做漢堡選單**（決策 D3）：只有 4 個連結；且 `components/ui/` 沒有 sheet 也沒有 drawer、
    `package.json` 無 vaul，B 案要新增 shadcn 元件 + client state + focus trap + `aria-expanded`，
    成本遠高於其他階段任何一項
  - **不加「header 高度維持 h-14」的新 Scenario**：已被既有 Requirement 覆蓋，重複
