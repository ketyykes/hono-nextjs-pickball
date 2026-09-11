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

---

## 補登：apply 階段新增的非錨點測試（2026-09-06，tasks §9.12）

> 下列測試**不對應任何 delta spec 的「驗收」錨點**，是 apply 過程中為了殺掉 mutation 存活缺口
> 而補上的。每一條都對應 spec prose 的某條 MUST 子句或某個 design Decision，
> 經各群組的 Stage 1／Stage 2 判定為**正當補強而非測試膨脹**。在此補登，避免日後稽核
> 誤判為未經規劃的測試。
>
> `/opsx:verify` 的錨點核對是**單向**的（每個驗收錨點都要找得到同名測試），
> 多出來的測試不會造成核對失敗。

### `nextjs-pickball/lib/matchmaker/player-stats.test.ts`（unit）

| Test name | 補的是什麼缺口 | 對應的 spec／design 條文 | 由誰補 |
|-----------|----------------|--------------------------|--------|
| 單打紀錄即使隊伍帶兩名球員也不計入最常搭檔（僅雙打計數） | 移除「只計雙打」判斷後仍全綠——既有 fixture 的單打隊伍固定只有 1 人，「排除自己」的判斷已足以讓單打自然不產生配對，遮蔽了這條判斷 | spec「最常搭檔 MUST 由該球員所有**雙打**歷史紀錄中的隊友逐筆計數」 | §4 Implementer |
| 最常搭檔次數平手時取姓名 UTF-16 code unit 較前者 | 反轉同分 tie-break 方向仍全綠——既有搭檔／對手測試皆無次數平手情境 | design Decision 5 | §4 Implementer |
| 最常搭檔的顯示姓名取該對象 playedAt 最近一次的姓名快照 | **design Decision 4 的 MUST 原本零覆蓋**——§3 的測試只涵蓋 `ratingAfter`，改成取最早姓名仍全綠 | design Decision 4 | §4 Stage 2 |

### `nextjs-pickball/components/matchmaker/PlayerStatsTable.test.tsx`（integration）

| Test name | 補的是什麼缺口 | 對應的 spec／design 條文 | 由誰補 |
|-----------|----------------|--------------------------|--------|
| 表格標題列依序顯示九個欄位名稱 | 九個欄位標題各自刪除的變異需有斷言守住 | spec「排行榜表格 MUST 依序顯示下列欄位…」＋ design Decision 6（零 dead data） | §5 Implementer |
| 名次為傳入陣列的索引加一，不重新排序也不使用索引本身 | 名次改成索引本身或倒序的變異 | tasks 5.3；§4→§5 交棒事項 2（元件不重新排序） | §5 Implementer |
| 各欄位如實顯示球員統計資料 | 九個 `TableCell` 資料來源互換的變異 | spec 的九欄對應正確性 | §5 Implementer |
| 強度淨變化為負值時顯示負號，不強制補上正號 | 呈現層顯示決策無護欄 | design Decision 2（文案與呈現決策留給消費端） | §5 Implementer |
| 最常搭檔與最常對手為 null 時顯示佔位符號而非空字串 | `?? 佔位符號` 改成 `?? ""` 的變異 | design Decision 2（`null` → 呈現層決定顯示什麼字） | §5 Implementer |
| 球員欄的色塊內容為姓名本身 | **球員欄原本從未斷言「顯示的是姓名」**——色塊內容換成 `stat.id` 竟全綠 | spec「球員（色塊＋姓名）」 | §5 Stage 2 |
| 強度淨變化為零時不補正號 | `delta > 0` 放寬為 `>=` 的變異；該邊界是元件內具名寫下的顯示決策卻無測試護欄 | design Decision 2 | §5 Stage 2 |
| 勝率以四捨五入取整數百分比呈現 | `Math.round` 換成 `floor`／`ceil` 的變異 | 同上 | §5 Stage 2 |
| 表格具備可存取名稱 | `<Table>` 原本沒有可存取名稱，螢幕閱讀器的表格清單只會讀到「表格」 | spec「色彩 SHALL NOT 作為唯一資訊來源」的無障礙延伸 | §5 Stage 2 |

### `nextjs-pickball/lib/matchmaker/section-nav.test.ts`（unit）

| Test name | 補的是什麼缺口 | 對應的 spec／design 條文 | 由誰補 |
|-----------|----------------|--------------------------|--------|
| 統計頁路徑下只有統計分頁為 active | task 指定的兩條路徑（`/matchmaker`、`/matchmaker/players`）**沒有任何斷言是站在 `/matchmaker/stats` 這一側觀察的**，而「把 `===` 改成 `startsWith` 會讓對戰分頁在每個子頁一起亮起」是本 milestone 唯一的新風險點 | `match-stage` spec「SHALL NOT 另立第二套判定邏輯」 | §7 Implementer |
| 分頁清單依序為對戰、參賽者、歷史、資料與統計五筆 | **這一條不是新增的**——它是 M5 既有的 regression guard，由 §7.1 依 tasks §9.8 的白名單更名並把預期陣列由四筆擴為五筆。列在此處只是說明它同樣沒有對應錨點 | `match-stage` spec「`MATCHMAKER_SECTION_HREFS`／`MATCHMAKER_SECTION_LABELS` 各新增一筆」 | §7 Implementer（更名既有測試） |

### `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`（e2e）

| Test name | 補的是什麼缺口 | 對應的 spec／design 條文 | 由誰補 |
|-----------|----------------|--------------------------|--------|
| 名單內球員取名單姓名與目前強度，已離開名單者標示且取歷史最後一筆 | 把 `computePlayerStats` 第二引數換成空陣列會全綠——這條**接線**只有 E2E 能驗（unit test 只測函式本身，不測 `page.tsx` 有沒有呼叫它、傳了什麼） | design Decision 1 的 store 接線 | §6 Implementer |
| 統計頁載入後無 console error | `page.tsx` 在 render 期間呼叫 `new Date()`，此 test 是「不會造成 hydration mismatch」這個推論的實證 | design Decision 1 的代價（本頁非 server component） | §6 Implementer |
| 切換到沒有紀錄的區間時不顯示引導型空狀態 | 空狀態判定誤用 `filteredHistory.length === 0` 竟全綠——該退化會讓空區間**謊稱使用者從未打過**，且**連區間篩選器一起消失**（使用者切不回去） | spec「空狀態的呈現」：`matchmaker:history:v1` **完全沒有任何紀錄**時才顯示引導型空狀態 | §6 Stage 2 |
