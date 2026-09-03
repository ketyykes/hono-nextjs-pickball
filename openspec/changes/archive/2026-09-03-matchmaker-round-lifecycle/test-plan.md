# Test Plan — matchmaker-round-lifecycle（M4）

> **這是 RED 階段的承諾文件**：以下每一列都是「先寫、先看到紅燈」的測試，不描述實作邏輯。
> `Test name` 欄與 delta spec 的 `**驗收**` 錨點 **it 名稱逐字相同**，否則 verify 階段無法機械核對。
>
> **Tier 判準**（依 `nextjs-pickball/CLAUDE.md` 的 TDD 節）：
> - `unit`——`lib/matchmaker/**` 下的純函式與 zod schema，happy-dom 內直接呼叫。
> - `integration`——`hooks/useRoundStore.test.tsx`：同時跨 hook、`round-storage.ts` 與真實
>   `localStorage`，驗的是三者接起來的行為而非單一函式。
> - `e2e`——Playwright。本 change **不新增任何 e2e**（無 UI，見 proposal 的「不在本次範圍」）；
>   下方僅有的兩列 e2e 是 `player-roster` MODIFIED requirement 既有的 test，列出是為了滿足
>   「每個 Scenario 至少一個 test」的覆蓋要求，本 change 不改動它們。
>
> **紅燈誠實標註**：`player-roster` 與 `pickleball-guide-page` 兩個 MODIFIED capability 底下，
> 凡標記 `既有測試` 者皆為 **regression guard 而非 TDD 紅燈**——被守護的行為在本 change 之前
> 已經成立。依 root `CLAUDE.md`「紅燈要是真的」，此處誠實標註，**不以 mutation check
> （改斷言看紅再改回）偽造紅燈**。這些列的「Why first」記錄的是**為何值得列**，而非「為何必須先寫」。
> 唯二例外是 `重置只移除列舉的 key，不影響 scoreboard 資料`（本 change 擴大斷言範圍，擴大後
> 在實作前必定紅）與 `hooks 目錄下每支 hook 都能在規格的歸屬清單中找到`（建立
> `useRoundStore.ts` 的當下必定紅），兩者是真紅燈。

## round-lifecycle

### Requirement: 回合資料模型

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 合法回合通過驗證，roundNumber 非正整數時失敗 | 合法回合通過驗證 | 完整合法欄位 → `safeParse().success === true`；`roundNumber: 0` 或 `-1` → `success === false` | golden path：整個 change 的資料契約，schema 錯了後面全錯 | unit |
| 場次狀態僅接受 pending、scoring、completed | 場次狀態僅接受三個列舉值 | 三個列舉值 → 通過；`"done"` → 驗證失敗 | 邊界：`scoring` 是為 M6 預留的值，先釘住列舉才不會在 M6 被當成新增而做破壞性遷移 | unit |
| completed 場次缺少比分、勝方或完成時間時驗證失敗 | 完成場次必須帶齊比分、勝方與完成時間 | `status: "completed"` 且 `scores`／`winner`／`completedAt` 任一為 `null` → 失敗；`status: "pending"` 且三者皆 `null` → 通過 | 邊界：跨欄位一致性，寫成 refinement 才擋得住「標成完成卻沒有比分」的損壞資料 | unit |

