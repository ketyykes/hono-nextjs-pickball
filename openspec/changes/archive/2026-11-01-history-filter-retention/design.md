# Design: history-filter-retention

## Context

- 登入時歷史頁：`app/matchmaker/history/page.tsx`（server component）→ `HistoryModeSwitch` → remote 時 `RemoteHistoryView`、其餘 `HistoryView`（本機）。
  統計頁：`app/matchmaker/stats/page.tsx` → remote 時 `RemoteStatsContent`、其餘 `LocalStatsContent`。兩個雲端元件都經 `useRemoteHistory({ enabled, userId, range, onUnauthorized })` 讀歷史。
- `useRemoteHistory` 每次 `range` 改變都 `dispatch({ type: "begin" })`，把結果清空並回到 `loading`（刻意：不讓前一區間的資料在載入中殘留）。失敗為 `load-failed`，`total`／`items` 維持 `begin` 後的空值。
- 目前兩個雲端元件在阻斷狀態時都 **early return** 一個只含 `SyncStatusNotice` 的 `<div>`，與 `synced` 時的 return 是不同的樹：
  `RemoteHistoryView` 的 `synced` 樹是 `[損毀提示?, HistoryRangeFilter, 內容]`；阻斷樹是 `[SyncStatusNotice]`。
  依 React「同一位置、同一型別才保留」的規則，篩選器在 `synced → loading` 時被卸載，焦點所在的 `<button>` 從 DOM 移除，瀏覽器把焦點交回 `body`。
- `RemoteStatsContent` 另以 `pickDisplayStatus(rosterStatus, historyStatus)` 決定提示：名單阻斷優先；`synced` 時 `total === 0` 只顯示引導型空狀態（不含篩選器），否則顯示篩選器＋排行榜；標題只在非阻斷時顯示。
- 前一個 change（`2026-10-28-matchmaker-history-stats-backend`）照主 spec 字面實作並把問題列為 Open Questions 9（焦點）與 13（空區間 400 時篩選器消失、無法切回）；coordinator 裁定另開本 change。
- 本機路徑：`HistoryView` 自己同步讀 `readHistory()`，沒有 `loading` 階段；`LocalStatsContent` 只在本機模式渲染，名單 `syncStatus` 恆為 `local`，其阻斷分支在實務上走不到。兩者都沒有這個問題，本 change 不碰。

## Goals

- 雲端歷史頁：載入中、載入失敗時篩選器保留且焦點不遺失；失敗後可改選其他區間重新載入。
- 雲端統計頁：歷史阻斷時同上（並保留標題）；名單阻斷時維持現狀。
- 訪客路徑、hook、共用元件、後端、核心套件零變更。

## Non-Goals

- 重試按鈕、點選目前已選取的區間重新載入、`load-failed` 文案改寫（見 Open Questions）。
- 換區間時保留上一區間的資料（stale-while-revalidate）——hook 的 `begin` 清空是刻意設計，不在本 change 改。
- 名單阻斷時保留統計頁篩選器。
- 本機頁、對戰頁、參賽者頁、計分板的載入畫面。

## Decisions

### Decision 1：篩選器以「同一位置持續掛載」保留，不另寫焦點還原

**Choice**：兩個雲端元件改為**單一 return**（統計頁的名單阻斷分支除外，見 Decision 3），篩選器固定在根元素子節點的同一個位置；只有它後面的「內容槽」依狀態換成 `SyncStatusNotice`、紀錄／排行榜或空狀態。
條件式子節點一律寫成 `{條件 && <X />}` 或三元運算放在同一個槽位，使篩選器前面的兄弟節點數目在各狀態下一致——例如歷史頁的損毀提示槽位在阻斷時寫成 `false`（`{!isBlocking && droppedCount > 0 && <Alert/>}`），**不得**因阻斷而移除該槽位或改走另一個 return。
`HistoryRangeFilter` 內部以 `key={range}` 渲染五個選項，型別與 key 不變，因此同一個 `<button>` DOM 節點在 `synced → loading → synced／load-failed` 全程存在，焦點自然留在原處。

