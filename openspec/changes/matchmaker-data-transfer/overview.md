# Overview — matchmaker-data-transfer（M8）

## Scope

替對戰分配機補上唯一的備份與搬移路徑：新增 `/matchmaker/data` 資料工具頁，提供 JSON
完整備份的匯出與匯入、歷史賽果的 CSV 匯出、參賽者名單的 CSV 匯入（含預覽與附加寫入），
以及 §10 表格裡至今無處可按的「清除本機資料」。

**規模：large** —— 影響 1 個新 capability，但 tasks 共 9 個群組、92 條
（34 組 RED／GREEN 配對 + 8 條 REFACTOR + 16 條前置與收尾驗證），
遠超過 medium 的 9-20 條上限；`tasks > 20` 這條命中即判 large。

條件式區塊判定：

- **前端需求：是** —— 新增一整個路由與五個元件，含檔案選擇、預覽、確認對話框與
  錯誤提示等多個視覺狀態 → 加 UI Mockups。
- **資料庫結構：否** —— 專案無資料庫，資料層只有瀏覽器 LocalStorage，本段不新增任何 key。
- **資料遷移：否** —— 不改動任何既有 key 的結構或版本號，備份格式 `version` 為第一版。
- **跨元件流程：是** —— CSV 匯入是「選檔 → 解析 → 預覽 → 確認 → 寫入 → 整頁 reload」
  的順序敏感多步互動，且失敗分支必須在寫入前就中止 → 加 Sequence Diagram。

## What Changes

- 新增 `lib/matchmaker/` 下六個純函式模組：`transfer-types.ts`、`backup.ts`、`csv.ts`、
  `history-csv.ts`、`roster-csv.ts`、`transfer-storage.ts`（各附 `*.test.ts`）
- 新增路由 `app/matchmaker/data/page.tsx` 與五個 `components/matchmaker/` 元件
- 新增 E2E `tests/e2e/specs/matchmaker-data-transfer.spec.ts`
- **不編輯任何既有檔案**：`storage.ts`、`storage-keys.ts`、`round-types.ts`、`history.ts`、
  `roster.ts`、`colors.ts`、`types.ts`、`hooks/**` 全部只 import 不修改
  （並行 worktree 的合併衝突面積趨近零）

```
=== Before ===

  LocalStorage
    matchmaker:roster:v1   名單
    matchmaker:round:v1    回合      ── 只存在這一台瀏覽器
    matchmaker:history:v1  歷史          ▲
    scoreboard:current:v1  計分進度      │ 沒有任何匯出 / 匯入路徑

  PRD 10 的「清除本機資料」 ── 有規格，無入口
  PRD 9.3 的 CSV           ── 完全未實作

=== After ===

  /matchmaker/data
    +-- JSON 匯出   --> matchmaker-backup-YYYY-MM-DD.json
    |                   version / players / currentRound / history
    |                   重複配對簽章隨 currentRound 一併帶走
    +-- JSON 匯入   <-- 先全部驗證，任一處不合法即整份拒絕
    |                   失敗時 3 個 key 一個字都不動
    +-- CSV 匯出    --> 歷史賽果，UTF-8 BOM，11 個欄位
    +-- CSV 匯入    <-- 參賽者名單，預覽後才附加寫入
    +-- 清除本機資料 --> 4 個列舉 key，二次確認 + 無法復原提示
```

## UI Mockups

資料頁的四個區塊為固定版面；真正會變化的是 CSV 匯入的三個狀態（未選檔 / 預覽合法 /
預覽有問題）、JSON 匯入失敗的錯誤狀態，以及清除本機資料的確認對話框。以下依序列出。