### Requirement: 目標分數為每輪設定

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| targetScore 僅接受 11、15、21 且不帶預設值 | 目標分數僅接受 11、15、21 | `11`／`15`／`21` → 通過；`9`、`13`、`undefined` → 失敗（`undefined` MUST NOT 被補成 11） | 邊界：`.default()` 是最容易被順手加上的一行，先寫測試把「不帶 default」釘死 | unit |
| 目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致 | 目標分數選項與計分板值域一致 | 本 capability 的選項常數集合 === `lib/scoreboard/types.ts` 的 `TargetScoreSchema` 可接受值集合 | regression guard（跨 capability 漂移）：M6 會把回合的目標分數直接交給計分板，值域分歧的失敗是靜默的 | unit |
| 產生本輪時決定目標分數，未指定時採預設 11 | 產生本輪時決定目標分數 | `createRound({ targetScore: 15 })` → `round.targetScore === 15`；未指定 → `11` | golden path：`prd.md` 6.3.1 明訂「於產生本輪對戰時決定」 | unit |
| 所有場次皆為 pending 時可改目標分數，已有場次離開 pending 時拒絕 | 尚未開始計分時可更改，已開始後拒絕 | 全 `pending` → 回傳 `targetScore: 21` 的新回合、其餘欄位不變；有 `scoring` 或 `completed` → `ok: false` 且原回合未被修改 | 邊界：這是本 change 對「鎖定」語意的定案，M6 會在其上擴充 | unit |

### Requirement: 產生本輪對戰

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 首輪回合編號為 1，基準為空且所有場次為 pending | 首輪以空基準產生且回合編號為 1 | 無目前回合 → `roundNumber === 1`、`seenSignatures` 三組皆為 `[]`、每場 `status === "pending"` 且 `scores`／`winner`／`completedAt` 皆為 `null` | golden path：最常走的路徑，也是空狀態的第一步 | unit |
| 產生新一輪時回合編號加 1 並取代目前回合 | 產生新一輪時編號加 1 並取代目前回合 | `previousRound.roundNumber === 3` → 新回合 `roundNumber === 4`，回傳的目前回合為新回合 | golden path：回合是否會前進 | unit |
| 上一輪已完成與進行中的場次納入重複比對基準 | 上一輪的已完成與進行中場次納入基準 | 上一輪含 1 場 `completed` + 1 場 `scoring` → 兩場的隊友／對手／完整比賽簽章全部出現在新回合 `seenSignatures` | golden path：`prd.md` 6.1 的核心句 | unit |
| 上一輪未開始的場次不納入基準也不寫入歷史 | 上一輪未開始的場次不納入基準 | 上一輪含 1 場 `pending` → 其簽章不在新回合 `seenSignatures`，且歷史筆數不變 | 邊界：容易被實作成「掃全部場次」，而那會用沒發生過的對戰限制配對空間 | unit |
| 重複比對基準只取上一輪，不累積更早的回合 | 基準只取上一輪不累積更早的回合 | 連續三輪、第 1 輪有一場 `completed` → 第 3 輪的 `seenSignatures` 不含第 1 輪那場的簽章 | 邊界：累積式實作在前兩輪看起來完全正確，要到第三輪才顯現（design Decision 2） | unit |
| 簽章基準以字串陣列保存，呼叫 allocateRound 前轉為 Set | 簽章基準以字串陣列保存並在分配前轉為 Set | `round.seenSignatures` 三欄皆為 `string[]` 且 `JSON.parse(JSON.stringify(x))` 內容不變；傳給 `allocateRound` 的三欄皆為 `Set` | 邊界：`Set` 直接 `JSON.stringify` 會變成 `{}`，這條轉換是 M2 明文交給本段的持久化邊界 | unit |

### Requirement: 休息次數於產生新一輪時結算

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 產生新一輪時上一輪休息者的 restCount 加 1，出場者不變 | 產生新一輪時上一輪休息者的休息次數加 1 | 上一輪休息者 C、D（`restCount: 2`）→ patch 後兩人為 `3`；上一輪出場者的 `restCount` 不變 | golden path：整個公平分配承諾的最後一塊，`restCount` 不前進則 M2 的排序永遠對著一組 0 | unit |
| 產生首輪時不結算任何人的 restCount | 產生首輪時不結算任何人 | 無上一輪 → 回傳的 `restSettlements` 為空陣列 | 邊界：off-by-one 的典型位置（誤把本輪休息名單當成要結算的對象） | unit |
| 連續產生多輪時同一輪的休息名單只被結算一次 | 同一輪的休息名單只結算一次 | 第 1 輪休息者 C，連續產生第 2、3 輪 → C 因第 1 輪增加的次數恰為 1 | 邊界：重複累加是靜默錯誤，只會在多輪之後表現為「某人一直不上場」 | unit |
| 暫停出場者不因本輪休息而累加 restCount | 暫停出場者不因本輪休息而累加 | 名單含 `isActive: false` 成員 → 該員不在 `restSettlements` 中 | 邊界：`prd.md` 4.1.2 明文；累加了會讓復出者挾帶不合理優先權 | unit |
| 重排未完成場次不觸發休息結算 | 重排未完成場次不觸發休息結算 | 重排回傳結果不含任何 `restCount` patch | 邊界：「本輪結束」的定義若被實作成「名單變動時」就會誤觸 | unit |

