# Test Plan: history-filter-retention

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（前端元件測試，Vitest＋happy-dom，`useRemoteHistory`／`useSession`／`useRosterStore` 以既有 module-level `vi.mock` 取代）；
> `e2e`（`tests/e2e/user-data/**`，只在 `user-data` project；需 `.dev.vars`）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **焦點斷言的共同要求**：按鍵前先取得被選取選項的 DOM 參照（例：`const option = screen.getByRole("radio", { name: "本週" })`），之後每個階段斷言 `document.activeElement` **與該參照為同一個物件**（`toBe(option)`），
> 而非只查「名為本週的 radio 有焦點」——要能區分「篩選器從未卸載」與「重建後碰巧聚焦同名選項」。鍵盤操作一律 `option.focus()` ＋ `user.keyboard("{Enter}")`（E2E 為 `locator.focus()` ＋ `page.keyboard.press("Enter")`），不用點擊。
>
> **E2E 攔截的共同要求**：`page.route` 依查詢字串判定區間（「今日」只帶 `from`；「本週」帶 `from` 與 `to`），**不依請求次數**（`next dev` 的 StrictMode 會在 mount 時送出兩個「今日」請求）；
> 判別方式：`new URL(route.request().url()).searchParams.has("to")` 為 false 即「今日」（週一時「本週」的 `from === to`，但 `to` 仍存在，判別可靠）。
> 暫停以 `Promise` resolver 實作、斷言載入中後立即放行，並以 `try／finally` 或測試結束前 `page.unrouteAll({ behavior: "ignoreErrors" })` 確保不留暫停中的請求；SHALL NOT 使用 `waitForTimeout`。
> **斷言順序**：session 載入中會先渲染本機元件（同樣有「今日」radio 與統計標題），所有 radio、標題、焦點的操作與斷言 MUST 排在 `[data-sync-status="load-failed"]` 可見之後。
>
> **mock 的共同要求**：阻斷狀態（`loading`／`load-failed`）的 `useRemoteHistory` 回傳值 MUST 與真實 hook 同形（`items: []`、`total: 0`、`droppedCount: 0`），只有「歷史頁保留篩選器」的 it 另以帶資料的回傳值驗證阻斷時不渲染紀錄與損毀提示。
> 使用 `mockImplementation` 的 it 須在自身範圍內 `mockReset`（檔案 `afterEach` 只做 `vi.clearAllMocks()`，不會重設 implementation），不得依賴隱含重設。

## match-history

