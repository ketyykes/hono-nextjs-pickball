## Purpose

定義「匹克球對戰分配機」把參賽者名單轉為本輪對戰的完整決策規則：對戰方式與場地數、候選排序與出場名單、單打配對、雙打組隊與組成標示、重複配對迴避，以及人數不足時的邊界行為。

本 capability 的核心是 `prd.md` 5.1 的**嚴格優先序**——模式結構性約束 ＞ 累計休息次數 ＞ 強度接近 ＞ 重複配對迴避。前一項永遠不得為了滿足後一項而讓步；此順序是產品對使用者的承諾（「休息次數多者一定輪到」），一旦被破壞，使用者會直接觀察到同一批人反覆上場的死鎖。

本 capability 全部為**純函式**：不讀寫 LocalStorage、不含 React、不更新評分、不管理回合狀態。回合的建立與持久化、`restCount` 的實際累加、比分與評分更新，都屬於其他 capability。

## Requirements

### Requirement: 對戰方式與場地數

系統 SHALL 只提供單打與雙打兩種對戰方式，每場人數分別為 2 與 4。**SHALL NOT 提供任何以性別篩選出場人選的模式**（僅混雙／僅男雙／僅女雙）——候選池只有一個，不因性別分池，這讓「休息次數多者優先」不存在任何例外（`prd.md` 4.2）。

預設對戰方式 MUST 為單打，預設場地數 MUST 為 1，場地數的合法範圍 MUST 為 1～8（含兩端）。這些預設值 SHALL 由本 capability 以具名常數匯出，供上層 UI 取用，SHALL NOT 由 UI 各自寫死——寫死會讓 `prd.md` 15 的產品決策散落在多處，改動時漏改一處即與規格不符。

本輪出場人數 MUST 依下式計算，並向下取整至每場人數的倍數：

```
出場人數 = min(可用人數, 場地數 × 每場人數)  向下取整至每場人數的倍數
```

「可用人數」指 `isActive === true` 的參賽者數量。場地無法被填滿時 SHALL 只產生可完整組成的場次，SHALL NOT 產生不完整隊伍（`prd.md` 4.3）。

場地編號 MUST 為 1 起算的連續整數，依序指派給產生的場次。

實作位於 `nextjs-pickball/lib/matchmaker/candidates.ts` 與 `nextjs-pickball/lib/matchmaker/allocation-types.ts`。

#### Scenario: 預設值與場地數範圍

- **WHEN** 讀取匯出的預設常數
- **THEN** 預設對戰方式為單打、預設場地數為 1、場地數上限為 8
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「預設為單打與 1 個場地，場地數範圍為 1～8」

#### Scenario: 出場人數向下取整至每場人數的倍數

- **WHEN** 雙打、2 個場地、可用人數為 7
- **THEN** 出場人數為 4（`min(7, 8) = 7`，向下取整至 4 的倍數）
- **AND** 單打、2 個場地、可用人數為 7 時出場人數為 4（`min(7, 4) = 4`）
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「出場人數取 min(可用人數, 場地數×每場人數) 後向下取整至每場人數的倍數」

#### Scenario: 場地無法填滿時只產生完整場次

- **WHEN** 雙打、3 個場地、可用人數為 9
- **THEN** 只產生 2 場（8 人出場），第 3 個場地不產生場次
- **AND** 剩餘 1 人列入休息名單
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「場地無法填滿時只產生可完整組成的場次」

#### Scenario: 場地編號由 1 起算且連續

- **WHEN** 產生 3 場對戰
- **THEN** 場地編號依序為 1、2、3
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「場地編號由 1 起算且連續指派」

### Requirement: 候選排序與出場名單決策

系統 SHALL 依下列順序排序候選人員（`prd.md` 5.3）：