### Requirement: 重設與重排未完成場次

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 沒有回合或沒有 pending 場次時重排被拒絕 | 沒有回合或沒有未開始場次時不可重排 | 無回合 → `ok: false` 且訊息為繁體中文；所有場次皆 `completed` → 同樣 `ok: false`；兩者皆不拋例外 | 邊界：`prd.md` 6.2 的前置條件，UI 靠它決定按鈕是否顯示 | unit |
| 重排保留已完成場次的比分、勝方與賽前賽後分數 | 重排保留已完成場次的比分與評分結果 | 1 場 `completed`（11:7）+ 1 場 `pending` → 重排後該 `completed` 場的 `scores`／`winner`／`completedAt`／`playerRatings` 完全相等 | golden path：`prd.md` 6.2 的核心承諾，弄丟即等於使用者的比分白填 | unit |
| 重排的候選池含休息名單成員，已比賽者不再納入 | 重排的候選池含休息名單成員但排除已比賽者 | `completed`(A,B) + `pending`(C,D) + 休息 E（`restCount` 最高）→ 重排後場次不含 A、B，且 E 出場 | golden path：design Decision 5 的核心，只在 pending 內洗牌會使重排無效 | unit |
| 重排沿用原回合與前一輪的重複比對基準 | 重排沿用原回合與前一輪的重複比對基準 | 回合 `seenSignatures` 含前一輪組合 → 重排時傳入 `allocateRound` 的基準包含那些簽章 | 邊界：從空基準重排會把上一輪剛打過的組合又排一次 | unit |
| 重排把被丟棄的原始組合併入本回合基準 | 被丟棄的原始組合併入本回合基準 | `pending` 組合 X → 重排後 `round.seenSignatures` 含 X 的簽章 | 邊界：少了這步，輸入沒變時重排會產生一模一樣的結果，使用者判定功能壞掉 | unit |
| 重排不改變回合編號、建立時間、對戰方式與目標分數 | 重排不改變回合編號與該輪設定 | 第 2 輪、雙打、目標分數 15 → 重排後四個欄位皆相等 | regression guard：重排若走「建立新回合」的同一條路徑就會把這四個欄位一起重設 | unit |

### Requirement: 比分驗證

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 比分欄位空白時拒絕送出並回傳繁體中文訊息 | 比分欄位空白 | `""` 或 `"   "` → `ok: false`，`message` 為繁體中文且說明兩隊比分皆須填寫 | golden path：`prd.md` 6.3.2 第一條，也是最常發生的使用者錯誤 | unit |
| 比分非有效數字時拒絕送出 | 比分非有效數字 | `"abc"`、`"1a"`、`"NaN"` → 皆 `ok: false` | 邊界：`Number("")` 為 `0`、`parseInt("1a")` 為 `1`，兩個內建函式都會靜默放行 | unit |
| 比分為負數時拒絕送出，0 本身可接受 | 比分為負數 | `"-1"` → `ok: false`；`"0"` vs `"11"` → `ok: true` | 邊界：「非負」的兩端都要釘，只擋負數會連 0:11 這種合法比分一起擋掉 | unit |
| 兩隊比分相同時拒絕送出 | 兩隊比分相同 | `11` vs `11` → `ok: false`，訊息說明平局無法判定勝方 | golden path：`prd.md` 6.3.2 明列，且平局會讓勝方判定無解 | unit |
| 已完成場次再次送出時被拒絕且既有結果不變 | 場次已完成 | `status: "completed"` 的場次再次送出 → `ok: false`，該場 `scores`／`playerRatings` 不變 | golden path：`prd.md` 6.5 明列「已完成場次不得再次送出相同比分」 | unit |

