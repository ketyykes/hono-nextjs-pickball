> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。

## 1. 型別與常數骨架

- [x] 1.1 建立 `nextjs-pickball/lib/matchmaker/allocation-types.ts`，定義 `MatchFormat`（`"singles" | "doubles"`）與 `DoublesComposition`（`"mens" | "womens" | "mixed" | "general"`）
- [x] 1.2 定義 `Team`（`players: readonly Player[]`、`rating: number`）、`Match`（`courtNumber`、`teams: readonly [Team, Team]`、`format`、`doublesComposition?`）、`RoundAllocation`（`matches`、`resting`）
- [x] 1.3 定義 `AllocationInput`（`players`、`format`、`courtCount`、`seenSignatures`），並確認全部欄位皆可序列化（無函式、無 class 實例，見 design Context）——`seenSignatures` 的型別 `SignatureIndex` 亦定義於本檔，供 duplication.ts（後續批次）沿用（⚠️ **文件漂移更正**：本行原寫「三個 `readonly string[]`，而非 `Set`，確保可序列化」，但該型別已於 fix commit `20b8a1f` 改為三個 `ReadonlySet<string>`——理由是陣列允許重複條目而型別名叫「索引」，且「可序列化」的約束屬於第 3 段的持久化表示法，不屬本函式引數，見 `allocation-types.ts` 現行的 `SignatureIndex` 定義與 design Decision 4）
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

> ⚠️ **本節與 §4、§5 的 TDD 證據有缺口，如實記錄**：實作 commit `682cd34` 未同步更新本檔，
> 是事後（commit 後）由主 agent 依實作者回報補記的。實作者只提供了**一次**紅燈輸出——
> `pairing.test.ts` 建立、`pairing.ts` 尚不存在時的模組解析失敗：
>
> ```
> FAIL  lib/matchmaker/pairing.test.ts [ lib/matchmaker/pairing.test.ts ]
> Error: Failed to resolve import "./pairing" from "lib/matchmaker/pairing.test.ts". Does the file exist?
>  Test Files  1 failed (1)
>       Tests  no tests
> ```
>
> 該紅燈只涵蓋 3.1。**4.1 與 5.1 沒有各自獨立的紅燈輸出**，無法區分「先寫測試看到紅燈」
> 與「實作完補測試」。這是流程缺陷，不是事後可補救的證據——標註於此以免日後誤讀為完整 TDD。
> 綠燈為 `pairing.test.ts` 9 passed（主 agent 已自行重跑確認）。

- [x] 3.1 🔴 新增 `nextjs-pickball/lib/matchmaker/pairing.test.ts`，寫入兩個 it：「單打依強度排序後相鄰兩兩配對」、「單打每隊一人，隊伍分數等於該員 rating」。第一個 it 須同時斷言「分差總和不大於其他配對方式」。確認紅燈（紅燈輸出見上方 ⚠️ 區塊）
- [x] 3.2 🟢 實作 `pairSingles(playing)`：依 `rating` 排序後相鄰兩兩配對，每隊 1 人，隊伍分數為該員 `rating`
- [x] 3.3 ♻️ refactor：與雙打共用的「建立 Team」邏輯抽成內部輔助函式（撰寫綠燈程式碼時已一併抽為 `buildTeam`，複查無額外壞味道，未產生獨立 refactor commit）

## 4. 雙打組隊（pairing.ts）

- [x] 4.1 🔴 於 `pairing.test.ts` 補三個 it：「雙打組內以最高＋最低對第二高＋第三高」、「雙打組隊方式的兩隊總和差不大於其餘分隊方式」、「多組雙打依強度由高到低每 4 人切分」。確認紅燈（⚠️ **無獨立紅燈輸出**，見 §3 開頭說明）
- [x] 4.2 🟢 實作 `pairDoubles(playing)`：依 `rating` 由高到低排序 → 每 4 人一組 → 組內「最高＋最低」為第一隊、「第 2 高＋第 3 高」為第二隊，隊伍分數為兩人 `rating` 總和
- [x] 4.3 ♻️ refactor：確認 4 人分組的切片邏輯無 off-by-one，且不依賴輸入長度剛好整除（迴圈條件為 `i + 4 <= sorted.length`，殘餘 1～3 人自然略過不解構出 `undefined`；已補防呆測試「雙打人數非 4 的倍數時不崩潰」——該 it 不在 spec 驗收錨點內，屬 tasks 4.3 的防呆驗證而非 spec 承諾）

