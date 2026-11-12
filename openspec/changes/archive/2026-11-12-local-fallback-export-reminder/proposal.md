# Proposal: local-fallback-export-reminder

## Why

使用者在 session 無法確認時按「先用這台裝置的資料」進入本機備援，期間產生的資料只存在這台裝置。上一個 change（`cloud-json-import-append`）讓 JSON 備份能**附加**到雲端，但前提是使用者先匯出備份——
而重新整理並連上雲端後，資料頁「匯出 JSON」匯出的是**雲端**資料，本機資料沒有任何入口可匯出，「匯入本機資料到雲端」在雲端已有資料時也會被拒絕（409）。備份只能在重新整理**之前**、備援期間做，但目前的本機提示只說「重新整理頁面可再次連線雲端」，會把使用者引向資料遺失。

## What Changes

- **只改一句文案**：`LOCAL_FALLBACK_NOTICE`（`nextjs-pickball/lib/sync/sync-status.ts`）改為
  「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」，提醒使用者先匯出備份、連線後再匯入。
- 不加連結或按鈕：提示維持 `pointer-events-none`、固定在底部、不擋操作；`LocalFallbackBanner` 元件與樣式不改。
- 同步改測試字面值（`sync-status.test.ts`）與文件（`nextjs-pickball/CLAUDE.md`）的舊文案；主 spec 的舊文案由 delta spec 更新。

### 明確不做

- 加連結、按鈕或自動匯出；改 `LocalFallbackBanner` 的版面、層級或顯示條件。
- 讓重新整理並連上雲端後仍能匯出本機資料、或改變「匯入本機資料到雲端」的 409 規則。
- 改後端、核心套件、`/api/session` 契約；新增 npm 相依；migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：MODIFIED「session 無法確認時的阻擋畫面與本機備援」——`LOCAL_FALLBACK_NOTICE` 的文案，以及其提醒先匯出備份的用途說明；Scenario 中引用舊文案的三處（固定值、本機提示、E2E 本機備援）同步更新。

## Impact

- **前端產品程式碼**（1 檔）：`nextjs-pickball/lib/sync/sync-status.ts`（常數字面值）。
- **測試**（1 檔）：`nextjs-pickball/lib/sync/sync-status.test.ts` 的 it「unavailable 取代內容，按鈕與本機提示文案為固定值」授權改寫字面值斷言（改為新文案即為真紅）。
  `components/sync/LocalFallbackBanner.test.tsx`、`tests/e2e/specs/data-pending.spec.ts` 皆引用常數，不改，作為回歸。
- **文件**：`nextjs-pickball/CLAUDE.md` 儲存三態條目內「重新整理頁面可再次連線雲端」一句補上先匯出備份的提醒。
- **不改**：`components/sync/**`、`components/matchmaker/**`（含 `JsonBackupSection.tsx`、`LocalDataImportSection.tsx`）、`hooks/**`、`lib/auth/**`、`lib/matchmaker/**`、`app/**`、後端與核心套件。
- **相依**：不新增。**migration**：無。
- **使用者可見**：本機備援期間畫面下方的常駐提示變長（375px 寬約由 2 行增為 3 行），內容多了先到「資料」頁匯出 JSON 備份的提醒；其他畫面完全不變。
