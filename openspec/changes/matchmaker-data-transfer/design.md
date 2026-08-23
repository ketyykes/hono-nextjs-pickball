## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

- `lib/matchmaker/` 為**扁平佈局**（`types.ts`、`roster.ts`、`colors.ts`、`storage.ts`、
  `allocation*.ts`、`candidates.ts`、`pairing.ts`、`duplication.ts`、`rating-math.ts`，
  各自鄰近一份 `*.test.ts`），本段沿用，不新增子目錄。
- 本段是**第一個同時橫跨多個資料域**的 milestone：名單（M1）、回合與歷史（M4）、
  重複配對簽章（M2 的持久化表示法）、以及計分板（既有 `scoreboard:current:v1`）。
  它不擁有其中任何一份 schema，只負責把它們**打包、驗證、還原與清除**。
- **並行約束是本段最重要的結構壓力**：M6／M7／M9 與本段同時在各自的 worktree 上進行，
  最後都要合回 `main`。因此本段刻意把所有新增行為放進**新檔案**，
  對既有檔案只做 `import`，不做編輯（見 Decision 2）。
- 專案 `tsconfig.json` 開 `strict` 與 `verbatimModuleSyntax`，型別匯入須用 `import type`。
- 前端無 CSV 相關套件；`zod@4` 為既有相依。

### 與 M4 的介面對齊

本段的 `transfer-types.ts` MUST **import** M4 定案的回合與歷史 schema，
SHALL NOT 自行重新宣告一份平行型別——重新宣告等於製造第二個真相來源，
M4 日後改欄位時本段不會編譯失敗，錯誤會延後到使用者匯入舊備份時才爆。

撰寫本文件時 M4（`matchmaker-round-lifecycle`）的 artifact 已寫成、但**尚未合併回 `main`**。
下表是依 M4 現行 delta spec 讀出的對應，供實作直接引用；由於 M4 在合併前仍可能調整識別字，
**apply 的 §0 仍必須逐項對照 worktree 內的實際程式碼**，不一致時以程式碼為準並更新該表。

| 需要的東西 | M4 現行 delta 的名稱 | 模組 |
|---|---|---|
| 回合 schema | `RoundSchema`（單場為 `RoundMatch`、隊伍為 `RoundTeam`） | `lib/matchmaker/round-types.ts` |
| 歷史單筆 schema | `MatchHistoryEntrySchema`（隊伍為 `HistoryTeam`） | `lib/matchmaker/history.ts` |
| 三個 key 常數 | `ROSTER_STORAGE_KEY`／`ROUND_STORAGE_KEY`／`HISTORY_STORAGE_KEY` | `lib/matchmaker/storage-keys.ts` |
| `hasLocalStorage()` | 由私有函式改為**匯出** | `lib/matchmaker/storage-keys.ts` |
| 回合／歷史的讀寫 | `readRound`／`writeRound`／`readHistory`／`writeHistory` | `lib/matchmaker/round-storage.ts` |
| 重複配對簽章 | `Round.seenSignatures = { teammateKeys, opponentKeys, fullMatchKeys }`，**三組字串陣列，存在回合物件內** | `lib/matchmaker/round-types.ts` |

三個關鍵事實直接改變了本段的設計：

1. **`hasLocalStorage()` 已被 M4 提升為匯出**，本段因此是**重用**而非「比照模式重寫」。
2. **key 常數集中在 `storage-keys.ts`**，本段的清除清單直接由該檔取用，
   與 M4 的 `RESET_KEYS` 共用同一個來源，兩份清單不會各自漂移（見 Decision 5）。
3. **簽章存在回合物件內且已是字串陣列**，備份不需要（也不應該）另設頂層欄位（見 Decision 11）。

歷史紀錄的欄位為**自足快照**（`players[].name`／`ratingBefore`／`ratingAfter` 皆在紀錄內），
M4 的 spec 明文寫著這是為了 9.3.1 的 CSV 匯出。因此 `history-csv.ts` 直接讀快照欄位，
SHALL NOT 以 id 回查名單。

## Goals / Non-Goals

**Goals:**