1. 累計休息次數 `restCount` **多**者優先。
2. 同休息次數時，強度分數 `rating` 高者優先。
3. 仍相同時維持**穩定排序**，使相同條件者的相對次序與輸入一致，避免每次產生結果大幅跳動。

「休息次數多者優先」的方向不可反轉：休息次數少代表已經打了很多場，若讓其繼續優先出場會形成死鎖——出場者休息次數不增加，於是永遠是同一批人上場（`prd.md` 5.1 註解）。

`isActive === false`（暫停出場）的參賽者 MUST 完全排除於候選池之外，SHALL NOT 出現在出場名單，**也 SHALL NOT 出現在休息名單**。休息名單的定義是「候選池中本輪未被選中出場者」；暫停者本來就不參與，若把他們計入休息名單，其 `restCount` 會在暫停期間持續累加，恢復出場時將挾帶不合理的優先權，直接壓過一路在場的人（見 design Decision 3）。

依上述排序取出「出場人數」名成員出場，其餘候選進入休息名單。**此步驟決定的出場／休息名單即為最終結果**——後續的強度配對與重複配對迴避 SHALL NOT 更動名單成員（`prd.md` 5.3、5.6）。

本 capability SHALL NOT 修改任何 `Player` 物件，包含 `restCount` 的累加——累加屬於回合結束時的持久化行為，由回合 capability 負責。輸入的 `Player` 陣列 MUST 被視為唯讀。

實作位於 `nextjs-pickball/lib/matchmaker/candidates.ts`。

#### Scenario: 休息次數多者優先出場

- **WHEN** 候選為 A(`restCount` 3)、B(2)、C(1)、D(0)，單打 1 個場地（出場 2 人）
- **THEN** 出場為 A、B，休息為 C、D
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「休息次數多者優先出場」

#### Scenario: 同休息次數時強度高者優先

- **WHEN** 候選皆為 `restCount` 2，`rating` 分別為 3.0、5.0、7.0、4.0，單打 1 個場地
- **THEN** 出場為 `rating` 7.0 與 5.0 兩人
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「同休息次數時強度分數高者優先」

#### Scenario: 休息次數與強度皆相同時維持穩定排序

- **WHEN** 候選的 `restCount` 與 `rating` 完全相同
- **THEN** 排序後的相對次序與輸入陣列一致
- **AND** 對同一份輸入重複呼叫 MUST 得到相同結果
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「休息次數與強度皆相同時維持輸入的相對次序」

#### Scenario: 暫停出場者不進入候選池

- **WHEN** 名單中有 `isActive === false` 的成員，且其 `restCount` 為全場最高
- **THEN** 該成員不出現在出場名單
- **AND** 該成員**也不出現在休息名單**
- **驗收**：`nextjs-pickball/lib/matchmaker/candidates.test.ts`，it 名稱「暫停出場者不進入候選池，既不出場也不列入休息名單」

#### Scenario: 連續多輪後出場機會輪轉

- **WHEN** 以 6 人、單打 1 個場地連續產生多輪，並在每輪後對休息者的 `restCount` 加 1
- **THEN** 每位成員的累計出場次數差距 MUST 不超過 1，SHALL NOT 固定由同一批人出場
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「連續多輪後出場機會輪轉，累計出場次數差距不超過 1」

#### Scenario: 分配不修改輸入的參賽者物件

- **WHEN** 完成一次分配
- **THEN** 輸入陣列與其中每個 `Player` 的 `restCount`、`gamesPlayed` 皆未被更動
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「分配不修改輸入的參賽者物件」

### Requirement: 單打配對

單打 SHALL 取用已決定的出場人員（人數必為 2 的倍數），依 `rating` 排序後**相鄰兩兩配對**，使對戰雙方分數差距盡量接近（`prd.md` 5.4）。

每場 MUST 包含兩支隊伍，每隊 1 名球員；隊伍分數即該員的 `rating`。

實作位於 `nextjs-pickball/lib/matchmaker/pairing.ts`。

