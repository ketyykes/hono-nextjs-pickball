## Context

`/scoreboard` 目前的版面是「`min-h-screen` 內容自然長高」：外層 `flex min-h-screen flex-col pt-14`，內含設定列（61px）、兩個 TeamPanel（`flex-1`，分數字級 `text-[10rem] md:text-[14rem]` 固定值）、ActionBar（61px）。實測（headless Playwright）確認三類裝置溢出：844x390 橫向手機 212px、390x844 直向手機 108px、768x1024 平板直向 56px；橫向最小頁高 602px、直向手機 952px、平板直向 1080px。兩個結構性根因：

1. 所有尺寸只跟**寬度斷點**走（`md:` 以寬 768px 判定，平板直向、橫向手機都誤中 224px 大字級），沒有任何尺寸隨**視窗高度**縮放。
2. `min-h-screen` = 100vh，行動瀏覽器工具列展開時大於可視高度；全螢幕鈕只移除瀏覽器外框、不改內容固定高度，且 iPhone Safari 不支援 Fullscreen API（`fullscreenEnabled === false`）時按鈕整顆不渲染。

專案內已有 `TourShell.tsx` 用 `calc(100dvh - var(--site-nav-h))` 鎖高的先例；實裝 tailwindcss 4.3.0 支援 `@container-size` 與容器查詢單位。

## Goals / Non-Goals

**Goals:**

- 手機直向（390x844）、手機橫向（844x390）、平板直向（768x1024）、桌機（含 1024x600 臨界尺寸）皆零垂直捲動（`scrollHeight <= clientHeight`），且「贏這球+」與 Undo/重置按鈕完整落在 viewport 內
- 分數字級隨「面板實際可用高度」流體縮放，一組參數同時覆蓋直向／橫向與 OrientationHint 顯示／關閉等變因
- 「專注模式」：手動切換後隱藏 navbar 與設定列、ActionBar 浮動化，分數面積最大化；支援 Fullscreen API 的裝置附帶進入全螢幕；iPhone Safari 等不支援裝置仍有完整的專注模式（修掉現況按鈕缺席的功能洞）

**Non-Goals:**

- 不做 `status`-based 自動進入專注模式（localStorage 恢復會讓使用者一進頁 navbar 就消失，且會弄壞既有兩條 E2E）
- 不引入 JS 量測（ResizeObserver / visualViewport / transform scale）——本頁為固定結構，純 CSS 可解（評估詳見 proposal）
- 不改計分規則、Undo、持久化、Toast 等既有行為；`useFullscreen.ts`、`app/layout.tsx` 零改動
- 不處理軟鍵盤／split view 等極端矮視口的完美呈現（clamp 下限保底可讀即可）

## Decisions

### D1：鎖高採 `h-dvh` + `overflow-hidden` + `min-h-0` flex 鏈（方案 A）

`Scoreboard.tsx` 外層改 `flex h-dvh flex-col overflow-hidden bg-background pt-(--site-nav-h)`（非 focus 時）。要點：

- `dvh` 而非 `vh`：行動瀏覽器工具列動態高度下 100vh 失真；頁面 `overflow-hidden` 後不可捲、工具列不會收合，`dvh` 實質為穩定值。與 `TourShell` 先例一致。
- **`min-h-0` 是成敗關鍵**：flex item 預設 `min-height: auto` 不肯縮到內容尺寸以下；中間 wrapper（`flex flex-1`）與 TeamPanel 根節點都要補 `min-h-0`，否則大字級照樣撐破鎖高。
- `pt-14` 順手改為 `pt-(--site-nav-h)`，符合 site-navbar spec「layout 元件透過 `--site-nav-h` 取用高度」的既有 requirement。

### D2：字級用 size container + 容器查詢單位（方案 B），container 設在每個 TeamPanel