- 讓「匯出 → 換裝置／清除 → 匯入」成為一條**可驗證且無損**的路徑：JSON 的匯出入對稱，
  以 round-trip 測試釘住。
- 把「整份原子性」變成**結構上的必然**而非註解約束：驗證與寫入拆成兩個函式，
  寫入函式的參數型別只接受**已驗證**的備份物件，想寫入半套資料在型別上就做不到。
- 讓每一則錯誤都能回答使用者「我現在該做什麼」——列號、欄位、原因、下一步。
- 全段純函式與新檔案，讓 M6／M7／M9 的並行 worktree 合併時衝突面積接近零。

**Non-Goals:**

- 不做 CSV 的完整 RFC 4180 相容實作（不支援自訂分隔符、不支援 `\r` 單獨作為換行、
  不處理 BOM 以外的編碼偵測）。範圍是「本 app 匯出的 CSV，以及使用者從
  Google Sheets／Excel 另存的 CSV」，這兩者都輸出標準的逗號分隔與 `\n`／`\r\n`。
- 不做匯入的合併（merge）語意。9.3.2 明訂第一版採附加模式、同名視為不同人。
- 不做匯入的部分套用、不做匯入預覽的逐列編輯。使用者要修就回試算表修。
- 不做效能最佳化。PRD 12.1 的規模是 8～40 人；一季歷史撐死數千列，
  字串串接在此規模下遠低於一個 frame。
- 不處理跨版本備份的遷移（v2 讀 v1）。本次只有 v1，遇到非 1 一律明確拒絕。

## Decisions

### Decision 1：拆成六個模組，而非單一 `transfer.ts`

| 模組 | 職責 | 對應 PRD |
|---|---|---|
| `transfer-types.ts` | 備份檔的 zod schema 與型別（`BackupSchema`／`Backup`），以及本 capability 對外錯誤訊息的**單一常數表** | 9.2、§11 |
| `backup.ts` | `buildBackup()`／`parseBackup()`／`backupFileName()` | 9.2、§11 |
| `csv.ts` | CSV 的底層序列化與解析（跳脫、BOM、換行） | 9.3.1、9.3.2 |
| `history-csv.ts` | 歷史賽果 → CSV 列（9.3.1 的欄位對應） | 9.3.1 |
| `roster-csv.ts` | CSV → 參賽者（逐列驗證、預覽、附加寫入） | 9.3.2 |
| `transfer-storage.ts` | 快照的讀／寫／清除，列舉 key 清單 | 9.1、§10、§11 |

理由是**原子性與職責邊界需要被型別強制**。單檔實作時「驗證失敗不得寫入」只能靠註解提醒；
拆開後 `transfer-storage.ts` 的寫入函式簽章只接受 `Backup`（`parseBackup` 成功後才產得出來
的型別），拿不到未驗證的 `unknown`，想違反也做不到。`csv.ts` 同理——它只認識字串與二維陣列，
完全不知道 `Player` 或歷史紀錄的存在，因此不可能在解析層偷偷做網域驗證。

替代方案是單一 `transfer.ts` 內用私有函式分層。否決理由與 M2 Decision 1 相同：私有函式無法
獨立測試，而「跳脫規則」「列號換算」「原子性」正是最需要逐層驗證的部分；且 spec 的「驗收」
錨點需要指到具體檔案，`/opsx:verify` 才能機械核對。

**錯誤訊息為何集中在 `transfer-types.ts`**：spec 要求「所有錯誤訊息為繁體中文且各自包含可
採取的修正方式」，這句話只有在**訊息可被逐一列舉**時才驗得起來。若訊息散落在 `backup.ts`
與 `transfer-storage.ts` 的各個 `return` 裡，測試只能一則一則手抄，漏掉新加的那則不會紅。
集中成一張匯出的常數表後，測試可以直接遍歷整張表，**新增訊息卻忘了寫修正方式會立刻紅燈**。

`transfer-types.ts` 因此同時含 schema 與訊息常數。這不違反 M2 `allocation-types.ts`
「純型別與常數檔」的慣例——兩者都是「無執行期邏輯、只有型別與 `as const` 值」；差別只在
本檔的常數是字串而非數字。本檔仍**不含函式**，其斷言掛在消費它的 `backup.test.ts`，
不為常數檔硬造一份測試檔（同 M2 Decision 2）。

