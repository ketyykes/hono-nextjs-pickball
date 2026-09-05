> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 1、2）：
> - `unit`：`lib/matchmaker/player-stats.ts`，Vitest + happy-dom，毫秒級、決定性
> - `integration`：`components/matchmaker/PlayerStatsTable.tsx`，Vitest +
>   `@testing-library/react`，測 wiring（欄位是否渲染、色塊與前景色是否正確、
>   已不在名單的文字標示是否出現）
> - `e2e`：Playwright，測真實路由開啟、區間篩選整合、橫向溢出量測與持久化資料不變
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械
> 核對。
>
> 例外層（`nextjs-pickball/app/matchmaker/stats/page.tsx`）沒有單元測試列，其驗收一律落在
> e2e 列上——這是刻意的分層結果，不是漏寫（見 design Decision 1）。

## player-stats

### Requirement: 統計資料的計算範圍與唯讀保證

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 名單成員即使無出場紀錄仍列入統計結果 | 名單成員即使無出場紀錄仍列入統計結果 | `players` 含一位不曾出現在 `history` 的球員 → 回傳結果含該球員，`gamesPlayed === 0` | golden path：這是「聯集」規則最基本的一半，先確保名單不會因為沒打過球而消失 | unit |
| 已離開名單但曾出現於歷史的球員仍列入統計結果 | 已離開名單但曾出現於歷史的球員仍列入統計結果 | 一筆 `history` 紀錄的球員 id 不存在於傳入的 `players` → 回傳結果仍含該球員 | edge case：聯集規則的另一半，也是「已刪除球員的資料是否消失」這個常見資料模型陷阱的唯一防線 | unit |
| 計算過程不修改輸入的歷史與名單 | 計算過程不修改輸入的歷史與名單 | 呼叫前以 `structuredClone` 留底 → 呼叫後 `history`／`players` 深層比對完全相同 | regression guard：`lib/matchmaker/` 全段的一貫約束（M2／M8／M9 皆有同型測試），排序或標記字段時最容易寫成原地操作 | unit |

### Requirement: 出場、勝負與勝率的計算

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 出場數、勝場與敗場依歷史紀錄正確加總 | 出場數、勝場與敗場依歷史紀錄正確加總 | 某球員 3 筆紀錄、2 筆其所屬隊伍為 `winner` → `gamesPlayed=3`、`wins=2`、`losses=1`、`winRate=2/3` | golden path：出場／勝負／勝率是排行榜最基本的三欄，其餘欄位都建立在這條算對的前提上 | unit |
| 出場數為零時勝率為零而非 NaN | 出場數為零時勝率為零 | `gamesPlayed === 0` 的球員 → `winRate === 0`（非 `NaN`） | edge case：0/0 是典型的除以零陷阱，且會靜默污染排序（`NaN` 在多數比較中恆為 false，排序結果不可預期） | unit |

### Requirement: 目前強度與已離開名單球員的標示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 名單內球員的目前強度取自名單目前的 rating | 名單內球員的目前強度取自名單目前的 rating | 球員存在於 `players`，其 `rating` 與其任一歷史 `ratingAfter` 皆不同 → `currentRating` 等於 `players` 的 `rating`、`onRoster=true` | golden path：確保「目前強度」真的是即時值，不是不小心從歷史回推 | unit |
| 已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單 | 已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單 | 球員 id 不在 `players`，出現在兩筆 `playedAt` 不同的歷史紀錄 → `currentRating` 等於**較晚**那筆的 `ratingAfter`、`onRoster=false` | edge case：`prd.md` 第 11 節錯誤處理精神的同型情境（M9 Decision 8 已處理過視覺匯出的對應版本）；「較晚」而非「較早」是最容易寫反的一步 | unit |

### Requirement: 強度淨變化的計算

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 強度淨變化為所有出場紀錄賽前賽後分數差的加總 | 強度淨變化為所有出場紀錄賽前賽後分數差的加總 | 某球員兩筆紀錄的 `ratingAfter-ratingBefore` 分別為 +0.12、-0.05 → `ratingDelta === 0.07` | golden path：淨變化是唯一需要跨多筆紀錄相加的欄位，必須先確認加總方向與正負號正確 | unit |

### Requirement: 最常搭檔與最常對手的計算

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 最常搭檔為雙打隊友中出現次數最多者 | 最常搭檔為雙打隊友中出現次數最多者 | 與甲搭檔 2 次、與乙搭檔 1 次（皆雙打）→ `mostFrequentPartner` 等於甲的姓名 | golden path：「取次數最多者」是本 Requirement 的核心規則 | unit |
| 從未打過雙打時最常搭檔為 null | 從未打過雙打時最常搭檔為 null | 全部歷史皆為單打 → `mostFrequentPartner === null` | edge case：只實作雙打分支時，這裡最容易變成空字串或拋錯而非明確的 `null` | unit |
| 最常對手為對戰過的對手中出現次數最多者 | 最常對手為對戰過的對手中出現次數最多者 | 與丙對戰 2 次、與丁對戰 1 次 → `mostFrequentOpponent` 等於丙的姓名 | golden path：對手計數涵蓋單打與雙打兩種來源，需與搭檔計數分開驗證 | unit |

