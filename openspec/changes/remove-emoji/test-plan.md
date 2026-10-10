# Test Plan: remove-emoji

## emoji-free-ui

### Requirement: 原始碼不含 emoji

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `app、components、data、lib、hooks 的原始碼不含 emoji 或 emoji 類符號` | 原始碼掃描無 emoji | 掃描五個目錄的非測試 `.ts`／`.tsx` → 命中清單為 `[]`（目前會列出約 30 行，真紅燈） | golden path；是整個 change 的完成判準，先寫出來當進度表 | unit |
| `品牌產地不含國旗且以國家或地區名稱開頭` | 品牌產地以純文字呈現 | `brands` 每筆 `origin` → 不含 U+1F1E6–U+1F1FF，且符合 `/^(美國\|德國\|奧地利\|台灣)/`（目前以國旗開頭，真紅燈） | 資料層替換的直接驗收 | unit |

### Requirement: 自繪符號元件集中於 components/icons

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `每個符號元件預設渲染對輔助科技隱藏的單一 svg` | 每個符號元件預設對輔助科技隱藏 | 渲染 8 個元件 → 各自 `querySelectorAll("svg").length === 1`，且 `aria-hidden="true"`、`focusable="false"`（模組尚不存在，真紅燈） | golden path；後續所有替換都依賴這組元件 | unit |
| `符號元件只使用 currentColor 且不含漸層` | 符號元件只用 currentColor 且不含漸層 | 每個元件 outerHTML → 不含 `#[0-9a-f]{3,8}`、`rgb(`、`Gradient`；所有 `stroke`／`fill` 屬性值 ∈ {`currentColor`, `none`} | 保證不會偷改配色 | unit |
| `className 會傳遞到 svg 根元素` | className 傳遞到 svg 根元素 | `className="size-6"` → `svg.classList.contains("size-6")` | 呼叫端靠 className 控制尺寸 | unit |

### Requirement: emoji 所在位置改以符號或純文字呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `logo 以 LogoMark 符號呈現而非 emoji` | navbar logo 以 LogoMark 呈現 | 渲染 `SiteNavbar` → logo 連結（`href="/"` 且非 nav 內連結）含 1 個 `svg`，`textContent` 不含 🏓，含「匹克球指南」 | 全站每頁都看得到的位置 | unit |
| `三張結論卡各以一個自繪符號取代 emoji` | 結論三張卡各有一個符號 | 渲染 `Conclusion` → 依三個標題找到卡片，每張 `svg` 數 === 1，`textContent` 不含 🏓🔄🍳 | golden path | unit |
| `迷思與正確規則標籤以符號取代叉勾字元` | 迷思列標籤以符號表示叉與勾 | 渲染 `MythRow` → 「常見迷思」「正確規則」標籤元素各含 1 個 `svg`；整體 `textContent` 不含 ✕✓ | golden path | unit |
| `每顆星以 svg 符號呈現而非 ★ 字元` | 價位星以 svg 呈現 | `stars={4}` → 10 個 `[data-star]` 各含 1 個 `svg`；`textContent` 不含 ★ | 既有 4 條 PriceStars 測試照舊作為 regression guard，這條是新行為 | unit |
| `三個分數區間的鼓勵文字皆為純文字` | 測驗結果鼓勵文字不含 emoji | `correctCount` 9／6／2、`total` 10 → 分別出現三句完整句子（不含 emoji 的精確文字比對） | 文案變更的直接驗收 | unit |
| `獲勝標題為純文字不含獎盃 emoji` | 比賽結束對話框標題為純文字 | `finished` + 勝方 us → `getByRole("heading")` 或 dialog title 文字 === 「我方獲勝」 | 文案變更的直接驗收 | unit |
| `提示橫幅以轉向符號取代燈泡 emoji` | 橫向提示以符號取代燈泡 | `visible` → `role="status"` 內含文字「建議橫向使用，體驗更好」、不含 💡，且關閉按鈕以外有 1 個 `aria-hidden` 的 `svg` | golden path | unit |

## site-navbar

### Requirement: 窄螢幕導航呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `窄螢幕下 logo 與導航連結皆不換行` | 窄螢幕下 logo 與導航連結皆不換行 | 390px 與 1280px 的 logo 高度差 ≤ 4px（既有測試，regression guard：logo 改 SVG 後仍需通過） | regression guard | e2e |
| `寬螢幕顯示 logo 文字，窄螢幕收合只留圖示` | logo 文字依斷點收合 | 既有測試照舊（regression guard） | regression guard | e2e |
| `小於 375px 時隱藏 logo、375px 起恢復` | 小於 375px 時隱藏 logo、375px 起恢復 | 既有測試照舊（regression guard） | regression guard | e2e |
| `窄螢幕下四個導航連結全部可見`、`窄螢幕下對戰分配連結亦全部可見`、`窄螢幕下導航列內容不橫向溢出`、`320px 下五個導航連結完整落在視口內` | 其餘四個 Scenario | 既有測試照舊（regression guard） | regression guard | e2e |

## scoreboard

### Requirement: RWD 排版

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| `直式 viewport 顯示「建議橫向使用」提示橫幅` | 直式排版（portrait） | 既有測試改名（去掉 💡），斷言不變（regression guard） | 驗收錨點與主 spec 同步 | e2e |
| `橫式 viewport 兩隊面板左右並排`、`直式提示橫幅可關閉並記入 sessionStorage` 及其餘 RWD 測試 | 其餘 Scenario | 既有測試照舊（regression guard） | regression guard | e2e |

> 另：`scoreboard.spec.ts` 的「我方連贏 11 球觸發 GameOverDialog 顯示「🏆 我方獲勝」與「11 – 0」」改名為去掉 🏆 的版本，斷言（`/我方獲勝/` 部分比對）不變。此 test 不是任何 Scenario 的驗收錨點，只為讓測試名稱與畫面一致。

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form (avoid `test_1`, `it_works`)
