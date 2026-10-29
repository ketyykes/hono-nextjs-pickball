# Proposal: history-filter-retention

## Why

登入時的雲端歷史頁與統計頁，每次切換區間都會讓 `useRemoteHistory` 回到 `loading`，而主 spec 規定 `loading`／`load-failed` 時「以 `SyncStatusNotice` 取代內容」，
於是 `HistoryRangeFilter` 被卸載再掛載：① 以鍵盤或點擊切換區間後焦點掉回 `body`，回應到達後也不會回來；② 載入失敗時篩選器整個消失，使用者無法改選其他區間重試，只能重新整理頁面。
本機頁沒有這兩個問題。來源：`docs/backend-scoring-runbook-b1-b9.md` B8 紀錄（coordinator 裁定 OQ9「後續 change：載入中與失敗時保留篩選器」）、
`openspec/changes/archive/2026-10-28-matchmaker-history-stats-backend/design.md` Open Questions 9（焦點遺失，Stage 2 以 happy-dom 實測 `activeElement` 變為 `BODY`）與 13（空區間 400 曾讓篩選器消失，「OQ9 因此加重」）。

## What Changes

- **雲端歷史頁**（`RemoteHistoryView`）：`loading`／`load-failed` 時**保留區間篩選器**（同一個 DOM 元素持續掛載），只把紀錄區塊（紀錄卡片、兩種空狀態）換成 `SyncStatusNotice`；損毀提示在這兩個狀態仍不顯示（沒有可信資料）。
  載入失敗後改選其他區間即以新區間重新載入（沿用 hook 既有「`range` 改變重新 GET」規則，hook 不改）。
- **雲端統計頁**（`RemoteStatsContent`）：名單可用而**歷史** `loading`／`load-failed` 時，保留標題與區間篩選器，只把排行榜區塊換成提示。
  名單 `loading`／`load-failed` 時維持現狀（以提示取代整段內容、名單狀態優先）——切換區間無法恢復名單，保留篩選器沒有意義。
  雲端歷史 `synced` 且 `total === 0` 時不顯示篩選器的既有規則不變（載入中與失敗時 hook 的 `total` 恆為 0，不適用此規則）。
- 焦點：焦點已在某個區間選項上時（例如以鍵盤選取區間），載入中、載入完成、載入失敗都不會遺失。做法是「篩選器不卸載」，不另寫焦點還原程式。以指標點擊是否讓按鈕取得焦點由瀏覽器決定（Safari、macOS Firefox 不會），不在承諾範圍。
- **BREAKING（規格層，僅登入態）**：主 spec 的 Scenario「雲端歷史：載入失敗時歷史頁顯示錯誤」的「區間篩選不存在」改為「區間篩選仍在且可操作」。

### 明確不做

- 不加「重試」按鈕、不讓點選「目前已選取的區間」重新載入、不改 `load-failed` 的固定文案（列於 design Open Questions）。
- 不改 `useRemoteHistory`、`HistoryRangeFilter`、`SyncStatusNotice`、`sync-status.ts`。
- 不改訪客路徑：本機 `HistoryView`、`LocalStatsContent` 與共用元件一行不動。訪客頁本來就沒有這兩個問題（本機讀取同步完成，不經 `loading`）。
- 不新增 hook（不需更新 `pickleball-guide-page` 的 hooks 歸屬清單）、不新增相依、無 migration、不動後端與核心套件。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-history`：「登入時歷史以雲端為準」——雲端歷史頁在載入中與載入失敗時保留區間篩選與焦點，只替換紀錄區塊；改寫既有 Scenario「雲端歷史：載入失敗時歷史頁顯示錯誤」，新增四個 Scenario。
- `player-stats`：「統計依區間篩選」——雲端統計頁在歷史載入中與載入失敗時保留標題、區間篩選與焦點，只替換排行榜區塊；名單阻斷時維持整段取代。新增五個 Scenario（其中「名單載入中或載入失敗時仍以提示取代整段內容」以既有 it／E2E 為驗收錨點，屬 regression guard）。

## Impact

- **前端產品程式碼（只改兩檔）**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`、`nextjs-pickball/components/matchmaker/RemoteStatsContent.tsx`。
- **測試**：
  - 新增 it：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`（3 個）、`nextjs-pickball/components/matchmaker/RemoteStatsContent.test.tsx`（3 個）。
  - 新增 E2E：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`（2 個 test）。
  - **授權修改的既有測試（僅限下列三處，皆為本 change 行為的必然結果）**：
    ① `RemoteHistoryView.test.tsx` 的 it「syncStatus 為 %s 時以提示取代內容並標示 data-sync-status」**刪除** `expect(screen.queryByRole("radiogroup")).toBeNull();` 一行（與新行為矛盾；正向斷言由新 it 承擔，不在舊 it 重複）；
    ② `RemoteStatsContent.test.tsx` 的 it「歷史 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status」**刪除**同一行（理由同上）；
    ③ `history-sync.spec.ts` 的 test「雲端歷史載入失敗時歷史頁顯示錯誤提示」最後一行 `toHaveCount(0)` 改為斷言「今日」選項可見且為選中。
    其餘既有 it／test（含名單阻斷時篩選器不存在的 it 與 `roster-sync.spec.ts`「雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容」）一行不改，作為 regression guard。
- **文件**：`nextjs-pickball/CLAUDE.md` 的 `/matchmaker/history`、`/matchmaker/stats` 條目各補一句「雲端歷史載入中／失敗時保留區間篩選（統計頁連同標題），只替換紀錄／排行榜區塊」（apply 階段改；名單同步段「三頁以提示取代內容」指名單狀態，仍正確、不改）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **訪客／正式站**：訪客 DOM 零變更；登入態歷史頁與統計頁的載入中、失敗畫面多出篩選器（與標題）。