**Rationale**：
- Context7 `/reactjs/react.dev`（learn/preserving-and-resetting-state）：「同一個元件在 UI 樹的同一位置會保留狀態」，即使分屬不同 `if` return 也一樣；「在同一位置換成不同型別的元素會移除該元件並銷毀其狀態」。
  目前的阻斷分支在篩選器的位置放的是 `SyncStatusNotice`（不同型別），正是後者。
- 焦點留在原節點是瀏覽器的預設行為，不需 `ref.focus()`。程式化還原焦點會在 `useEffect` 之後才發生，期間螢幕閱讀器已播報焦點移到 `body`，且要多記一份「上一個焦點在哪」的狀態。
- `SyncStatusNotice` 是 `role="status"`（live region），插入後螢幕閱讀器會播報「正在載入雲端資料…」／失敗文案，焦點不必移動。

**Alternatives considered**：
- 阻斷時另外渲染一份篩選器、再以 `useEffect` 把焦點移回：焦點仍會先掉到 `body`（重掛載），且多一份狀態與副作用。不選。
- 換區間時不回到 `loading`、保留上一區間資料直到新資料到達（stale-while-revalidate）：要改 hook 的 `begin` 與擁有者標記語意，且會讓使用者在「本月」標籤下看到「今日」的紀錄。不選。
- 把篩選器移到 `HistoryModeSwitch`／統計頁入口，由父層持有 `range`：要改 `HistoryView`／`LocalStatsContent`（訪客路徑）與 page 層。不選。

### Decision 2：失敗後的「重試」就是改選其他區間，hook 不改

**Choice**：`load-failed` 時篩選器可操作；改選其他區間由既有 effect（依賴含 `range`）發出新請求，成功即顯示。不新增重試按鈕或 reload token。
使用者若要重試「同一個」區間，可先選別的區間再選回來，或依文案重新整理頁面。

**Rationale**：問題陳述是「篩選器消失、無法切回其他區間重試」；保留篩選器即解決。重試同一區間需要在 hook 加 `reload()` 或在元件加 reload token，屬範圍擴張，列為 Open Question。

**Alternatives considered**：
- 點選已選取的區間也觸發重新載入：`setSelectedRange(same)` 不會重新 render，需另加計數器並改 hook 依賴；行為與本機頁（點選已選取區間無反應）不一致。不選。
- 在失敗提示旁加「重試」按鈕：需新文案、新 hook API，且要決定與 `SyncStatusNotice` 固定文案「請重新整理頁面」的關係。不選（Open Questions 1）。

### Decision 3：統計頁只在「歷史」阻斷時保留標題與篩選器，名單阻斷維持整段取代

**Choice**：`RemoteStatsContent` 分三種畫面：
1. 名單 `loading`／`load-failed` → 維持現有 early return（只有 `SyncStatusNotice`，`data-sync-status` 為名單狀態）。
2. 名單可用、歷史 `loading`／`load-failed` → 標題＋篩選器＋`SyncStatusNotice`（`data-sync-status` 為歷史狀態）。
3. 兩者可用 → 標題＋（`total === 0` ? 引導型空狀態 : 篩選器＋排行榜），與現狀相同。
第 2、3 種共用同一個 return，篩選器位置相同；第 3 種在 `total === 0` 時篩選器槽位為 `false`。

**Rationale**：
- 名單失敗時切換區間不會重新載入名單，保留篩選器只會讓使用者以為能自救；且既有 `roster-sync.spec.ts`「雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容」斷言標題不存在、與對戰頁行為一致。
- 統計頁不寫入名單，因此不會觸發 `useRemoteRosterStore` 的 409 整份重載；名單進入 `loading` 的時機是該 hook 主 effect 重跑（mount、換帳號，見 `hooks/useRemoteRosterStore.ts` effect 開頭重設為 loading 的 reducer），與換區間無關，不影響換區間的焦點。
- 歷史阻斷時顯示標題：篩選器若單獨出現在頁首、沒有標題，版面會與 `synced` 時跳動；標題是靜態文字，不構成「誤導性的資料」。
  前一個 change 的程式註解「標題只在有可信資料時顯示」在本 change 改為「名單不可信時不顯示」。