#### Scenario: 相鄰兩兩配對使分差最小

- **WHEN** 出場者 `rating` 為 8.0、7.5、4.0、3.5
- **THEN** 配對為 (8.0 vs 7.5) 與 (4.0 vs 3.5)
- **AND** 該配對的分差總和 MUST 不大於任何其他配對方式
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「單打依強度排序後相鄰兩兩配對」

#### Scenario: 單打每隊一人且隊伍分數等於該員強度

- **WHEN** 產生單打場次
- **THEN** 每場有兩隊、每隊 1 人，隊伍分數等於該員 `rating`
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「單打每隊一人，隊伍分數等於該員 rating」

### Requirement: 雙打組隊

雙打 SHALL 取用已決定的出場人員（人數必為 4 的倍數），依 `rating` **由高到低**排序後每 4 人形成一個候選組。組內 MUST 以「最高＋最低」形成第一隊、「第 2 高＋第 3 高」形成第二隊，使兩隊總和分數盡量平衡（`prd.md` 5.5）。

隊伍分數 MUST 為隊內兩人 `rating` 的總和。每場 MUST 包含兩支隊伍、每隊 2 名球員，共 4 名球員。

實作位於 `nextjs-pickball/lib/matchmaker/pairing.ts`。

#### Scenario: 組內以最高加最低對第二高加第三高

- **WHEN** 一組 4 人的 `rating` 為 8.0、6.0、5.0、2.0
- **THEN** 第一隊為 8.0 與 2.0（總和 10.0），第二隊為 6.0 與 5.0（總和 11.0）
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「雙打組內以最高＋最低對第二高＋第三高」

#### Scenario: 該組隊方式的隊伍總和差為組內最小

- **WHEN** 任取一組 4 人
- **THEN** 「最高＋最低 vs 第 2 高＋第 3 高」的兩隊總和差 MUST 不大於該 4 人其餘兩種分隊方式的總和差
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「雙打組隊方式的兩隊總和差不大於其餘分隊方式」

#### Scenario: 多組雙打依強度由高到低切分

- **WHEN** 8 人出場、2 個場地
- **THEN** `rating` 最高的 4 人形成第 1 場，其餘 4 人形成第 2 場
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「多組雙打依強度由高到低每 4 人切分」

### Requirement: 雙打組成事後標示

雙打場次 SHALL 依組內性別**事後標示**為男雙、女雙或混雙；含 `other`（其他／不指定）而無法歸類時 MUST 標示為一般雙打。

此標示 MUST 為**純顯示用途**，SHALL NOT 參與任何選人或配對決策——性別在任何情況下都不影響出場順序，休息次數多者必定優先出場（`prd.md` 5.5、13.3、15）。

標示的判定對象為**整場 4 人**（而非單一隊伍）：4 人全為 `male` 標示男雙、全為 `female` 標示女雙、僅含 `male` 與 `female` 兩種標示混雙、含任一 `other` 標示一般雙打。

單打場次 MUST 不帶此標示。

實作位於 `nextjs-pickball/lib/matchmaker/pairing.ts`。

#### Scenario: 四人同性別標示男雙或女雙

- **WHEN** 一場雙打的 4 人性別皆為 `male`
- **THEN** 標示為男雙；皆為 `female` 時標示為女雙
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「雙打四人同性別時標示男雙或女雙」

#### Scenario: 兼有男女標示混雙

- **WHEN** 一場雙打的 4 人性別同時含 `male` 與 `female` 且不含 `other`
- **THEN** 標示為混雙
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「雙打兼有男女且無其他時標示混雙」

#### Scenario: 含其他不指定標示一般雙打

- **WHEN** 一場雙打的 4 人中有任一人性別為 `other`
- **THEN** 標示為一般雙打
- **驗收**：`nextjs-pickball/lib/matchmaker/pairing.test.ts`，it 名稱「雙打含其他不指定時標示一般雙打」