### Requirement: 比分送出的完成流程

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 送出合法比分後場次標記為完成並記錄比分、勝方與完成時間 | 送出合法比分後場次標記為完成 | `pending` 單打送 `11` vs `7` → `status === "completed"`、`scores === { teamA: 11, teamB: 7 }`、`winner === "teamA"`、`completedAt` 為注入值 | golden path：整條 pipeline 的骨幹 | unit |
| 完成場次的 playerRatings 逐一對應該場每位球員的賽前與賽後分數 | 賽前與賽後分數逐一對應該場每位球員 | 雙打 → `playerRatings` 恰 4 筆、`playerId` 集合等於該場球員；單打 → 恰 2 筆；每筆 `before` 為送出當下 rating、`after` 為評分後 rating | golden path：`prd.md` 8.2 與 9.3.1 都要求「各員」賽前賽後分數，只存隊伍值無法還原 | unit |
| 完成場次後評分結果寫回名單，未參賽者不受影響 | 評分結果寫回名單 | 該場球員的 patch 帶新 rating；未參與者不出現在 patch 中 | golden path：評分若不寫回名單，下一輪的強度配對就永遠用舊分數 | unit |
| 完成場次後該場球員 gamesPlayed 各加 1，其餘人不變 | 該場球員的累計出場次數加 1 | 雙打 4 人 patch 的 `gamesPlayed` 各 +1；休息者與其他場次球員不在 patch 中 | golden path：`gamesPlayed` 是 K 遞減的輸入（`prd.md` 6.4.3），不累加則評分幅度永遠停在新手值 | unit |
| 評分觸頂時賽後分數停在 8.00 並回報已達上限 | 觸頂或觸底時停在邊界並回報 | rating 已達 `8.00` 者獲勝 → `after === 8.00`，且回傳的 `boundaryHits` 含該員已達上限 | 邊界：`prd.md` 6.4.6 明訂「不得靜默卡住讓使用者誤以為功能故障」 | unit |
| 送出失敗時回合、名單與歷史皆不變 | 驗證失敗時回合、名單與歷史皆不變 | 以平局送出 → 回合物件、名單 patch、歷史筆數三者與送出前完全相同 | 邊界：原子性。部分更新沒有自我修復路徑，使用者只會看到分數對不上 | unit |