TeamPanel 根節點加 `@container-size min-h-0 min-w-0`，分數字級改 `text-[clamp(4rem,min(50cqh,36cqw),16rem)]`（起點參數，依量測調校）；`gap-6`/`p-6` 改 `gap-[clamp(0.5rem,4cqh,1.5rem)]`/`p-[clamp(0.5rem,4cqh,1.5rem)]`（同樣待調）。理由：

> **實作落地註記**：字級最終量測調校為 `clamp(2.5rem,min(37cqh,38cqw),14rem)`；gap/padding 改用
> `clamp(0.375rem,2dvh,1.5rem)`（**dvh 而非 cqh**）——cq 單位查的是「祖先」container，掛在
> panel 自身的屬性查不到自己、會靜默 fallback 到視口尺寸，故明確改用 dvh，原因見 TeamPanel.tsx 註解。

- container 設在 panel 而非中間 wrapper：直向時 panel 高≈可用區一半、橫向≈全高，`cqh` 天然跟著變——一組參數覆蓋兩種 orientation，並自動吸收 OrientationHint 橫幅、設定列 flex-wrap 換行等高度變因（viewport 單位感知不到這些）。
- `cqw` 上限防兩位數分數在直向半寬面板水平溢出；`clamp()` 給下限（極矮視口仍可讀）與上限（大桌機不誇張）。
- 移除 `md:text-[14rem]`：寬度斷點與「依高度縮放」目標矛盾，是平板直向溢出的直接原因。
- 依賴 tailwindcss >= 4.3（`@container-size` 為 4.3 新 utility；實裝 4.3.0 已確認）。瀏覽器支援線（size container：Safari 16+/Chrome 105+/Firefox 110+）被 Tailwind v4 自身基線（Safari 16.4/Chrome 111/Firefox 128）完全涵蓋，零額外相容成本。

### D3：專注模式為手動切換，fullscreen 是 progressive enhancement（方案 D）

- `ScoreboardSetup` 右側按鈕改為「專注模式」鈕：**永遠渲染**（拿掉 `fullscreenSupported &&` 條件），`aria-label`「進入專注模式」/「退出專注模式」、`aria-pressed` 綁 focus 狀態。
- 點擊時：切換 focus mode；`isSupported === true` 再附帶呼叫 `useFullscreen` 的 `toggle()`（進入時 request、退出時 exit）。iPhone Safari（`isSupported === false`）只切 focus layout，行為一致。
- Esc／系統手勢退出 fullscreen（`isFullscreen` 由 true→false）時同步退出 focus mode；追蹤 previous 值判斷「真的退出過」，避免不支援 fullscreen 的裝置（`isFullscreen` 恆 false）一進 focus 就被誤關。
- focus mode 下：`ScoreboardSetup` 整列不渲染，改渲染一顆 `fixed top-2 right-2` 的浮動退出鈕（Minimize 圖示）；外層 `pt-0`；ActionBar 收為浮動縮小版（`fixed bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 backdrop-blur`），按鈕 role/name 不變。

> **實作落地註記**：浮動元件 z-index 定為 **`z-40`**（設計初稿的 `z-[115]` 會蓋過 portal 到 body 的
> z-50 AlertDialog／GameOverDialog，與下一條「禁止覆蓋法」自相矛盾）；navbar 在 focus mode 已隱藏，
> 浮動元件不需要壓過它。另外直向 focus mode 追加 `portrait:pb-16` 保留底部空間——浮動 ActionBar 與
> 下面板「贏這球+」按鈕同一水平中線會重疊（量測證實），保留空間讓面板高度預算把浮動列算進去；
> 橫向按鈕在左右半場中央、浮動列落在中間空帶，不需讓位。
- **禁止覆蓋法**：不可改用「Scoreboard 外層 `fixed inset-0 z-[120]` 蓋過 navbar」——重置確認 AlertDialog 與 GameOverDialog 都是 Radix portal 到 body 的 `z-50`，會被整頁蓋死。

### D4：navbar 隱藏走 `documentElement` class + Tailwind arbitrary variant