#### Scenario: 性別不影響出場人選與配對

- **WHEN** 兩份輸入僅性別欄位不同、其餘欄位完全相同
- **THEN** 出場名單、休息名單與每場的隊伍組成 MUST 完全一致，僅雙打組成標示可能不同
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「僅性別不同時出場名單與隊伍組成完全一致」

### Requirement: 重複配對迴避

重複配對迴避是分配優先序中的**最低順位**，SHALL 只在出場名單與強度配對都已決定之後執行（`prd.md` 5.6）。

系統 MUST 能為一場對戰產生三類簽章：**同隊隊友組合**、**兩隊交叉對手組合**、**完整比賽組合**。簽章 MUST 與球員在隊伍中的排列順序無關——同一組人無論誰被列在前面都必須產生相同簽章，否則交換位置就能騙過重複偵測。

偵測到重複時，SHALL 依序嘗試：交換不同場地的球員 → 交換隊伍內隊友 → 重新排列相鄰強度接近的候選人。所有調整 MUST 同時滿足：

- **SHALL NOT 改變出場與休息名單的成員**。不可為了避開重複而把已入選者換成休息名單中的人，也不可讓休息次數較多者繼續休息。
- **SHALL NOT 使強度差距劣於調整前**。單打以雙方分數差、雙打以兩隊總和差衡量，取全場差距總和比較；若所有可行交換都會讓差距變大，MUST 保留原配對並接受重複。
- **SHALL NOT 產生不完整隊伍**。

候選人數過少或上述限制使得無交換可行時，MUST 直接接受重複並照常產生對戰，SHALL NOT 因為無法避開重複而不產生場次或跳過任何應出場的人。

實作位於 `nextjs-pickball/lib/matchmaker/duplication.ts`。

#### Scenario: 簽章與隊伍內外的排列順序無關

