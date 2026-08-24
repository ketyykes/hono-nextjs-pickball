## ADDED Requirements

### Requirement: 計分板結果的自動回填共用送出 pipeline

系統 SHALL 於使用者回到對戰頁時，把該輪中已判定勝負的計分板進度自動回填為該場的最終比分。回填 MUST 呼叫**與手動輸入完全相同的送出比分入口**（驗證 → 評分更新 → 寫入歷史 → 標示完成 → 記錄完成時間），SHALL NOT 另寫一條平行的寫入路徑——`prd.md` 6.3 明訂兩種完成方式「產生相同的後續結果」，兩條路徑各自實作必然在評分四捨五入、歷史欄位或完成時間的其中一處分岔，而分岔後的歷史紀錄無法事後辨識是由哪條路徑寫入的。

判定與轉換 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`），輸入為目前回合與計分板槽集合，輸出為「待送出清單」；實際送出仍由回合模組的既有入口執行。此分工使「回填與手動輸入結果一致」能以單元測試逐欄比對，而非只能靠 E2E 目視。

**回填條件**（三者皆成立才列入待送出清單）：

1. 該 `matchId` 的計分板槽存在且 `status === "finished"`。
2. 該 `matchId` 仍存在於目前回合的對戰清單中。
3. 該場次**尚未完成**。

已完成的場次 MUST 被略過，SHALL NOT 重複送出——重複送出會二次更新評分，使一場比賽對雙方 rating 造成兩倍變動，且歷史會出現兩筆同一場的紀錄（`prd.md` 6.5）。回填必須是**冪等**的：同一組回合與槽集合連續呼叫兩次，第二次的待送出清單 MUST 為空。

比分轉換 MUST 使用與計分板入口相同的隊伍對應（第一隊 ⟷ `us`、第二隊 ⟷ `them`，見 `match-stage` capability）。

回填成功後，該場次的計分板槽 MUST 被清除——保留已回填的槽會讓下一次回到對戰頁時再度命中條件 1，只靠條件 3 擋著；一旦回合資料因任何原因重建，就會發生重複送出。

#### Scenario: 回填與手動輸入產生逐欄相同的結果

- **GIVEN** 同一個回合與同一場次，比分為 11-7（第一隊勝）
- **WHEN** 分別以「手動輸入 11 與 7 後送出」與「該場計分板 `status === "finished"`、`scores` 為 `{ us: 11, them: 7 }` 後回到對戰頁」兩條路徑各跑一次
- **THEN** 兩者產生的回合物件與歷史紀錄逐欄相同（比分、勝方、賽前分數、賽後分數、對戰方式、雙打組成標示皆一致），僅完成時間可因取用時刻不同而相異
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「回填與手動輸入的送出結果逐欄相同」

#### Scenario: 只回填已判定勝負且尚未完成的場次

- **GIVEN** 該輪三場：`m1` 的槽為 `finished`、`m2` 的槽為 `playing`、`m3` 無槽
- **WHEN** 計算待送出清單
- **THEN** 清單只含 `m1`，`m2` 與 `m3` 皆不在其中
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「只有 finished 的槽才進入待送出清單」

#### Scenario: 已完成場次不重複送出

- **GIVEN** `m1` 的槽為 `finished`，且 `m1` 在回合中已標示為已完成
- **WHEN** 計算待送出清單
- **THEN** 清單為空；連續呼叫兩次的結果皆為空
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「已完成的場次不重複送出且連續呼叫為冪等」

#### Scenario: 槽對應的場次已不在回合中時略過

- **GIVEN** `scoreboard:matches:v1` 有 `gone` 的 `finished` 條目，但目前回合的對戰清單不含 `gone`
- **WHEN** 計算待送出清單
- **THEN** 清單不含 `gone`，且不拋錯
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「槽對應的場次已不在回合中時略過且不拋錯」

#### Scenario: 回填後清除該場次的計分板槽

- **GIVEN** `m1` 的槽為 `finished` 且該場尚未完成
- **WHEN** 完成回填送出
- **THEN** `scoreboard:matches:v1` 內 `m1` 的條目被移除，其他場次的條目不受影響
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」

#### Scenario: E2E 由計分板完成一場並回填

- **GIVEN** 目前回合為 11 分制，場地 1 尚未完成
- **WHEN** 使用者進入場地 1 的計分板連續得分至 11-0、按「返回對戰」
- **THEN** 對戰頁的場地 1 顯示最終比分 11-0、勝方為第一隊、樣式為已完成，且該場不再提供「進入計分板」入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「由計分板判定勝負後返回，比分自動回填且該場轉為已完成」

### Requirement: 開始計分後鎖定本輪目標分數

本輪的目標分數（11／15／21）SHALL 於「產生本輪對戰」時決定、同一輪所有場地共用；**該輪一旦有任一場次開始計分即 MUST 不可更改**（`prd.md` 6.3.1）。

「已開始計分」MUST 判定為下列任一成立：

- 該輪任一場次已完成（不論比分來自手動輸入或計分板）。
- 該輪任一場次的計分板槽存在且 `status !== "setup"`。

槽存在但仍為 `"setup"`（使用者點進計分板卻一球未打）SHALL NOT 視為已開始——否則誤觸一次入口就永久鎖死該輪的分制，而使用者沒有任何解除手段。

鎖定生效時，UI 的目標分數控制項 MUST 以原生 `disabled` 表達，且變更目標分數的行為 MUST 被忽略（不只是視覺上停用）；同時 MUST 顯示繁體中文說明鎖定原因（形如「本輪已開始計分，目標分數不可更改」），SHALL NOT 只停用而不解釋——沉默的 disabled 會被讀成功能故障（`prd.md` §11：錯誤訊息需說明可採取的修正方式）。

判定 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`），輸入為目前回合與計分板槽集合，輸出為布林值與鎖定原因。此純函式是鎖定與否的**唯一來源**：對戰頁的目標分數選擇器 MUST 委派它（見 `match-stage` capability 的「目標分數選擇器」Requirement，該 Requirement 於本 change 一併 MODIFIED，把鎖定條件由「目前回合存在即鎖」放寬為本 Requirement 的判定），SHALL NOT 在元件內另判一次。

