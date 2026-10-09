# Tasks: navbar-narrow-viewport-fit

> **TDD 三步**：RED 先寫失敗測試並在 shell 實際看到紅燈（貼出輸出）→ GREEN 最小實作至綠 →
> REFACTOR（無壞味道註記 skipped）。**紅燈要是真的**；加入即綠者 MUST 誠實標註為
> regression guard，SHALL NOT 用「改斷言看紅再改回」偽造紅燈。
>
> E2E 指令：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/navbar-rwd.spec.ts`
>
> **test 名稱必須與 delta spec 的「驗收」錨點逐字一致。**

## 1. 前置確認（不寫任何產品程式碼）

- [ ] 1.1 確認 cwd 為 environment.md 宣告的路徑、分支為 `change/navbar-narrow-viewport-fit`，baseline `pnpm test` 全綠；回填 environment.md 的 Verification
- [ ] 1.2 讀 `nextjs-pickball/components/layout/SiteNavbar.tsx`，確認容器 `px-4 sm:px-6`、`gap-3 sm:gap-6`、連結 `px-2 sm:px-3`、logo 為 header 內第一個 `<a>`，與 design Context 一致；不一致則停下回報
- [ ] 1.3 確認 `navbar-rwd.spec.ts` 既有五條 test 在 chromium 全綠（baseline）

## 2. 窄螢幕導航呈現（site-navbar）
Depends on: §1

- [ ] 2.1 RED: write test `320px 下五個導航連結完整落在視口內`（預期修正前「對戰分配」`toBeInViewport({ ratio: 1 })` 失敗）
- [ ] 2.2 GREEN: `SiteNavbar.tsx` 加上 `max-[375px]:hidden`（logo）、`max-[375px]:px-3`（容器）、`max-[375px]:px-1.5`（連結）
- [ ] 2.3 RED: write test `小於 375px 時隱藏 logo、375px 起恢復`（若 2.2 已使其加入即綠，MUST 標註為 regression guard 並說明：logo 隱藏是 2.2 讓 2.1 轉綠的必要手段，無法拆開）
- [ ] 2.4 GREEN: 若 2.3 為真紅燈，補上使其轉綠的最小實作；否則註記 n/a
- [ ] 2.5 REFACTOR: 同步更新 `SiteNavbar.tsx` 內「窄螢幕：收合 logo 文字」那段註解，說明 < 375px 的額外讓出規則（無其他壞味道則 skipped）

## 3. 收尾驗證
Depends on: §2

- [ ] 3.1 `navbar-rwd.spec.ts` 全檔 chromium 全綠（含既有 390px test，證明 ≥ 375px 零差異）
- [ ] 3.2 `pnpm lint`、`pnpm typecheck`、`pnpm test:web` 全綠
- [ ] 3.3 320／375／390px 各截一張 header 圖目視確認，附於回報
- [ ] 3.4 `git diff main --stat` 只含 `SiteNavbar.tsx`、`navbar-rwd.spec.ts` 與本 change 資料夾
