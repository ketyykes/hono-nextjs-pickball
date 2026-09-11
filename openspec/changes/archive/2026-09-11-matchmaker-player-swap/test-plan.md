> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 1、4、5、6）：
> - `unit`：`lib/matchmaker/round.ts` 的 `swapMatchPlayer`，Vitest + happy-dom，毫秒級、決定性
> - `integration`：`hooks/useRoundStore.ts` 的動作接線（Vitest）、
>   `components/matchmaker/CourtCard.tsx` 的換人操作（Vitest + `@testing-library/react`，
>   測 wiring：候選人是否列出、`disabled` 是否正確、callback 是否帶對參數、錯誤是否顯示）
> - `e2e`：Playwright，測真實鍵盤可達性與跨元件的可存取名稱區分度
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> 未列在下表但既有的 hook 層防線（例如「尚無目前回合」的型別安全防線，見
> `useRoundStore.ts` 對 `setTargetScore`／`submitScore` 的既有同類註解）比照既有慣例合併進
> 對應的成功／失敗 it 一併斷言，不另立獨立 Scenario——`round-lifecycle` spec 對
> `setTargetScore` 也未替這個防線列出獨立 Scenario，本 change 沿用同一慣例。

## round-lifecycle

### Requirement: 臨時換人（球員與休息名單互換）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 換人成功時以休息名單球員取代該場的在場球員 | 換人成功時替換該場次的在場球員 | 單打 `pending` 場次、`outPlayerId = A`、`inPlayerId = C`（休息名單中的 active 球員）→ `ok: true`，該隊 `playerIds` 以 C 取代 A，另一隊與其餘場次不變 | golden path：換人這個功能存在的唯一理由——沒有這條，後面每一條都不用測 | unit |
| 單打場次換人後重算該隊隊伍分數為換入球員的 rating | 單打場次換人後重算隊伍分數 | 換入球員 rating 為 `5.5` → 該隊 `rating` 更新為 `5.5` | golden path：`prd.md` 6.4 的隊伍分數必須與換人後的實際成員一致，否則畫面顯示的分數是假的 | unit |
| 雙打場次換人後重算該隊隊伍分數為兩位隊員 rating 總和 | 雙打場次換人後重算隊伍分數 | 留任隊員 rating `4.20`、換入球員 rating `3.10` → 該隊 `rating` 為 `roundRating(4.20 + 3.10)` | golden path：雙打與單打的加總邏輯不同（1 人 vs 2 人加總），只測單打會漏掉雙打分支 | unit |
| 雙打場次換人後以換人後四位球員重新判定組成標示 | 雙打場次換人後重算組成標示 | 換人前為混雙，換人後四位球員皆男性 → `doublesComposition` 更新為男雙 | golden path：`prd.md` 7.3 的組成標示若沿用舊值，畫面會顯示與實際成員矛盾的標示 | unit |
| 換人後換出者進入休息名單、換入者自休息名單移除 | 換人後休息名單互換 | 換人前 `restingPlayerIds` 含 C 不含 A → 換人後含 A 不含 C | golden path：換人若不更新休息名單，`RestingPanel` 會同時顯示一個「在場又休息」或「兩邊都沒有」的矛盾狀態 | unit |
| 換人不影響 restCount 與 seenSignatures | 換人不影響休息次數與重複比對基準 | 換人成功 → 回傳結果不含任何 `Player` patch；回傳回合的 `seenSignatures` 與換人前逐欄位相同 | regression guard：`resetIncompleteMatches`／`createRound` 都會動 `seenSignatures`，最容易的實作錯誤是誤用既有的基準重算邏輯 | unit |
| 雙打場次有隊友已從名單移除時組成標示維持換人前的值 | 有隊友已從名單移除時組成標示維持原值 | 另一隊某位既有隊友的 id 已不存在於 `players` → `doublesComposition` 維持換人前的值，呼叫不 throw | edge case：`removePlayer` 不禁止移除仍在進行中場次裡的人（round.ts 既有的 `resolveTeamPlayers` 已預告此情境一定會發生） | unit |
| matchId 不存在於該回合時拒絕換人 | 場次不存在時拒絕換人 | 傳入不存在的 `matchId` → `ok: false`，原回合物件參考不變 | edge case：呼叫端可能持有過期的 matchId（場次已被重排移除），與 `submitScore` 的 `MATCH_NOT_FOUND` 同類防線 | unit |
| 場次非 pending 時拒絕換人 | 場次非 pending 時拒絕換人 | 該場次 `status` 為 `"completed"` → `ok: false`，原回合不變 | golden path 的反例：已完成場次的結果不可回溯更動，這是本功能最核心的邊界 | unit |
| outPlayerId 不在該場次的任一隊伍時拒絕換人 | outPlayerId 不在該場時拒絕換人 | `outPlayerId` 不是該場任一隊伍 `playerIds` 的成員 → `ok: false`，原回合不變 | edge case：呼叫端傳入不屬於該場的球員 id（例如 UI 狀態過期） | unit |
| inPlayerId 不在該輪休息名單時拒絕換人 | inPlayerId 不在休息名單時拒絕換人 | `inPlayerId` 不存在於 `restingPlayerIds`（例如本來就在場上） | edge case：防止「換入一個已經在場上的人」造成同一人出現在兩個位置 | unit |
| inPlayerId 存在於休息名單但非 active 時拒絕換人 | inPlayerId 非 active 時拒絕換人 | `inPlayerId` 存在於 `restingPlayerIds`，但於 `players` 解析出 `isActive === false` → `ok: false` | edge case：休息名單成員可能在換人當下已被使用者於名單頁切換為暫停出場，這是兩個獨立時刻的資料 | unit |
| swapMatchPlayer 成功時套用新回合、失敗時 round 參考不變 | 換人成功時替換該場次的在場球員 | 呼叫 hook 的 `swapMatchPlayer(matchId, outId, inId)` → 成功時 `round` 更新為純函式回傳值；任一失敗條件下 `round` 參考不變（`dispatch` 未被呼叫） | wiring guard：比照既有 `resetIncompleteMatches`／`setTargetScore` 的 hook 層防線，驗證「呼叫純函式 → 判 ok → dispatch」這個既定模式被正確接上 | integration |
| 尚無目前回合時呼叫 swapMatchPlayer 回傳失敗且不 dispatch | 換人成功時替換該場次的在場球員 | `state.round === null` 時呼叫 hook 的 `swapMatchPlayer` → 回傳失敗結果，未呼叫 `dispatch` | wiring guard：與 `setTargetScore`／`submitScore` 同型的「不可達型別安全防線」，UI 只在 `round !== null` 時才會渲染出換人操作，但 hook 對外介面仍須防禦 | integration |