### Requirement: 排行榜排序規則

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 排行榜依目前強度、勝率、出場數、姓名依序排序 | 排行榜依目前強度、勝率、出場數、姓名依序排序 | 四位球員依序在強度、勝率、出場數三層逐步同分，最終須靠姓名決定順序 → 回傳陣列順序符合四層比較規則 | golden path：排序是排行榜存在的意義，四層比較任一層寫錯或順序顛倒都會直接產生錯誤名次 | unit |

### Requirement: 統計依區間篩選

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 切換區間後排行榜只反映該區間的歷史紀錄 | 切換區間後排行榜只反映該區間的歷史紀錄 | 某球員今日與上月皆有紀錄，切到「上月」→ 該球員的出場數只計入上月那筆 | golden path：驗證區間篩選與統計計算兩個既有／新增模組確實正確串接，任一端接錯都會讓數字對不上 | e2e |

### Requirement: 統計頁的路由與呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 直接開啟 /matchmaker/stats 可載入排行榜表格 | 直接開啟 /matchmaker/stats 顯示排行榜表格 | 已有歷史紀錄時開啟該路由 → 表格標題列同時含名次／球員／強度／出場／勝負／勝率／淨變化／常搭檔／常對手九項欄位名稱 | golden path：路由與掛載沒接上的話，後面每一條 e2e 都不用測 | e2e |
| 球員色塊沿用既有漸層且已不在名單者有文字標示 | 球員色塊沿用既有漸層且已不在名單者有文字標示 | 傳入一位在名單、一位不在名單的 `PlayerStat` → 在名單者背景為其漸層、前景色等於直接呼叫 `pickTextColor` 的回傳值；不在名單者姓名旁出現文字標示 | golden path＋防重複實作：確保色塊沿用既有演算法而非另寫一套亮度判斷 | integration |

### Requirement: 空狀態的呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 完全沒有歷史紀錄時顯示引導型空狀態 | 完全沒有歷史紀錄時顯示引導型空狀態 | `matchmaker:history:v1` 無資料時開啟 `/matchmaker/stats` → 顯示 `EmptyHistory` 的引導文案，不出現表格 | edge case：這是使用者第一次安裝／清空資料後會遇到的狀態，沒有這條會讓使用者看到毫無意義的空表格 | e2e |

### Requirement: 統計頁的可用性、無障礙與唯讀保證

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 排行榜表格於支援寬度下限不造成整頁橫向溢出 | 排行榜表格於支援寬度下限不造成整頁橫向溢出 | viewport 390x844、已有多筆紀錄 → `document.scrollingElement.scrollWidth <= clientWidth + 1` | edge case：九欄表格是本 change 唯一的橫向溢出風險點，且與 `match-stage` 的既有支援寬度下限一致 | e2e |
| 瀏覽統計頁不改動任何持久化資料 | 瀏覽統計頁不改動任何持久化資料 | 三個 key 皆已有資料，開啟頁面並切換五個區間 → 三個 key 的內容與操作前逐字相同 | regression guard：`prd.md` 12.4 的唯讀承諾；任何一處不小心呼叫了 store 的 setter 都會在此現形 | e2e |

## match-stage

### Requirement: 對戰頁路由與 matchmaker 區段動線

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 對戰頁可經 /matchmaker 開啟並顯示場次舞台 | 對戰頁可經路由開啟 | 開啟 `/matchmaker` → 顯示場次舞台、不出現 404 | 既有行為（M5 已實作並持續通過），MODIFIED 隨 Requirement 全文列出供覆蓋比對，本 change 不重寫 | e2e |
| 目前路徑對應的分頁為 active，其餘分頁為非 active | 區段導覽標示目前所在頁 | `/matchmaker`／`/matchmaker/players` 兩路徑呼叫分頁清單函式 → 對應分頁 `active=true`，另一個 `false` | 既有行為（M5 已實作並持續通過），MODIFIED 隨 Requirement 全文列出供覆蓋比對，本 change 不重寫 | unit |
| 區段導覽可在對戰頁與參賽者名單頁之間來回切換 | 兩頁可互相切換 | 依序點擊「參賽者」「對戰」→ 依序導向兩個路徑，皆顯示區段導覽 | 既有行為（M5 已實作並持續通過），MODIFIED 隨 Requirement 全文列出供覆蓋比對，本 change 不重寫 | e2e |
| 可由對戰頁的區段導覽點擊進入統計頁 | 統計分頁納入區段導覽並可點擊進入 | 於對戰頁點擊區段導覽的「統計」→ 導向 `/matchmaker/stats`，該分頁帶 `aria-current="page"` | golden path：本 change 對 `match-stage` 唯一新增的行為，確認第五個分頁真的接上路由而不只是清單多一筆資料 | e2e |
