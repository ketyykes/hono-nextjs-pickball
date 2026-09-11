> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 4、Context 的既有分層）：
> - `unit`：`lib/scoreboard/`、`lib/matchmaker/scoreboard-binding.ts` 的純函式與 schema，
>   Vitest + happy-dom，毫秒級、決定性
> - `e2e`：Playwright，測真實 UI 渲染、真實 localStorage 讀寫與多 viewport 版面
>
> **`components/scoreboard/` 沿用既有的 E2E-only 驗收分層**（見 design Context）：
> `TeamPanel.tsx` 的渲染改動沒有對應的 `integration` tier 測試列，其驗收一律落在 e2e 列上，
> 這是刻意的分層結果，不是漏寫。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> 下表同時列出**既有且不受本 change 影響的 Scenario**（標「Why first: regression guard」）：
> 這些 Scenario 的既有測試因 `buildMatchSlotSeed` 新增必填第三參數而需要補一個呼叫參數，
> 但斷言本身不變，故仍在下表列出以滿足「每個 Scenario 皆有對應測試」的檢查，實際 tasks 不會
> 為它們另開新的 RED（見 tasks §1 的既有測試改動清單）。

## match-stage

### Requirement: 場地區塊的計分板入口

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」 | 進入計分板時建立 seed 並帶入該輪目標分數 | 既有斷言不變，呼叫改為 `buildMatchSlotSeed(round, match, players)` 三參數 | regression guard：既有測試，本 change 只需補第三參數，斷言邏輯不變 | unit |
| 「已有進度的場次再次進入時保留既有進度不覆蓋」 | 已有進度時再次進入不覆蓋 | 既有斷言不變，呼叫改為三參數 | regression guard：同上 | unit |
| 「第一隊對應 us、第二隊對應 them，來回轉換不顛倒」 | 隊伍對應為第一隊 us、第二隊 them | 既有斷言不變，不受本 change 影響（不呼叫 `buildMatchSlotSeed`） | regression guard：`mapTeamScores` 未變動 | unit |
| 「已完成場次不顯示進入計分板入口」 | 已完成場次不提供計分板入口 | 既有斷言不變 | regression guard：E2E 既有測試，不受本 change 影響 | e2e |
| 「手動輸入比分的路徑仍可獨立完成一場」 | 手動輸入路徑不受影響 | 既有斷言不變 | regression guard：E2E 既有測試，不受本 change 影響 | e2e |
| 「seed 依對戰方式帶入對應人數的球員顯示資訊：單打 1 人、雙打 2 人」 | seed 依對戰方式帶入對應人數的球員顯示資訊 | 以單打與雙打各呼叫一次 `buildMatchSlotSeed` → 單打 `teamPlayers.us`／`teamPlayers.them` 各長度 1，雙打各長度 2，且每筆姓名依序對應 `match.teams[].playerIds` | golden path：`prd.md` 範圍外但為本 change 核心行為——人數算錯會讓雙打面板顯示錯誤球員數 | unit |
| 「球員顯示資訊的前景色等於 pickTextColor 的回傳值」 | 球員顯示資訊的前景色由 pickTextColor 決定 | 某位球員 `colorFrom`／`colorTo` 為相異 hex → seed 中該筆 `foreground` 等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值（不硬寫顏色字串） | golden path＋防重複實作：確保未來 `pickTextColor` 公式調整時本 change 自動跟進，不寫死第二套判斷 | unit |
| 「名單中找不到該球員時球員顯示資訊以替代文字呈現且不拋錯」 | 名單中找不到球員時以替代文字呈現 | 某隊 `playerIds` 含一個不存在於 `players` 的 id → 該筆為替代文字與中性色，該隊其餘球員與另一隊照常輸出，呼叫不 throw | edge case：M4 的回合只存 id，使用者可在回合中刪人——這是資料模型的必然，不是防禦性編程 | unit |

## scoreboard

