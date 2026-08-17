> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。

## 1. 型別與常數骨架

- [x] 1.1 建立 `nextjs-pickball/lib/matchmaker/allocation-types.ts`，定義 `MatchFormat`（`"singles" | "doubles"`）與 `DoublesComposition`（`"mens" | "womens" | "mixed" | "general"`）
- [x] 1.2 定義 `Team`（`players: readonly Player[]`、`rating: number`）、`Match`（`courtNumber`、`teams: readonly [Team, Team]`、`format`、`doublesComposition?`）、`RoundAllocation`（`matches`、`resting`）
- [x] 1.3 定義 `AllocationInput`（`players`、`format`、`courtCount`、`seenSignatures`），並確認全部欄位皆可序列化（無函式、無 class 實例，見 design Context）——`seenSignatures` 的型別 `SignatureIndex` 亦定義於本檔（三個 `readonly string[]`，而非 `Set`，確保可序列化），供 duplication.ts（後續批次）沿用
- [x] 1.4 匯出常數 `DEFAULT_FORMAT = "singles"`、`DEFAULT_COURT_COUNT = 1`、`MIN_COURT_COUNT = 1`、`MAX_COURT_COUNT = 8`、`PLAYERS_PER_MATCH = { singles: 2, doubles: 4 }`
- [x] 1.5 本檔為純型別與常數檔，依 `openspec/config.yaml` 的 TDD 例外**不建立 `allocation-types.test.ts`**；常數的斷言掛在 `candidates.test.ts`（見 design Decision 2）
- [x] 1.6 型別匯入一律 `import type`（`verbatimModuleSyntax` 已開啟）；跑 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 確認無誤

## 2. 候選排序（candidates.ts）

- [x] 2.1 🔴 新增 `nextjs-pickball/lib/matchmaker/candidates.test.ts`，寫入三個 it：「休息次數多者優先出場」、「同休息次數時強度分數高者優先」、「休息次數與強度皆相同時維持輸入的相對次序」。跑單檔確認紅燈並貼出輸出
- [x] 2.2 🟢 實作 `sortCandidates(players)`：`restCount` 遞減 → `rating` 遞減 → 穩定。排序前先 `slice()` 複製，不得原地改動輸入（design Decision 8）
- [x] 2.3 ♻️ refactor：比較函式抽出具名常數或輔助函式，確認無重複邏輯（skipped：GREEN 階段已將比較邏輯抽為具名函式 `compareCandidates`，複查無重複，無需再動）
- [x] 2.4 🔴 補三個 it：「預設為單打與 1 個場地，場地數範圍為 1～8」、「出場人數取 min(可用人數, 場地數×每場人數) 後向下取整至每場人數的倍數」、「暫停出場者不進入候選池，既不出場也不列入休息名單」。確認紅燈
- [x] 2.5 🟢 實作 `countPlaying(availableCount, format, courtCount)` 與 `selectPlaying(players, format, courtCount)`：先以 `isActive` 過濾候選池 → 排序 → 取前 N 出場、其餘為休息名單
- [x] 2.6 🟢 確認暫停者既不在 `playing` 也不在 `resting`（design Decision 3）
- [x] 2.7 ♻️ refactor：`countPlaying` 的取整邏輯確認只有一處，`PLAYERS_PER_MATCH` 為唯一人數來源（skipped：複查後取整邏輯僅存在於 `countPlaying`，`selectPlaying` 呼叫而非重算，無需再動）

## 3. 單打配對（pairing.ts）

- [ ] 3.1 🔴 新增 `nextjs-pickball/lib/matchmaker/pairing.test.ts`，寫入兩個 it：「單打依強度排序後相鄰兩兩配對」、「單打每隊一人，隊伍分數等於該員 rating」。第一個 it 須同時斷言「分差總和不大於其他配對方式」。確認紅燈
- [ ] 3.2 🟢 實作 `pairSingles(playing)`：依 `rating` 排序後相鄰兩兩配對，每隊 1 人，隊伍分數為該員 `rating`
- [ ] 3.3 ♻️ refactor：與雙打共用的「建立 Team」邏輯抽成內部輔助函式

