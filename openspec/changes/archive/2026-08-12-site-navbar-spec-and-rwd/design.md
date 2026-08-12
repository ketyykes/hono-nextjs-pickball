## Context

本 change 有一個與其他 change 都不同的特徵：**它的規格內容必須由量測決定，不能由推理決定。**

稽核階段對窄螢幕行為的推估（「內容約 434px > viewport 390px 會溢出」）**被實測推翻**。
這份 design 的第一要務是記錄那次推翻，避免日後有人照著錯誤的推理再走一次。

## TDD 分層判定

| 項目 | 分類 | 依據 |
|---|---|---|
| `lib/navHeight.ts` | **行為邏輯**（`lib/**`） | 走三步，真 red-first |
| `components/layout/SiteNavbar.tsx` 的門檻改動 | **行為邏輯**（`components/**`） | 走三步，真 red-first |
| `components/layout/SiteNavbar.tsx` 的 RWD utility | **樣式調整** | 但 `components/**` 不在例外清單，仍先寫 E2E 看紅（見 D-⑥-2） |
| `components/guide/TocBar.tsx` | **行為邏輯** | 已有 `TocBar.test.tsx`（change ② 新增）守住，改動後須維持全綠 |
| `playwright.config.ts` | **例外層** | 測試設定 |

## 關鍵決策

### D-⑥-1｜先量測，後定規格（且量測推翻了推估）

決策 D3 定案時附了一組估算的 utility 值，並明確標註「落地前必須量測，不要照抄」。
實際量測（chromium，`header > div`）結果：

```
vw=320  logo=71/71   logoH=40  nav=177/177  linkH=56  headerH=56
vw=390  logo=91/91   logoH=40  nav=227/227  linkH=56  headerH=56
vw=430  logo=102/102 logoH=40  nav=256/256  linkH=56  headerH=56
vw=640  logo=105/105 logoH=20  nav=262/262  linkH=36  headerH=56
```

三件事與推估不符：

1. **不會橫向溢出**。`scrollWidth === clientWidth` 在所有寬度恆成立 ——
   header 是 flex 容器，logo 與 nav 被壓縮到剛好填滿。
   「餘裕」恆為 72px（= `gap-6` 24 + `px-6` 48），與 viewport 無關
2. **真正的破口是換行**。logoH 由 20 變 40、linkH 由 36 變 56，
   都是斷成兩行後塞在固定 `h-14`（56px）的 bar 裡
3. **修法的核心是 `whitespace-nowrap` 而非縮距**。縮 gap/padding 只是讓 nowrap 之後仍放得下

**教訓**：對 flex 容器斷言「不橫向溢出」幾乎沒有鑑別力 —— 子元素會先被壓縮。
要驗排版有沒有壞，該量的是**子元素高度是否倍增**。

### D-⑥-2｜RWD 的驗收放 E2E，不放單元測試

單元測試只能斷言 className 字串，斷不了「文字有沒有換行」。
把 `sm:gap-6` 寫進 `toContain` 斷言，等於把當下隨手挑的 utility 固化成規格，
換一組等效的 utility 就會誤紅，而真正壞掉時反而測不出來。

因此 RWD 的 Scenario 全部以**可觀察的排版結果**表述（高度是否倍增、連結是否可見、
logo 文字是否隱藏），驗收放 `tests/e2e/specs/navbar-rwd.spec.ts`。
`config.yaml` 把 E2E 列為例外層不強制三步，但本項仍**先寫測試看紅**
——因為那是唯一能確認「問題真的存在」的手段。

E2E 只在 chromium 跑一次（`test.skip` 其餘 project）：這是排版行為，與引擎無關，
且 firefox/webkit/mobile-safari 的本機瀏覽器版本落後是已知問題（見 archive 記錄）。

### D-⑥-3｜`getNavHeightPx()` 抽成 lib helper 而非留在元件內

原計畫的 ⑥-3-③ 寫「若換算邏輯有複用價值，抽成 `lib/` 下的 helper；否則註記 skipped」。
量測時發現**確實有兩個使用者**：`SiteNavbar.tsx:25` 與 `TocBar.tsx:9` 都硬寫 `56`。

因此直接抽成 `lib/navHeight.ts` 並 TDD 它，而不是在 SiteNavbar 內寫一次再重複一次。
函式需處理三種情況：`rem`（依 root font-size 換算）、`px`（直接取值）、
無法解析（回 `NAV_HEIGHT_FALLBACK_PX`）。SSR 下 `window` 不存在也回 fallback。

### D-⑥-4｜動 TocBar 是修正 site-navbar 的 Requirement，不是越界

`TocBar.tsx` 屬 `pickleball-guide-page` capability。本 change 動它，理由是
它違反的是 **site-navbar 的**「統一 nav 高度變數」Requirement ——
該 Requirement 的管轄對象本來就是「所有取用 nav 高度的 layout 元件」。

原 Requirement 的主詞寫「**其他** layout 元件（Hero、TourShell 等）」，
把 SiteNavbar 自身與 TocBar 都排除在字面之外，這是規格的漏洞而非實作的問題。
本 change 把主詞擴及所有 layout 元件，使其可落實。

### D-⑥-5｜Playwright readiness 探測的回歸

change ④ 依決策 D2 把 hono 的 `GET /` 改成 404。
`playwright.config.ts:32` 的 `url: "http://localhost:8787"` 是 Playwright 的 readiness 探測，
它等待 2xx/3xx —— 404 永遠不算 ready，於是**所有 E2E 一律 120 秒逾時失敗**。

這個副作用在稽核、計畫、④ 的 design 中都沒被預料到。
④ 的 proposal 只寫了「workers.dev 根路徑會變 404」這個對外影響，
漏了「repo 內部有東西依賴 root path 回 2xx」。

修法是把探測指向 `/api/health`。並在 config 內留註解說明原因，
避免日後有人「順手」改回 `/`。

**教訓**：刪除一個看似無用的端點前，要 grep 誰在依賴它 ——
包含設定檔，不只程式碼。

## 不做的事

- **不做漢堡選單**（決策 D3）。除了「4 個連結不值得」之外，還有實際成本：
  `components/ui/` 只有 alert-dialog、badge、button、card、dialog、input、label、
  select、separator、table、textarea 共 11 個，**沒有 sheet 也沒有 drawer**，`package.json` 無 vaul
- **不在 spec 裡寫死 utility 組合**（見 D-⑥-2）。Requirement 本文提及 `gap-3 px-4` 等值是為了
  說明「空間從哪裡讓出來」，但 Scenario 的 THEN 一律用可觀察結果表述
- **不改 `--site-nav-h` 的值**：3.5rem / 56px 與 `h-14` 對應正確，本 change 只是讓它真的被取用