## 5. 雙打組成事後標示（pairing.ts）

- [x] 5.1 🔴 於 `pairing.test.ts` 補三個 it：「雙打四人同性別時標示男雙或女雙」、「雙打兼有男女且無其他時標示混雙」、「雙打含其他不指定時標示一般雙打」。確認紅燈（⚠️ **無獨立紅燈輸出**，見 §3 開頭說明）
- [x] 5.2 🟢 實作 `labelDoublesComposition(fourPlayers)`：判定對象為**整場 4 人**而非單一隊伍；含任一 `other` 一律回傳 `"general"`
- [x] 5.3 🟢 於 `pairDoubles` 產生的每個 `Match` 掛上 `doublesComposition`；單打的 `Match` 不帶此欄位（`Match` 已於 fix `20b8a1f` 改為 discriminated union，此約束改由編譯期保證）
- [x] 5.4 ♻️ refactor：確認標示邏輯**完全不影響**選人與配對——`labelDoublesComposition` 只在隊伍決定後被呼叫，其回傳值不流回任何排序或配對函式（code review 以實測確認：回傳值只落進 `doublesComposition` 欄位，不流回 `sortByRatingDesc`／`buildTeam`／分組迴圈）

## 6. 重複配對簽章（duplication.ts）

- [x] 6.1 🔴 新增 `nextjs-pickball/lib/matchmaker/duplication.test.ts`，寫入 it「三類簽章與球員排列順序無關」：同一場對戰在隊內互換、兩隊互換後三類簽章皆須相同。確認紅燈
- [x] 6.2 🟢 實作 `teammateKeys(match)`、`opponentKeys(match)`、`fullMatchKey(match)`：player id 先字典序排序再以 `|`（隊內）與 `#`（隊間）串接（design Decision 4）
- [x] 6.3 🟢 提供由 `Match[]` 建立 `SignatureIndex` 索引的函式 `buildSignatureIndex`（`SignatureIndex` 型別已在 1.3 定義於 `allocation-types.ts`，本檔沿用不重複定義）
- [x] 6.4 ♻️ refactor：分隔符抽為具名常數，`teamTeammateSignature` 沿用 `teamRawSignature`，確認三個函式共用同一套 id 正規化邏輯

## 7. 重複偵測與受限交換（duplication.ts）

- [x] 7.1 🔴 於 `duplication.test.ts` 補 it「與歷史有相同隊友或對手組合時判定為重複」（含「完全沒有交集時判定為不重複」的斷言）。確認紅燈
- [x] 7.2 🟢 實作 `countRepeats(matches, seen)`：回傳重複命中數
- [x] 7.3 🔴 補兩個 it：「有可行交換時降低重複數且不更動出場名單」、「迴避會擴大強度差距時保留原配對並接受重複」。確認紅燈
- [x] 7.4 🟢 實作 `ratingSpread(matches)`：單打取每場雙方 `rating` 差絕對值總和、雙打取每場兩隊總和差絕對值總和（design Decision 5）；內部以「分」為單位取整數差再比較，避免浮點加總誤差（見 duplication.test.ts「ratingSpread 的浮點誤差防護」）
- [x] 7.5 🟢 實作 `avoidRepeats(matches, seen)`：依 5.6 三階段依序試探（跨場地換人 → 隊內換隊友 → 相鄰強度重排），採納條件為**重複數下降且 `ratingSpread` 未增加**（`<=`），否則回退
- [x] 7.6 🟢 確認 `avoidRepeats` 只重排既有球員，無法新增或移除任何人——出場名單成員在調整前後必須完全相同（隨 7.3 的測試一併斷言）
- [x] 7.7 ♻️ refactor：試探掃描順序固定（不使用 `Math.random`），確保決定性；抽出 `runStage` 作為「試探並回退」的共用結構，三階段共用不各自寫一份

## 8. 分配入口（allocation.ts）

> ⚠️ **8.3／9.1／9.3 的紅燈是「regression guard」而非傳統 TDD 紅燈，如實記錄**：
> 8.2 依 task 字面指示（`selectPlaying → pairSingles/pairDoubles → avoidRepeats → 指派場地編號`）
> 一次到位實作了完整組合，該組合已是能通過 8.1 三個 it 的最小正確實作——沒有更小的實作能同時
> 滿足「輸出形狀」「連續場地編號」「決定性」。因為 candidates.ts／pairing.ts／duplication.ts
> 三個子模組在前面批次（§2～§7）已各自驗證為純函式、不修改輸入、正確處理場地無法填滿與性別
> 不影響配對，8.3／9.1／9.3 新增的 it 因而是這些既有保證透過 `allocateRound` 重新曝光的
> **必然結果**，並非需要新程式碼才能通過。三次都是加入測試後立即執行看到全綠（見下方各步驟
> 貼出的 shell 輸出），沒有透過「先改斷言看紅、再改回」偽造紅燈。唯一真正的模組層級紅燈是
> 8.1（`allocation.ts` 尚不存在時的 import 解析失敗），與 §3 開頭記錄的 `pairing.ts` 情況同構。

