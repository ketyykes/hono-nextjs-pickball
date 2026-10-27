## MODIFIED Requirements

### Requirement: 統計依區間篩選

統計頁 SHALL 提供與歷史頁相同的五個區間篩選（今日、本週、本月、上月、更早），實作沿用
`packages/pickball-core/src/matchmaker/history-range.ts` 的 `filterHistoryByRange` 與
`nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx`，SHALL NOT 另寫一套區間邏輯。
切換區間時，排行榜 MUST 只反映該區間內的歷史紀錄——出場數、勝負、勝率、強度淨變化、最常
搭檔與最常對手皆須重新以篩選後的歷史紀錄計算；目前強度不受區間篩選影響（見「目前強度與
已離開名單球員的標示」）。初次開啟 MUST 預設選中**今日**，與歷史頁一致（`prd.md` 13.4）。

**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下，篩選後的歷史 MUST 取自 `useRemoteHistory({ range })`（後端依 `rangeBounds` 的界線篩選，見 `match-history`「登入時歷史以雲端為準」），
名單取自 `useRosterStore`（雲端名單），統計 MUST 以同一個 `computePlayerStats` 計算——SHALL NOT 另寫一套區間或統計邏輯；平局計為和局（`2026-09-14-matchmaker-draw-followups`）在雲端模式同樣成立。
實作位於 `nextjs-pickball/components/matchmaker/RemoteStatsContent.tsx`，`nextjs-pickball/app/matchmaker/stats/page.tsx` 依儲存模式擇一渲染本機或雲端內容。

#### Scenario: 切換區間後排行榜只反映該區間的歷史紀錄

- **GIVEN** `matchmaker:history:v1` 中今日與上月皆有某球員的歷史紀錄
- **WHEN** 開啟 `/matchmaker/stats` 後切換到「上月」
- **THEN** 該球員的出場數只計入上月的紀錄，不含今日的紀錄
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「切換區間後排行榜只反映該區間的歷史紀錄」

#### Scenario: 統計區間：登入時計時回合的平局在統計頁計為和局

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有兩位，已產生一輪設定計時的單打並開始計時
- **WHEN** 送出 `9` 比 `9`、開啟 `/matchmaker/stats`
- **THEN** 兩位球員的勝負和欄皆依序為 `0`、`0`、`1`，出場數皆為 1
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時計時回合的平局在統計頁計為和局」

---

### Requirement: 空狀態的呈現

`matchmaker:history:v1` 完全沒有任何紀錄時，統計頁 SHALL 顯示
`nextjs-pickball/components/matchmaker/EmptyHistory.tsx` 的引導型空狀態（`range={null}`），
SHALL NOT 顯示只有標題列的空表格——排行榜在完全沒有資料時沒有任何可排序的意義。

雲端模式下「完全沒有任何紀錄」MUST 以 `GET /api/matchmaker/history` 回應的 `total === 0` 判定（而非篩選後的 `items` 為空）——否則使用者在「上月」沒有紀錄時會被誤導成「從未打過」。

#### Scenario: 完全沒有歷史紀錄時顯示引導型空狀態

- **GIVEN** `matchmaker:history:v1` 沒有任何紀錄
- **WHEN** 開啟 `/matchmaker/stats`
- **THEN** 畫面顯示引導型空狀態，不顯示排行榜表格
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「完全沒有歷史紀錄時顯示引導型空狀態」

#### Scenario: 統計空狀態：雲端 total 為 0 時統計頁顯示引導型空狀態

- **GIVEN** 雲端模式，`useRemoteHistory` 回 `{ items: [], total: 0, syncStatus: "synced" }`
- **WHEN** 渲染 `RemoteStatsContent`
- **THEN** 顯示引導型空狀態、不顯示排行榜表格
- **AND** `total` 為 5 而 `items` 為空時，顯示排行榜表格（名單成員皆為出場 0）
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`，it 名稱「雲端 total 為 0 時顯示引導型空狀態，否則顯示排行榜」

---

### Requirement: 統計頁的可用性、無障礙與唯讀保證

排行榜表格 MUST 於支援寬度下限 **390px**（與 `site-navbar`／`match-stage` 一致）不造成整頁
橫向溢出（`document.scrollingElement` 的 `scrollWidth <= clientWidth + 1`）；表格本身可於
自身容器內橫向捲動。

色彩 SHALL NOT 作為唯一資訊來源：已不在名單的標示、勝負與排名皆 MUST 有文字或數字表達，
不得只靠色塊或樣式區分（`prd.md` 12.5）。區間篩選控制項 MUST 可由鍵盤操作且具備可存取名稱
（沿用 `HistoryRangeFilter` 既有的 `role="radiogroup"` 實作）。

統計頁 SHALL NOT 呼叫任何 store 的 setter，SHALL NOT 改變回合、名單或歷史等 LocalStorage
資料的**內容**。本機模式 SHALL NOT 發出任何網路請求；雲端模式 MUST 只發出讀取請求（`GET /api/matchmaker/players`
與 `GET /api/matchmaker/history`），SHALL NOT 發出任何寫入請求，雲端內容元件 SHALL NOT 掛載 `useRoundStore`（統計不需要回合）。

上述唯讀保證的界線：統計頁比照 `/matchmaker` 對戰頁直接持有 `useRosterStore`／
`useRoundStore`，兩個 hook 的 write effect 會在 hydrate 後把三個 LocalStorage key 各自
**重新序列化寫回**（既有 hydration 行為，非統計頁引入）。這種等值的重新序列化 SHALL NOT
被視為「修改」——寫回的是同一份資料經目前 schema 序列化後的形狀，對應用程式自己寫出的
資料而言逐位元組相同。此界線僅涵蓋等值重新序列化，SHALL NOT 據以放寬前段：任何會改變
資料語意內容的寫入仍在禁止之列。

#### Scenario: 排行榜表格於支援寬度下限不造成整頁橫向溢出

- **GIVEN** viewport 為 390x844、已有多筆歷史紀錄
- **WHEN** 開啟 `/matchmaker/stats`
- **THEN** `document.scrollingElement` 的 `scrollWidth` 不大於 `clientWidth + 1`
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「排行榜表格於支援寬度下限不造成整頁橫向溢出」

#### Scenario: 瀏覽統計頁不改動任何持久化資料

- **GIVEN** `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1` 皆已有資料
- **WHEN** 開啟 `/matchmaker/stats` 並依序切換五個區間
- **THEN** 三個 key 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`，test 名稱「瀏覽統計頁不改動任何持久化資料」

#### Scenario: 統計頁唯讀：登入時瀏覽統計頁只發出讀取請求

- **GIVEN** 以測試帳號登入，雲端已有歷史
- **WHEN** 開啟 `/matchmaker/stats` 並依序切換五個區間
- **THEN** 對 `/api/*` 的請求方法皆為 GET；`/api/matchmaker/*` 的請求路徑只有 `/api/matchmaker/players` 與 `/api/matchmaker/history`（不含回合與分槽）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時瀏覽統計頁只發出名單與歷史的讀取請求」
