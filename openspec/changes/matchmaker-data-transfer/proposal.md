> **Milestone：M8（資料匯入匯出）**
> 交付序：M1 `add-player-roster` → M2 `matchmaker-allocation-engine` →
> M3 `matchmaker-rating-engine` → M4 `matchmaker-round-lifecycle` →
> M5 `matchmaker-match-stage-ui` → M6 `matchmaker-scoreboard-binding` →
> M7 `matchmaker-history-page` → **M8 `matchmaker-data-transfer`（本 change）** →
> M9 JPG／PDF 匯出。
>
> **執行相依**：**M5 必須先合併回 main**，本 change 的 worktree 才能從 `main` 開出。
> 理由是 M8 消費的兩份共用契約都在 M5 之前落地——Round 資料模型與歷史紀錄欄位由 M4 定案、
> 評分 API 由 M3 定案，而 M5 是 M3／M4 之後的最末一段；`main` 含 M5 即必然含 M3 與 M4。
> 與 M7（歷史頁）、M9（JPG／PDF）**可並行**；**M6（計分板銜接）必須先合併**——
> 本 change 的清除清單直接 import M6 的 `MATCH_SLOTS_KEY`
> （`lib/scoreboard/match-slots.ts`），M6 未合併時 `tsc` 會直接失敗（見 design Decision 5）。
> 並行的部分仍成立：本 change 不修改
> `match-stage`、`match-history`、`site-navbar` 任何既有 requirement，也不動 M4 建立的
> `lib/matchmaker/storage.ts`（見 design Decision 2）。

## Why

`prd.md` 明訂本版「資料策略：只使用瀏覽器 LocalStorage，不需登入、不接後端儲存」（第 10 行）。
這個決定把**資料可攜性**從「加分項」變成**唯一的備份與跨裝置手段**——12.4 已寫明「清除瀏覽器
資料或更換裝置會導致資料遺失」。M1～M7 交付後，使用者手建的數十位參賽者、逐輪回合與整季歷史
賽果全部只存在單一瀏覽器的 LocalStorage 裡，**沒有任何一條路徑能把它們帶走或帶回來**。

同時，§10 表格列的「清除本機資料」目前也無處可按。這一列與 4.1.5 的「重置名單」是**兩件不同
的事**（前者清全部本機資料、後者只清 matchmaker 的名單／回合／歷史），M1 只做了後者。在沒有
JSON 匯出的情況下先做清除是危險的——12.4 要求「介面需在重置與清除流程提醒此風險」，而唯一
能提的補救手段就是「先匯出 JSON」。因此**匯出必須與清除同一段落交付**，不能分開。

## What Changes

新增 `data-transfer` capability，涵蓋 `prd.md` 9.2、9.3 全節、§10 的「清除本機資料」列、
§11 的「匯入檔案格式錯誤」與「LocalStorage 不可用或寫入超出配額」、12.4 的清除風險提醒，
以及 13.5 驗收清單中屬於匯入匯出的項目：

- **資料工具頁**：新增路由 `/matchmaker/data`，以自身 requirement 描述其導覽入口
  （SHALL 可從 matchmaker 區段抵達），**不 MODIFY M5 的 `match-stage` 導覽 requirement**。
- **JSON 完整備份匯出**（9.2）：單一檔案含版本號、參賽者、目前回合、歷史與重複配對簽章，
  schema 沿用 M3／M4 定案的共用契約，**不另立一套平行型別**。
- **JSON 匯入還原**（9.2）：以 zod 做結構驗證（比照 `lib/matchmaker/types.ts` 既有模式）。
  格式錯誤時**整份不匯入、不覆蓋現有資料**，並回傳繁體中文錯誤訊息。此處刻意**不採**
  M1 名單持久化的「逐筆降級」策略（理由見 design Decision 4）。