### Requirement: 回合與歷史的持久化與損壞降級

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 重新掛載後還原目前回合與歷史 | 重整後還原目前回合與歷史 | 產生回合並完成一場 → 重新掛載 hook 後回合內容與歷史筆數相同 | golden path：`prd.md` 9.1 與 13.5「LocalStorage 可在重新整理後還原資料」 | integration |
| 回合 JSON 解析失敗時清除 key 並回傳無回合 | 回合資料 JSON 解析失敗時清除並回傳無回合 | key 內容為 `"{ 不是合法 JSON"` → `readRound()` 回無回合，且 key 已被移除 | 邊界：`prd.md` 第 11 節「LocalStorage 內容損壞」 | unit |
| 回合外層結構或 version 不符時整份清除 | 回合外層結構或版本不符時整份清除 | `{ version: 2, round: {...} }` → 回無回合且 key 移除；`[1,2,3]` → 同 | 邊界：回合是單一物件，無筆可救，必須與歷史的逐筆降級走不同分支 | unit |
| 歷史單筆損壞時保留其餘 2 筆並回報 droppedCount 為 1 | 歷史單筆損壞時保留其餘紀錄 | 3 筆中 1 筆缺 `winner` → 回 2 筆、`droppedCount === 1`、key 未被清除；回寫後再讀 MUST 同時斷言筆數與內容仍為那 2 筆 | 邊界：只斷言 `droppedCount === 0` 無法區分「回寫正確」與「回寫時把歷史整個寫丟」 | unit |
| 歷史 version 不符時整份清除，不走逐筆降級 | 歷史外層版本不符時整份清除 | `{ version: 2, entries: [三筆合法] }` → 空歷史、`droppedCount === 0`、key 已移除 | 邊界：版本不符屬結構層級損壞，即使每筆都合法也不得保留 | unit |
| localStorage 不可用或寫入超出配額時不拋出例外 | LocalStorage 不可用或寫入超出配額時不拋出例外 | `localStorage` 存取拋例外、`setItem` 拋 `QuotaExceededError` → 四個讀寫函式皆不拋出，讀取回空結果 | 邊界：`prd.md` 第 11 節兩項；SSR 與私密模式下會實際發生 | unit |
| 三個 LocalStorage key 名稱由 storage-keys 單一來源匯出 | 三個 LocalStorage key 名稱由單一來源匯出 | 三個常數值分別為 `matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1`，且皆自 `storage-keys.ts` 匯出 | regression guard：key 名稱多一處來源就多一處漏改，而漏改的失敗（重置漏清）是沉默的 | unit |

### Requirement: 無參賽者與人數不足時的邊界行為

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 名單為空時不建立回合並提示新增參賽者 | 名單為空時不建立回合 | `players: []` → `ok: false`，訊息提示先新增參賽者，不拋例外 | 邊界：`prd.md` 第 11 節「重置後沒有任何參賽者」 | unit |
| 單打不足 2 人或雙打不足 4 人時不建立回合 | 可用人數不足以組成任何場次時不建立回合 | 單打可用 1 人 → `ok: false` 且未建立空回合；雙打可用 3 人 → 同 | 邊界：M2 的 `allocateRound` 在此情況會回傳空 `matches` 而非拋錯，本層必須自己判斷 | unit |
| 全員暫停出場時的訊息與名單為空時不同 | 全員暫停出場時給出專屬訊息 | 6 人全 `isActive: false` → `ok: false` 且 `message` 與名單為空時**不相等** | 邊界：兩者修正方式不同，共用訊息會叫使用者對著滿滿一頁參賽者去「新增參賽者」 | unit |
| 產生失敗時既有回合與 restCount 皆不受影響 | 產生失敗時既有的目前回合不受影響 | 已有第 2 輪，全員暫停後產生 → 目前回合仍為原第 2 輪且內容相等，`restSettlements` 為空 | 邊界：失敗路徑上若先結算再失敗，休息次數就白加了一輪 | unit |
| 場地數不合法時接住例外並轉為失敗結果 | 場地數不合法時轉為可判讀的失敗結果 | `courtCount` 為 `0`／`9`／`1.5` → `ok: false`，不讓 `allocateRound` 的 `Error` 穿透 | 邊界：M2 明訂拋錯而非夾值，本層是唯一呼叫端，不接住就會炸到 UI | unit |

## match-history

