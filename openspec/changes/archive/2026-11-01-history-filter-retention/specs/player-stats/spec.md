# Specification: player-stats

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

**雲端模式的載入中與載入失敗**：名單可用（名單 `syncStatus` 不是 `loading`／`load-failed`）而歷史為 `loading`／`load-failed` 時，`RemoteStatsContent` MUST 保留標題與 `HistoryRangeFilter`，只把排行榜區塊換成 `SyncStatusNotice`。
篩選器在歷史 `loading`、`load-failed`、`synced` 之間轉換時 MUST 是同一個持續掛載的元素，SHALL NOT 卸載重建；焦點已在某個區間選項上時（例如以鍵盤選取區間），焦點 MUST 留在該選項上；歷史載入失敗後改選其他區間 MUST 以新區間重新載入（`match-history`「登入時歷史以雲端為準」）。
名單為 `loading`／`load-failed` 時 MUST 維持以提示取代整段內容（不顯示標題、篩選器與排行榜），且名單狀態優先於歷史狀態——切換區間無法恢復名單，保留篩選器沒有意義。
根元素帶 `data-sync-status`：名單阻斷時為名單狀態，否則為歷史狀態。**僅在**歷史為 `synced`（或其他非阻斷狀態）且 `total === 0` 時，依「空狀態的呈現」顯示引導型空狀態、不顯示篩選器；歷史 `loading`／`load-failed` 時 `useRemoteHistory` 回傳的 `total` 恆為 0（載入中的結果已清空），此時 MUST 仍顯示篩選器。

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


#### Scenario: 統計區間：歷史載入中與載入失敗時保留標題與區間篩選

- **GIVEN** 名單為 `synced` 且有一位球員；`useRemoteHistory` 回報 `syncStatus` 為 `loading`（另一次為 `load-failed`），回傳值與真實 hook 同形（`items: []`、`total: 0`、`droppedCount: 0`）
- **WHEN** 渲染 `RemoteStatsContent`
- **THEN** 標題「球員統計」與「歷史區間」radiogroup 皆存在且「今日」為選中；`role="status"` 的文字為該狀態的固定文案；根元素的 `data-sync-status` 為該狀態；不顯示排行榜表格與引導型空狀態
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`，it 名稱「歷史載入中與載入失敗時保留標題與區間篩選並只以提示取代排行榜」

#### Scenario: 統計區間：名單載入中或載入失敗時仍以提示取代整段內容

- **GIVEN** 名單 `syncStatus` 為 `loading`（另一次為 `load-failed`），歷史為 `synced`、`total: 5`
- **WHEN** 渲染 `RemoteStatsContent`
- **THEN** `role="status"` 的文字為名單狀態的固定文案；根元素的 `data-sync-status` 為名單狀態；不顯示排行榜表格與區間篩選
- **AND** 登入後雲端名單 `GET` 回 500 時，統計頁顯示失敗提示，不顯示標題與排行榜
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`，it 名稱「名單 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status」；`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容」

#### Scenario: 統計區間：切換區間時焦點留在篩選器

- **GIVEN** 名單為 `synced`，「今日」的歷史已載入（`synced`、`total: 5`）
- **WHEN** 焦點移到「本週」選項並按 Enter，歷史先回報 `loading`（`items: []`、`total: 0`）、之後回報 `synced`（`total: 5`）；接著焦點移到「本月」並按 Enter，歷史回報 `load-failed`（`items: []`、`total: 0`）
- **THEN** 「本週」在 `loading` 與 `synced` 兩個階段都是 `document.activeElement`，且與按鍵前取得的是同一個 DOM 節點；「本月」在 `load-failed` 時同樣是 `document.activeElement` 且為同一個節點
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`，it 名稱「以鍵盤切換區間時焦點在歷史載入中、載入完成與載入失敗後都留在被選取的區間選項」

#### Scenario: 統計區間：歷史載入失敗後改選其他區間可重新載入

- **GIVEN** 名單為 `synced` 且有一位球員；「今日」的歷史載入失敗（`load-failed`、`total: 0`）
- **WHEN** 選取「本週」，歷史對 `thisWeek` 回報 `synced`、`total: 5`、`items` 含該球員的一場紀錄
- **THEN** `useRemoteHistory` 最後一次收到的 `range` 為 `thisWeek`；排行榜表格出現且該球員出場數為 1；不再有失敗提示，篩選器仍在且「本週」為選中
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`，it 名稱「歷史載入失敗後改選其他區間會以新區間重新載入並顯示排行榜」

#### Scenario: 統計區間：登入時歷史載入失敗後切換區間重新載入成功且焦點不遺失

- **GIVEN** 以測試帳號登入、雲端名單兩位且已有一筆今日完成的對戰；以 `page.route` 攔截 `GET /api/matchmaker/history*`：測試放行前，「今日」區間的請求（只帶 `from`）回 500、「本週」區間的請求暫不回應；放行後所有請求照常轉給後端（依區間而非請求次數判定，因 dev 模式的 StrictMode 會在 mount 時送出兩次請求）
- **WHEN** 開啟 `/matchmaker/stats`，出現失敗提示後以鍵盤選取「本週」，確認載入中後放行，再以鍵盤選取「今日」
- **THEN** 失敗時標題與區間篩選可見且「今日」為選中；「本週」在 `data-sync-status="loading"` 與 `synced` 時皆為焦點所在；最後「今日」的排行榜兩位球員出場數皆為 1，焦點在「今日」選項
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時統計頁歷史載入失敗後切換區間重新載入成功且焦點留在篩選器」

---