### Decision 2：不編輯 `storage.ts`，改新增 `transfer-storage.ts` 只 import 既有匯出

`lib/matchmaker/storage.ts` 的 `RESET_KEYS` 是 M4 正在擴充的對象（M4 Decision 8 把三個 key
與 `hasLocalStorage()` 抽到新的 `storage-keys.ts`，並讓 `storage.ts` 以 re-export 保持相容）。
M4 與本段並行，**兩邊同時編輯同一檔案的同一段常數必然衝突**。

因此本段新增 `transfer-storage.ts`，只從 `storage-keys.ts` import 三個 matchmaker key
與 `hasLocalStorage()`、從 `lib/scoreboard/` 下各模組 import 全部計分板 key 常數
（`storage.ts` 的獨立槽 key；M6 已合併時再加上分槽模組的 `scoreboard:matches:v1`），
再在本檔內組出自己的 `CLEAR_ALL_KEYS`。`storage.ts`、`storage-keys.ts` 與
`lib/scoreboard/**` 一行都不改。

替代方案是把 `CLEAR_ALL_KEYS` 加進 `storage.ts` 與 `RESET_KEYS` 並列。否決理由有二：
① 合併衝突（上述）；② `resetMatchmakerData()`（重置名單）與 `clearAllLocalData()`
（清除本機資料）是 §10 表格裡不同的兩列，清單並列在同一檔會誘導後人「順手」讓兩者共用同一份
清單，而它們的範圍本來就該不同（前者不含 `scoreboard:current:v1`，後者含）。
`player-roster` 的 spec 已明文「本次清單僅含 `matchmaker:roster:v1`」，把兩份清單放在不同
檔案，是讓這個差異在檔案結構上可見。

### Decision 3：CSV 自行實作，不引入 `papaparse` 之類的套件

需要的功能只有三件事：以逗號分隔、以雙引號包住含特殊字元的值、值內雙引號以兩個雙引號跳脫。
解析端多兩件：處理引號內的換行、去掉開頭的 BOM。合計約 60 行純函式。

替代方案是引入 `papaparse`（約 45 KB min）或 `csv-parse`。否決理由：
① 本專案部署為 Cloudflare Worker，前端 bundle 直接影響冷啟與載入；
② M1／M2 建立的慣例是「純函式、無外部相依」，`lib/matchmaker/` 至今零套件相依；
③ 套件的價值在於處理各種畸形輸入，但本段的輸入來源只有兩個（本 app 自己的匯出、
試算表的標準匯出），Non-Goals 已明確放棄完整相容；
④ 自行實作的跳脫規則可以被 round-trip 測試完整釘住（spec 的「含逗號、雙引號或換行的欄位」
Scenario 就同時斷言序列化與讀回）。

若日後要支援使用者手工編輯的畸形 CSV，再評估引入套件，屆時 `csv.ts` 的公開介面
（`toCsv` / `parseCsv`）可原樣保留，只換內部實作。

### Decision 4：JSON 匯入採「整份原子」，刻意不沿用 M1 的逐筆降級

`player-roster` 的 `readRoster()` 採逐筆降級（外層壞才整份清、單筆壞只丟該筆），
理由是「名單是使用者逐筆手建的數十筆資料，因單筆不合法而清空整團人，損失不成比例」。

**備份檔的情況相反**：它是一份互相參照的整體——回合中的球員 id 指向 `players`、
歷史的賽前／賽後分數對應當時的名單、簽章由球員 id 串接而成。丟掉幾筆 `players` 會留下
指向不存在球員的回合與歷史，那是**比整份拒絕更難修復的狀態**：使用者看不出哪裡壞了，
只會在產生下一輪時撞到找不到球員的錯誤。而且逐筆降級在此處也沒有「不成比例」的問題——
使用者手上還有原始備份檔，重新匯入或修檔的成本遠低於「名單被清空」。

替代方案是對 `players` 逐筆降級、對 `currentRound` 整份丟棄。否決理由：那會產生
「歷史裡有這個人、名單裡沒有」的資料，而 M7 的歷史頁要顯示球員姓名與顏色。