- [x] 8.1 🔴 新增 `nextjs-pickball/lib/matchmaker/allocation.test.ts`，寫入三個 it：「輸出包含場地編號、兩隊球員與分數、對戰類型與休息名單」、「場地編號由 1 起算且連續指派」、「相同輸入產生相同輸出」。確認紅燈
- [x] 8.2 🟢 實作 `allocateRound(input)`：`selectPlaying` → `pairSingles` / `pairDoubles` → `avoidRepeats` → 指派 1 起算的連續場地編號 → 回傳 `{ matches, resting }`
- [x] 8.3 🔴 補三個 it：「場地無法填滿時只產生可完整組成的場次」、「分配不修改輸入的參賽者物件」、「僅性別不同時出場名單與隊伍組成完全一致」。確認紅燈（⚠️ 實測為 regression guard 立即全綠，見本節開頭說明；非傳統紅燈）
- [x] 8.4 🟢 補齊上述行為；「不修改輸入」以 `structuredClone` 前後比對或凍結輸入驗證（8.3 加入時已全綠，無需額外實作；`allocation.test.ts` 的「分配不修改輸入的參賽者物件」以 `structuredClone` 前後比對驗證）
- [x] 8.5 ♻️ refactor：確認 `allocateRound` 只做串接，四個子模組的職責無外洩（複查 `allocation.ts` 僅呼叫四個子模組並指派場地編號，無重新實作排序／配對／迴避邏輯，無需再動）

## 9. 優先序的整體保證（allocation.ts）

- [x] 9.1 🔴 於 `allocation.test.ts` 補三個 it：「強度差距再大也不得讓休息次數多者繼續休息」、「避免重複會改變出場人選時接受重複」、「無交換可行時照常產生重複的對戰」。確認紅燈（⚠️ 實測為 regression guard 立即全綠，見 §8 開頭說明；非傳統紅燈）
- [x] 9.2 🟢 補齊行為；此三項是 5.1 嚴格優先序的核心承諾，實作若需在 `avoidRepeats` 加防護則加在該處，不得在 `allocateRound` 事後修補名單（9.1 加入時已全綠，`avoidRepeats` 既有的型別與採納條件已足夠保護，`allocateRound` 未新增任何事後修補邏輯）
- [x] 9.3 🔴 補 it「連續多輪後出場機會輪轉，累計出場次數差距不超過 1」：以 6 人單打 1 場地連續跑多輪，每輪後對休息者 `restCount + 1`（在測試內模擬，不在被測函式內累加）。確認紅燈（⚠️ 實測為 regression guard 立即全綠，見 §8 開頭說明；非傳統紅燈——12 輪模擬下 6 人出場次數差距為 0）
- [x] 9.4 🟢 補齊行為，確認方向未反轉（休息次數**多**者優先，非少者）（9.3 加入時已全綠，`candidates.ts` 的 `compareCandidates` 方向自 §2 起即為 `restCount` 遞減，未反轉，無需額外實作）
- [x] 9.5 ♻️ refactor：檢查是否有任何路徑能讓後順位項目推翻前順位；若結構上已不可能，在 design 或註解記錄理由（已在 `allocation.ts` 的 `allocateRound` docstring 補上逐項理由：`pairing.ts` 拿不到 `resting`、`duplication.ts` 的 `avoidRepeats` 型別上只能重排既有 `Match[]` 且採納條件拒絕強度劣化，`allocateRound` 本身在迴避之後不做任何名單／配對的事後修補）

## 10. 邊界條件（allocation.ts）

