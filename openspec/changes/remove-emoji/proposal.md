# Proposal: remove-emoji

## Why

介面上散落的 emoji（🏓🔄🍳🏆💪📖💡、國旗、✕✓★）讓網站看起來像 AI 產生的範本。使用者評估過全站改版（`change/site-editorial-redesign` 分支）後，決定**維持原本的配色、字型與版面**，只把 emoji 換掉。

## What Changes

- 新增 `nextjs-pickball/components/icons/`：自繪 SVG 符號元件（`LogoMark`、`ServeDiagonalIcon`、`DoubleBounceIcon`、`KitchenZoneIcon`、`MythMarkIcon`、`FactMarkIcon`、`StarIcon`、`RotateToLandscapeIcon`），一律 `currentColor`，不寫死色碼、不用漸層、不帶動畫
- SiteNavbar logo：🏓 → `LogoMark`
- Conclusion 三張卡：🏓🔄🍳 → 發球對角線、兩跳、廚房區三個符號
- MythRow：標籤上的 ✕／✓ → `MythMarkIcon`／`FactMarkIcon`
- PriceStars：★ 字元 → `StarIcon`（實心／空心的顏色維持 `text-amber-400`／`text-foreground/20`）
- ResultScreen 鼓勵文字、GameOverDialog 標題：拿掉 🏆💪📖，改成純文字
- OrientationHint：💡 → `RotateToLandscapeIcon`
- `data/guide/brands.ts` 的 `origin`：拿掉國旗，只留國家與地區名稱
- 程式碼註解裡的 `⚠️`（5 處）改寫為「注意：」、tour 註解中的「✕ 犯規」（5 處）改寫為「打叉犯規」，讓守門測試不需要區分註解和字串（tour 的犯規印章本來就是 SVG，畫面不變）
- 新增守門測試：掃描 `app/`、`components/`、`data/`、`lib/`、`hooks/` 的非測試原始碼，出現 emoji 就失敗
- 配色、字型（Bebas Neue／Outfit／Noto Sans TC）、Hero、動畫、favicon **全部不動**

## Capabilities

### New Capabilities

- `emoji-free-ui`：原始碼不含 emoji 的守門規則，以及取代 emoji 的自繪符號元件規格

### Modified Capabilities

- `site-navbar`：「窄螢幕導航呈現」中 logo 的 🏓 改為 `LogoMark` 符號
- `scoreboard`：「RWD 排版」直式提示橫幅的驗收 test 名稱拿掉 💡

## Impact

- 前端元件：`components/layout/SiteNavbar.tsx`、`components/guide/Conclusion.tsx`、`components/guide/shared/MythRow.tsx`、`components/guide/shared/PriceStars.tsx`、`components/quiz/ResultScreen.tsx`、`components/scoreboard/GameOverDialog.tsx`、`components/scoreboard/OrientationHint.tsx`
- 資料：`data/guide/brands.ts`
- 註解：含 `⚠️` 的 5 個檔案與 `components/tour/stages/` 的 2 個檔案（只改註解文字）
- 測試：新增 `components/icons/icons.test.tsx`、`app/emojiFree.test.ts` 與各元件的單元測試；E2E `scoreboard.spec.ts` 兩個 test 名稱拿掉 emoji
- 不新增 npm 相依；`components/ui/**`、`public/icon.svg`、`app/globals.css`、`app/layout.tsx` 不變
- 後端無影響
