# Design: remove-emoji

## Context

`main` 的介面有 7 處用 emoji 當圖示或裝飾（navbar logo、結論卡、迷思列、價位星、測驗結果、獲勝對話框、橫向提示），加上品牌產地的國旗。使用者先評估過整站改版（`change/site-editorial-redesign`，改了配色、字型、Hero、動畫），最後決定**只去 emoji、其餘維持原樣**。該分支保留不刪，本 change 從 `main` 重新開始，不合併它。

該分支已經畫好一組自繪 SVG（`components/icons/`），但那組符號依賴改版後才有的 `--ball` token 與 motion 動畫，不能整包搬過來。

## Goals

- 介面上不再出現 emoji 與 ✕✓★ 這類圖示字元；註解與文件等文字敘述允許 emoji
- 每個 emoji 都有語意對等的替代：有意義的圖示依用途改成 lucide 圖示或自繪 SVG，純裝飾的直接拿掉
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

### Decision 2: 圖示來源依用途選擇：通用記號用 lucide，專屬圖形自繪

**Choice**: 叉、勾、星用 `lucide-react` 的 `X`、`Check`、`Star`（星以 `fill-current` 填成實心）；logo、結論三卡、手機轉向自繪於 `components/icons/`。自繪圖形參考 `change/site-editorial-redesign` 分支 `components/icons/*.tsx` 的 SVG 路徑（以 `git show` 讀取），重寫成靜態、只用 `currentColor` 的元件，共用的 `<svg>` 外殼抽成 `IconSvg`。

**Rationale**: 使用者指示「依情況選擇」SVG、套件圖示或 AI 產圖。通用記號在 lucide 已有成熟繪製，專案的按鈕圖示（計分板關閉鈕 `X`、Undo、重置等）本來就用 lucide，換過去風格一致，也少維護三個元件；lucide 沒有球場、兩跳、廚房區、手機轉向這類主題圖形，這些才值得自繪。

**Alternatives considered**:
- 全部自繪：叉勾星自己畫沒有比 lucide 好，只是多維護三個元件（本 change 第一版即如此，依使用者回饋調整）
- 能用 lucide 的都用（結論卡改 `MoveDiagonal`、`Repeat`、`Ban`）：通用圖示表達不出球場規則，語意變弱
- AI 產生的點陣圖（Codex 產圖）：無法跟隨 `currentColor`，在深色結論卡與淺色 navbar 間要準備多份；檔案也比向量圖示重。留待日後做精緻版 logo 或插圖時評估
- `git checkout <branch> -- components/icons`：會一起帶進 motion 動畫與 `--ball`，之後還得逐檔拆掉

### Decision 3: 測驗結果與獲勝對話框改純文字

**Choice**: 直接刪掉 emoji，句子不加符號替代。

**Rationale**: 這兩處 emoji 只是裝飾，句子本身已經完整表達意思；硬補一個獎盃圖反而又回到範本感。

**Alternatives considered**:
- 換成自繪獎盃 SVG：多一個元件卻沒增加資訊

### Decision 4: 守門測試只檢查介面文字，以 TypeScript AST 判定

**Choice**: `app/emojiFree.test.ts` 以 Node `fs` 遞迴讀取 `app/`、`components/`、`data/`、`lib/`、`hooks/` 下非測試的 `.ts`／`.tsx`，用 `typescript` 的 `createSourceFile` 解析後走訪 `StringLiteral`、樣板字串各段與 `JsxText` 節點，對節點文字套用 `/\p{Emoji_Presentation}|\uFE0F|[✕✓★]/u`，命中就列出 `檔案:行號`。註解不是 AST 節點，自然不在檢查範圍。掃描邏輯抽成同檔內的函式，另以原始碼片段直接測它（註解放行、字串攔下）。

**Rationale**: 使用者指示文字敘述（如註解裡的 ⚠️）允許 emoji。`typescript` 已是既有相依，`createSourceFile` 不需要型別檢查、速度快；AST 能正確區分註解、字串與 JSX 文字，不必寫容易出錯的啟發式。

**Alternatives considered**:
- 逐行 regex、連註解一起掃（本 change 第一版）：逼得註解要改寫，違反使用者「文字敘述允許 emoji」的指示
- 逐行 regex、略過 `//` 開頭的行：會漏掉區塊註解與 JSX 註解，也無法處理 `const url = "https://x"; // ⚠️` 這種同一行有字串又有註解的情況
- `ts.createScanner` 逐 token 掃描：單獨的 scanner 不知道 JSX 語境，無法正確切出 `JsxText`

## Risks / Trade-offs

- [Risk] E2E 依文字找元素，拿掉 emoji 後 accessible name 改變 → Mitigation：既有 E2E 都用 `/我方獲勝/`、`hasText: "建議橫向使用"` 這類部分比對，實測不受影響；只有兩個 test 名稱含 emoji，需要改名（scoreboard 主 spec 的驗收錨點同步改）
- [Risk] PriceStars 從字元改成 SVG 後尺寸與間距不同，星列看起來變寬或變窄 → Mitigation：lucide `Star` 以 `size-[1em]` 跟著原本的 `text-[0.8rem]` 縮放；`tracking-[1px]` 對 svg 無效，改以外層 `gap-px` 補回 1px 星距，每顆星的 span 設 `inline-flex` 避免基線下方空隙；apply 時以截圖目視確認
- [Risk] navbar logo 改成 SVG 後，「logo 與導航連結皆不換行」的高度基準改變 → Mitigation：符號以 `size-4` 對齊 `text-sm` 行高，既有 navbar-rwd E2E 會量測高度並擋下

## Migration Plan

純前端呈現變更，無資料遷移。合併到 `main` 並推送後由 Workers Builds 自動部署；回滾就是 revert 合併 commit。

## Open Questions

（無）