> ⚠️ **10.1 的五個 it 中，四個是「regression guard」，只有場地數範圍檢查是真紅燈，如實記錄**：
> `candidates.ts` 的 `selectPlaying`／`countPlaying` 在前面批次（§2）已處理好「`isActive` 過濾」
> 與「向下取整至每場人數倍數（含 0）」，`pairSingles`／`pairDoubles` 的迴圈條件
> `i + perMatch <= length` 在人數不足時本就不產生任何場次——這三項邊界（單打/雙打人數不足、
> 全員暫停、名單為空）在加入測試的當下就直接全綠，是既有保證透過 `allocateRound` 重新曝光的
> 必然結果，同構於 §8/§9 記錄的模式。**場地數範圍檢查則不同**：`allocateRound` 在本批之前
> 完全沒有對 `courtCount` 做任何驗證，是本 change 目前唯一一個「先寫測試、實際看到紅燈、
> 再寫最小實作讓它變綠」的傳統 TDD 循環。實測輸出：
>
> ```
> ❯ lib/matchmaker/allocation.test.ts (15 tests | 1 failed) 11ms
>      × 場地數超出 1～8 時拒絕輸入而非靜默夾值 3ms
> AssertionError: expected [Function] to throw an error
>  Test Files  1 failed (1)
>       Tests  1 failed | 14 passed (15)
> ```
>
> 綠燈（10.3 實作 `assertValidCourtCount` 後）：`Test Files 1 passed / Tests 15 passed`。

- [x] 10.1 🔴 於 `allocation.test.ts` 補五個 it：「單打可用人數不足 2 時回傳空對戰清單」、「雙打可用人數不足 4 時回傳空對戰清單」、「全員暫停出場時對戰與休息名單皆為空」、「名單為空時回傳空結果且不拋錯」、「場地數超出 1～8 時拒絕輸入而非靜默夾值」。確認紅燈（⚠️ 四項為 regression guard 立即全綠、一項為真紅燈，見本節開頭說明）
- [x] 10.2 🟢 補齊人數不足與空名單路徑：回傳空 `matches` 與完整 `resting`，不拋例外、不產生不完整隊伍（10.1 加入時該四項已全綠，`candidates.ts`／`pairing.ts` 既有邏輯已足夠，`allocateRound` 未新增額外處理）
- [x] 10.3 🟢 場地數超出 1～8 時拋出可判讀的錯誤（design Decision 7），錯誤訊息為繁體中文並說明合法範圍——實作 `assertValidCourtCount(courtCount)`，訊息為「場地數需介於 1 到 8 之間，請調整後再試一次（目前輸入：N）」
- [x] 10.4 ♻️ refactor：邊界判斷集中在 `allocateRound` 入口一處，子模組不各自重複檢查——複查 `candidates.ts`／`pairing.ts`／`duplication.ts` 三個子模組皆未新增邊界檢查，`assertValidCourtCount` 是唯一新增的檢查點，於 `allocateRound` 開頭（步驟 0）呼叫一次，無需再動

## 11. 跨批次缺口修補（A／B／C，第 5 批 review 追加）

> 第 4 批 code review 記錄了兩個跨批次缺口（`.claude/agent-memory/code-reviewer-readonly/project_matchmaker_allocation_engine.md`「待後續批次驗證的追蹤項」）與一處文件漂移，於本批一併處理，不另開變更。

- [x] 11.A.1 🔴 於 `allocation.test.ts` 補 it「avoidRepeats 換人後雙打組成標示會依實際成員重新推導」：構造一個會觸發跨場地換人的雙打歷史重複 fixture，換人後兩場的實際性別組成皆變成男女混合，斷言 `doublesComposition` 為 `"mixed"`。確認紅燈：
  ```
  AssertionError: expected 'mens' to be 'mixed'
  Tests  1 failed | 15 skipped (16)
  ```
- [x] 11.A.2 🟢 `allocation.ts` 在 `avoidRepeats` 之後、指派場地編號之前，新增 `relabelDoublesComposition`：對雙打場次以當下兩隊實際成員重新呼叫 `pairing.ts` 的 `labelDoublesComposition`；單打場次原樣返回。綠燈：`Test Files 1 passed / Tests 16 passed`
- [x] 11.A.3 ♻️ refactor：確認 `relabelDoublesComposition` 只讀 `Match.teams` 重推導標示，不回頭影響 `avoidRepeats` 已決定的球員位置或隊伍組成（複查無需再動）
- [x] 11.B.1 🔴 於 `duplication.test.ts` 補 it「交換後的隊伍分數與直接配對產生的隊伍分數表示一致」：fixture 使 `avoidRepeats` 交換後 `rebuildMatch` 重建的隊伍分數為 `2.01 + 1.01`（IEEE754 下為 `3.0199999999999996`），斷言 `Team.rating` 為四捨五入後的 `3.02`。確認紅燈：
  ```
  AssertionError: expected 3.0199999999999996 to be 3.02
  Tests  1 failed | 5 skipped (6)
  ```