### Requirement: 登入時歷史以雲端為準（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 載入中與載入失敗時保留區間篩選並只以提示取代紀錄區塊 | 雲端歷史：載入中與載入失敗時保留區間篩選 | `it.each(["loading","load-failed"])`；hook 回一筆紀錄、`total: 3`、`droppedCount: 2` → radiogroup「歷史區間」存在、五個 radio、「今日」`aria-checked="true"`；`role="status"` 文字＝固定文案；根元素 `data-sync-status`＝該狀態；`history-record-m1`、`empty-history`、`empty-history-range`、`role="alert"` 皆不存在 | golden path；現行阻斷分支無篩選器 → **真紅** | unit |
| 以鍵盤切換區間時焦點在載入中、載入完成與載入失敗後都留在被選取的區間選項 | 雲端歷史：切換區間時焦點留在篩選器 | 今日 `synced` 一筆 → 取「本週」參照、focus＋Enter；hook 依 `range` 回 `loading` → `activeElement` 為同一參照、`aria-checked="true"`；改回 `synced` 並 `rerender` → 仍為同一參照；取「本月」參照、focus＋Enter，hook 回 `load-failed` → `activeElement` 為「本月」同一參照 | 本 change 的核心保證；happy-dom 在節點移除時把焦點交回 `body`（前 change OQ9 實測）→ **真紅** | unit |
| 載入失敗後改選其他區間會以新區間重新載入並顯示紀錄 | 雲端歷史：載入失敗後改選其他區間可重新載入 | hook 對 `today` 回 `load-failed`、對 `thisWeek` 回 `synced`＋一筆紀錄 → 選「本週」後 `useRemoteHistory` 最後一次的 `range` 為 `thisWeek`；`history-record-<id>` 存在；`role="status"` 不存在；radiogroup 存在、「本週」選中 | 失敗時篩選器不存在、無法選取 → **真紅** | unit |
| （既有，授權刪除一行）syncStatus 為 %s 時以提示取代內容並標示 data-sync-status | 雲端歷史：載入中與載入失敗時保留區間篩選 | 刪除 `queryByRole("radiogroup")` 為 null 的那一行後，其餘斷言（status 文案、`data-sync-status`、無損毀提示、無紀錄卡片）原樣通過 | 與新行為矛盾的斷言；刪除後為 regression guard | unit |
| （既有）total 為 0 時顯示引導型空狀態，否則顯示區間空狀態；雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示；其餘 regression guard | 雲端歷史：兩種空狀態；損毀提示 | 原樣通過 | regression guard（`synced` 分支結構調整不得改變輸出） | unit |
| 雲端歷史載入失敗時歷史頁顯示錯誤提示（既有，授權改最後一行） | 雲端歷史：載入失敗時歷史頁顯示錯誤 | 全部歷史 GET 回 500 → 失敗文案可見、`[data-sync-status="load-failed"]` 可見、`radio「今日」` 可見且 `toBeChecked()` | 原斷言「篩選不存在」→ 改為存在，現行程式碼下 **真紅** | e2e |
| 雲端歷史載入失敗後切換區間重新載入成功且焦點留在篩選器 | 雲端歷史：載入失敗後切換區間重新載入成功且焦點不遺失 | 種兩位雲端參賽者、完成一場（今日）；攔截如檔頭 → 開歷史頁 → `load-failed` 可見、「今日」checked；focus「本週」＋Enter → `[data-sync-status="loading"]` 可見且「本週」`toBeFocused()` → 放行 → `synced` 可見、「本週」`toBeFocused()`、區間空狀態可見；focus「今日」＋Enter → `synced`、紀錄卡片 1 張、「今日」`toBeFocused()` | 端到端證據（真瀏覽器的焦點行為）；失敗時無篩選器 → **真紅** | e2e |
| （既有，後端）auth 停用且無 DB binding 時歷史端點回 404；未登入呼叫歷史端點回 401；B 看不到 A 的歷史且 total 為 0；每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變（及同 Scenario 另兩個守衛 it）；預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新；from 含、to 不含地篩選 played_at，total 仍為全部筆數；from、to 或 order 不合法時回 400；from 等於 to 時回 200、items 為空且 total 為全部筆數；不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除；data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗 | 雲端歷史：auth 停用…／未登入…／他人的歷史不可見／預期帳號缺少或不符…／預設由新到舊…／依 from 與 to 篩選…／不合法的查詢參數／from 等於 to…／損毀列被略過…／data 不是合法 JSON… | 原樣通過（本 change 不動後端） | regression guard；MODIFIED 帶入的既有 Scenario，C3 全套守住 | integration |
| （既有，核心與前端）rangeBounds 與 rangeOfTime 對任意時間判定一致；五個區間的 rangeBounds 首尾相接且兩端無界；rangeBounds 產生的每個區間界線皆通過 HistoryQuerySchema；HistoryQuerySchema 拒絕 from 大於 to 且 HistoryListResponseSchema 接受平局紀錄；歷史 API 包裝以正確的查詢字串呼叫 requestJson；依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入；range 快速切換時只採用最後一次請求的結果；GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求；userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史 | 雲端歷史：rangeBounds 與 rangeOfTime…／五個區間的界線首尾相接／rangeBounds 產生的界線皆為合法查詢／共用的歷史查詢與回應 schema／歷史 API 包裝的請求形狀／依區間載入雲端歷史／只採用最後一次請求的結果／載入失敗、401 與停用／換帳號時… | 原樣通過（本 change 不動核心、`lib/sync`、`useRemoteHistory`；C6 驗證零 diff） | regression guard；「`range` 改變重新載入」是本 change 失敗後重試的前提 | unit |
| （既有）登入時瀏覽歷史頁只發出 GET 且不改動本機歷史；登入後完成的對戰由雲端顯示在歷史頁且不寫入本機 | 對應既有 Scenario | 原樣通過 | regression guard（`switchThroughAllRanges` 以點擊切換五個區間，結構改動不得影響） | e2e |

## player-stats