## 4. 雙打組隊（pairing.ts）

- [ ] 4.1 🔴 於 `pairing.test.ts` 補三個 it：「雙打組內以最高＋最低對第二高＋第三高」、「雙打組隊方式的兩隊總和差不大於其餘分隊方式」、「多組雙打依強度由高到低每 4 人切分」。確認紅燈
- [ ] 4.2 🟢 實作 `pairDoubles(playing)`：依 `rating` 由高到低排序 → 每 4 人一組 → 組內「最高＋最低」為第一隊、「第 2 高＋第 3 高」為第二隊，隊伍分數為兩人 `rating` 總和
- [ ] 4.3 ♻️ refactor：確認 4 人分組的切片邏輯無 off-by-one，且不依賴輸入長度剛好整除（人數已於 §2 保證為 4 的倍數，但函式本身不得因此崩潰）

## 5. 雙打組成事後標示（pairing.ts）

- [ ] 5.1 🔴 於 `pairing.test.ts` 補三個 it：「雙打四人同性別時標示男雙或女雙」、「雙打兼有男女且無其他時標示混雙」、「雙打含其他不指定時標示一般雙打」。確認紅燈
- [ ] 5.2 🟢 實作 `labelDoublesComposition(fourPlayers)`：判定對象為**整場 4 人**而非單一隊伍；含任一 `other` 一律回傳 `"general"`
- [ ] 5.3 🟢 於 `pairDoubles` 產生的每個 `Match` 掛上 `doublesComposition`；單打的 `Match` 不帶此欄位
- [ ] 5.4 ♻️ refactor：確認標示邏輯**完全不影響**選人與配對——`labelDoublesComposition` 只在隊伍決定後被呼叫，其回傳值不流回任何排序或配對函式

## 6. 重複配對簽章（duplication.ts）

- [ ] 6.1 🔴 新增 `nextjs-pickball/lib/matchmaker/duplication.test.ts`，寫入 it「三類簽章與球員排列順序無關」：同一場對戰在隊內互換、兩隊互換後三類簽章皆須相同。確認紅燈
- [ ] 6.2 🟢 實作 `teammateKeys(match)`、`opponentKeys(match)`、`fullMatchKey(match)`：player id 先字典序排序再以 `|`（隊內）與 `#`（隊間）串接（design Decision 4）
- [ ] 6.3 🟢 定義 `SignatureIndex`（三個 `Set<string>` 或等價的可序列化結構），並提供由 `Match[]` 建立索引的函式
- [ ] 6.4 ♻️ refactor：分隔符抽為具名常數，確認三個函式共用同一套 id 正規化邏輯

## 7. 重複偵測與受限交換（duplication.ts）

- [ ] 7.1 🔴 於 `duplication.test.ts` 補 it「與歷史有相同隊友或對手組合時判定為重複」（含「完全沒有交集時判定為不重複」的斷言）。確認紅燈
- [ ] 7.2 🟢 實作 `countRepeats(matches, seen)`：回傳重複命中數
- [ ] 7.3 🔴 補兩個 it：「有可行交換時降低重複數且不更動出場名單」、「迴避會擴大強度差距時保留原配對並接受重複」。確認紅燈
- [ ] 7.4 🟢 實作 `ratingSpread(matches)`：單打取每場雙方 `rating` 差絕對值總和、雙打取每場兩隊總和差絕對值總和（design Decision 5）
- [ ] 7.5 🟢 實作 `avoidRepeats(matches, seen)`：依 5.6 三階段依序試探（跨場地換人 → 隊內換隊友 → 相鄰強度重排），採納條件為**重複數下降且 `ratingSpread` 未增加**（`<=`），否則回退
- [ ] 7.6 🟢 確認 `avoidRepeats` 只重排既有球員，無法新增或移除任何人——出場名單成員在調整前後必須完全相同
- [ ] 7.7 ♻️ refactor：試探掃描順序固定（不使用 `Math.random`），確保決定性；抽出「試探並回退」的共用結構避免三階段各寫一份