### Requirement: 綁定場次的隊伍標示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 「由對戰頁進入時面板顯示球員姓名」 | 綁定模式兩隊面板顯示球員姓名色塊 | 種入名單並產生一輪雙打對戰後點擊「進入計分板」→ 兩隊面板各查得兩位球員姓名文字，且各自的色塊 `background` 含對應的 `colorFrom`／`colorTo` | golden path：本 change 唯一使用者可見的最終行為，是整條資料鏈（seed → schema → reducer → 元件）真的接上的唯一證據 | e2e |
| 「UNDO 與 RESET 後保留 teamPlayers，不退回 null」 | UNDO 與 RESET 保留 teamPlayers | `teamPlayers` 非 `null`、比賽進行中且 `history.length > 0` → dispatch UNDO 再 dispatch RESET，兩次結果的 `teamPlayers` 皆與原值相同 | edge case：與既有 `matchId`／`courtNumber`／`targetScore` 保留測試同構的失效路徑——UNDO／RESET 以「重建初始 state」實作，漏帶欄位會在使用者操作當下靜默清空 | unit |
| 「HYDRATE 原樣保留帶入的 teamPlayers」 | HYDRATE 保留 teamPlayers | 儲存值含非 `null` 的 `teamPlayers` → dispatch HYDRATE 後 state 的 `teamPlayers` 與儲存值相同 | edge case：HYDRATE 是重整後唯一的還原路徑，掉欄位等同每次重整都靜默清空球員顯示 | unit |
| 「綁定模式含球員姓名色塊時多 viewport 仍零捲動」 | 綁定模式含球員姓名色塊時多 viewport 仍零捲動 | 以雙打（每隊 2 筆姓名色塊，內容量最大）綁定場次開啟 `/scoreboard?match=<matchId>`，於 390x844、844x390、768x1024、1024x600 四個 viewport 下 → `scrollHeight <= clientHeight + 1`，且兩顆「贏這球+」與 Undo／重置按鈕的 boundingBox 完整落在 viewport 內 | edge case：加入可見內容存在壓縮既有零捲動安全餘量的風險（design Decision 5、Risks），此為唯一能自動化驗證的防線 | e2e |

### Requirement: localStorage 持久化

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 「write 後 read 可取回相同 state」 | 分數自動保存 | 既有斷言不變（整體物件比對，`teamPlayers` 隨 `createInitialState()` 的預設 `null` 自動納入比對） | regression guard：既有測試，schema／reducer 新增欄位後自動涵蓋 | unit |
| 「localStorage 持久化：reload 後分數保留」 | 頁面重整回復 | 既有斷言不變 | regression guard：E2E 既有測試，不受本 change 影響 | e2e |
| 「舊版資料缺 targetScore 時補為 11 且不清除 key」 | 舊版資料缺少 targetScore 時補預設值 | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「舊版資料缺 matchId 時補為 null 且不清除 key」 | 舊版資料缺少 matchId 時補為 null | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「舊版資料缺 teamPlayers 時補為 null 且不清除該筆」 | 舊版資料缺少 teamPlayers 時補為 null | `scoreboard:matches:v1` 內某條目為不含 `teamPlayers` 的合法舊資料 → 讀取後該條目 `teamPlayers` 為 `null`，該筆 SHALL NOT 被丟棄 | edge case：與 `matchId`／`targetScore`／`courtNumber` 同構的向後相容防線，缺此測試會讓「新增欄位造成既有分槽被誤判損壞」的迴歸無法被抓到 | unit |
| 「資料為非 JSON 時 read 回 null 並清 key，且 warn」／「資料 schema 不合法時 read 回 null 並清 key，且 warn」 | 損壞資料 fallback | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「寫入某場次的槽不影響其他場次與獨立槽」 | 多場地各自存槽互不覆蓋 | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「單筆損壞只丟該筆並回報 droppedCount，其餘場次保留」 | 分槽逐筆降級 | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「整份非 JSON 時清除分槽 key 且不動獨立槽」 | 整份分槽資料非 JSON 時清除整個 key | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |
| 「批次清除只移除指定場次且忽略不存在的 id」 | 批次清除指定場次的槽 | 既有斷言不變 | regression guard：既有測試，不受本 change 影響 | unit |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form (avoid `test_1`, `it_works`)
