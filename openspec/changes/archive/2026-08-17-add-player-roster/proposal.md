## Why

`prd.md` 描述的「匹克球對戰分配機」在本 repo 為**零實作**——現有的 `/scoreboard` 是單場 side-out 計分板，與分配機是兩個不同的東西（PRD 頁首「實作範圍」已載明此區別）。

整份 PRD 一次做完不切實際，其中每一個後續階段——分配演算法（PRD 5）、對戰畫面（PRD 7）、評分更新（PRD 6.4）、歷史紀錄（PRD 8）、匯入匯出（PRD 9）——**都以「參賽者名單」為前置條件**：沒有參賽者就沒有候選池，沒有候選池就沒有對戰。

本次先交付這個地基。它同時是一個可獨立驗證、對使用者已有價值的垂直切片：球聚主持人可以在活動前把整團人建好、標好強度與顏色、把臨時不來的人切成暫停，資料在重整與關閉瀏覽器後仍在。

## What Changes

- 新增 capability `player-roster`，並新增路由 `/matchmaker/players`。
- 參賽者的新增、編輯、刪除；每位具備名稱、性別、雙色 Hex 漸層、強度分數（1.00～8.00）、出場狀態、建立時間。
- 快速帶入強度（新手 1.00／中階 3.00／高階 5.00），亦可手動輸入小數點後兩位。
- 出場狀態切換（出場中／暫停出場）。
- 文字顏色依背景亮度自動選深色或淺色，維持可讀性。
- LocalStorage 持久化（key `matchmaker:roster:v1`），JSON 解析失敗或 zod 驗證失敗時清除損壞資料並降級為空名單，比照 `lib/scoreboard/storage.ts` 既有模式。
- 首次開啟為空白名單，不得帶入任何假資料；空狀態提供「新增第一位參賽者」入口。
- 重置名單，附二次確認，確認後回到空白初始狀態、取消則不動任何資料。

**資料模型完整但部分欄位本次不寫入**：`累計休息次數` 與 `累計出場次數`（PRD 4.1）在本次一併納入 schema 並初始化為 0、隨名單持久化，但**累加邏輯屬於分配演算法與評分更新**，不在本次範圍。先納入 schema 是為了避免下一階段對 `matchmaker:roster:v1` 做破壞性遷移。

不在本次範圍：

- 分配演算法（PRD 5）、對戰畫面（PRD 7）、回合與比分（PRD 6）、評分更新（PRD 6.4）、歷史紀錄（PRD 8）。
- 匯入匯出 JSON／CSV／JPG／PDF（PRD 9.2～9.5）。本次只做 9.1 的參賽者部分。
- **全站導覽入口**。功能尚不完整（有名單但無法產生對戰），此時把 `/matchmaker/players` 放進 navbar 是半成品入口；導覽整合待對戰畫面完成後與 `site-navbar` 一併處理。本次以直接輸入網址驗收。
- **PRD 4.1.4 的「舊版示範種子資料一次性清除」與 PRD 13.1 對應驗收項不適用**——本 capability 為全新，`matchmaker:roster:v1` 在使用者瀏覽器中不存在既有資料，沒有清除對象。實作不應為此寫任何遷移程式碼。

## Capabilities

### New Capabilities

- `player-roster`: 參賽者名單的資料模型、CRUD、出場狀態、顏色標記、空白初始狀態、重置流程與 LocalStorage 持久化。

### Modified Capabilities

（無）

## Impact

**新增程式碼**（皆位於 `nextjs-pickball/`）：

| 檔案 | 內容 | TDD 歸屬 |
|---|---|---|
| `lib/matchmaker/types.ts` | zod schema：`Gender`、`Player`、`Roster`；強度分數範圍與 Hex 色碼驗證 | 行為邏輯，必 TDD |
| `lib/matchmaker/roster.ts` | 純函式 CRUD：`addPlayer`／`updatePlayer`／`removePlayer`／`togglePlayerActive`／`resetRoster` | 行為邏輯，必 TDD |
| `lib/matchmaker/colors.ts` | `pickTextColor`（依背景亮度選前景色）、`defaultGradient`（自動配色） | 行為邏輯，必 TDD |
| `lib/matchmaker/storage.ts` | `readRoster`／`writeRoster`／`clearRoster`，損壞資料清除並降級 | 行為邏輯，必 TDD |
| `hooks/useRosterStore.ts` | 名單狀態、hydration、寫回 LocalStorage | 行為邏輯，必 TDD |
| `app/matchmaker/players/page.tsx` | 路由入口 | 例外層（入口） |
| `components/matchmaker/PlayerList.tsx` | 名單列表 | 例外層（純呈現） |
| `components/matchmaker/PlayerForm.tsx` | 新增／編輯表單 | 例外層（純呈現） |
| `components/matchmaker/PlayerCard.tsx` | 單筆參賽者（漸層背景、狀態、分數） | 例外層（純呈現） |
| `components/matchmaker/EmptyRoster.tsx` | 空白狀態與入口 | 例外層（純呈現） |
| `components/matchmaker/ResetRosterDialog.tsx` | 重置二次確認（沿用 `components/ui/alert-dialog`） | 例外層（純呈現） |

**測試**：

- 新增 `lib/matchmaker/{types,roster,colors,storage}.test.ts` 與 `hooks/useRosterStore.test.tsx`。
- 新增 `tests/e2e/specs/player-roster.spec.ts`：空狀態 → 新增 → 重整後仍在 → 編輯 → 暫停 → 重置（確認與取消兩路徑）。

**使用者資料**：新增 LocalStorage key `matchmaker:roster:v1`。不讀取、不修改、不刪除既有的 `scoreboard:current:v1`。

**無影響**：後端 `hono-pickball`、部署設定、既有 capability（`scoreboard`、`quiz`、`tour-experience`、`pickleball-guide-page`、`site-navbar`、`api-connectivity`、`dev-workflow`）。