## 8. 分配入口（allocation.ts）

- [ ] 8.1 🔴 新增 `nextjs-pickball/lib/matchmaker/allocation.test.ts`，寫入三個 it：「輸出包含場地編號、兩隊球員與分數、對戰類型與休息名單」、「場地編號由 1 起算且連續指派」、「相同輸入產生相同輸出」。確認紅燈
- [ ] 8.2 🟢 實作 `allocateRound(input)`：`selectPlaying` → `pairSingles` / `pairDoubles` → `avoidRepeats` → 指派 1 起算的連續場地編號 → 回傳 `{ matches, resting }`
- [ ] 8.3 🔴 補三個 it：「場地無法填滿時只產生可完整組成的場次」、「分配不修改輸入的參賽者物件」、「僅性別不同時出場名單與隊伍組成完全一致」。確認紅燈
- [ ] 8.4 🟢 補齊上述行為；「不修改輸入」以 `structuredClone` 前後比對或凍結輸入驗證
- [ ] 8.5 ♻️ refactor：確認 `allocateRound` 只做串接，四個子模組的職責無外洩

## 9. 優先序的整體保證（allocation.ts）

- [ ] 9.1 🔴 於 `allocation.test.ts` 補三個 it：「強度差距再大也不得讓休息次數多者繼續休息」、「避免重複會改變出場人選時接受重複」、「無交換可行時照常產生重複的對戰」。確認紅燈
- [ ] 9.2 🟢 補齊行為；此三項是 5.1 嚴格優先序的核心承諾，實作若需在 `avoidRepeats` 加防護則加在該處，不得在 `allocateRound` 事後修補名單
- [ ] 9.3 🔴 補 it「連續多輪後出場機會輪轉，累計出場次數差距不超過 1」：以 6 人單打 1 場地連續跑多輪，每輪後對休息者 `restCount + 1`（在測試內模擬，不在被測函式內累加）。確認紅燈
- [ ] 9.4 🟢 補齊行為，確認方向未反轉（休息次數**多**者優先，非少者）
- [ ] 9.5 ♻️ refactor：檢查是否有任何路徑能讓後順位項目推翻前順位；若結構上已不可能，在 design 或註解記錄理由

## 10. 邊界條件（allocation.ts）

- [ ] 10.1 🔴 於 `allocation.test.ts` 補五個 it：「單打可用人數不足 2 時回傳空對戰清單」、「雙打可用人數不足 4 時回傳空對戰清單」、「全員暫停出場時對戰與休息名單皆為空」、「名單為空時回傳空結果且不拋錯」、「場地數超出 1～8 時拒絕輸入而非靜默夾值」。確認紅燈
- [ ] 10.2 🟢 補齊人數不足與空名單路徑：回傳空 `matches` 與完整 `resting`，不拋例外、不產生不完整隊伍
- [ ] 10.3 🟢 場地數超出 1～8 時拋出可判讀的錯誤（design Decision 7），錯誤訊息為繁體中文並說明合法範圍
- [ ] 10.4 ♻️ refactor：邊界判斷集中在 `allocateRound` 入口一處，子模組不各自重複檢查

## 11. 收尾驗證

- [ ] 11.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以腳本機械比對，不靠目視
- [ ] 11.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠，貼出輸出
- [ ] 11.3 `pnpm lint` 通過，貼出輸出
- [ ] 11.4 `pnpm typecheck` 通過，貼出輸出
- [ ] 11.5 `pnpm test` 全套通過（確認未破壞 M1 既有測試），貼出輸出
- [ ] 11.6 本段無 UI，**不跑 E2E**；在此註明理由，避免日後誤判為漏跑
- [ ] 11.7 `DO_NOT_TRACK=1 openspec validate matchmaker-allocation-engine --strict` 通過