- [x] 11.B.2 🟢 `duplication.ts` 的 `rebuildMatch` 改用與 `pairing.ts` 的 `buildTeam` 相同的四捨五入（`Math.round(sum * 100) / 100`）。綠燈：`Test Files 1 passed / Tests 6 passed`
- [x] 11.B.3 ♻️ 共用性評估：`buildTeam`（`pairing.ts`）與 `rebuildMatch`（`duplication.ts`）的四捨五入邏輯目前**各自一行 `Math.round(sum * 100) / 100`**，未抽共用函式。理由：`pairing.ts` 不在本批可動檔案清單內，且兩處各自的四捨五入時機緊鄰不同的加總來源（`buildTeam` 對初始配對、`rebuildMatch` 對換人後的隊伍），抽共用模組需新增檔案或觸碰 `pairing.ts`，超出本批範圍。**記錄為後續項**：下次觸及 `pairing.ts` 時，評估把「rating 四捨五入到分」抽成 `allocation-types.ts` 或新檔的具名函式（例如 `roundTeamRating`），供兩處 import，避免兩處各自維護同一條 magic number（`100`）。
- [x] 11.C.1 更正 tasks.md 1.3 的文件漂移：`SignatureIndex` 已於 fix commit `20b8a1f` 改為 `ReadonlySet<string>`，1.3 原文「三個 `readonly string[]`」已過時，改為指向現行定義（見上方 1.3 的 ⚠️ 區塊）

## 12. 第 3 批 code review 追加項（D1～D5，第 5 批一併處理）

> 第 3 批（`duplication.ts`，commit `73470f6`）的 code review 判「1 個 High（流程）」＋數個 Medium，主 agent 要求在本批一併處理，不另開分支。

- [x] 12.D1 補記 §6／§7 的紅燈證據（reviewer 判「高」，同構於 commit `f500b7a` 已檢討過的同一個洞）：
  - Cycle A（§6.1，it「三類簽章與球員排列順序無關」）紅燈：`Error: Failed to resolve import "./duplication"`；綠燈：`Test Files 1 passed / Tests 1 passed`
  - Cycle B（§7.1–7.2，it「與歷史有相同隊友或對手組合時判定為重複」）紅燈：`TypeError: countRepeats is not a function`；綠燈：`Test Files 1 passed / Tests 2 passed`
  - Cycle C（§7.3–7.6，三個 it）紅燈：`TypeError: ratingSpread is not a function`（3 個測試皆因此失敗）；綠燈：`Test Files 1 passed / Tests 5 passed`
  三次皆為「函式尚不存在」的模組層級真紅燈，與 §3 開頭記錄的「無獨立紅燈」情況不同類。
- [x] 12.D2 🔴🟢 修正浮點防護測試假紅燈（reviewer 判「中」）：`duplication.test.ts` 原 fixture `1.1+2.2` vs `1.0+2.3` 乘以 100 後兩邊皆恰為 `330`，`Math.round` 未真正被觸發。改用 `a=2.02, b=1.00, c=2.01, d=1.01`（`*100` 後為 `302` vs `301.99999999999994`，四捨五入後才相等）。Mutation 驗證：
  - `toRatingCents` 拿掉 `Math.round`（改回傳 `rating * CENTS_PER_RATING_UNIT`）→ 紅燈：`AssertionError: expected 5.684341886080802e-16 to be +0`
  - 加回 `Math.round` → 綠燈：`Test Files 1 passed / Tests 6 passed`
- [x] 12.D3 🔴🟢 補 it「強度差距總和完全不變時仍接受交換」覆蓋 `avoidRepeats` 採納條件的 `<=`（reviewer 判「中」，`design.md` Decision 5 的「零成本交換要接受」原本零測試 pin）：`a=5.0 vs b=3.0`（歷史重複）、`c=5.0 vs d=3.0`，交換後兩場仍是 5 vs 3，`ratingSpread` 前後皆為 `4.0`，重複數 1→0。Mutation 驗證：
  - `runStage` 採納條件 `spread <= current.spread` 改為 `spread < current.spread` → 紅燈：`AssertionError: expected +0 to be 4`（改用另一個候選達成 spread=0，證明 `<=` 分支確實影響最終結果）
  - 改回 `<=` → 綠燈：`Test Files 1 passed / Tests 7 passed`