未鎖定時實際變更目標分數 MUST 經由本 capability 既有的 `setTargetScore(round, n)`（見「目標分數為每輪設定」Requirement）。本判定與該入口的拒絕條件 MUST **方向一致**：該入口以場次 `status`（`scoring`／`completed`）判定，本判定另納入計分板槽的狀態，因此差集只可能出現在一個方向——「槽已離開 `"setup"` 但場次 `status` 仍為 `pending`」時本判定已鎖、該入口仍會接受；UI 在本判定回報已鎖時 SHALL NOT 呼叫該入口，而該入口的拒絕仍是最後一道防線。相反方向（該入口拒絕但本判定未鎖）SHALL NOT 出現。

本段**不**為場次 `status` 新增任何轉換規則：「進行中」由計分板槽表達（`status !== "setup"`），場次的 `"scoring"` 值仍如 M4 所載由後續 milestone 定義其產生時機。若實作為了對戰頁呈現而讓場次進入 `"scoring"`，該值 MUST 同時被納入本判定的第一條，否則兩處會對同一個狀態給出相反答案。

#### Scenario: 尚未開始計分時可更改目標分數

- **GIVEN** 該輪所有場次皆未完成，且沒有任何計分板槽
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定，UI 的目標分數控制項為 enabled
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「無任何場次完成且無計分板槽時目標分數未鎖定」

#### Scenario: 有場次的計分板已開打時鎖定

- **GIVEN** 該輪某場次的計分板槽為 `status === "playing"`
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳已鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「任一場次的計分板槽非 setup 時目標分數鎖定」

#### Scenario: 槽存在但一球未打時不鎖定

- **GIVEN** 該輪某場次的計分板槽存在但 `status === "setup"`、比分 0-0，且無任何場次已完成
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳未鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「槽存在但仍為 setup 時不視為已開始計分」

#### Scenario: 手動輸入完成一場後亦鎖定

- **GIVEN** 該輪沒有任何計分板槽，但已有一場以手動輸入完成
- **WHEN** 呼叫鎖定判定
- **THEN** 回傳已鎖定
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「已有場次完成時目標分數鎖定，不論比分來源」

#### Scenario: 鎖定時 UI 停用並說明原因

- **GIVEN** 該輪已有場次開始計分
- **WHEN** 檢視對戰頁的目標分數控制項
- **THEN** 控制項為原生 `disabled`，且畫面顯示繁體中文說明「本輪已開始計分，目標分數不可更改」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「本輪開始計分後目標分數控制項停用並說明原因」

### Requirement: 重排本輪或重置名單時清除對應計分板進度

重排本輪（`resetIncompleteMatches` 丟棄未完成場次）或重置名單時，系統 MUST 一併清除對應場次在 `scoreboard:matches:v1` 的條目。

此清除是 `scoreboard` capability「該 `matchId` 有條目 ⟺ 綁定有效」不變式的維持者：不清除的話，使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，而畫面上沒有任何跡象顯示它已成孤兒。孤兒條目同時會無界累積在 LocalStorage 中（`prd.md` §11：LocalStorage 寫入超出配額）。

重設本輪時 MUST **只**清除被重排掉的未完成場次的條目，已完成場次的比分、評分結果與歷史紀錄 SHALL NOT 被影響（`prd.md` 6.2）。清除 SHALL NOT 觸碰 `scoreboard:current:v1`——獨立計分板的進度與回合無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。

「重置名單」的清除範圍不由本 capability 列舉：它是 `player-roster` capability「重置名單與二次確認」Requirement 的**列舉 key 清單**，該 Requirement 於本 change 一併 MODIFIED，把 `scoreboard:matches:v1` 納入清單。本 capability SHALL NOT 另行列舉一份 key 清單——同一個 `resetMatchmakerData()` 只能有一個清除範圍的定義處，兩處各列一次的失敗模式是沉默的（重置看起來成功了，殘留的槽要到使用者從舊連結回到計分板時才顯現）。

#### Scenario: 重設本輪清除未完成場次的計分板槽

- **GIVEN** 該輪 `m1` 已完成、`m2` 未完成且有計分板槽
- **WHEN** 使用者重設／重排本輪
- **THEN** `m2` 的條目被移除；`m1` 的比分、評分結果與歷史紀錄不變；`scoreboard:current:v1` 不被觸碰
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「重設本輪只清除未完成場次的槽且不動獨立槽」

#### Scenario: 回到已失效場次的計分板時顯示說明

- **GIVEN** 使用者於場地 2 的計分板計到 5-2，另一個分頁重設了本輪
- **WHEN** 使用者回到該計分板分頁並重新整理
- **THEN** 顯示繁體中文說明（該輪已重設或該場次已被刪除）與「回到對戰頁」「改用獨立計分板」兩個出口，SHALL NOT 顯示技術錯誤碼
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「重設本輪後回到舊計分板連結顯示失效說明」

#### Scenario: 重置名單清除全部計分板槽

- **GIVEN** 該輪有多個場次的計分板槽
- **WHEN** 使用者於參賽者頁確認「重置名單」（清除全部參賽者、目前回合與歷史賽果）
- **THEN** `scoreboard:matches:v1` 的全部條目被清除；`scoreboard:current:v1` 不被觸碰
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「重置名單清除全部場次槽但保留獨立槽」