### Requirement: 歷史紀錄欄位 schema

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 合法歷史紀錄通過驗證 | 合法歷史紀錄通過驗證 | 完整合法欄位 → `safeParse().success === true` | golden path：M7 與 M8 共用同一份 schema，先釘住形狀 | unit |
| 缺少必要欄位或欄位格式不合法時驗證失敗 | 缺少必要欄位時驗證失敗 | 缺 `winner`／`playedAt`／`scoreA` → 失敗；`playedAt` 非 ISO 8601、`scoreA` 為負數 → 失敗 | 邊界：歷史會經同一 schema 從 LocalStorage 回讀，不驗格式等於讓損壞資料靜默通過 | unit |
| 歷史紀錄的每位球員各帶賽前與賽後分數 | 每位球員各帶賽前與賽後分數 | 雙打紀錄兩隊合計 4 位球員、每位皆有 `ratingBefore` 與 `ratingAfter`；單打合計 2 位 | golden path：`prd.md` 8.2 與 9.3.1 的核心欄位 | unit |
| 單打不得帶雙打組成標示，雙打必須帶 | 單打不帶雙打組成標示 | `format: "singles"` 帶 `doublesComposition` → 失敗；`format: "doubles"` 未帶 → 失敗 | 邊界：與 `match-allocation` 的 `Match` 同一約束，兩處形狀分歧會讓 M8 的 CSV 匯出出現空欄 | unit |
| 球員自名單刪除後歷史紀錄的姓名與分數仍完整 | 球員自名單刪除後歷史仍完整 | 寫入一筆後把該球員自名單移除 → 該筆的 `name`／`scoreA`／`ratingBefore`／`ratingAfter` 完全不變 | golden path：design Decision 3 的核心，用 id 回查的實作在此必紅 | unit |

### Requirement: 完成場次時寫入一筆歷史

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| appendHistoryEntry 回傳新陣列且只增加一筆 | 完成一場後歷史增加恰好一筆 | 2 筆 → 3 筆，新增筆的 `matchId`／`courtNumber`／`scoreA`／`scoreB`／`winner` 與該場一致，且原陣列未被就地修改 | golden path：`prd.md` 8.2 的寫入時機 | unit |
| 已完成場次重複送出時歷史筆數不變 | 同一場次重複送出不會產生第二筆 | 對 `completed` 場次再送 → `ok: false` 且歷史筆數相等 | 邊界：重複紀錄會讓 M8 的 CSV 統計失真且無從發現 | unit |
| 重排未完成場次不刪除也不修改既有歷史 | 重排未完成場次不影響既有歷史 | 1 場已完成並寫入歷史 → 重排後歷史筆數與內容完全相等 | 邊界：重排若被實作成「重建整個回合」很容易連帶把歷史一起重算 | unit |
| 多筆歷史依追加順序保存，不重新排序 | 多場完成時依完成順序追加 | 依序完成 A、C、B → 歷史 `matchId` 順序為 A、C、B | 邊界：在儲存層排序會讓同秒完成的兩場順序不穩定，也讓 M7 失去唯一可靠的並列基準 | unit |

## player-roster（MODIFIED）

### Requirement: 參賽者資料模型

本 Requirement 的改動**只有散文**：把 `restCount`／`gamesPlayed` 的累加歸屬由「分配演算法與評分更新」更正為 `round-lifecycle`。schema 與六個 Scenario 的行為完全未變，因此**不新增測試**，以既有測試作為回歸守衛。

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 合法欄位通過驗證，restCount 與 gamesPlayed 未提供時補 0 | 合法參賽者通過驗證 | 既有測試：完整合法欄位 → 通過，兩個累計欄位補 0 | 既有測試（regression guard）：本 change 更正的正是這兩個欄位的歸屬敘述，須確認 schema 本身未被順手改動 | unit |
| rating 超出 1.00～8.00 時驗證失敗 | 強度分數超出範圍 | 既有測試：`0.99`／`8.01` → 失敗；`1`／`8` → 通過 | 既有測試（regression guard）：本 change 會由送出流程寫回 rating，須確認寫回值仍受同一範圍約束 | unit |
| createdAt 非 ISO 8601 時驗證失敗 | 建立時間非 ISO 8601 | 既有測試：`"not-a-date"` → 失敗 | 既有測試（regression guard） | unit |
| RosterSchema 的 version 僅接受 1 | 外層版本號不符 | 既有測試：`version: 2` → 失敗 | 既有測試（regression guard）：回合與歷史的外層 schema 沿用同一模式，此列同時是新 schema 的參照樣板 | unit |
| name 僅含空白時驗證失敗 | 名稱僅有空白 | 既有測試：`"   "` → 失敗 | 既有測試（regression guard） | unit |
| Hex 色碼格式不合法時驗證失敗 | Hex 色碼格式不合法 | 既有測試：`"0E6B63"`／`"#GGG"` → 失敗 | 既有測試（regression guard） | unit |