- **CSV 匯出歷史賽果**（9.3.1）：日期、時間、對戰方式、雙打組成標示、場地、第一隊球員、
  第二隊球員、比分、勝方、各員賽前／賽後分數；編碼需被 Excel 與 Google Sheets 正確辨識中文。
- **CSV 匯入參賽者名單**（9.3.2）：名稱／性別／強度分數為必填，顏色兩欄選填；**匯入前顯示
  預覽**（將新增幾人、哪幾列有問題）；**附加**模式（不覆蓋既有）；**同名視為不同人**；
  任一列驗證失敗時指出**列號、欄位、原因**且**整份不匯入**。顏色未提供時以既有
  `lib/matchmaker/colors.ts` 的調色盤自動配色。
- **CSV 匯出與匯入刻意不對稱**（9.3 前言）：匯出的是歷史賽果、匯入的是參賽者名單，
  兩者**不構成 round-trip**。此不對稱 SHALL 在 UI 上明講，避免使用者誤以為 CSV 可備份還原。
- **清除本機資料**（§10、12.4）：明確二次確認、載明無法復原、建議先匯出 JSON 備份；
  清除範圍以**列舉的 key 清單**實作（沿用 M1 Decision 6 的原則），且該清單 MUST 涵蓋
  `matchmaker:*` 與 `scoreboard:*` 兩個資料域**寫入的全部 key**——**必然包含** M6 新增的
  分槽 key `scoreboard:matches:v1`（M6 為硬前置，該 key MUST 納入；
  範圍決策與理由見 design Decision 5）。
- **錯誤處理**（§11）：匯入檔案格式錯誤、LocalStorage 不可用、寫入超出配額三種情況皆
  SHALL NOT 拋出例外中斷操作，一律回傳可判讀的繁體中文訊息並說明可採取的修正方式。

### 不在本次範圍

明確排除相鄰 milestone 的內容，避免並行 worktree 重疊：

- **JPG 匯出（9.4）與 PDF 列印（9.5）屬 M9**，本段不產生任何圖片或列印流程，也不新增
  `html2canvas` 之類的相依。
- **歷史頁與五個時間區間（第 8 節、8.1）屬 M7**。本段只**讀取**歷史資料轉成 CSV，
  SHALL NOT 實作任何區間篩選；CSV 匯出的範圍是「全部歷史」而非「目前篩選結果」。
- **歷史紀錄的寫入（8.2）屬 M4**。本段只消費 M4 定案的欄位 schema，不新增、不改欄位。
- **回合狀態機、`targetScore` 與比分送出（第 6 節）屬 M4／M6**，本段不觸碰。
- **對戰舞台視覺（第 7 節）與 navbar 的 matchmaker 入口屬 M5**，本段不 MODIFY
  `site-navbar` 或 `match-stage` 的任何 requirement。
- **「重置名單」（4.1.5）屬 M1 的 `player-roster`**，本段 SHALL NOT 修改該 requirement——
  它與「清除本機資料」是 §10 表格裡不同的兩列，兩者的確認文案、清除範圍與入口位置都不同。
- **線上帳號與雲端同步（第 14 節）**不在本版任何 milestone。

## Capabilities

### New Capabilities

- `data-transfer`：匹克球對戰分配機的資料可攜層。定義 JSON 完整備份的匯出與匯入（含結構
  驗證與整份原子性）、歷史賽果的 CSV 匯出、參賽者名單的 CSV 匯入（含預覽、附加寫入與逐列
  錯誤定位）、清除本機資料的確認流程與列舉清除範圍，以及檔案格式錯誤與 LocalStorage
  不可用／超出配額時的錯誤處理。

### Modified Capabilities

（無）本段對既有 capability 全為**唯讀取用**：

- `player-roster`：重用 `Player`／`PlayerSchema`（`lib/matchmaker/types.ts`）與
  `addPlayer`／`nextAutoGradient`（`lib/matchmaker/roster.ts`），不改其任何 requirement。
  「重置名單」requirement 完全不動。
