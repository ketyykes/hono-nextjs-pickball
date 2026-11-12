# Design: local-fallback-export-reminder

## Context

本機備援（有上次登入提示、session 無法確認時按「先用這台裝置的資料」）期間，`LocalFallbackBanner` 常駐顯示 `LOCAL_FALLBACK_NOTICE`。目前文案「重新整理頁面可再次連線雲端」只告訴使用者怎麼回到雲端，沒提醒備援期間的修改此時**只存在這台裝置**、重新整理後就難以救回。

查證結果（皆讀自現行程式碼，未改動任何東西）：

1. **備援期間資料頁的 JSON 匯出可用，且匯出本機資料。** `resolveStorageMode` 對 `{ status: "loading", localFallback: true }` 回 `"local"`（且判斷在 `signedInHint` 之前，`lib/sync/storage-mode.ts`）；
   `JsonBackupSection` 的 `isRemote = mode === "remote"` 為 false，不走 `mode === "pending"` 的阻擋分支，渲染「匯出 JSON」，`handleExport` 走本機路徑 `buildBackup(readSnapshot(), …)`，匯出 LocalStorage 的資料。
2. **重新整理並連上雲端後沒有任何本機匯出入口。** 此時 session 為已登入，模式為 `"remote"`：「匯出 JSON」走 `handleRemoteExport`，匯出雲端資料；本機資料仍在 LocalStorage，但資料頁沒有入口讀它出去。
   「匯入本機資料到雲端」（`LocalDataImportSection`）在雲端已有資料時被後端以 409 拒絕。所以備份**必須在重新整理之前**做；做完之後，連上雲端時「JSON 完整備份」區塊的「選擇備份檔匯入雲端…」可把備份匯入（雲端為空整份匯入、已有資料時走附加流程，見 `cloud-json-import-append`）。這是本 change 的理由。
3. **導覽名稱與區塊字樣**：`/matchmaker/data` 的導覽名稱是「資料」（`lib/matchmaker/section-nav.ts`）；匯入區塊標題為「JSON 完整備份」，雲端分支的選檔按鈕為「選擇備份檔匯入雲端…」。

## Goals

- 本機備援提示明講：重新整理前先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端。

## Non-Goals

- 加連結、按鈕、自動匯出，或改 `LocalFallbackBanner` 的版面、層級、顯示條件（使用者定案：只改這一句文案）。
- 改變重新整理後的匯出語意、或「匯入本機資料到雲端」的 409 規則。

## Decisions

### Decision: 只改 `LOCAL_FALLBACK_NOTICE` 常數的字面值

**Choice**: 新文案逐字為「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」（63 字，原 32 字）。元件、樣式、掛載位置不動。

**Rationale**: 使用者定案；常數是唯一來源，`LocalFallbackBanner`、單元測試與 E2E 都經常數引用，改一處全跟上。

**Alternatives considered**:
- 提示內加「前往資料頁」連結：提示是 `pointer-events-none` 以免擋住下方操作，要加連結就得改成可點，牽動層級與專注模式版面，超出使用者定案範圍。
- 另立第二個常數或第二行提示：同一時間只有一個提示就夠，不增加文案數量。

### Decision: 匯入端字樣採實際 UI 字樣，不照 coordinator 草稿的「從 JSON 備份匯入到雲端」

**Choice**: 文案後半寫「連線後再選擇備份檔匯入雲端」。

**Rationale**: 資料頁沒有叫「從 JSON 備份匯入到雲端」的標題或按鈕；實際是「JSON 完整備份」區塊內的「選擇備份檔匯入雲端…」（登入時）。「選擇備份檔匯入雲端」是該按鈕字樣去掉省略號，使用者能在畫面上對得上；前半的「JSON 備份」對應區塊標題與「匯出 JSON」按鈕。

**Alternatives considered**:
- 原草稿「從 JSON 備份匯入到雲端」：與畫面字樣不一致，使用者找不到對應入口。
- 「於『JSON 完整備份』選擇備份檔匯入雲端」：最精確但再多 12 字，提示更長；同頁只有一個 JSON 區塊，不必再指名。

### Decision: 不為「備援期間可匯出」另加新測試

**Choice**: 本 change 唯一的紅燈是 `sync-status.test.ts` 改寫字面值。備援期間匯出本機資料的行為由既有測試分段涵蓋（`storage-mode.test.ts` 的本機備援為 `local`；本機模式「匯出 JSON」匯出本機資料見 E2E `matchmaker-data-transfer.spec.ts` 的「匯出 JSON 產生內容正確的備份檔案」），不補新 it。

**Rationale**: 行為早已存在，新增測試只會是 regression guard，且使用者定案範圍只有文案；避免為小改動膨脹測試。

**Alternatives considered**:
- 補一條「localFallback 快照下 JsonBackupSection 匯出本機資料」的 it：價值有限，且屬行為層不是本 change 變更。

## Risks / Trade-offs

- [提示變長佔更多畫面] `NOTICE_CLASS`（`rounded-lg border px-4 py-2 text-center text-sm`）沒有 `whitespace-nowrap`，會自然換行。外層為 `fixed inset-x-0 bottom-4 flex justify-center px-4`，375px 寬時文字可用寬約 311px，`text-sm` 全形字約 22 字一行，63 字約 3 行（原 32 字約 2 行），框高約由 58px 增為 78px；
  一般頁面提示頂端約離底部 94px，計分板專注模式（`[.sb-focus_&]:bottom-16`，讓到浮動操作列上方）約 142px。多出的 20px 只會多蓋住頁面底部一小段內容（視覺），因外層與提示皆在 `pointer-events-none` 之下，**不擋任何操作**。
  桌面寬度下仍為 1～2 行。→ Mitigation：不調整版面；以 gate 的 mobile project 實跑確認 `LOCAL_FALLBACK_NOTICE` 可見且 `data-pending.spec.ts` 本機備援那條照舊通過。
- [使用者忽略提示仍重新整理] 提示只是提醒，無法阻止重新整理 → 接受；使用者定案不做攔截。
- [備份後匯入的前提] 連線後匯入走既有雲端分支，雲端已有資料時為附加（不覆寫、不含進行中回合）；提示不展開這些細節 → 接受，細節在資料頁區塊說明文字。

## Migration Plan

無資料或 schema 變更。回滾即還原常數與測試字面值。

## Open Questions

- 無。apply 階段若遇阻礙，附加於此。