- **WHEN** 同一場對戰的球員在隊伍內、或兩隊之間互換列出順序
- **THEN** 三類簽章 MUST 完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/duplication.test.ts`，it 名稱「三類簽章與球員排列順序無關」

#### Scenario: 偵測既有的隊友與對手重複

- **WHEN** 新產生的場次與歷史紀錄有相同隊友組合或相同交叉對手組合
- **THEN** 該場次 MUST 被判定為重複
- **AND** 完全沒有交集時 MUST 判定為不重複
- **驗收**：`nextjs-pickball/lib/matchmaker/duplication.test.ts`，it 名稱「與歷史有相同隊友或對手組合時判定為重複」

#### Scenario: 有可行交換時降低重複數

- **WHEN** 存在一組交換能減少重複且不使強度差距總和變大
- **THEN** 調整後的重複數 MUST 少於調整前
- **AND** 出場與休息名單的成員 MUST 與調整前完全相同
- **驗收**：`nextjs-pickball/lib/matchmaker/duplication.test.ts`，it 名稱「有可行交換時降低重複數且不更動出場名單」

#### Scenario: 迴避會擴大強度差距時保留原配對

- **WHEN** 所有能減少重複的交換都會使強度差距總和變大
- **THEN** MUST 保留原配對並接受重複
- **驗收**：`nextjs-pickball/lib/matchmaker/duplication.test.ts`，it 名稱「迴避會擴大強度差距時保留原配對並接受重複」

#### Scenario: 迴避不得改變出場人選

- **WHEN** 唯一能避開重複的方式是把休息名單中的人換上場
- **THEN** MUST 接受重複，休息次數多者仍必定出場
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「避免重複會改變出場人選時接受重複」

#### Scenario: 人數過少而無交換可行時照常產生對戰

- **WHEN** 只有剛好一場的人數，且該組合與歷史完全重複
- **THEN** MUST 照常產生該場次，SHALL NOT 回傳空場次或跳過任何應出場的人
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「無交換可行時照常產生重複的對戰」

### Requirement: 分配優先序的整體保證

系統 SHALL 在完整分配流程中維持 `prd.md` 5.1 的嚴格優先序：**模式結構性約束 ＞ 累計休息次數 ＞ 強度接近 ＞ 重複配對迴避**。前一項 SHALL NOT 為了滿足後一項而讓步。

任何情況下 MUST NOT 產生不完整隊伍：每場的球員數必為 2（單打）或 4（雙打）。

輸出 MUST 包含：N 組對戰（含場地編號、兩隊球員、兩隊分數、對戰類型）與休息名單（`prd.md` 5.2）。

同一份輸入重複呼叫 MUST 產生相同輸出（決定性）——分配過程 SHALL NOT 使用隨機性，否則使用者按下重新產生會得到無法解釋的差異，且測試無法穩定驗證優先序。

實作位於 `nextjs-pickball/lib/matchmaker/allocation.ts`。

#### Scenario: 輸出形狀符合規格

- **WHEN** 完成一次雙打分配
- **THEN** 每場包含場地編號、兩支隊伍（各 2 名球員與隊伍分數）、對戰類型與雙打組成標示
- **AND** 同時回傳休息名單
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「輸出包含場地編號、兩隊球員與分數、對戰類型與休息名單」

#### Scenario: 相同輸入產生相同輸出

- **WHEN** 以同一份輸入連續呼叫兩次
- **THEN** 兩次輸出 MUST 完全相等
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「相同輸入產生相同輸出」

#### Scenario: 強度配對不得推翻休息次數優先

- **WHEN** 休息次數最多者的 `rating` 與其他出場者差距極大，讓他出場會使強度差距明顯變大
- **THEN** 該員 MUST 仍然出場，SHALL NOT 為了平衡強度而讓他繼續休息
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「強度差距再大也不得讓休息次數多者繼續休息」

### Requirement: 人數不足與空名單的邊界行為

系統 SHALL 在人數不足以組成任何場次時回傳**空的對戰清單**與完整的休息名單，SHALL NOT 拋出例外、SHALL NOT 產生不完整隊伍（`prd.md` 第 11 節）。

具體邊界：

- 單打可用人數 < 2。
- 雙打可用人數 < 4。
- 全部參賽者皆暫停出場（可用人數為 0）。
- 名單為空。

場地數超出 1～8 範圍時 MUST 視為輸入錯誤並拒絕，SHALL NOT 靜默夾值——靜默夾值會讓 UI 的加減按鈕失效卻無提示，使用者無從得知為何場地數停住。

實作位於 `nextjs-pickball/lib/matchmaker/allocation.ts`。

#### Scenario: 單打人數不足

- **WHEN** 單打且可用人數為 1
- **THEN** 對戰清單為空，該員列入休息名單
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「單打可用人數不足 2 時回傳空對戰清單」

#### Scenario: 雙打人數不足

- **WHEN** 雙打且可用人數為 3
- **THEN** 對戰清單為空，3 人全部列入休息名單
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「雙打可用人數不足 4 時回傳空對戰清單」

#### Scenario: 全員暫停出場

- **WHEN** 名單有成員但全部 `isActive === false`
- **THEN** 對戰清單為空，休息名單**也為空**（暫停者不列入休息名單）
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「全員暫停出場時對戰與休息名單皆為空」

#### Scenario: 名單為空

- **WHEN** 參賽者名單為空陣列
- **THEN** 對戰清單與休息名單皆為空，且不拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「名單為空時回傳空結果且不拋錯」

#### Scenario: 場地數超出範圍

- **WHEN** 場地數為 0 或 9
- **THEN** MUST 拒絕該輸入，SHALL NOT 夾值至 1 或 8 後照常分配
- **驗收**：`nextjs-pickball/lib/matchmaker/allocation.test.ts`，it 名稱「場地數超出 1～8 時拒絕輸入而非靜默夾值」