- `match-allocation`：重用重複配對簽章的持久化表示法（字串陣列），不改其任何 requirement。
- `round-lifecycle`／`match-history`（M4）：重用 `RoundSchema`、`MatchHistoryEntrySchema`
  與 `storage-keys.ts` 的三個 key 常數與 `hasLocalStorage()`，不改其任何 requirement。
- `pickleball-guide-page`：**不動**。本段不新增 `hooks/` 下的檔案，因此不觸碰 hooks
  歸屬清單 requirement——M4 已為 `useRoundStore` MODIFY 過它，並自行記錄了並行 worktree
  互相覆寫該清單的風險（M4 design Decision 9）；本段直接避開此風險。
- `site-navbar`、`scoreboard`：不動。清除本機資料會移除 `scoreboard:current:v1`，
  但那是**資料層的清除行為**，不改變 `scoreboard` capability 的任何 requirement。

## Impact

- **新增（純函式，必 TDD）**：`nextjs-pickball/lib/matchmaker/` 下的
  `transfer-types.ts`、`backup.ts`、`csv.ts`、`history-csv.ts`、`roster-csv.ts`、
  `transfer-storage.ts` 與各自的 `*.test.ts`
- **新增（例外層，E2E 驗收）**：`nextjs-pickball/app/matchmaker/data/page.tsx` 與
  `nextjs-pickball/components/matchmaker/` 下的四個區塊元件、一個確認對話框，
  以及 `nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`
- **修改（既有生產程式碼，必 TDD）**：`nextjs-pickball/lib/matchmaker/section-nav.ts` 與
  `nextjs-pickball/lib/matchmaker/section-nav.test.ts`。資料頁的導覽入口不是新檔就能達成——
  matchmaker 分頁清單與文案的**單一來源**是 `section-nav.ts`（渲染層
  `components/matchmaker/MatchmakerTabs.tsx` 只讀它），因此 `MATCHMAKER_SECTION_HREFS`
  （第 13 行）與 `MATCHMAKER_SECTION_LABELS`（第 15～21 行）各需加一筆資料頁路徑
  （標籤「資料」）；`section-nav.test.ts` 第 31～36 行的 `toEqual` regression guard
  釘死「分頁清單依序為對戰與參賽者兩筆」，會轉紅，MUST 一併更新。
  `section-nav.ts` 屬 `lib/**`，依專案規則是**必 TDD** 的行為邏輯，非例外層。
  **M7（歷史頁）也會改同兩處**——兩個 change 合併時會在同一個常數陣列與同一支測試上衝突，
  解法是保留雙方的分頁（順序：對戰／參賽者／歷史／資料）
- **重用（唯讀）**：`lib/matchmaker/types.ts`（`PlayerSchema`）、`roster.ts`
  （`addPlayer`／`nextAutoGradient`）、`round-types.ts`（`RoundSchema`）、
  `history.ts`（`MatchHistoryEntrySchema`）、`storage-keys.ts`（三個 key 常數與
  `hasLocalStorage()`）、`lib/scoreboard/**`（計分板的**全部** key 常數：`storage.ts` 的
  獨立槽 key，以及分槽模組 `match-slots.ts` 的 `scoreboard:matches:v1`——M6 為硬前置，
  該 key 必然存在且必納入）
- **不動**：`lib/matchmaker/storage.ts` 與 `storage-keys.ts`（M4 的產物，本段只 import
  不編輯，見 design Decision 2）、`hooks/**`、`app/matchmaker/players/page.tsx`
- **不新增 `hooks/` 下的檔案**——避免動到 `pickleball-guide-page` 的 hooks 歸屬清單
  requirement 而與並行 worktree 衝突（見 design Decision 6）
- **無新增 npm 套件**：CSV 的序列化與解析自行實作（見 design Decision 3），
  zod 為既有相依
- **無後端變更**：全部行為在瀏覽器完成，不呼叫 `/api/*`，`hono-pickball` 完全不受影響