此決定 MUST 寫進 spec（已寫入「單筆參賽者不合法時整份拒絕」Scenario），
避免日後審查者拿 `player-roster` 的逐筆降級模式來要求一致。

### Decision 5：清除範圍以列舉清單涵蓋**本 app 的全部 key**（含計分板），且明講備份不含計分進度

`prd.md` §10 表格的「清除本機資料」列寫的是「全部 LocalStorage 資料」。字面最接近的實作是
`localStorage.clear()`，但本段選**列舉清單**：

```
matchmaker:roster:v1    matchmaker:round:v1
matchmaker:history:v1   scoreboard:current:v1
（＋ scoreboard:matches:v1，若 M6 已合併）
```

前三個 key 的字面值取自 M4 的 `storage-keys.ts`（與 M4 `RESET_KEYS` 同一個來源，
兩份清單因此不會各自漂移）、計分板的則取自 `lib/scoreboard/` 下對應模組的匯出常數。
**兩份清單刻意保持不同**：`RESET_KEYS`（重置名單）不含計分板，`CLEAR_ALL_KEYS`
（清除本機資料）含——它們是 §10 表格裡不同的兩列。

**「列舉」是手段，「涵蓋本 app 全部 key」才是承諾**。本段與 M6（`matchmaker-scoreboard-binding`）
並行，M6 會新增分槽 key `scoreboard:matches:v1`；若把清單的**內容**寫死成四筆，M6 一合併，
「清除本機資料」就會留下全部分場計分槽——正是 M6 自己警告的孤兒條目與 LocalStorage 無界累積。
因此：① spec 的敘述採結果導向（涵蓋本 app 寫入的全部 key，已知者列表，分槽 key 若存在則
MUST 納入）；② 對應 Scenario **不斷言筆數**，改斷言「`CLEAR_ALL_KEYS` 的集合 ＝ 來源模組
匯出的 key 常數集合」；③ tasks §0.5 用 grep 把「找出全部 key 常數」變成 apply 時的
強制步驟，而非只留在本檔的 Open Questions（Open Questions 不會轉紅）。

理由與 `player-roster` Decision 6 同源並延伸：`clear()` 會刪掉本 app 從未寫入的 key
（同網域的其他來源、未來的純顯示偏好如深色模式），而使用者無從檢視被刪掉了什麼；
列舉清單則強制在新增任何資料域時**主動決定**它是否屬於清除範圍。

`scoreboard:current:v1` **納入**清除範圍：它是本 app 的資料，使用者按下「清除本機資料」
的意圖就是把這台裝置上的東西清乾淨；把它排除在外會留下一場半完成的計分，
與 §10 要求的「回到空白狀態」不符。

但這帶出一個必須在 UI 上講明的落差：**JSON 備份的五個區塊不含計分板進度**
（9.2 只列版本號、參賽者、目前回合、歷史、重複配對資訊）。因此確認提示不能只說
「建議先匯出 JSON 備份」就了事，MUST 補一句備份不含 `/scoreboard` 的逐球計分進度——
否則使用者依提示匯出後清除，會發現一場進行到 9:7 的比賽消失了，而他明明「照做了」。

替代方案是把計分板進度也放進備份。否決理由：那會改動 9.2 明列的備份內容，屬於 PRD 層級的
決定；而且 M6 正在把計分板狀態改為綁定特定對戰場次（6.3.1），此刻擴充備份 schema 會與
M6 的並行工作直接相撞。記錄於 Open Questions 供 M6 合併後評估。

### Decision 6：不新增 `hooks/` 下的檔案；匯入與清除後以整頁 reload 同步狀態

`hooks/` 的跨 capability 歸屬清單維護在 `pickleball-guide-page` 的 spec 內，並由
`hooks/hooksInventory.test.ts` 雙向守衛。**新增任何一支 hook 都必須同時 MODIFY
`pickleball-guide-page` 的 requirement**，而 M6／M7／M9 也可能各自新增 hook——
四個並行 worktree 同時改同一份清單，合併時必然衝突且容易漏行。

