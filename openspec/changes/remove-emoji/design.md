# Design: remove-emoji

## Context

`main` 的介面有 7 處用 emoji 當圖示或裝飾（navbar logo、結論卡、迷思列、價位星、測驗結果、獲勝對話框、橫向提示），加上品牌產地的國旗。使用者先評估過整站改版（`change/site-editorial-redesign`，改了配色、字型、Hero、動畫），最後決定**只去 emoji、其餘維持原樣**。該分支保留不刪，本 change 從 `main` 重新開始，不合併它。

該分支已經畫好一組自繪 SVG（`components/icons/`），但那組符號依賴改版後才有的 `--ball` token 與 motion 動畫，不能整包搬過來。

## Goals

- 介面與原始碼（含註解）不再出現 emoji 與 ✕✓★ 這類圖示字元
- 每個 emoji 都有語意對等的替代：有意義的圖示改成自繪 SVG，純裝飾的直接拿掉
- 加一條守門測試，之後再出現 emoji 就擋下

## Non-Goals

- 不改配色、字型、圓角、陰影、Hero、動畫、favicon
- 不改 `components/ui/**`，不新增 npm 相依
- 不合併或 cherry-pick `change/site-editorial-redesign` 的其他改動
- 不處理排版符號（`→`、`↔`、`×`、`–`）

## Decisions

### Decision 1: 符號只用 currentColor，靜態不動

**Choice**: 所有符號元件的 `stroke`／`fill` 只用 `currentColor` 或 `none`；顏色由呼叫端的 `text-*` 決定。Conclusion 卡的符號放在 `text-lime-400` 容器內，沿用原本標題的強調色；navbar logo 跟著連結文字色（透明態白、solid 態 `text-slate-900`）。

**Rationale**: 原本的配色寫在各元件的 Tailwind class 裡，符號跟著文字色走就能自動對上，不需要新增 token。

**Alternatives considered**:
- 沿用改版分支的 `var(--ball)` 強調色：`main` 沒有這個 token，加了就等於開始改配色，超出範圍
- 符號接受 `accentColor` prop：只有雙色圖才需要，目前沒有非用不可的雙色圖，屬於提前設計

### Decision 2: 從改版分支借圖形路徑，但重寫元件

**Choice**: 參考 `change/site-editorial-redesign` 分支 `components/icons/*.tsx` 的 SVG 路徑（以 `git show` 讀取），在本分支重寫成靜態、只用 `currentColor` 的元件；共用的 `<svg>` 外殼抽成 `IconSvg`（設好 `aria-hidden`、`focusable`、`viewBox`、`className` 傳遞）。`StarIcon` 為新圖形。

**Rationale**: 圖形本身使用者看過、沒有意見；要拿掉的是動畫和 token 依賴。

**Alternatives considered**:
- `git checkout <branch> -- components/icons`：會一起帶進 motion 動畫與 `--ball`，之後還得逐檔拆掉，反而更亂
- 改用 lucide 圖示（已安裝）：lucide 沒有球場、兩跳、廚房區這類主題圖形，而且通用圖示正是使用者說的「AI 感」來源之一

### Decision 3: 測驗結果與獲勝對話框改純文字

**Choice**: 直接刪掉 emoji，句子不加符號替代。

**Rationale**: 這兩處 emoji 只是裝飾，句子本身已經完整表達意思；硬補一個獎盃圖反而又回到範本感。

**Alternatives considered**:
- 換成自繪獎盃 SVG：多一個元件卻沒增加資訊

### Decision 4: 守門測試掃整個原始碼，註解也算

**Choice**: `app/emojiFree.test.ts` 以 Node `fs` 遞迴讀取 `app/`、`components/`、`data/`、`lib/`、`hooks/` 下非測試的 `.ts`／`.tsx`，逐行比對 `/\p{Emoji_Presentation}|️|[✕✓★]/u`，命中就列出 `檔案:行號`。註解裡的 `⚠️` 改成「注意：」，tour 註解的「✕ 犯規」改成「打叉犯規」。

**Rationale**: 要分辨字串和註解就得做語法解析，為了 10 行註解不值得；改寫後的意思也沒變。

**Alternatives considered**:
- 只掃 JSX 文字與字串常值：需要 TypeScript AST，測試本身會比要守的東西還複雜
- 白名單排除註解行：`//` 判斷會漏掉 JSX 註解與區塊註解，規則不可靠

## Risks / Trade-offs

- [Risk] E2E 依文字找元素，拿掉 emoji 後 accessible name 改變 → Mitigation：既有 E2E 都用 `/我方獲勝/`、`hasText: "建議橫向使用"` 這類部分比對，實測不受影響；只有兩個 test 名稱含 emoji，需要改名（scoreboard 主 spec 的驗收錨點同步改）
- [Risk] PriceStars 從字元改成 SVG 後尺寸與間距不同，星列看起來變寬或變窄 → Mitigation：`StarIcon` 以 `size-[1em]` 跟著原本的 `text-[0.8rem]` 縮放，保留 `tracking-[1px]` 對應的間距；apply 時以 E2E 截圖目視確認
- [Risk] navbar logo 改成 SVG 後，「logo 與導航連結皆不換行」的高度基準改變 → Mitigation：符號以 `size-4` 對齊 `text-sm` 行高，既有 navbar-rwd E2E 會量測高度並擋下

## Migration Plan

純前端呈現變更，無資料遷移。合併到 `main` 並推送後由 Workers Builds 自動部署；回滾就是 revert 合併 commit。

## Open Questions

（無）