- [x] 12.D4 🔴🟢 補雙打 it「雙打隊內換隊友能消除隊友組合重複（受限交換階段②）」，覆蓋階段②（`intraTeamSwapCandidates`，reviewer 判「中」：既有兩個 `avoidRepeats` 測試皆為單打，階段②的雙打有效路徑一次都沒被執行過）。刻意只用單一場地讓階段①（跨場地換人）產生零候選；斷言精確到重建後的隊伍組成（`team0=[c,b]`、`team1=[a,d]`），而非只斷言重複數下降——因為本 fixture 若停用階段②，階段③（相鄰強度重排）會用不同候選順序找到不同組成（`[a,c]`／`[b,d]`），只斷言「重複數下降」無法區分兩者。Mutation 驗證：
  - `avoidRepeats` 停用階段②（`runStage(state, seen, [])` 取代 `intraTeamSwapCandidates(...)`）→ 紅燈：`AssertionError: expected [ 'a', 'c' ] to deeply equal [ 'c', 'b' ]`
  - 還原 → 綠燈：`Test Files 1 passed / Tests 8 passed`
- [x] 12.D5 為 `countRepeats` 的計數語意補 JSDoc 與測試 pin（reviewer 記錄的已知盲點，非 bug，需留痕避免日後被誤判重查）：
  1. JSDoc 明寫「回傳的是**有命中的場次數**，非命中次數」，並記錄此語意是 `avoidRepeats` 對「完全重複的雙打場次」束手無策的已知盲點成因
  2. 補 it「一場同時命中隊友與對手組合仍只算一次重複」pin 住此語意（regression guard，加入時已綠燈：`Test Files 1 passed / Tests 9 passed`）
  design.md 的 Risks 由主 agent 另補，不在本批範圍

### 順手小項（D1～D5 之外，reviewer 記錄的低成本補強）

- [x] 12.misc.1 `matchHitsSeen` 的 `fullMatchKeys` 檢查加註「defence-in-depth，偵測力已被前兩者涵蓋，可證為理論死碼但索引仍依 spec 要求產生三類簽章」（隨 12.D5 的 JSDoc 一併補上）
- [x] 12.misc.2 補 it「單打分差為兩隊 rating 差的絕對值，回傳單位為分數而非分」pin `ratingSpread` 的回傳單位。Mutation 驗證：
  - `ratingSpread` 拿掉 `/ CENTS_PER_RATING_UNIT`（直接回傳 `totalCents`）→ 紅燈：`AssertionError: expected 200 to be 2`
  - 還原 → 綠燈：`Test Files 1 passed / Tests 10 passed`
- [x] 12.misc.3 「ratingSpread 的浮點誤差防護」補註記「非 spec 驗收錨點」，避免 13.1 腳本比對時誤判為錯字

## 13. 收尾驗證

- [x] 13.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、it 名稱逐字相符。以 Python 腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條核對 `it("...")`，不靠目視。結果：**33 個錨點、33 個對上**（§10 補完前為 28/33，缺的 5 個正是 §10 五個 it，補完後全數對上）：
  ```
  共找到 33 個驗收錨點
  ✅ 全部 33 個錨點逐字相符
  ```
- [x] 13.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 全綠：
  ```
   Test Files  8 passed (8)
        Tests  73 passed (73)
  ```
- [x] 13.3 `pnpm lint` 通過（0 errors，3 個與本段無關的既有 warning：`useQuiz.ts`／`useRosterStore.ts`／`useScoreboardStore.ts`）：
  ```
  ✖ 3 problems (0 errors, 3 warnings)
  ```
- [x] 13.4 `pnpm typecheck` 通過（無輸出即成功）
- [x] 13.5 `pnpm test` 全套通過（確認未破壞 M1 既有測試與 hono-pickball 後端測試）：
  ```
  hono-pickball test:  Test Files  4 passed (4)
  hono-pickball test:       Tests  16 passed (16)
  nextjs-pickball test:  Test Files  39 passed (39)
  nextjs-pickball test:       Tests  269 passed (269)
  ```
- [x] 13.6 本段（`lib/matchmaker/allocation.ts`、`duplication.ts` 及對應測試）全為純函式、無 UI，**不跑 E2E**——`tests/e2e/specs/` 沒有涉及對戰分配畫面的既有測試會受影響，本批未新增任何 UI 元件或頁面路由
- [ ] 13.7 `DO_NOT_TRACK=1 openspec validate matchmaker-allocation-engine --strict` 通過