這不是推測：M4 的 design Decision 9 已經為了新增 `useRoundStore` 而必須 MODIFY 該
requirement，並自行記錄了風險——「M5／M7／M8 若也新增 hook……若對方先合併回 `main`，
本 change 的 delta（寫於對方合併之前）就成了舊全文，直接套用會**把對方新增的 hook
從清單裡刪掉**」。本段選擇不新增 hook，等於直接把自己移出這個衝突集合。

因此本段把行為邏輯全數放在 `lib/matchmaker/` 的純函式，資料頁的 UI 狀態
（選到的檔案、預覽結果、錯誤訊息）用元件內的 `useState`，不抽 hook。

匯入成功與清除完成後，資料頁**觸發整頁 reload**（`window.location.reload()`），
讓 `useRosterStore` 與 M4／M5 的各個 store 一律從 LocalStorage 重新 hydrate。
替代方案有二，皆否決：
① 讓資料頁持有所有 store 並在匯入後逐一 dispatch——需要為每個 store 新增「整批取代」
   的 action，等於同時編輯 M1／M4／M5 的 hook 檔，並行衝突面積最大；
② 發自訂事件／`storage` event 讓各 store 自行重載——`storage` event 不會在**同一個分頁**
   內觸發（規格如此），得自行建一套 pub/sub，是為了避開一次 reload 而引入常駐機制。

reload 的代價是使用者會看到一次白畫面。可接受：匯入與清除都是低頻的、使用者主動確認過的
破壞性操作，此時「畫面整個重來」反而符合心理預期，也順帶保證不留任何 stale state。

### Decision 7：檔案的下載與讀取留在元件層，字串組裝留在 `lib/`

`lib/matchmaker/` 的既有慣例是純函式、無 I/O。本段沿用：`buildBackup`／`toCsv` 只回傳
**字串或純資料**，`new Blob()`、`URL.createObjectURL()`、`<a download>` 點擊、
`FileReader`／`File.text()` 全部留在 `components/matchmaker/` 的元件裡。

依 `nextjs-pickball/CLAUDE.md` 的 TDD 分層，這些元件是**例外層**（純入口／純視覺，
不強制單元 TDD），以 Playwright E2E 驗收；而 BOM、跳脫、欄位順序、錯誤訊息這些真正會出錯的
地方全在 `lib/` 內，由 Vitest 單元測試涵蓋。

替代方案是把下載封裝成 `lib/matchmaker/download.ts` 並在 happy-dom 下測試。否決理由：
`URL.createObjectURL` 在 happy-dom 下是 stub，測到的是 mock 行為而非真實下載；
E2E 的 `page.waitForEvent("download")` 才是真的驗到檔案落地。

### Decision 8：`createdAt` 維持 `z.iso.datetime()` 的嚴格性，不為匯入放寬

`PlayerSchema.createdAt` 用 `z.iso.datetime()`，**只接受 `Z` 尾碼的 UTC**，
帶時區 offset（`+08:00`）或純日期一律驗證失敗。本 app 產生的 `createdAt` 一律來自
`new Date().toISOString()`（固定輸出 UTC `Z`，與執行環境時區無關），
因此**本 app 自己匯出的備份必定能被自己匯入**，9.2 的對稱性不受影響。

風險只存在於「使用者手動編輯 JSON、塞入 offset 格式時間戳」。本段選擇**不放寬**：
① 放寬等於在 `transfer-types.ts` 建立一份與 `PlayerSchema` 不同的第二套時間格式規則，
   兩者遲早漂移；② 9.2 定義 JSON 是**本 app 的完整備份格式**，不是通用交換格式，
   沒有承諾要吃外部工具產生的檔案。

代價是手改檔案的使用者會撞到驗證失敗。緩解方式是錯誤訊息必須指出「哪一位參賽者的哪個欄位」，
而不是丟一句「格式錯誤」——這已寫進 spec 的錯誤訊息要求。

### Decision 9：CSV 匯入的顏色與 rating 一律委派既有 `addPlayer`，不重寫

`roster-csv.ts` 的寫入函式 MUST 以 `reduce` 逐列呼叫 `lib/matchmaker/roster.ts` 的
`addPlayer(roster, input, { id, now })`，而非自行組出 `Player` 物件。這樣三件事自動正確：