```
=== State 1: 資料頁初始 (尚未選擇任何檔案) ===

 ┌─ /matchmaker/data ──────────────────────────────────────────┐
 │  資料匯入匯出                                                │
 │                                                              │
 │  ⓘ CSV 匯出的是歷史賽果、匯入的是參賽者名單，兩者不構成      │
 │    round-trip。需要完整還原請使用 JSON。                     │
 │                                                              │
 │  ┌─ JSON 完整備份 ──────────────────────────────────────┐   │
 │  │ 含參賽者、目前回合、歷史與重複配對簽章               │   │
 │  │ [匯出 JSON]        [選擇備份檔…]                     │   │
 │  └──────────────────────────────────────────────────────┘   │
 │  ┌─ 歷史賽果 CSV 匯出 ──────────────────────────────────┐   │
 │  │ 全部歷史，可直接以 Excel / Google Sheets 開啟        │   │
 │  │ [匯出 CSV]                                           │   │
 │  └──────────────────────────────────────────────────────┘   │
 │  ┌─ 參賽者名單 CSV 匯入 ────────────────────────────────┐   │
 │  │ 欄位：名稱 / 性別 / 強度分數 / 顏色起點 / 顏色終點   │   │
 │  │ [選擇 CSV 檔…]                                       │   │
 │  │ [確認匯入]░░░░  ← 未選檔時 disabled                  │   │
 │  └──────────────────────────────────────────────────────┘   │
 │  ┌─ 清除本機資料 ───────────────────────────────────────┐   │
 │  │ 會清除本機全部資料，且無法復原                       │   │
 │  │ [清除本機資料]                                       │   │
 │  └──────────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────────┘
              │
              │ 選擇一份全部合法的 CSV
              ▼

=== State 2: CSV 預覽 - 全部合法 ===

 ┌─ 參賽者名單 CSV 匯入 ────────────────────────────────────┐
 │ 已選擇：players.csv                                      │
 │ ┌─ 預覽 ─────────────────────────────────────────────┐  │
 │ │ 將新增 3 人，0 列有問題                            │  │
 │ │  第 2 列  王小明   男   3.00   自動配色            │  │
 │ │  第 3 列  李小華   女   5.00   自動配色            │  │
 │ │  第 4 列  陳大同   其他 4.25   #2563EB → #1E3A8A   │  │
 │ └────────────────────────────────────────────────────┘  │
 │ [確認匯入]            [Cancel]                           │
 └──────────────────────────────────────────────────────────┘
              │
              │ 改選一份含錯誤列的 CSV
              ▼

=== State 3: CSV 預覽 - 有問題列 (整份不匯入) ===

 ┌─ 參賽者名單 CSV 匯入 ────────────────────────────────────┐
 │ 已選擇：players-broken.csv                               │
 │ ┌─ 預覽 ─────────────────────────────────────────────┐  │
 │ │ ⚠ 可新增 3 人，但有 2 列有問題                     │  │
 │ │   任一列有問題時整份不匯入，請修正後重新選擇檔案。 │  │
 │ │   第 3 列  名稱      不可為空白                    │  │
 │ │   第 5 列  強度分數  需介於 1.00 至 8.00 之間      │  │
 │ └────────────────────────────────────────────────────┘  │
 │ [確認匯入]░░░░  ← 有錯誤列時 disabled                    │
 │ [Cancel]                                                 │
 └──────────────────────────────────────────────────────────┘

=== State 4: JSON 匯入失敗 (既有資料完全未動) ===

 ┌─ JSON 完整備份 ──────────────────────────────────────────┐
 │ 已選擇：backup.json                                      │
 │ ┌─ 錯誤 ─────────────────────────────────────────────┐  │
 │ │ ✕ 備份檔的參賽者資料有誤：強度分數需介於 1.00 至   │  │
 │ │   8.00 之間。整份未匯入，目前資料未被更動。        │  │
 │ │   請確認檔案是本 App 匯出的備份後再試一次。        │  │
 │ └────────────────────────────────────────────────────┘  │
 │ [匯出 JSON]        [選擇備份檔…]                         │
 └──────────────────────────────────────────────────────────┘

=== State 5: 清除本機資料的二次確認 ===

 ┌─ 確認清除本機資料 ───────────────────────────────────────┐
 │ 這會清除本機全部資料，包含參賽者、目前回合、歷史賽果與   │
 │ 計分板進度，且**無法復原**。                             │
 │                                                          │
 │ 建議先匯出 JSON 備份再繼續。                             │
 │ 注意：JSON 備份不包含 /scoreboard 進行中的逐球計分進度。 │
 │                                                          │
 │            [Cancel]        [確定清除]                    │
 └──────────────────────────────────────────────────────────┘
```

