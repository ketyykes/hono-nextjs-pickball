# Tasks — matchmaker-data-transfer（M8）

> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify`
> 無法機械核對。名稱清單見 `test-plan.md`。
>
> **紅燈形式聲明**：`lib/matchmaker/` 下六個模組**全為新檔**，每個模組第一個測試的紅燈
> 會是「模組／函式尚不存在」的解析失敗，之後同檔追加的測試才是斷言失敗型紅燈——兩者都是
> 真紅燈。若某條測試加入後**立即全綠**，MUST 誠實標註為 regression guard 並改以 mutation
> 驗證（改壞看紅、還原看綠）證明偵測力，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **例外層**：`app/matchmaker/data/page.tsx` 與 `components/matchmaker/**` 依
> `nextjs-pickball/CLAUDE.md` 屬純入口／純視覺，不強制單元 TDD——§8 改以 **Playwright E2E
> 當 RED**（路由不存在時測試必紅），再實作元件轉綠，TDD 節奏不因例外層而消失。

## 0. 前置：與 M4 的介面對齊（調查與記錄，非實作）

> 本群組**不寫任何程式碼**，只確認 base 狀態並產出後續所有 subagent 都要引用的對照表。
> 下表的「M4 delta 名稱」欄是撰寫本 change 時從 `matchmaker-round-lifecycle` 的 delta spec
> 讀出的，**M4 當時尚未合併**；本群組的工作就是逐項對照 worktree 內的**實際程式碼**，
> 不一致時以程式碼為準並就地更新此表。

- [x] 0.1 確認 worktree 的 base 已含 M5（`matchmaker-match-stage-ui`），
      並確認 M3（`matchmaker-rating-engine`）與 M4（`matchmaker-round-lifecycle`）
      皆已在 `main`。
      **判定方式為程式碼存在性核對，SHALL NOT 用 `ls openspec/changes/archive | grep matchmaker` 判定**：
      M3／M4／M5 是以一般 merge commit 併入 `main`、**未走 openspec archive**，
      `openspec/changes/archive/` 底下看不到它們（字面執行只會命中 M2
      `2026-08-17-matchmaker-allocation-engine`，誤判為未合併而白白中止 apply）。
      改跑下列三行，**全部列出檔案**才算通過：
      `ls nextjs-pickball/lib/matchmaker/rating.ts nextjs-pickball/lib/matchmaker/rating-bounds.ts`（M3）、
      `ls nextjs-pickball/lib/matchmaker/round-types.ts nextjs-pickball/lib/matchmaker/round-storage.ts`（M4）、
      `ls nextjs-pickball/lib/matchmaker/section-nav.ts nextjs-pickball/app/matchmaker/page.tsx`（M5）。
      **若任一未合併，停止 apply 並回報**（見 `execution-plan.md` 的 Escalation）
- [x] 0.2 `grep -rn "^export " nextjs-pickball/lib/matchmaker/round-types.ts
      nextjs-pickball/lib/matchmaker/history.ts nextjs-pickball/lib/matchmaker/storage-keys.ts
      nextjs-pickball/lib/matchmaker/round-storage.ts`
      核對回合／歷史 schema、key 常數、`hasLocalStorage()` 與讀寫函式的實際匯出名稱
- [x] 0.3 確認 `Round` 的簽章欄位（預期 `seenSignatures`，三組字串陣列）
      與其在 `RoundSchema` 內的巢狀位置
- [x] 0.4 確認 `MatchHistoryEntry` 的球員快照欄位（預期
      `teamA.players[].name`／`ratingBefore`／`ratingAfter`），CSV 匯出直接讀這些欄位
- [x] 0.5 列出**本 app 寫入 LocalStorage 的全部 key 常數**，兩道 grep 都要跑
      （第二道用來抓不是 `export const` 形式的宣告，例如包在物件或陣列裡的字面值）：
      `grep -rnE '^export const [A-Z_]+ = "(matchmaker|scoreboard):' nextjs-pickball/lib/`
      與 `grep -rnE '"(matchmaker|scoreboard):[^"]*"' nextjs-pickball/lib/`。
      **掃描範圍 MUST 不只 `lib/`**：上述兩道 grep 同時要對
      `nextjs-pickball/app/`、`nextjs-pickball/components/` 與 `nextjs-pickball/hooks/`
      各跑一次——`lib/` 之外目前仍有 key 字面值（`components/scoreboard/OrientationHint.tsx`）。
      只掃 `lib/` 與本項承諾的「**全部** key 常數」自相矛盾，而**漏列即為 spec 違反**。
      **每一個命中的 key 都 MUST 回到該檔確認呼叫的是 `localStorage` 而非 `sessionStorage`**：
      `sessionStorage` 的 key（例如 `scoreboard:hint-dismissed`，見
      `components/scoreboard/OrientationHint.tsx` 第 8、21、30 行）SHALL NOT 列入匯出或清除清單。
      誤收會讓清除清單多出一個本 app 從未寫進 LocalStorage 的成員，
      使 §7.1 的集合相等斷言永遠對不上。
      **重點是 `lib/scoreboard/` 不只有 `storage.ts` 的 `STORAGE_KEY`**——M6
      （`matchmaker-scoreboard-binding`）為本 change 的**硬前置**，該目錄下必然有一個分槽模組
      `lib/scoreboard/match-slots.ts` 匯出 `scoreboard:matches:v1`；
      找不到該模組即代表 M6 尚未合併，MUST 停止 apply 並回報（見 §7.2）。
      命中的每一個 key 常數都 MUST 填入下表並成為 §7
      `CLEAR_ALL_KEYS` 的來源：spec 的「清除本機資料」承諾的是「本 app 寫入的全部 key」
      而非固定四筆，**漏列即為 spec 違反**（會留下整批孤兒分場計分槽）
- [x] 0.6 把 0.2～0.5 的核對結果填入下表——§2 之後的每一次派工都要附上此表：

  | 需要的東西 | M4 delta 名稱（待核對） | 實際名稱 | 模組路徑 |
  |---|---|---|---|
  | 回合 schema | `RoundSchema` | `RoundSchema`（相符）／`Round` 型別 | `lib/matchmaker/round-types.ts` |
  | 歷史單筆 schema | `MatchHistoryEntrySchema` | `MatchHistoryEntrySchema`（相符；為 `z.discriminatedUnion("format", …)`，兩分支皆 `.strict()`）／`MatchHistoryEntry` 型別 | `lib/matchmaker/history.ts` |
  | 名單 key 常數 | `ROSTER_STORAGE_KEY` | `ROSTER_STORAGE_KEY = "matchmaker:roster:v1"`（相符） | `lib/matchmaker/storage-keys.ts` |
  | 回合 key 常數 | `ROUND_STORAGE_KEY` | `ROUND_STORAGE_KEY = "matchmaker:round:v1"`（相符） | `lib/matchmaker/storage-keys.ts` |
  | 歷史 key 常數 | `HISTORY_STORAGE_KEY` | `HISTORY_STORAGE_KEY = "matchmaker:history:v1"`（相符） | `lib/matchmaker/storage-keys.ts` |
  | LocalStorage 防護 | `hasLocalStorage()` | `hasLocalStorage()`（相符，已為 `export function`） | `lib/matchmaker/storage-keys.ts` |
  | 回合／歷史讀寫 | `readRound`／`writeRound`／`readHistory`／`writeHistory` | 四者皆存在（另有 `clearRound`／`clearHistory`）。⚠️ `readHistory()` 回傳的是 `ReadHistoryResult = { entries, droppedCount }` 而非陣列；`writeRound`／`writeHistory` **靜默吞掉配額例外**，故 §7 的 `writeBackup` SHALL NOT 委派它們（無法回報配額失敗），須自行 `setItem` 並 try/catch | `lib/matchmaker/round-storage.ts` |
  | 簽章持久化欄位 | `Round.seenSignatures`（三組字串陣列） | `Round.seenSignatures: { teammateKeys: string[]; opponentKeys: string[]; fullMatchKeys: string[] }`（相符，schema 為 `SeenSignaturesSchema`） | `lib/matchmaker/round-types.ts` |
  | 計分板獨立槽 key 常數 | `STORAGE_KEY` | `STORAGE_KEY = "scoreboard:current:v1"`。⚠️ **宣告點是 `lib/scoreboard/storage-keys.ts`**，`storage.ts` 第 9 行只 `export { STORAGE_KEY }` re-export | `lib/scoreboard/storage-keys.ts` |
  | 計分板分槽 key 常數（M6 為硬前置，MUST 存在） | `MATCH_SLOTS_KEY`（`scoreboard:matches:v1`） | ✅ 存在：`MATCH_SLOTS_KEY = "scoreboard:matches:v1"`。⚠️ **宣告點是 `lib/scoreboard/storage-keys.ts`**，`match-slots.ts` 第 8 行只 `export { MATCH_SLOTS_KEY }` re-export。M6 已在 `main` | `lib/scoreboard/storage-keys.ts` |
  | 其他 `matchmaker:`／`scoreboard:` key 常數 | （0.5 的 grep 若還有命中就逐一補列） | 無其他 LocalStorage key。唯一額外命中為 `components/scoreboard/OrientationHint.tsx:8` 的 `DISMISS_KEY = "scoreboard:hint-dismissed"`，該檔第 21／30 行用的是 **`sessionStorage`**，依 §0.5 明文 SHALL NOT 列入清除清單 | — |

  補充（§5／§6 需要）：`PlayerSchema`／`Player`／`Gender` 在 `lib/matchmaker/types.ts`；
  `addPlayer(roster, input, { id, now })`、`nextAutoGradient(roster)`、
  `AddPlayerInput { name, gender, rating, colorFrom?, colorTo? }`、
  `AddPlayerContext { id, now }` 在 `lib/matchmaker/roster.ts`；
  `PALETTE_SIZE`／`defaultGradient`／`paletteIndexOf` 在 `lib/matchmaker/colors.ts`。
  三個 matchmaker key 的容器格式為 `{ version: 1, players }`／`{ version: 1, round }`／
  `{ version: 1, entries }`。

  **CLEAR_ALL_KEYS 的最終來源（§7.2 據此實作，共 5 個 key）**：
  `ROSTER_STORAGE_KEY`／`ROUND_STORAGE_KEY`／`HISTORY_STORAGE_KEY`
  （`@/lib/matchmaker/storage-keys`）＋ `STORAGE_KEY`／`MATCH_SLOTS_KEY`
  （`@/lib/scoreboard/storage-keys`，即兩者的實際宣告點）。

- [x] 0.7 跑 `pnpm test` 確認 baseline 全綠，把結果與 commit hash 回填
      `environment.md` 的 Verification 三個欄位

## 1. CSV 底層序列化與解析（`lib/matchmaker/csv.ts`）

> 刻意排在最前面且**不依賴 §0**：本模組只認識字串與二維陣列，完全不 import 任何網域型別，
> 因此 M4 是否已合併都不影響它。

- [x] 1.1 RED: 新增 `nextjs-pickball/lib/matchmaker/csv.test.ts`，寫入 it
      「CSV 文字以 UTF-8 BOM 開頭」：對任意二維陣列呼叫 `toCsv`，斷言首字元為 `﻿`。
      跑單檔確認紅燈並貼出輸出
- [x] 1.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/csv.ts` 的 `toCsv(rows)`：
      以 `﻿` 起頭、逗號分隔、`\r\n` 換行（Excel 相容），並匯出 BOM 具名常數
- [x] 1.3 RED: 於 `csv.test.ts` 補 it
      「含逗號、雙引號或換行的欄位以 RFC 4180 規則跳脫並可原樣讀回」：
      以 `王小明, Jr.`／`他說"讚"`／含 `\n` 的值序列化後斷言引號與跳脫，
      再以 `parseCsv` 讀回斷言逐字相同。確認紅燈
- [x] 1.4 GREEN: 實作 `escape` 規則與 `parseCsv(text)`：引號狀態機（引號內的逗號與換行不分隔、
      連續兩個雙引號還原為一個）、去除開頭 BOM、同時接受 `\n` 與 `\r\n`
- [x] 1.5 REFACTOR: 分隔符、引號、換行、BOM 抽為具名常數；序列化與解析共用同一組常數，
      不各自寫死字面值

      > Stage 2 code-quality review 第 1 輪退回（CHANGES_REQUESTED，38 組 mutation、18 組存活）：
      > 修正 Blocker B1（parseCsv 對檔尾換行產生幻影空列，先紅燈後修正）；補強 B2（parseCsv
      > 主流路徑、toCsv 完整輸出、非引號欄位等零覆蓋路徑）；補 Major M1／M2（未閉合引號寬鬆
      > 處理、單獨 CR round-trip）與 Minor（空輸入、連續引號、非引號欄位吃引號）的 regression
      > guard；並把 M21 對應的空輸入提早 return 判定為 B1 修正後的 dead code（等價 mutant），
      > 直接移除而非硬湊測試。複驗後 18 組存活 mutation 全數轉紅，最終 mutation 存活數 0。

## 2. 備份 schema、訊息常數與匯出（`transfer-types.ts`、`backup.ts`）
Depends on: §0

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/matchmaker/backup.test.ts`，寫入 it
      「buildBackup 產生的備份含版本號、參賽者、目前回合、歷史與重複配對簽章」：
      以 2 位參賽者／1 回合／3 筆歷史／2 組簽章的快照斷言五個區塊。確認紅燈
- [x] 2.2 GREEN: 建立 `nextjs-pickball/lib/matchmaker/transfer-types.ts`：
      `BackupSchema`（`version: z.literal(1)`、`players: z.array(PlayerSchema)`、
      `currentRound: RoundSchema.nullable()`、`history: z.array(MatchHistoryEntrySchema)`），
      巢狀 schema 一律 **import 自 §0 對照表記錄的模組**，SHALL NOT 重新宣告欄位；
      同檔匯出 `TRANSFER_MESSAGES` 訊息常數表（先放本任務用得到的）。
      並實作 `backup.ts` 的 `buildBackup(snapshot, { exportedAt })`
- [x] 2.3 RED: 補 it「空資料時仍產生合法備份而非拒絕匯出」：空名單／`currentRound: null`／
      空歷史，斷言回傳合法備份且不拋例外。確認紅燈
      > regression guard：2.2 的 buildBackup 對空陣列／null 本就無特殊分支，寫入即綠燈。
      > 已用 mutation 驗證偵測力：暫時在 buildBackup 內加入
      > `if (snapshot.players.length === 0) throw new Error(...)`，
      > 本 it 立即轉紅（`AssertionError: expected [Function] to not throw an error but
      > 'Error: MUTATION-TEST：空名單時故意拒絕匯出' was thrown`）；還原後重跑轉綠，
      > `backup.ts` 與還原前 byte-for-byte 相同（`diff` 確認）。
- [x] 2.4 GREEN: 補齊空資料路徑：空陣列與 `null` 皆為合法輸入，不進入任何錯誤分支
      （2.2 的實作已滿足，無需額外程式碼改動；見上方 2.3 的 mutation 證據）
- [x] 2.5 RED: 補 it「簽章以字串陣列寫入備份，JSON 往返後內容不變」：以簽章為 `Set` 的快照
      呼叫 `buildBackup`，斷言 `backup.currentRound` 的三組簽章欄位皆為字串陣列，且
      `JSON.parse(JSON.stringify(backup))` 後內容相等。確認紅燈
      > regression guard：型別安全要求 `BackupSnapshot` 從 2.2 起就要能同時接受
      > `ReadonlySet<string>` 與字串陣列（見公開介面約定），2.2 為滿足此型別限制
      > 已一併實作 Set→排序字串陣列的正規化，本 it 寫入即綠燈。
      > 已用 mutation 驗證偵測力：暫時把 `buildBackup` 內三個 `seenSignatures` 欄位改為
      > `snapshot.currentRound.seenSignatures as any`（跳過正規化，直接原樣寫入 Set），
      > 本 it 立即轉紅（`AssertionError: expected false to be true` on
      > `Array.isArray(backup.currentRound?.seenSignatures.teammateKeys)`）；
      > 還原後重跑轉綠，`backup.ts` 與還原前逐位元組相同（`diff` 確認）。
- [x] 2.6 GREEN: 在 `buildBackup` 內把簽章的 `Set` 轉為**排序後**的字串陣列並寫回
      `currentRound` 的對應欄位（design Decision 11：**不另設頂層 `signatures` 欄位**；
      排序是為了讓相同內容產生相同備份，便於 round-trip 斷言與 diff）
      （2.2 的 `toSortedSignatureKeys` 已滿足，無需額外程式碼改動；見上方 2.5 的 mutation 證據）
- [x] 2.7 RED: 補 it「backupFileName 依注入時間產生含日期的檔名」：
      `exportedAt = "2026-08-23T01:02:03.000Z"` → `matchmaker-backup-2026-08-23.json`。確認紅燈
- [x] 2.8 GREEN: 實作 `backupFileName(exportedAt)`；SHALL NOT 內部呼叫 `new Date()`
- [x] 2.9 REFACTOR（skipped，無壞味道；Stage 2 第 1 輪修正後更新措辭）: 已用
      `grep -nE "function|=>" nextjs-pickball/lib/matchmaker/transfer-types.ts`
      確認無命中——`transfer-types.ts` 僅含 `BackupSchema`／`Backup` 兩個匯出，無任何函式。
      `buildBackup` 的 Set→排序字串陣列正規化（`toSortedSignatureKeys`）**與 `round.ts`
      的私有函式 `toArrays()` 語意相近但刻意不同**：`toArrays()` 只做
      `[...index.teammateKeys]`，保留 Set 插入序、不排序；本檔的
      `toSortedSignatureKeys` 額外排序（design Decision 11：讓相同內容產生相同備份，
      便於 round-trip 斷言與 diff）。兩者不合併抽共用——語意刻意不同（一個要保序、
      一個要排序），且 `round.ts` 為唯讀檔案（不在本 change 的檔案邊界內）。
      （原措辭誤稱「未與既有模組的任何轉換重複」，未查 `round.ts`；M8 §2 Stage 2
      Code-Quality Review 第 1 輪修正回合已更正，見 `backup.ts` 的
      `toSortedSignatureKeys` 註解與 `backup.test.ts` 的重複值測試。）

## 3. 備份匯入的驗證與錯誤訊息（`backup.ts`）
Depends on: §2

> **交棒記錄（M8 §2 Stage 2 實測，第 1 輪修正回合）**：
> ① round-trip 斷言 MUST 用 `toEqual`，SHALL NOT 比較 JSON 字串——
> `MatchHistoryEntrySchema` 為 `discriminatedUnion`，zod 重建物件後 `format` 鍵序
> 與輸入不同，`JSON.stringify(parsed) === JSON.stringify(backup)` 會是 `false`，
> 但 `toEqual` 為 PASS，字串比較會產生假紅燈。
> ② `buildBackup` 會把重複配對簽章**排序**，而 `round.ts` 的私有函式 `toArrays()`
> 不排序（保留 Set 插入序）。round-trip fixture 若用亂序簽章，期望值要寫**排序後**
> 的結果，不能直接比對原始 LocalStorage 內容。

- [x] 3.1 RED: 於 `backup.test.ts` 補 it
      「buildBackup 的輸出經 JSON 往返後可被 parseBackup 還原為相同快照」。確認紅燈
- [x] 3.2 GREEN: 實作 `parseBackup(text)`：`JSON.parse` → `BackupSchema.safeParse`，
      成功回 `{ ok: true, backup }`。回傳型別 MUST 讓「未驗證的資料」在型別上無法傳給
      §7 的寫入函式（design Decision 1 的原子性由型別強制）
- [x] 3.3 RED: 補 it「JSON 語法錯誤時回傳繁體中文失敗訊息而非拋錯」。確認紅燈
- [x] 3.4 GREEN: 以 try/catch 接住 `JSON.parse`，回 `{ ok: false, message }`，
      訊息取自 `TRANSFER_MESSAGES`，SHALL NOT 在此處寫死字串
- [x] 3.5 RED: 補 it「version 不是 1 時整份拒絕並說明版本不支援」。確認紅燈
- [x] 3.6 GREEN: 在 `parseBackup` 內先辨識版本不符並回傳專屬訊息，
      不與「結構不合法」共用同一則（兩者的修正方式不同）
- [x] 3.7 RED: 補 it「單筆參賽者不合法時整份拒絕，不走逐筆降級」：3 位中 1 位
      `rating: 99`，斷言 `ok` 為 `false` **且結果中不存在另外 2 位**。確認紅燈
- [x] 3.8 GREEN: 確認 `BackupSchema` 對 `players` 使用完整的 `PlayerSchema` 陣列驗證
      （非 `z.unknown()` 兩段式），使單筆不合法即整份失敗（design Decision 4）
- [x] 3.9 RED: 補 it「所有錯誤訊息為繁體中文且各自包含可採取的修正方式」：
      遍歷 `TRANSFER_MESSAGES` 的每一則，斷言① 不含未翻譯的 zod issue 字串
      （如 `Invalid input`、`Expected`）② 含「請」字開頭的下一步指引。確認紅燈
- [x] 3.10 GREEN: 補齊訊息表：每一則都寫成「＜發生了什麼＞。＜目前資料狀態＞。請＜下一步＞。」
      三段式，與 `PlayerForm` 既有訊息語氣一致
- [x] 3.11 REFACTOR: 確認 `parseBackup` 的失敗分支只有一處組裝結果物件，
      三種失敗（語法／版本／結構）只是取不同訊息，不各自寫一份 return

## 4. 歷史賽果的 CSV 匯出（`history-csv.ts`）
Depends on: §0, §1

- [x] 4.1 RED: 新增 `nextjs-pickball/lib/matchmaker/history-csv.test.ts`，寫入 it
      「標題列涵蓋 9.3.1 的 11 個欄位且順序固定」：去除 BOM 後比對第一列。確認紅燈
- [x] 4.2 GREEN: 實作 `history-csv.ts`：匯出標題列常數與轉換函式，內部委派 `csv.ts` 的 `toCsv`
- [x] 4.3 RED: 補 it「雙打歷史輸出日期時間、雙方球員與各員賽前賽後分數」：
      以一筆雙打歷史斷言日期／時間由對戰時間拆出、雙方球員串接、賽前與賽後分數對應到各員。確認紅燈
- [x] 4.4 GREEN: 實作單筆歷史 → CSV 列的欄位對應（欄位名稱以 §0 對照表為準）
- [x] 4.5 RED: 補 it「歷史為空時仍輸出只有標題列的 CSV」。確認紅燈
      （寫入當下即綠燈，已改標為 regression guard 並以 mutation 驗證，見 impl-s4.md）
- [x] 4.6 GREEN: 補齊空歷史路徑：仍輸出標題列（含 BOM），SHALL NOT 回傳空字串
      （4.4 的實作已無條件涵蓋此路徑，本項為確認，無需額外程式改動）
- [x] 4.7 REFACTOR: 確認欄位順序**只有一處來源**（標題列常數與資料列的組裝共用同一份
      欄位定義），避免兩處各自維護順序而漂移
      （4.4 實作時已一次到位：HISTORY_CSV_COLUMNS 為單一來源，HISTORY_CSV_HEADERS 由其
      `.map((column) => column.header)` 衍生、資料列由其 `.map((column) => column.getValue(entry))`
      衍生，故本項為驗證，無需額外重構；grep 自證見 impl-s4.md）

## 5. 參賽者 CSV 的解析與逐列驗證（`roster-csv.ts`）
Depends on: §0, §1

- [x] 5.1 RED: 新增 `nextjs-pickball/lib/matchmaker/roster-csv.test.ts`，寫入 it
      「合法 CSV 解析出對應筆數且性別已正規化」：標題列 + 3 筆合法資料 →
      3 筆可新增、0 筆錯誤。確認紅燈
- [x] 5.2 GREEN: 實作 `parseRosterCsv(text)`：委派 `csv.ts` 的 `parseCsv`，
      **依標題名稱**（非欄位位置）對應五個欄位，逐列產出可新增列
- [x] 5.3 RED（regression guard）: 補 it「性別欄接受中英文常見寫法並忽略大小寫與前後空白」：
      `男`／`female`／` M `／`不指定` → `male`／`female`／`male`／`other`。
      5.2 的實作已提前納入完整性別對照表，寫入即綠燈，非真實 TDD 紅燈；
      改以 mutation 驗證：移除 `.trim().toLowerCase()` 正規化後兩個相關 it 皆轉紅
      （`M`／` M `／大小寫混雜案例失敗），還原後轉綠
- [x] 5.4 GREEN（同上，已於 5.2 提前完成）: 性別正規化對照表（trim + toLowerCase 後查表）
- [x] 5.5 RED: 補 it「無法對應的性別記為該列錯誤而非靜默歸為 other」。確認紅燈
- [x] 5.6 GREEN: 查表失敗時產生該列錯誤，SHALL NOT 回退為 `other`
- [x] 5.7 RED: 補 it「每筆錯誤指出試算表列號、欄位與繁體中文原因」：
      第 3 列名稱空白、第 5 列強度分數 `9` → 斷言**具體數字 3 與 5**、欄位名與繁中原因。確認紅燈
- [x] 5.8 GREEN: 實作列號換算：標題列為第 1 列、第一筆資料為第 2 列
      （即 `資料索引 + 2`），SHALL NOT 使用 0 起算索引
- [x] 5.9 RED: 補 it「缺少必填標題欄時回傳結構性錯誤並指出欄位名稱」。確認紅燈
- [x] 5.10 GREEN: 在逐列解析**之前**先檢查標題列，缺欄位時直接回結構性錯誤，不進入逐列迴圈
- [x] 5.11 RED（regression guard）: 補 it「只提供顏色起點或終點其中一端時整組改走自動配色」。
      5.2 的最小實作已提前納入「同進同出」判定，寫入即綠燈，非真實 TDD 紅燈；
      改以 mutation 驗證：把判定條件由 `&&` 改為 `||`（單端存在即帶入）後轉紅，還原後轉綠
- [x] 5.12 GREEN（同上，已於 5.2 提前完成）: 只提供一端時兩端皆不帶入 `AddPlayerInput`，
      交由 `addPlayer` 走自動配色（design Decision 9：不在本模組另寫顏色判定）
- [x] 5.13 REFACTOR: 欄位名稱、性別對照表抽為具名常數；
      每個欄位的驗證抽成同一形狀的小函式，避免五段各寫各的錯誤組裝

## 6. CSV 匯入的預覽與附加寫入（`roster-csv.ts`）
Depends on: §5

> §5 的 `parseRosterCsv` 會**直接跳過空白資料列**（不計入 `rows` 也不計入 `errors`，
> 見 design Decision 13）。§6 的「可新增 N 人」與「有錯即 disabled」直接建立在此形狀上，
> SHALL NOT 在 §6 另做一次空列過濾。

- [x] 6.1 RED→regression guard: 於 `roster-csv.test.ts` 補 it「預覽回報可新增人數與問題列的列號與原因」：
      5 筆其中 2 筆有問題 → 可新增 3 人、2 筆問題列。**寫下當下即綠燈**——`parseRosterCsv`
      的既有回傳形狀（`rows`／`errors`）已完整滿足此預覽需求，非真紅燈；已以 mutation
      驗證：將 `roster-csv.ts` 逐列迴圈內 `if (rowErrors.length > 0)` 改為
      `if (rowErrors.length > 100)`（使錯誤列不再被攔下）後轉紅（9 個 it 失敗，
      含本條），還原後轉綠
- [x] 6.2 GREEN（同上，已於 6.1 前提前完成）: `parseRosterCsv` 的回傳形狀本身即為預覽所需
      （可新增列數 = `rows.length`、問題列清單 = `errors`），未另立第二種只為 UI 服務的
      回傳型別
- [x] 6.3 RED: 補 it「任一列驗證失敗時整份不匯入，名單完全不變」：
      4 筆中第 3 筆 rating `12` → 回傳名單與原名單逐筆相等。**真紅燈**：
      `TypeError: applyRosterImport is not a function`（函式尚未存在）
- [x] 6.4 GREEN: 實作 `applyRosterImport(roster, parsed, { ids, now })`——**偏離**：
      design.md 字面簽章寫 `applyRosterImport(roster, rows, { ids, now })`，但任一列失敗
      需整份不匯入（task 6.3）必須讀到 `errors`，若第二參數只收合法列（`RosterCsvRow[]`）
      將無從得知有錯誤列存在；改為第二參數直接收 `parseRosterCsv` 的成功分支
      `Extract<ParseRosterCsvResult, { ok: true }>`（含 `rows`／`errors`），不另立新型別，
      與 task 6.4 附註「例如直接接受 ParseRosterCsvResult 的成功分支」一致。
      有任一錯誤列時**直接回傳原名單**（不進入迴圈），
      `ids.length` 與 `rows.length` 不符時視為呼叫端錯誤並拋出可判讀訊息
- [x] 6.5 RED→regression guard: 補 it「匯入採附加模式，既有參賽者不被覆蓋且順序在前」。
      **寫下當下即綠燈**——6.4 的 `reduce` 實作已內建附加語意，非真紅燈；已以 mutation
      驗證：將 `reduce` 初始累積值由 `[...roster]` 改為 `[]`（既有名單不再帶入）後轉紅
      （`toHaveLength(5)` 收到 3），還原後轉綠
- [x] 6.6 GREEN（同上，已於 6.4 提前完成）: `reduce` 逐列呼叫既有 `roster.ts` 的
      `addPlayer`，新成員附加於陣列尾端
- [x] 6.7 RED→regression guard: 補 it「同名參賽者各自獨立建立，不靜默合併」。
      **寫下當下即綠燈**——流程本就沒有任何依 name 的比對或去重，非真紅燈；
      已以 mutation 驗證：暫時加入依 name 去重的 `.filter()`（略過與既有名單同名的列）
      後轉紅（`toHaveLength(2)` 收到 1），還原後轉綠
- [x] 6.8 GREEN（同上，已於 6.4 提前完成）: 確認流程中**沒有任何依 `name` 的比對或去重**，
      同名自然各自建立
- [x] 6.9 RED→regression guard: 補 it「同一次匯入未提供顏色的多列取得互不相同的預設漸層」：
      匯入 3 筆皆未提供顏色 → 三者的 `colorFrom`／`colorTo` 組合兩兩相異。**寫下當下即綠燈**
      ——6.4 的 `reduce` 本就以成長中的名單逐列呼叫 `addPlayer`，非真紅燈；已以 mutation
      驗證：把 `addPlayer` 的第一參數由 `accumulatedRoster`（成長中名單）改為固定的
      `roster`（匯入前名單），使 `nextAutoGradient` 每列都基於同一份名單計算，
      三者轉為同一漸層（`gradientKeys` 的 Set size 由 3 降為 1）後轉紅，還原後轉綠
- [x] 6.10 GREEN（同上，已於 6.4 提前完成）: 確認 `reduce` 的累積值是**成長中的名單**
      （每次 `addPlayer` 都看到前一列的結果），而非固定的匯入前名單（design Decision 9）
- [x] 6.11 REFACTOR: skipped——確認本模組**完全沒有**自行組裝 `Player` 物件的程式碼：
      `grep -n "Player\b" roster-csv.ts` 顯示 `Player` 僅作為型別標註（`readonly Player[]`／
      `Player[]`），唯一產生 `Player` 值的呼叫點是 `addPlayer`，rating 的 round 與顏色
      自動配色皆落在 `addPlayer` 內，無壞味道

> **修正輪（§6 Stage 2 review CHANGES REQUESTED）**：以下皆為「行為早已正確、寫下即綠」
> 的 regression guard，逐條以 mutation 驗證（改壞看紅、還原看綠），**無一條偽造紅燈**：
> - **B1**：補「ids 數量少於／多於可新增列數量時拋出可判讀錯誤」兩條 it，`toThrow` 帶
>   正規表達式斷言訊息內容（原本此 throw 分支零測試覆蓋）。mutation：拿掉整個 guard
>   （`if (false)`）兩條皆轉紅；只留 `<` 方向、只留 `>` 方向、訊息內兩數字互換，皆能被
>   對應方向或內容斷言轉紅。
> - **B2＋M1～M4**：合併成一條「每一列的 id／createdAt／gender／rating／顏色／預設欄位
>   皆正確寫入且互不污染」，3 筆（1 筆手動顏色＋2 筆自動配色）一次鎖住 id 依序對應、
>   `context.now`→`createdAt`、gender／rating 透傳（rating 用 `4.567` 鎖住 round 委派）、
>   手動顏色原樣帶入且不跨列污染（以 `colors.ts` 的 `paletteIndexOf` 斷言自動配色仍落在
>   既有調色盤內）、新成員 `restCount`／`gamesPlayed`／`isActive` 初值。mutation：id
>   共用第一個／位移一格／反轉，`now` 固定空字串，`gender` 強制覆寫，`rating` 強制覆寫或
>   自行 `Math.floor`，顏色清空／只清終點／被第一列污染，reduce 後 `.map()` 強制
>   `isActive:false`／`restCount:99`，逐一改動皆轉紅，且皆命中此條 it。
> - **m1**：補「成功匯入後原 roster 陣列本身不被就地修改」，mutation（reduce 後對輸入
>   `roster` 額外 `.push()`）轉紅。
> - **m2**：補「CSV 合法但無可新增資料時正常回傳與原名單相等的結果」（`rows: []` 邊界），
>   mutation（`rows.length === 0` 時額外 throw）轉紅。
> - **m3**：補「驗證失敗時回傳的是原名單的複本而非同一參考」（`not.toBe` regression
>   guard，鎖住現行「即使無變動也回傳新參考」的選擇），mutation（改回傳 `roster as
>   Player[]`）轉紅。
> - **m4**（Stage 1 Minor）：既有 it「同一次匯入未提供顏色的多列取得互不相同的預設漸層」
>   補上 `paletteIndexOf` 斷言（spec THEN 子句「皆來自既有預設調色盤」，原本只驗證兩兩
>   相異）。it 名稱不變，僅擴充斷言。mutation：讓自動配色改回傳互異但不在調色盤內的顏色，
>   轉紅。

## 7. 快照的讀寫與清除（`transfer-storage.ts`）
Depends on: §0, §3

> **交棒記錄（M8 §3 Stage 2 review J2 裁決）**：本組追加到 `TRANSFER_MESSAGES` 的兩則
> 訊息（localStorage 不可用／寫入超出配額）MUST 同樣滿足 §3 的遍歷斷言：以「。」分段後
> 至少 3 段、最後一段以「請」開頭、長度 ≥ 30 字、不含未翻譯的 zod issue 字串。
> `backup.test.ts` 的「所有錯誤訊息為繁體中文且各自包含可採取的修正方式」一律遍歷整張表，
> 新訊息不符合這四項會直接紅燈。

- [x] 7.1 RED: 新增 `nextjs-pickball/lib/matchmaker/transfer-storage.test.ts`，寫入 it
      「clearAllLocalData 移除本 app 寫入的全部 LocalStorage key」：以 §0.5／0.6 對照表列出的
      **全部** key 常數（由來源模組 import，SHALL NOT 在測試內抄字面值）組成 `expectedKeys`，
      逐一寫入內容後呼叫，斷言① 每個 key 皆為 `null` ②
      `new Set(CLEAR_ALL_KEYS)` 與 `new Set(expectedKeys)` 相等。
      **SHALL NOT 斷言固定筆數**（如 `toHaveLength(4)`）——寫死筆數會讓日後新增資料域
      卻漏列的情況維持綠燈。確認紅燈
- [x] 7.2 GREEN: 實作 `transfer-storage.ts` 的 `CLEAR_ALL_KEYS`（**import**
      `storage-keys.ts` 的三個 matchmaker key 常數，以及 §0.5 grep 出的
      `lib/scoreboard/` 全部 key 常數——`storage.ts` 的 `STORAGE_KEY`，以及分槽模組
      `lib/scoreboard/match-slots.ts` 的 `MATCH_SLOTS_KEY`（`scoreboard:matches:v1`）；
      SHALL NOT 硬編字串）與 `clearAllLocalData()`。
      **分槽 key 不是選配**：若 `lib/scoreboard/match-slots.ts` 不存在（M6 尚未合併），
      MUST 停止本群組並回報，SHALL NOT 靜默地只納入四個 key——那是「merge 全綠、測試全綠，
      但使用者清除後分槽計分進度整批殘留」的無聲失敗（§7.1 的集合相等斷言只比對當下
      import 得到的常數，補不出還不存在的模組）。因此 **M6 MUST 先於本 change 合併**。
      **SHALL NOT 編輯 `lib/matchmaker/storage.ts` 或 `storage-keys.ts`**（design Decision 2），
      也 SHALL NOT 編輯 `lib/scoreboard/**`（只 import）
- [x] 7.3 RED: 補 it「clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響」：
      另寫一個不在清單的 key，斷言其內容逐字不變。確認紅燈
- [x] 7.4 GREEN: 確認實作為逐一 `removeItem`，且原始碼中不存在 `localStorage.clear()`
- [x] 7.5 RED: 補 it「匯入驗證失敗時三個 key 的內容完全不變」：既有三 key 有內容，
      以不合法備份走匯入流程，斷言三者的字串與匯入前逐字相同。確認紅燈
- [x] 7.6 GREEN: 實作 `writeBackup(backup)`：參數型別只接受 §3 驗證通過的 `Backup`，
      驗證與寫入在型別上就無法對調順序
- [x] 7.7 RED: 補 it「localStorage 不可用時讀寫皆不拋出例外並回報可判讀結果」：
      以 `vi.spyOn(window, "localStorage", "get")` 讓存取拋例外。確認紅燈
- [x] 7.8 GREEN: 讀寫入口皆先呼叫 `storage-keys.ts` **匯出的** `hasLocalStorage()`；
      讀取回空快照、寫入回失敗結果並附 `TRANSFER_MESSAGES` 的訊息
- [x] 7.9 RED: 補 it「寫入超出配額時回報失敗並提供繁體中文的修正建議」：
      讓 `setItem` 拋 quota 例外。確認紅燈
- [x] 7.10 GREEN: 以 try/catch 接住 `setItem`，回傳失敗結果與專屬訊息
      （「請先清除舊資料或減少匯入筆數」）
- [x] 7.11 REFACTOR: 確認 `hasLocalStorage` 的判斷**沒有在本檔重寫**一份；
      `CLEAR_ALL_KEYS` 內每一個 key 的來源皆為 import 而非字面值，且其成員與 §0.6
      對照表列出的全部 key 常數逐一對得上（有落差就是漏列，回到 7.2 補齊）

> **修正輪（兩階段審查 CHANGES REQUESTED 後）**：Stage 1 與 Stage 2 review 皆獨立指出
> it「匯入驗證失敗時三個 key 的內容完全不變」是空測試（`writeBackup` 從未被呼叫），
> 且 `readSnapshot`／`writeBackup` 的 happy path 完全零覆蓋（Stage 2 以 13 組 mutation
> 具體證實：M13、M15～M19、M21～M27 全部 SURVIVED）。以下任務為修正輪，**不改動
> `transfer-storage.ts` 的行為**（僅補測試），逐條附 mutation 紅燈證據於
> `impl-s7-fix.md`。

- [x] 7.12 FIX（Blocker B1）: 修正 it「匯入驗證失敗時三個 key 的內容完全不變」——
      新增 `vi.spyOn(window.localStorage, "setItem")` 監看，明確斷言 `setItem` 全程
      未被呼叫，讓「驗證失敗時沒有寫入路徑可走」從型別保證變成可觀察的斷言。
      it 名稱不變（spec 驗收錨點）
- [x] 7.13 FIX（Blocker B2）: 新增 it「readSnapshot 在 localStorage 可用時回傳名單／
      回合／歷史的真實內容」：以真實 localStorage 內容（非 mock）驗證三欄位對應來源
      資料，history 用 2 筆非空資料鎖住 `entries → history` 欄位改名。
      mutation 複驗：M13／M15／M16／M17／M18／M19 六組全數轉紅（見 impl-s7-fix.md）
- [x] 7.14 FIX（Blocker B3）: 新增 it「writeBackup 成功寫入後可用既有讀取函式還原
      名單／回合／歷史（round-trip）」：呼叫 `writeBackup` 後以既有 `readRoster`／
      `readRound`／`readHistory` 讀回比對，同時鎖住寫入端容器格式與讀取端 schema。
      mutation 複驗：M21～M27 七組全數轉紅（見 impl-s7-fix.md）
- [x] 7.15 FIX（Major M1）: 新增 it「clearAllLocalData 對單一 key 的 removeItem
      拋例外時仍不拋出且其餘 key 正常清除」：mock 單一 key 的 `removeItem` 拋例外，
      斷言不拋出、其餘 key 仍被清除。mutation 複驗：M9 轉紅
- [x] 7.16 FIX（Minor m1）: 新增 regression guard it「writeBackup 於第二個 setItem
      撞到配額時第一個已寫入的資料不會被回滾（design.md 已記錄的取捨，非缺陷）」，
      it 上方以繁體中文註解引用 design.md「Risks / Trade-offs」的對應條目，避免日後
      被誤判為缺陷而擅自加回滾（SHALL NOT 修改 `writeBackup` 的原子性行為）
- [x] 7.17 FIX（Minor m2）: 新增 it「clearAllLocalData 在 localStorage 不可用時不
      拋出例外」，補上 no-op 分支的覆蓋
- [x] 7.18 驗證: 對 Stage 2 列為存活的 14 組 mutation（M9、M13、M15～M19、M21～M27）
      逐一重新實測，確認現在全數被對應 it 殺死；並對 `writeBackup` 函式體整個換成
      `return { ok: true };` 做 B1 專項複驗，確認 round-trip it 與配額 regression guard
      it 轉紅。全部驗證後還原檔案，`git status` 乾淨。證據完整記錄於 impl-s7-fix.md

## 8. 資料頁與元件（例外層，E2E 當 RED）
Depends on: §2, §3, §4, §6, §7

> 依 `nextjs-pickball/CLAUDE.md`，`app/**/page.tsx` 與純呈現元件為 TDD 例外層。
> 本群組不寫單元測試，改以 Playwright E2E 當紅燈：路由或區塊不存在時測試必紅。

> **交棒記錄（M8 §3 Stage 2 review m4）**：`ParseBackupResult` 失敗分支只有 `message`
> （無機器可讀的 `code`）。§8 若需對三種失敗（語法／版本／結構，未來還會加上 localStorage
> 不可用／寫入超出配額）做不同 UI 處理，SHALL NOT 用字串比對訊息內容判別類別——
> 請回頭與 leader 確認是否要補 `code` 欄位，不要在本群組自行用 `message === TRANSFER_MESSAGES.xxx`
> 拼湊判斷邏輯（那與「訊息集中在常數表」的初衷相違，訊息措辭日後一改就會連動壞掉 UI 判斷）。
> Blob／`<a download>`／`FileReader` 等瀏覽器 I/O **只出現在本層**（design Decision 7）。

> **交棒記錄（M8 §4 Stage 2 review m3）**：`history-csv.ts` 已 `export` 了
> `HISTORY_CSV_HEADERS`（9.3.1 的 11 個欄位標題，順序固定）。§8 若需要顯示 CSV 匯出
> 的預覽表頭，請直接 `import` 這份常數，SHALL NOT 在本群組另抄一份欄位名稱字面值——
> 兩處各自維護會在欄位改動時漂移。

- [ ] 8.1 RED: 新增 `nextjs-pickball/tests/e2e/specs/matchmaker-data-transfer.spec.ts`，
      寫入兩個 test：「可從 matchmaker 區段導覽抵達資料頁並看到四個功能區塊」、
      「資料頁標示 CSV 匯出入不對稱且完整還原請用 JSON」。
      跑 `pnpm --filter ./nextjs-pickball test:e2e --grep "資料頁"` 確認紅燈並貼出輸出
- [ ] 8.2 GREEN: 建立 `app/matchmaker/data/page.tsx` 與四個區塊元件骨架
      （`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection`、
      `ClearLocalDataSection`），含 9.3 不對稱說明文字與從 matchmaker 區段的導覽入口
- [ ] 8.2a **必 TDD**（`lib/**` 的行為邏輯，非例外層）：導覽入口的單一來源是
      `nextjs-pickball/lib/matchmaker/section-nav.ts`——在 `MATCHMAKER_SECTION_HREFS`
      （第 13 行）與 `MATCHMAKER_SECTION_LABELS`（第 15～21 行）各加一筆資料頁路徑
      （標籤「資料」）。`lib/matchmaker/section-nav.test.ts` 第 31～36 行的 `toEqual`
      regression guard 釘死「分頁清單依序為對戰與參賽者兩筆」，**先更新該測試看紅燈**，
      再改 `section-nav.ts` 轉綠。渲染層 `components/matchmaker/MatchmakerTabs.tsx`
      讀同一份常數，不需另外改。
      漏做的話會拖到 §9.6「`pnpm test` 全套通過」才爆，且那不是 TDD 紅燈而是既有測試被破壞。
      **M7 也會改同兩處**，合併時保留雙方分頁（順序：對戰／參賽者／歷史／資料）
- [ ] 8.3 RED: 補 test「匯入合法 JSON 備份後參賽者與歷史一併還原」。確認紅燈
- [ ] 8.4 GREEN: 接上 `JsonBackupSection` 的匯出（Blob + `<a download>`）與匯入
      （`File.text()` → `parseBackup` → `writeBackup` → `location.reload()`），
      失敗時只顯示訊息**不寫入**
      `exportedAt` MUST 直接來自 `new Date().toISOString()`，SHALL NOT 由使用者輸入
      或其他來源取得——`backupFileName` 對非 ISO 輸入不做防護（§2 Stage 2 Minor-4 裁決：
      不加執行期驗證，違反 Simplicity First 且會讓純函式多一條錯誤路徑）
- [ ] 8.5 RED: 補兩個 test：「在 CSV 匯入預覽按取消後名單維持不變」、
      「確認 CSV 匯入預覽後名單新增匯入的參賽者」。確認紅燈
- [ ] 8.6 GREEN: 接上 `RosterCsvImportSection`：選檔 → `parseRosterCsv` → 顯示預覽
      （可新增人數 + 問題列的列號／欄位／原因）→ 有錯誤列時確認鈕 disabled →
      確認後 `applyRosterImport` → 寫入 → reload
- [ ] 8.7 RED: 補三個 test：「清除本機資料的確認提示載明無法復原、建議先匯出並說明備份不含
      計分進度」、「取消清除本機資料後名單維持不變」、「確認清除本機資料後參賽者頁回到
      空白狀態」。確認紅燈
- [ ] 8.8 GREEN: 實作 `components/matchmaker/ClearLocalDataDialog.tsx`：
      比照既有 `ResetRosterDialog` 的 `AlertDialog` + `variant="destructive"` 模式，
      文案含三句（無法復原／建議先匯出 JSON／備份不含 `/scoreboard` 計分進度）
- [ ] 8.9 REFACTOR: 四個區塊共用的「選檔 → 讀文字 → 顯示錯誤」樣板抽成單一元件或
      小型 helper；確認 `lib/` 的純函式沒有為了配合 UI 而被改動

## 9. 收尾驗證（驗證項，非實作項）

- [ ] 9.1 逐條核對 delta spec 的 38 個「驗收」錨點：以腳本抽出
      `**驗收**：\`<path>\`，it／test 名稱「<name>」` 並與實際 `it(...)`／`test(...)`
      逐字比對（比照 M2 §13.1 的做法），**不靠目視**
- [ ] 9.2 spec 條目重複檢查：依 root `CLAUDE.md` 指定的 python 計數法統計
      `### Requirement:` 與 `#### Scenario:`，**不使用 BSD `uniq`**
- [ ] 9.3 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠
- [ ] 9.4 `pnpm lint` 0 errors（既有 3 個 warning 不計）
- [ ] 9.5 `pnpm typecheck` 通過
- [ ] 9.6 `pnpm test` 全套通過（確認未破壞 M1～M7 既有測試與後端測試）
- [ ] 9.7 `pnpm test:e2e` 通過（本 change 新增的 8 個 E2E case 皆綠）；
      **後端測試在受限沙箱會噴 `listen EPERM`，那是 miniflare 需要開 localhost server
      被擋，不是設定錯誤**，放行後重跑即可
- [ ] 9.8 確認 `git status` 中**沒有**任何 `openspec/specs/**`、`prd.md`、
      `lib/matchmaker/storage.ts`、`roster.ts`、`types.ts`、`colors.ts`、`hooks/**` 的改動
- [ ] 9.9 `DO_NOT_TRACK=1 npx openspec validate matchmaker-data-transfer --strict` 通過
- [ ] 9.10 派發 Final Code Reviewer（見 `execution-plan.md`）對完整 commit 集合做跨任務審查，
      並把結論記入本檔