focus mode 期間在 `document.documentElement` 掛 `sb-focus` class；`SiteNavbar.tsx` 的 header className 追加 `[.sb-focus_&]:hidden`。SiteNavbar 零邏輯改動、不需知道 scoreboard 狀態，`app/layout.tsx` 不動，跨樹耦合最低。unmount／退出時必須清除 class（全域副作用，漏清會污染其他路由）。

### D5：行為邏輯抽 `useFocusMode` hook（必 TDD），呈現層以 E2E 驗收

- **行為邏輯（必 TDD）**：`nextjs-pickball/hooks/useFocusMode.ts`——簽名 `useFocusMode(options: { isFullscreen: boolean }): { focusMode: boolean; toggleFocusMode: () => void }`。職責：focus state 切換、`sb-focus` class 的掛載／清除（含 unmount cleanup）、fullscreen true→false 的退出同步。接收 `isFullscreen` 參數而非內部呼叫 `useFullscreen`，happy-dom 下以 rerender 模擬 fullscreen 變化即可測，不需 mock document.fullscreenElement。
- **例外層（不強制單元 TDD，以 E2E 驗收）**：四個 scoreboard 元件與 SiteNavbar 的 className／條件渲染改動（純呈現）、`tests/e2e/specs/scoreboard.spec.ts` 新增測試。
- E2E 新增兩組：① 防捲動——390x844、844x390、768x1024、1024x600 四組 viewport 斷言 `scrollHeight <= clientHeight + 1` 且「贏這球+」按鈕 boundingBox 完整在 viewport 內（`overflow-hidden` 把失敗模式從可捲動變成裁切，既有 role/text 斷言抓不到，此測試是唯一防線）；② 專注模式進出——點鈕後 navbar 與「比賽形式」combobox hidden、浮動退出鈕 visible，退出後恢復（斷言 DOM 狀態，不依賴真的進 fullscreen，五個 browser project 才穩）。
- 參數調校迴圈：實作後重跑既有量測腳本（headless Playwright、7 組 viewport）確認全部 `overflowPx === 0`，並截圖目視分數無疊字／裁切——依專案 memory，驗證一律用 headless Playwright，不用 Chrome MCP 分頁。

## Risks / Trade-offs

- **失敗模式轉移**：`overflow-hidden` + `contain: size` 把「參數算錯」從可捲動變成**靜默裁切／疊字**，且既有 E2E 的 `toBeVisible` 抓不到 → 以 D5 的防捲動 E2E ＋ boundingBox 斷言 ＋ 量測腳本三重把關。
- **cq 參數是估值**：panel 內仍有固定高度成員（隊名、ServeIndicator 佔位、按鈕），`50cqh/36cqw/16rem` 需實測迭代；極矮視口（<390px 高＋橫幅）只保底 clamp 下限可讀。
- **tailwindcss >= 4.3 硬依賴**：lockfile 若回退到 4.2.x，`@container-size` 不產出、字級靜默失效——在 TeamPanel 註解明示此約束。
- **浮動 ActionBar 與「贏這球+」按鈕在矮視窗可能重疊** → 量測腳本加 focus mode 下兩者 boundingBox 不相交的檢查；若重疊改為只縮 padding 不浮動。（實作結果：直向確實重疊，最終採第三方案「保留浮動＋`portrait:pb-16` 預留底部空間」，量測確認 4 組 viewport 零溢出且不相交。）
- **`sb-focus` 為全域副作用**：`useFocusMode` 的 cleanup 必須被單元測試覆蓋（unmount 後 class 移除）。
- **無障礙取捨**：容器單位字級不完全跟隨使用者字型偏好，`clamp()` 的 rem 上下限部分保留；分數另有 `aria-label`（「我方目前 N 分」）供讀屏，資訊不受視覺字級影響。
- **語意約束**：頁面從此不能長高——未來往 Scoreboard 盒內加內容會被裁掉，在外層註解明示。
