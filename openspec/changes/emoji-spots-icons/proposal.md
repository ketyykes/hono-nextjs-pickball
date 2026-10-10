# Proposal: emoji-spots-icons

## Why

`remove-emoji` 把測驗結果與獲勝對話框的 emoji 直接刪掉、留下純文字，品牌產地的國旗也拿掉了。使用者看過後指示：原本是 emoji 的地方要**換成圖示**（SVG、套件圖示或生圖），不要只留純文字；國旗則可以繼續用 emoji。

## What Changes

- 測驗結果（`ResultScreen`）三句鼓勵文字，句尾原本 emoji 的位置改放 lucide 圖示：高分 `Trophy`、中等 `BicepsFlexed`、低分 `BookOpen`
- 獲勝對話框（`GameOverDialog`）標題前加 lucide `Trophy`
- 品牌產地（`data/guide/brands.ts`）還原為國旗 emoji 開頭的原文
- 守門測試新增國旗例外：成對的區域指示符號（國旗）允許，落單的仍攔下
- 配色、字型、版面、其他已換成圖示的五處都不動；不新增 npm 相依

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `emoji-free-ui`：「介面文字不含 emoji」改為「國旗除外」；「emoji 所在位置改以符號或純文字呈現」改為「改以圖示呈現」（皆以 REMOVED＋ADDED 表達，因 Scenario 名稱需要更動）

## Impact

- 元件：`components/quiz/ResultScreen.tsx`、`components/scoreboard/GameOverDialog.tsx`
- 資料：`data/guide/brands.ts`
- 測試：`app/emojiFree.test.ts`、`components/quiz/ResultScreen.test.tsx`、`components/scoreboard/GameOverDialog.test.tsx`
- 前提：以 `change/remove-emoji`（已 archive、尚未併入 `main`）為基底
