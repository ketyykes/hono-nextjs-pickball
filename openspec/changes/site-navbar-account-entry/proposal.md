# Proposal: site-navbar-account-entry

## Why

navbar 的帳號入口（`AccountEntry`）有兩個在 B3 時刻意留下、之後在 B7／B8 驗收中反覆出現的問題，現在一併修掉：

1. **載入時不佔寬度造成 navbar 位移**：主 spec `site-navbar`「navbar 顯示帳號入口」明定 session `loading` 時不渲染任何元素。
   `/api/session` 回應後插入圖示，`<nav>`（`ml-auto`）整排左移；使用者或 E2E 的 mousedown／mouseup 落在不同連結時 click 派給共同祖先 `<nav>`，導覽沒發生。
   B7 以事件捕捉診斷 80 次失 7，每次都是 mousedown 落在「測驗」、mouseup 落在「對戰分配」；webkit `quiz.spec.ts:49`、`scoreboard.spec.ts:22`
   因此約 3～9% 偶發失敗（`main` 上 `--repeat-each=30` 也重現 1/30）。這同時是 CLS 與使用者誤點。
2. **窄螢幕沒有登入入口**：B3 裁決帳號入口 `< sm`（640px）以 `hidden sm:inline-flex` 隱藏，手機只能自己輸入 `/login`。
   當時實測若直接顯示會溢出（320px 超出 10px、375px 超出 11px、390px 只剩 4px）。手機是計分板的主要使用情境（場邊），行動裝置需要能從 navbar 登入／登出。

## What Changes

- **帳號入口永遠佔用固定寬度**：`AccountEntry` 在 `loading` 與 `authEnabled === false` 時改為渲染一個**隱形佔位元素**
  （`invisible`、`aria-hidden="true"`、非互動、帶 `data-account-entry="loading" | "disabled"`），其版面 class 與登入連結完全相同；
  登入連結、登出按鈕、佔位元素三者寬度一致，`/api/session` 回應前後 navbar 連結位置不變。
- **窄螢幕顯示帳號入口**：移除 `hidden sm:inline-flex`，入口在所有寬度顯示。空間由 `< sm` 的間距讓出：
  - 共用內距 `NAV_ITEM_BASE`：`px-2 max-[375px]:px-1.5 sm:px-3` → `px-1.5 max-[375px]:px-1 sm:px-3`（`< sm` 的兩層各降一階；`>= sm` 不變）；
  - header 內層容器：`gap-3 sm:gap-6` → `gap-1 sm:gap-6`（`>= sm` 不變）。
  - 估算餘裕（design Decision 2）：320px 10px、375px 13px、390px 28px。
- **訪客與正式站可見的變更（本 change 明確要改）**：
  - 正式站（auth 停用）與載入中的訪客，navbar 最右側多一格**看不見的**入口寬度：`>= sm` 時五個連結整體左移 64px（入口 40＋間距 24），
    `< sm` 時左移 28～32px；這是消除位移的必要代價（見 design Decision 1）。
  - `< sm` 時五個連結的水平內距縮小一階、logo 與連結的最小間距由 12px 縮為 4px。
  - `.dev.vars` 齊備的訪客在手機寬度會看到「登入」圖示。
- **登入頁說明同步**：`/login` 已登入分支的「登出」按鈕保留，但不再是窄螢幕唯一的登出入口（`auth`「本機測試帳號登入頁」的說明與窄螢幕 Scenario 同步）。

### 明確不做

- 漢堡選單、帳號下拉選單、顯示使用者姓名（G1 改 Google 登入時再設計）。
- 縮短任何連結文案、隱藏任何導航連結、改變 logo 的 `< 375px` 隱藏規則。
- 以 build-time 旗標判斷 auth 是否啟用（見 design Decision 1 的替代方案）。
- 新 hook、新相依、後端改動。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `site-navbar`：REMOVED「navbar 顯示帳號入口」、ADDED「navbar 帳號入口於各寬度可見且預留固定寬度」（以 REMOVED＋ADDED 改名取代：舊版含
  「載入中或未啟用時不渲染」「帳號入口於 sm 以下隱藏」「窄螢幕下隱藏帳號入口且不影響既有導航連結」三條與新行為相反的 Scenario，MODIFIED 不允許丟棄既有 Scenario）；
  MODIFIED「窄螢幕導航呈現」（`< sm` 的連結內距與容器間距數值）。
- `auth`：MODIFIED「本機測試帳號登入頁」（已登入分支的窄螢幕說明、Scenario「窄螢幕下經由登入頁登入與登出」的 THEN）。

## Impact

- **前端程式碼**：
  - `nextjs-pickball/components/layout/AccountEntry.tsx`（佔位元素、移除 `hidden sm:inline-flex`、檔頭註解）
  - `nextjs-pickball/components/layout/navItemStyles.ts`（`NAV_ITEM_BASE` 內距階梯）
  - `nextjs-pickball/components/layout/SiteNavbar.tsx`（內層容器 `gap-3` → `gap-1`、窄螢幕註解）
  - `nextjs-pickball/components/auth/LoginForm.tsx`（只改一行過時註解，行為不變）
- **文件**：`nextjs-pickball/CLAUDE.md`「架構總覽」的 `/login` 條目（移除「帳號入口在 `< sm` 隱藏、窄螢幕改由 `/login`」的過時敘述）
- **單元測試**：
  - `nextjs-pickball/components/layout/AccountEntry.test.tsx`：新增 it；**刪除**「載入中或未啟用時不渲染任何元素」「登入連結與登出按鈕在 sm 以下隱藏」兩個 it（行為依本 change 反轉，由新 it 取代）
  - `nextjs-pickball/components/layout/SiteNavbar.test.tsx`：新增 it（既有 it 一行不改）
- **E2E**：
  - 新增 `nextjs-pickball/tests/e2e/specs/navbar-account-entry.spec.ts`（以 `page.route` 模擬 `/api/session`，不依賴 `.dev.vars`）
  - `nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`：**刪除**「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」；**修改**「窄螢幕下可經由登入頁登入與登出」的斷言
    （navbar 改為顯示「登出」；登入頁的「登出」按鈕改限定在 `main` 內查找）；新增「窄螢幕下 navbar 登入入口可前往登入頁」；移除不再使用的 `NAV_LABELS`／`HIDDEN_WIDTHS`／`VISIBLE_WIDTHS` 常數，改寫 describe 開頭「mobile-chrome 視口會隱藏帳號入口」的過時註解
- **既有 E2E 不改**：`navbar-rwd.spec.ts`、`quiz.spec.ts`、`scoreboard.spec.ts`、`match-stage.spec.ts`、`tests/e2e/user-data/**` 一行不改且須原樣通過。
- **相依**：不新增任何第三方套件。**Migration**：無。**後端／核心套件**：零變更。**hooks**：不新增（不需更新 hooks 歸屬清單）。