**Alternatives considered**：
- 任一阻斷都保留標題與篩選器（統一規則）：要改 `roster-sync.spec.ts` 的既有斷言與兩個名單阻斷 it，且名單失敗時篩選器無作用。不選（Open Questions 2）。
- 歷史阻斷時只保留篩選器、不顯示標題：版面跳動，且篩選器失去上下文。不選。

### Decision 4：`total === 0` 的既有規則與初次載入的過渡不另處理

**Choice**：歷史頁篩選器恆在（現狀即如此，`total === 0` 也顯示）；統計頁在 `synced` 且 `total === 0` 時不顯示篩選器（主 spec「空狀態的呈現」與既有 regression guard「total 為 0 時不顯示區間篩選」）。
因此雲端完全沒有紀錄的使用者開統計頁時，會看到「標題＋篩選器＋載入中」→「標題＋引導型空狀態」，篩選器出現一瞬後消失。

**實作約束**：`useRemoteHistory` 的 `begin` 與 `LOADING_RESULT` 都把 `total` 清為 0，載入失敗也維持 0——篩選器槽位的條件 MUST 含「歷史非阻斷」（例：`isHistoryBlocking || total > 0`），SHALL NOT 只寫 `total !== 0`，否則載入中與失敗時篩選器會被藏起來、焦點照樣遺失。測試的阻斷狀態 mock 一律用與真實 hook 同形的 `items: []`、`total: 0`。

**Rationale**：載入中無從得知「是否完全沒有紀錄」；要避免這一瞬就得在元件記住上一次的 `total`，屬額外狀態。這只發生在初次載入、且不影響焦點（使用者尚未操作）。列為 Risk。

**Alternatives considered**：載入中依「上一次 `synced` 的 `total`」決定是否顯示篩選器：多一份狀態且初次載入時仍無值。不選。

### Decision 5：測試以 mock hook 驅動狀態序列，焦點以 DOM 節點同一性斷言

**Choice**：元件測試沿用兩個測試檔既有的 `vi.mock("@/hooks/useRemoteHistory")`，以 `mockImplementation`／`mockReturnValue` 依序回報 `loading` → `synced`／`load-failed` 並 `rerender`；
按鍵前取得被選取選項的 DOM 參照，斷言 `document.activeElement` **就是**該參照（同一節點），而非僅「有一個名為本週的 radio 有焦點」。
鍵盤操作用 `@testing-library/user-event` 14 的 `element.focus()` ＋ `user.keyboard("{Enter}")`（`<button>` 上的 Enter 會觸發 click）。
E2E 在 `user-data` project（Desktop Chrome）以鍵盤操作並用 `expect(locator).toBeFocused()`；請求以 `page.route` 依區間（查詢字串的 `from`／`to` 組合）決定回 500、暫停或放行，**不依請求次數**——`next dev` 的 React StrictMode 會在 mount 時讓 effect 跑兩次、送出兩個「今日」請求。

**Rationale**：
- happy-dom 在焦點元素被移除時把 `activeElement` 交回 `body`（前一個 change 的 Stage 2 實測，OQ9），新 it 在現行程式碼下必紅——真紅燈。
- 節點同一性能區分「篩選器被重建後碰巧又聚焦到同名選項」與「篩選器從未卸載」；前者不是本 change 要的保證。
- Context7 `/microsoft/playwright`（class-locatorassertions、class-page）：`toBeFocused()` 為自動重試的 web-first 斷言；`page.route` handler 可 `fulfill({ status: 500 })` 或 `await` 後再 `continue()`，可用來把請求暫停在載入中。
- 不以真 hook＋mock fetch 測試：兩個測試檔已以 module-level `vi.mock` 取代 hook，另開檔案只為了真 hook 會分散錨點；hook 本身的 `range` 重新載入與「只採最後一次」已有 `useRemoteHistory.test.tsx` 守住。

**Alternatives considered**：
- 用 `user.click` 取代鍵盤：Safari 與 macOS Firefox 點擊 `<button>` 不會聚焦，E2E 無法跨瀏覽器一致；且問題陳述是鍵盤焦點。元件測試與 E2E 皆用鍵盤，規格也只承諾「焦點已在選項上時不遺失」，不承諾指標點擊會讓按鈕取得焦點。
- E2E 用 `{ times: 1 }` 只讓第一個請求失敗：StrictMode 下第二個「今日」請求會成功，失敗畫面不會出現。不選。