### Requirement: 重置名單與二次確認

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| 重置只移除列舉的 key，不影響 scoreboard 資料 | 重置只清除列舉範圍內的 key | **擴大斷言**：四個 key 同時存在 → `resetMatchmakerData()` 後 `matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1` 皆為 `null`，`scoreboard:current:v1` 仍在 | **真紅燈**：`RESET_KEYS` 目前只含 roster，擴大後的斷言在實作前必定失敗 | unit |
| 確認重置後名單清空且持久化資料被移除 | 確認重置後名單清空 | 既有 e2e：確認後名單為空且 `matchmaker:roster:v1` 被移除 | 既有測試（regression guard）：本 change 擴大重置範圍，須確認既有 UI 流程未被破壞 | e2e |
| 取消重置後名單維持不變 | 取消重置不動任何資料 | 既有 e2e：取消後名單內容不變 | 既有測試（regression guard） | e2e |

## pickleball-guide-page（MODIFIED）

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

本 Requirement 的改動只有歸屬清單新增 `` `useRoundStore` → round-lifecycle `` 一項，**不新增測試**——既有的守衛測試就是驗收機制本身。

| Test name | Scenario | Assertion | Why first | Tier |
|---|---|---|---|---|
| hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | hooks 目錄的每支 hook 都在歸屬清單內 | 建立 `hooks/useRoundStore.ts` 後，`missing` MUST 為 `[]` | **真紅燈**：建立 hook 檔的當下此測試必定紅，直到主 spec 的清單同步（design Decision 9） | unit |
| 歸屬清單提及的每個 hook 名稱都有對應檔案 | 歸屬清單提及的 hook 都有對應檔案 | 清單新增 `useRoundStore` 後，`stale` MUST 為 `[]` | 既有測試（regression guard）：守反向漂移——先改清單卻沒建檔 | unit |
| 應在 scrollY 超過 threshold 時回傳 true | useScrollShadow 在 scrollY 超過 threshold 時回傳 true | 既有測試 | 既有測試（regression guard）：本 change 未觸碰此 hook，列出以滿足 Scenario 覆蓋 | unit |
| 應回傳目前可視 section 的 id | useScrollSpy 回傳目前可視 section 的 id | 既有測試 | 既有測試（regression guard） | unit |
| 應在 scrollY 超過固定 threshold 時回傳 true | useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true | 既有測試 | 既有測試（regression guard） | unit |
| 應以 function threshold 動態判定是否已捲過門檻 | useScrolledPast 以 function threshold 動態判定 | 既有測試 | 既有測試（regression guard） | unit |

## 覆蓋檢查

- **每個 Requirement 至少一個 test**：round-lifecycle 9／9、match-history 2／2、player-roster 2／2、pickleball-guide-page 1／1 —— 全數有對應列。
- **每個 Scenario 至少一個 test**：round-lifecycle 47 個 Scenario 對 47 列；match-history 9 對 9；player-roster 9 對 9；pickleball-guide-page 6 對 6 —— **合計 71 對 71**。
- **每列都有 Tier**：是。unit 68 列、integration 1 列、e2e 2 列（e2e 兩列皆為既有測試，本 change 不新增 e2e）。
- **新增測試檔**：`round-types.test.ts`、`round.test.ts`、`history.test.ts`、`round-storage.test.ts`（皆於 `nextjs-pickball/lib/matchmaker/`）與 `nextjs-pickball/hooks/useRoundStore.test.tsx`。
- **既有測試檔的擴充**：`nextjs-pickball/lib/matchmaker/storage.test.ts`（重置範圍擴大為三個 key）。