- rating 的兩位小數 round（`roster.ts` 的唯一寫入點）；
- 顏色「兩端同進同出」的判定（只給一端就整組走自動配色）；
- 自動配色取「最小未使用 palette index」（`nextAutoGradient`），
  且因為是**逐列疊加**在成長中的名單上，同一次匯入的多列自然拿到互不相同的漸層。

第三點是這個決定最關鍵的收穫：若改成先算好全部 `Player` 再一次 append，
每一列看到的都是同一份「匯入前的名單」，`nextAutoGradient` 會回傳同一個 index，
十位新成員全部同色。spec 已為此寫了獨立 Scenario 釘住。

`id` 與 `now` 由呼叫端注入（沿用 `player-roster` Decision 4），簽章為
`applyRosterImport(roster, rows, { ids, now })`，`ids.length` MUST 等於 `rows.length`。
注入陣列而非 `() => string` 工廠，是為了讓測試能斷言確切的 id 而非 `expect.any(String)`。

### Decision 10：資料頁路由為 `/matchmaker/data`

既有路由為 `/matchmaker/players`（M1）。M5 的對戰舞台與 M7 的歷史頁預期落在
`/matchmaker` 底下的其他區段。`/matchmaker/data` 與它們平行，語意直接，
且不需要動任何既有路由。

替代方案是 `/matchmaker/settings` 或把匯出入塞進參賽者頁的一個分頁。前者名不符實
（本頁沒有任何設定項）；後者會讓「清除本機資料」與「重置名單」兩個範圍不同的破壞性操作
擠在同一畫面，是誤觸風險最高的排法——PRD §10 特地把它們列成兩列，UI 就不該把它們並排。

### Decision 11：重複配對簽章隨回合備份，不在備份中另設頂層欄位

`prd.md` 9.2 要求備份含「重複配對資訊」。M4 把該輪所用的基準保存在回合物件內
（`Round.seenSignatures`，三組**已是字串陣列**），因此備份只要帶上 `currentRound`
就自然含有簽章。

替代方案是在備份根層另放一份 `signatures`。否決理由：那會產生**兩個真相來源**——
使用者手改檔案、或未來 M6／M9 動到回合結構時，兩者不一致就沒有任何規則能判定該信哪一個；
而「加一條一致性檢查」只是把成本轉嫁到驗證邏輯，換不到任何額外能力。

「沒有回合時簽章會遺失嗎」——不會。M4 明訂重複比對基準**只取上一輪**且保存在目前回合內，
沒有目前回合就沒有基準（首輪基準為空）。因此不存在「簽章有值但回合為 `null`」的狀態。

## Risks / Trade-offs

- **[M4 合併前又調整了 schema 名稱]** → Context 的對照表是依 M4 現行 delta 讀出的，
  但 M4 尚未合併、仍可能改名。tasks.md §0 因此保留逐項對照的步驟：以 worktree 內的
  **實際程式碼**為準並更新該表。spec 只承諾欄位內容、不承諾識別字拼法。
  代價是 §0 未完成前不能開始 §2 以後的任務，已在 tasks 的 `Depends on:` 標明。

- **[三個 key 的寫入不是真正的原子操作]** → 驗證已全部在寫入前完成，因此「格式錯誤覆蓋現有
  資料」這個 spec 承諾成立；但寫入本身是三次 `setItem`，若第二次撞到配額，第一次已經寫進去了。
  緩解：配額失敗會回報並建議「先清除舊資料或減少匯入筆數」，而清除是本頁既有功能；
  使用者修正後重新匯入會整份覆蓋掉半套狀態，不會累積。**不做寫入回滾**——回滾本身也是寫入，
  在配額耗盡時同樣可能失敗，用一個會失敗的機制去補救另一個失敗只是把錯誤路徑變長。
  記錄於此是為了讓日後看到「部分寫入」的人知道這是已知取捨，不必重查。