## match-stage

### Requirement: 場地區塊的換人操作

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| pending 且未開始計分的場次每位球員格皆提供換人操作 | pending 且未開始計分的場次每位球員格提供換人操作 | 一場 `pending`、無計分板槽的雙打場次 → 四位球員格皆各自查得一個換人操作 | golden path：操作沒掛上去的話，後面每一條都不用測 | integration |
| 選擇休息名單中的球員後呼叫 onSwapPlayer 並帶入場次 id、換出者與換入者 id | 選擇休息名單中的球員後委派換人 | 選取候選人 C → `onSwapPlayer` 恰被呼叫一次，參數為 `(match.id, outPlayerId, "C")` | golden path：驗證元件正確委派而非自行判斷或改寫回合，wiring 用假函式在毫秒內驗完 | integration |
| 已完成場次不顯示換人操作 | 已完成場次不顯示換人操作 | 場次 `status` 為 `"completed"` → 查無任何換人操作 | golden path 的反例：已完成場次的結果不可回溯更動，UI 層須與純函式層的拒絕條件一致 | integration |
| 已有計分板槽的場次不顯示換人操作 | 已在計分板開始計分的場次不顯示換人操作 | 場次 `status` 仍為 `"pending"`，但傳入非 `null` 的 `matchSlot` → 查無任何換人操作 | edge case：`status` 目前實際只會是 `pending`／`completed` 兩值，僅看 `status` 會讓已經開打的場次仍可換人，這是本功能最容易被忽略的分支 | integration |
| 休息名單無 active 球員可換時換人操作停用並顯示無可換之人 | 無可換之人時操作停用並顯示文字說明 | 該輪休息名單全數為非 active（或為空）→ 操作帶 `disabled` 屬性，且顯示可見文字「無可換之人」 | edge case：`prd.md` 12.3 要求 disabled 要解釋自己，這是換人操作最常見的停用狀態（賽事初期休息名單常常很小） | integration |
| 換人操作具備可存取名稱且可由鍵盤操作，並能區分不同球員 | 換人操作具備可存取名稱且可由鍵盤操作 | 一場雙打、`pending` 且未開始計分的場地區塊 → 以 Tab 依序走訪四個換人操作皆可取得 focus，且四者的可存取名稱互不相同（各含所屬球員姓名） | 無障礙 golden path：`prd.md` 12.3／12.5 要求可鍵盤操作且色彩不是唯一資訊來源，「互不相同」這個要求只有真實 DOM 與 Tab 走訪能驗（unit/integration 測不到 Tab 順序） | e2e |
| 換人被拒絕時顯示帶 role alert 的繁體中文錯誤訊息 | 換人被拒絕時顯示繁體中文錯誤訊息 | 傳入的 `swapError` 為一句繁體中文訊息 → 場地區塊出現 `role="alert"` 的元素，內容為該訊息且不含技術錯誤碼 | golden path＋無障礙：判定正確但沒顯示出來等於沒做，`role="alert"` 是讀屏即時播報的條件（沿用 `visual-export` capability 的既有模式） | integration |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form（繁體中文完整句子，逐字對應 delta spec 的「驗收」錨點）
