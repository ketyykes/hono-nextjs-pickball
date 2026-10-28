# Proposal: local-data-import

## Why

runbook B9：B5～B8 讓登入後的計分板與對戰分配機全部以雲端為準，但使用者在登入前（訪客）累積的名單、回合、歷史與計分板進度仍只在本機——
登入後看到的是空的雲端，訪客時期的資料無法帶過去。本 change 提供「匯入本機資料到雲端」，並定案 B6 暫停的「登入時 JSON 還原」。

**使用者已定案**：匯入成功後**保留**本機資料；後端已有資料時**拒絕匯入並提示**（不覆寫、不合併）。重複匯入不得產生重複歷史。

**前提**：B4～B8 皆已合併並 archive（`sync_batch_guards` 與整批守衛、`matchmaker_*` 四張表、`GET /api/matchmaker/history`、`resetLocalMatchProgress()` 已刪除、登入時重置不碰本機）。

## What Changes

**後端**
- `POST /api/import`（新 sub-app `src/routes/import.ts`，`use("*", localAuth, requireSession, requireExpectedUser)`）：請求為 `BackupSchema` 擴充 `scoreboard: { current, matches }`；
  **單一 batch**：整批守衛（四張對戰分配機表皆無本人資料）→ 參賽者、回合、分槽、歷史各一條 `INSERT … SELECT … FROM json_each(?)` → 獨立計分板 `ON CONFLICT DO NOTHING` → 刪守衛。
  任一對戰分配機表已有資料 → 409、整份不寫入；獨立計分板已存在 → 略過該段（回應標示 `skipped`）。
- 冪等：重複匯入必被守衛拒絕；歷史主鍵 `(user_id, match_id)` 為第二道防線。

**核心套件**：`src/api/import.ts`（`LocalImportRequestSchema`、`LocalImportResponseSchema`）；`CORE_MODULES` 加一項。

**前端**
- `lib/sync/local-import.ts`：`buildLocalImportPayload()`（經既有 reader 讀本機五個 key、略過孤兒分槽與重複歷史、大小檢查）、`importLocalData()`、`backupToImportRequest()`、`hasImportableLocalData()`。
- 資料頁（登入時）：新增「匯入本機資料到雲端」區塊（`components/matchmaker/LocalDataImportSection.tsx`）；
  **JSON 還原恢復**為「從 JSON 備份匯入到雲端」，走同一端點與同一拒絕規則（B6 停用時明言由 B9 決定）。
- 參賽者頁（登入時）：雲端名單為空且本機有資料時顯示匯入提示（`components/matchmaker/LocalImportNotice.tsx`）。

**文件**：兩份 CLAUDE.md 加入匯入流程與拒絕規則。

### 明確不做

- 覆寫或合併雲端資料（使用者定案為拒絕）；匯入後清除本機資料（使用者定案為保留）。
- 自動匯入（一律由使用者按下）；分批匯入超過單一參數上限的資料（列為 Risk）。
- 新錯誤碼（「雲端已有資料」沿用 409 `VERSION_CONFLICT`，前端以端點語意決定文案）。
- 新 hook（匯入是一次性動作，狀態留在元件內；不需更新 hooks 歸屬清單）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：新增「本機資料匯入雲端的 API」。
- `data-transfer`：「登入時的資料工具頁」的 JSON 還原改為匯入到雲端；新增「登入後匯入本機資料到雲端」。

## Impact

- **後端**：新增 `src/routes/import.ts`、`src/import/local-import-repository.ts`；`src/index.ts`（掛載 `/api/import`）；測試新增 `test/local-import.test.ts`。**無 migration**。
- **核心套件**：新增 `src/api/import.ts` 與 `test/api/import.test.ts`；`CORE_MODULES`。
- **前端**：新增 `lib/sync/local-import.ts`（＋測試）、`components/matchmaker/{LocalDataImportSection,LocalImportNotice}.tsx`；
  修改 `app/matchmaker/data/page.tsx`（掛載區塊）、`app/matchmaker/players/page.tsx`（掛載提示）、`components/matchmaker/JsonBackupSection.tsx`（雲端分支由「停用說明」改為匯入）；
  E2E 新增 `tests/e2e/user-data/local-import.spec.ts`。
- **允許修改的既有測試**：`tests/e2e/user-data/roster-sync.spec.ts` 刪除 B6 的「登入時 JSON 還原停用並顯示說明」（行為依本 change 改變，見 `data-transfer` delta）；apply §1 追加（皆為行為的必然結果，見 design Open Questions 4）：`hono-pickball/test/expected-user-guard.test.ts` 樣本表補 `POST /api/import`（14 → 15）、`packages/pickball-core/test/module-boundary.test.ts` 的 `CORE_MODULES`、`roster-sync.spec.ts` 與 `history-sync.spec.ts` 的雲端同步點常數；其餘既有 it／test 一律不改。
- **apply §1 追加的新測試檔**：`components/matchmaker/LocalDataImportSection.test.tsx`、`components/matchmaker/JsonBackupSection.test.tsx`（B7.5 一次性雲端操作的帳號與未授權 refresh）。
- **相依**：**不新增任何第三方套件**。
- **訪客／正式站**：零變更（本機模式的資料頁與參賽者頁不渲染新元件；auth 停用時新端點回 404）。
