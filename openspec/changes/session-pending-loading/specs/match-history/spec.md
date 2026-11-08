# Specification: match-history

## MODIFIED Requirements

### Requirement: 歷史頁唯讀消費既有紀錄

歷史頁 SHALL 只**讀取**歷史，SHALL NOT 寫入、修改、刪除或回寫任何歷史紀錄，亦 SHALL NOT 觸發評分更新或回合狀態變更。

**本機模式**下讀取來源為 `matchmaker:history:v1`（本 Requirement 以下各段）；**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下讀取來源為 `GET /api/matchmaker/history`（見「登入時歷史以雲端為準」），歷史頁 MUST 只發出該 GET，SHALL NOT 發出任何寫入請求，也 SHALL NOT 讀寫 `matchmaker:history:v1`。

讀取 MUST 透過 M4 的 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）進行，SHALL NOT 自行 `JSON.parse(localStorage.getItem(...))`，也 SHALL NOT 於本 capability 重複寫死 key 字串（key 常數由 `nextjs-pickball/lib/matchmaker/storage-keys.ts` 單一來源匯出）——繞過 reader 會讓損壞資料的逐筆降級規則出現第二套實作，兩套一旦不一致就是資料靜默漏失。

讀取 MUST 在 client 端的 effect 中進行，首次伺服器輸出與讀取完成前 SHALL 為等待中提示（`data-sync-status="pending"` 的容器與「正在載入資料…」，見 `user-data-sync`「資料來源確定前的等待中畫面」），SHALL NOT 為區間篩選或空狀態；SHALL NOT 於 render 期間直接讀 LocalStorage 或取用系統時鐘，否則 SSR 與 CSR 的輸出必然不一致而產生 hydration 錯誤（沿用 `player-roster` 的 HYDRATE 模式）。

LocalStorage 不可用（私密模式）或無資料時，讀取完成後 SHALL 顯示空狀態，SHALL NOT 拋出例外中斷畫面（伺服器端沒有 LocalStorage，輸出依上一段為等待中提示）。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx`（本機）與 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`（雲端）；`nextjs-pickball/app/matchmaker/history/page.tsx` 依儲存模式擇一渲染。

#### Scenario: 瀏覽與切換區間不改動持久化資料

- **GIVEN** `matchmaker:history:v1` 中已有數筆紀錄
- **WHEN** 開啟歷史頁並依序切換五個區間
- **THEN** `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「瀏覽與切換區間後 matchmaker:history:v1 內容不變」

#### Scenario: 紀錄於 hydration 後才出現且無 console error

- **GIVEN** `matchmaker:history:v1` 中已有今日的紀錄
- **WHEN** 開啟 `/matchmaker/history` 並等待載入完成
- **THEN** 紀錄正確顯示
- **AND** 整個載入過程沒有任何 console error（含 hydration mismatch 警告）
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「紀錄於 hydration 後顯示且無 console error」

#### Scenario: 歷史頁唯讀：登入時瀏覽歷史頁只發出 GET 且不寫入本機

- **GIVEN** 以測試帳號登入，雲端已有一筆今日的歷史；本機 `matchmaker:history:v1` 有一份訪客歷史
- **WHEN** 開啟 `/matchmaker/history` 並依序切換五個區間
- **THEN** 對 `/api/matchmaker/*` 的請求全部為 GET；本機 `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時瀏覽歷史頁只發出 GET 且不改動本機歷史」