### Requirement: 統計依區間篩選（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 歷史載入中與載入失敗時保留標題與區間篩選並只以提示取代排行榜 | 統計區間：歷史載入中與載入失敗時保留標題與區間篩選 | `it.each(["loading","load-failed"])`；名單 `synced` 一位、歷史該狀態且 `items: []`、`total: 0`（真實 hook 同形）→ heading「球員統計」存在、radiogroup「歷史區間」存在且「今日」選中；`role="status"`＝固定文案；根元素 `data-sync-status`＝該狀態；table 與 `empty-history` 不存在 | golden path；現行阻斷分支無標題與篩選器 → **真紅** | unit |
| 名單 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status（既有） | 統計區間：名單載入中或載入失敗時仍以提示取代整段內容 | 原樣通過（status 為名單文案、`data-sync-status` 為名單狀態、無 table、無 radiogroup） | regression guard——Decision 3 的界線；實作若把名單阻斷也併入保留分支會轉紅 | unit |
| 雲端名單載入失敗時對戰頁與統計頁以錯誤提示取代內容（既有） | 統計區間：名單載入中或載入失敗時仍以提示取代整段內容 | 原樣通過（統計頁標題 `toHaveCount(0)`、排行榜 `toHaveCount(0)`） | regression guard（E2E 層） | e2e |
| 以鍵盤切換區間時焦點在歷史載入中、載入完成與載入失敗後都留在被選取的區間選項 | 統計區間：切換區間時焦點留在篩選器 | 名單 `synced`；歷史今日 `synced`、`total: 5` → 「本週」參照 focus＋Enter → 歷史 `loading`（`items: []`、`total: 0`）時 `activeElement` 為同一參照 → `synced` 並 `rerender` 仍為同一參照 → 「本月」參照 focus＋Enter、歷史 `load-failed`（`total: 0`）→ `activeElement` 為「本月」同一參照 | 核心保證；`total: 0` 使「篩選器只看 `total`」的錯誤實作轉紅 → **真紅** | unit |
| 歷史載入失敗後改選其他區間會以新區間重新載入並顯示排行榜 | 統計區間：歷史載入失敗後改選其他區間可重新載入 | 名單 `synced` 一位（`p1`）；歷史對 `today` 回 `load-failed`、`total: 0`，對 `thisWeek` 回 `synced`、`total: 5`、`items` 含 `p1` 一場 → 選「本週」後最後一次 `range` 為 `thisWeek`；table「球員排行榜」存在、`player-stat-row-p1` 出場欄為 `1`；`role="status"` 不存在；「本週」選中 | 失敗時篩選器不存在 → **真紅** | unit |
| （既有，授權刪除一行）歷史 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status | 統計區間：歷史載入中與載入失敗時保留標題與區間篩選 | 刪除 `queryByRole("radiogroup")` 為 null 的那一行後其餘斷言原樣通過 | 與新行為矛盾的斷言；刪除後為 regression guard | unit |
| （既有）雲端 total 為 0 時顯示引導型空狀態，否則顯示排行榜；regression guard：total 為 0 時不顯示區間篩選；regression guard：名單 load-failed 而歷史 loading 時以名單狀態為準；其餘 | 統計空狀態：雲端 total 為 0…；Decision 3／4 的界線 | 原樣通過；其中「total 為 0 時不顯示區間篩選」守的是 Decision 4（`synced` 且 `total === 0` 不顯示） | regression guard | unit |
| 登入時統計頁歷史載入失敗後切換區間重新載入成功且焦點留在篩選器 | 統計區間：登入時歷史載入失敗後切換區間重新載入成功且焦點不遺失 | 種兩位、完成一場（今日）；攔截如檔頭 → 開統計頁 → `load-failed` 可見、標題可見、「今日」checked；focus「本週」＋Enter → `loading` 可見、「本週」`toBeFocused()` → 放行 → `synced`、「本週」`toBeFocused()`、排行榜可見；focus「今日」＋Enter → `synced`、兩列出場欄皆 `1`、「今日」`toBeFocused()` | 端到端證據 → **真紅** | e2e |
| （既有）切換區間後排行榜只反映該區間的歷史紀錄；登入時計時回合的平局在統計頁計為和局；登入時瀏覽統計頁只發出名單與歷史的讀取請求 | 對應既有 Scenario | 原樣通過 | regression guard（訪客 `player-stats.spec.ts` 與登入態既有 E2E） | e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋8（兩檔各新增一個 `it.each` 展開 2 筆＋2 個 it）；後端、核心與基線相同 |
| C4 | （建置） | `pnpm build`（雙鎖） | exit 0 |
| C5 | （E2E） | 依 project 分開跑（雙鎖）：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | user-data＝基線＋2，全 passed、0 skipped；五個 browser project 數量與基線相同且全 passed（skip 只限既有瀏覽器條件）；無因缺帳密 skip |
| C6 | （訪客零變更） | `git diff main --stat -- nextjs-pickball/components/matchmaker/HistoryView.tsx nextjs-pickball/components/matchmaker/LocalStatsContent.tsx nextjs-pickball/components/matchmaker/HistoryRangeFilter.tsx nextjs-pickball/components/sync nextjs-pickball/hooks nextjs-pickball/lib nextjs-pickball/app hono-pickball packages` | 輸出為空 |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate history-filter-retention --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列
- [x] 每個 Scenario（新增 9、改寫 1、MODIFIED 帶入的既有 Scenario 以「（既有）」列合併）至少一列
- [x] 每列皆有 Tier（unit | e2e）
- [x] 授權修改的既有測試只有三處（兩個 it 各刪一行、一個 E2E 改最後一行），皆標明原因
- [x] 訪客路徑零變更有指令驗收（C6）