## Architecture

六個新模組的職責邊界與依賴方向。箭頭表示「A 依賴 B」；虛線框為既有模組（唯讀取用，
一行都不改）。`transfer-storage.ts` 是唯一碰 LocalStorage 的地方，`csv.ts` 只認識
字串與二維陣列、完全不知道網域型別的存在。

```
        app/matchmaker/data/page.tsx      <- 例外層，E2E 驗收
        components/matchmaker/*.tsx           Blob / <a download> / File
                     |                        皆留在這一層
       +-------------+--------------+-------------------+
       |             |              |                   |
       v             v              v                   v
  backup.ts     history-csv.ts  roster-csv.ts   transfer-storage.ts
   build/parse    9.3.1 欄位     9.3.2 逐列      讀 / 寫 / 清除
   /fileName      對應           驗證 + 預覽     CLEAR_ALL_KEYS
       |             |              |                   |
       |             +------+-------+                   |
       v                    v                           v
  transfer-types.ts       csv.ts               . . . . . . . . . . . . .
   BackupSchema            toCsv / parseCsv    . storage-keys.ts (M4)  .
   TRANSFER_MESSAGES       跳脫 / BOM / 換行   .  3 個 key 常數        .
   version: 1                                  .  hasLocalStorage()    .
       |                                       . . . . . . . . . . . . .
       v
  . . . . . . . . . . . . . . . . . . . . .    . . . . . . . . . . . . .
  . types.ts        PlayerSchema          .    . lib/scoreboard/       .
  . roster.ts       addPlayer /           .    .  storage.ts           .
  .                 nextAutoGradient      .    .   STORAGE_KEY         .
  . round-types.ts  RoundSchema (M4)      .    .  分槽模組 (M6 合併後) .
  . history.ts      MatchHistoryEntry(M4) .    .   scoreboard:matches  .
  . colors.ts       預設調色盤            .    . . . . . . . . . . . . .
  . . . . . . . . . . . . . . . . . . . . .
```

## Sequence Diagram

CSV 匯入的關鍵路徑與失敗分支。重點是**預覽與寫入是兩次獨立的使用者動作**，
且 `applyRosterImport` 在有任一錯誤列時根本不會被呼叫——整份原子性靠的是
「不呼叫」，而不是「呼叫後回滾」。

```
 使用者      DataPage      roster-csv.ts   transfer-storage   Browser
   │            │               │                │              │
   │ 選擇 CSV   │               │                │              │
   ├───────────►│               │                │              │
   │            │ file.text()   │                │              │
   │            ├──────────────────────────────────────────────►│
   │            │◄──────────────────────────────────────────────┤
   │            │ parseRosterCsv(text)           │              │
   │            ├──────────────►│                │              │
   │            │◄──────────────┤ {rows, errors} │              │
   │◄───────────┤ 顯示預覽      │                │              │
   │  將新增 N 人 / M 列有問題  │                │              │
   │            │               │                │              │
   │  [失敗分支] errors.length > 0               │              │
   │            │ 確認鈕 disabled，不再往下走    │              │
   │            │ ✕ applyRosterImport 完全不被呼叫              │
   │            │                                │              │
   │ [確認匯入] │               │                │              │
   ├───────────►│ applyRosterImport(roster,rows) │              │
   │            ├──────────────►│                │              │
   │            │◄──────────────┤ 新名單         │              │
   │            │ writeRoster(新名單)            │              │
   │            ├───────────────────────────────►│              │
   │            │◄───────────────────────────────┤ ok / 失敗    │
   │            │ location.reload()              │              │
   │            ├──────────────────────────────────────────────►│
   │◄──────────────────────────────────────────────────────────┤
   │  各 store 由 LocalStorage 重新 hydrate       │              │
```

