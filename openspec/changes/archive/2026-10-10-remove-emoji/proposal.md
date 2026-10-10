# Proposal: remove-emoji

## Why

介面上散落的 emoji（🏓🔄🍳🏆💪📖💡、國旗、✕✓★）讓網站看起來像 AI 產生的範本。使用者評估過全站改版（`change/site-editorial-redesign` 分支）後，決定**維持原本的配色、字型與版面**，只把 emoji 換掉。

## What Changes

- 圖示來源依用途選擇：通用記號（叉、勾、星）用既有相依 `lucide-react`；球場與品牌專屬圖形自繪於 `nextjs-pickball/components/icons/`（`LogoMark`、`ServeDiagonalIcon`、`DoubleBounceIcon`、`KitchenZoneIcon`、`RotateToLandscapeIcon`），一律 `currentColor`，不寫死色碼、不用漸層、不帶動畫；本次不用 AI 產生的點陣圖
- SiteNavbar logo：🏓 → `LogoMark`
- Conclusion 三張卡：🏓🔄🍳 → 發球對角線、兩跳、廚房區三個符號
- MythRow：標籤上的 ✕／✓ → lucide `X`／`Check`
- PriceStars：★ 字元 → lucide `Star`（實心填色；實心／空心的顏色維持 `text-amber-400`／`text-foreground/20`）
- ResultScreen 鼓勵文字、GameOverDialog 標題：拿掉 🏆💪📖，改成純文字
- OrientationHint：💡 → `RotateToLandscapeIcon`
- `data/guide/brands.ts` 的 `origin`：拿掉國旗，只留國家與地區名稱
- 文字敘述允許 emoji：程式碼註解（如 `⚠️`、tour 註解的「✕ 犯規」）與 openspec 文件不受限制，維持原文
- 新增守門測試：以 TypeScript AST 掃描 `app/`、`components/`、`data/`、`lib/`、`hooks/` 非測試原始碼中的字串、樣板字串與 JSX 文字，介面文字出現 emoji 就失敗；註解不檢查
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
- 測試：新增 `components/icons/icons.test.tsx`、`app/emojiFree.test.ts` 與各元件的單元測試；E2E `scoreboard.spec.ts` 兩個 test 名稱拿掉 emoji
- 不新增 npm 相依；`components/ui/**`、`public/icon.svg`、`app/globals.css`、`app/layout.tsx` 不變
- 後端無影響