## Risks / Trade-offs

- [Risk] 統計頁雲端零紀錄的使用者在初次載入時看到篩選器出現後消失（Decision 4）→ Mitigation：只發生在初次載入、使用者尚未操作；E2E 與 regression guard 鎖住 `synced` 時 `total === 0` 不顯示篩選器；若使用者回報再另開 change。
- [Risk] 實作把篩選器放進三元運算的不同分支（例如 `isBlocking ? <><Filter/><Notice/></> : <><Filter/>…</>`），React 對 Fragment 的比對可能保留、也可能因兄弟結構改變而重建，測試若只斷言「radiogroup 存在」就抓不到 → Mitigation：焦點 it 以 DOM 節點同一性斷言（Decision 5）；Stage 2 必做變異「阻斷時改用另一份篩選器實例（不同父節點）」須轉紅。
- [Risk] 失敗文案「請重新整理頁面」在篩選器保留後不再是唯一出路，文案略顯過時 → Mitigation：文案是 `sync-status.ts` 的跨頁共用契約與多個 E2E 的斷言，本 change 不改；列 Open Questions 1。
- [Risk] E2E 暫停請求的 handler 未放行導致測試卡到 timeout，或斷言失敗後暫停中的請求在頁面關閉時才 `continue()` 而拋錯、蓋掉真正的失敗原因 → Mitigation：放行以 `Promise` resolver 實作、斷言載入中後立即放行，並以 `try／finally` 確保放行或在測試結束前 `page.unrouteAll({ behavior: "ignoreErrors" })`；不用 `waitForTimeout`。
- [Risk] session 載入中先渲染本機元件（也有「今日」radio 與統計標題），E2E 若在雲端元件掛載前斷言或 `focus()` 會得到假綠或焦點被元件切換吃掉 → Mitigation：所有 radio、標題、焦點操作與斷言一律排在 `[data-sync-status="load-failed"]` 可見之後（tasks 2.2、3.2 明寫）。
- [Risk] 歷史 GET 回 401 時 hook 只呼叫 `onUnauthorized`、不改狀態，畫面會短暫停在「篩選器可操作＋載入中」，直到 `session.refresh` 讓頁面切回本機元件；期間改選區間會再發一次請求、同樣 401 → 接受，不處理（與前一個 change 相同的 401 處理，只是現在多了可操作的篩選器；時間極短，且不會送出寫入）。
- [Risk] 損毀提示在阻斷時隱藏：失敗後切換區間成功，提示會依新回應重新出現 → 與現況一致（`begin` 清 `droppedCount`），不另處理。

## Migration Plan

無資料或 schema 遷移；不新增相依。部署照 README「部署前手動檢查清單」，只影響前端 Worker（後端不需重新部署，但部署順序規則不變）。回滾：revert 兩個元件檔即可，測試同步 revert。

## Open Questions

1. **重試同一區間與失敗文案**：本 change 只保證「改選其他區間可重新載入」。替代方案：(a) 在雲端歷史／統計的失敗提示旁加「重新載入」按鈕（hook 增 `reload()`，或元件以 reload token 進 effect 依賴）；(b) 點選已選取區間時重新載入；(c) 歷史頁的失敗文案改為「無法載入雲端資料，請改選其他區間或重新整理頁面」（需新增 `SyncStatus` 以外的文案來源，或改共用文案並同步多個 E2E）。
   建議：本 change 不做，待使用者回報再議——(a) 是 hook API 變更，(c) 會牽動對戰頁、參賽者頁、計分板共用文案。
2. **統計頁名單阻斷是否也保留篩選器**（Decision 3 的統一規則方案）：建議不做，理由見 Decision 3；若 coordinator 偏好一致性，需授權修改 `roster-sync.spec.ts` 的標題斷言與 `RemoteStatsContent.test.tsx` 兩個名單阻斷 it。
3. **其他雲端頁的同類問題**：對戰頁、參賽者頁、計分板在 `loading`／`load-failed` 時也以提示取代內容，但它們沒有「使用者操作 → 重新載入」的控制項（不會因操作進入 `loading`），本 change 不處理。