## Task Tree

tasks.md 的群組相依。§0 是與 M4 的介面對齊，未完成前不能開始 §2 以後的任何工作；
§1（csv.ts）刻意獨立於 §0，因為它完全不碰網域型別，可最先開工。

```
  §0 前置：與 M4 的介面對齊(grep 出實際 schema 與 key 名稱)
   │
   ├── §1 CSV 底層(csv.ts)           ← 不依賴 §0，可平行
   │    │
   │    ├── §4 歷史賽果 CSV 匯出(history-csv.ts)
   │    │
   │    └── §5 參賽者 CSV 解析與驗證(roster-csv.ts)
   │         │
   │         └── §6 CSV 匯入的預覽與附加寫入(roster-csv.ts)
   │
   ├── §2 備份 schema(transfer-types.ts)
   │    │
   │    └── §3 備份的建立與解析(backup.ts)
   │
   └── §7 快照讀寫與清除(transfer-storage.ts)
        │
        └── §8 資料頁與元件(例外層)
             │
             └── §9 E2E 與收尾驗證
```

## Cross-Cutting Impact

| 檔案 / 模組 | 動作 | 說明 |
|---|---|---|
| `lib/matchmaker/transfer-types.ts` | 新增 | 備份 schema，import M4 的 round / history schema |
| `lib/matchmaker/backup.ts` | 新增 | build / parse / fileName，錯誤訊息繁中化 |
| `lib/matchmaker/csv.ts` | 新增 | 跳脫、BOM、換行；不認識任何網域型別 |
| `lib/matchmaker/history-csv.ts` | 新增 | 9.3.1 的 11 個欄位對應 |
| `lib/matchmaker/roster-csv.ts` | 新增 | 逐列驗證、預覽、附加寫入 |
| `lib/matchmaker/transfer-storage.ts` | 新增 | 快照讀寫、`CLEAR_ALL_KEYS`、配額與不可用處理 |
| `app/matchmaker/data/page.tsx` | 新增 | 例外層，E2E 驗收 |
| `components/matchmaker/*.tsx`（5 個） | 新增 | 例外層；Blob / File 的 I/O 全在此層 |
| `tests/e2e/specs/matchmaker-data-transfer.spec.ts` | 新增 | 8 個 E2E case |
| `lib/matchmaker/storage.ts`、`storage-keys.ts` | **不動** | 只 import 三個 key 常數與 `hasLocalStorage()`，避開與 M4 的衝突 |
| `lib/matchmaker/round-types.ts`、`history.ts` | **不動** | 只 import `RoundSchema` / `MatchHistoryEntrySchema` |
| `lib/matchmaker/roster.ts` | **不動** | 只 import `addPlayer` / `nextAutoGradient` |
| `lib/matchmaker/types.ts`、`colors.ts` | **不動** | 只 import schema 與調色盤 |
| `lib/scoreboard/**` | **不動** | 只 import 計分板的**全部** key 常數（`storage.ts` 的 `STORAGE_KEY`；M6 已合併時再加分槽模組的 `scoreboard:matches:v1`），由 §0.5 的 grep 逐一列出 |
| `hooks/**` | **不動** | 不新增 hook，避開 hooks 歸屬清單的並行衝突 |
| `openspec/specs/**` | **不動** | 主 spec 由 archive 階段同步，本 change 只寫 delta |
| `hono-pickball/**` | **不動** | 全部行為在瀏覽器完成，不呼叫 `/api/*` |