- **[整頁 reload 會丟掉使用者在其他分頁未儲存的狀態]** → 本 app 的狀態全部即時寫入
  LocalStorage（M1 的 write effect 模式），沒有「未儲存」的概念。唯一例外是使用者在資料頁
  已選好但尚未確認的檔案，reload 只發生在**確認之後**，該狀態本來就該清掉。

- **[UTF-8 BOM 在 Google Sheets 可能被當成第一個欄位名的一部分]** → 實務上
  Google Sheets 與 Excel 皆會辨識並吃掉 BOM；但**本模組自己的 `parseCsv` 必須主動去除**，
  否則「匯出 CSV → 再匯入」時第一個標題欄會變成 `﻿名稱` 而對不上。已在 spec 的
  round-trip Scenario 中以「以本模組的解析函式讀回時逐字相同」釘住。

- **[列號換算容易 off-by-one]** → 錯誤訊息的列號是使用者要拿回試算表用的，錯一格就等於
  指錯行。spec 明文「標題列為第 1 列、第一筆資料為第 2 列」，並為此寫了獨立 Scenario
  斷言具體數字（3 與 5），不接受只斷言「有錯誤」。

- **[匯出檔可能很大而撞到 LocalStorage 配額]** → 配額問題發生在**匯入**（寫回）而非匯出。
  §11 已要求配額例外不得拋出、需回報並建議修正方式。實際規模（40 人、數千筆歷史）
  遠低於 5 MB 的常見配額，此路徑主要防的是損壞資料或惡意大檔。

- **[「錯誤訊息皆為繁體中文且含修正方式」難以機械驗證]** → 對應的測試以「訊息不含未翻譯的
  zod issue 字串」+「訊息包含可採取的下一步關鍵詞」兩個可檢查的條件近似，
  而非人工目視。這是近似而非證明，記錄於此避免日後誤讀為完整保證。

- **[CSV 自行實作可能漏處理某種畸形輸入]** → Non-Goals 已明確劃界（不支援自訂分隔符、
  不處理 BOM 以外的編碼、不處理單獨 `\r`）。畸形輸入會落到「該列驗證失敗」或
  「缺少必填標題欄」兩條既有錯誤路徑，不會產生靜默錯誤的名單。

## Migration Plan

無資料遷移。本段只新增 key 的**讀取與清除**行為，不改變任何既有 key 的結構或版本號。
備份格式 `version` 為 1，是本格式的第一版，沒有舊版可讀。

回滾方式：本段全為新增檔案與新增路由，回滾即移除該路由與 `lib/matchmaker/` 下的六個新檔，
既有功能不受影響。

## Open Questions

- **M6 把計分板狀態綁定對戰場次後（PRD 6.3.1），清除清單與提示文案需要怎麼改？**
  若計分進度變成回合的一部分，它會自然被 `currentRound` 帶進備份，
  「備份不含計分進度」那句提示就必須刪掉——留著會變成錯誤資訊。
- **計分板進度是否該納入 JSON 備份？** 目前依 9.2 的字面列舉不納入，並以 UI 提示補足。
  待 M6 定案後可重新評估——若屆時計分進度已成為回合的一部分，它會自然被 `currentRound`
  帶進備份，本段的提示文案就要改掉。
- ~~**`scoreboard:current:v1` 在 M6 之後是否仍是單一 key？**~~ **已裁決，不再是 Open Question。**
  M6（`matchmaker-scoreboard-binding`）依 PRD 6.3.1 新增分槽 key `scoreboard:matches:v1`
  （`scoreboard:current:v1` 語意不變）。處置已落在會轉紅的地方，不留在本節：
  spec 的「清除本機資料與其確認流程」改為結果導向（涵蓋本 app 寫入的全部 key，
  分槽 key 存在時 MUST 納入）、其 Scenario 改斷言集合相等而非筆數、
  tasks §0.5 以 grep 強制列出 `lib/scoreboard/` 的全部 key 常數並填入 §0.6 對照表。
  確認提示文案則不需修改：spec 已把「備份不含 `/scoreboard` 逐球計分進度」定義為涵蓋
  獨立槽與分槽兩者。
- **是否提供拖放（drag & drop）選檔？** 本段只做 `<input type="file">`。
  拖放屬純互動加值，不影響任何 requirement，留待後續。
