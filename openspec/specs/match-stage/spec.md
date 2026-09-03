# match-stage Specification

## Purpose
TBD - created by archiving change matchmaker-match-stage-ui. Update Purpose after archive.

## Requirements

### Requirement: 對戰頁路由與 matchmaker 區段動線

系統 SHALL 於 `/matchmaker` 提供對戰頁（場次舞台），實作入口為
`nextjs-pickball/app/matchmaker/page.tsx`。

matchmaker 區段（`/matchmaker` 與 `/matchmaker/players`）SHALL 共用同一個區段外框
`nextjs-pickball/app/matchmaker/layout.tsx`，其中 MUST 包含區段導覽，使兩頁能互相切換，
並以 `aria-current="page"` 標示目前所在頁。SHALL NOT 只在對戰頁提供單向連結——
使用者建立名單後要回頭排對戰、排完對戰要回頭改名單，兩個方向都是常態動線。

區段導覽的分頁清單與 active 判定 MUST 抽為純函式
（`nextjs-pickball/lib/matchmaker/section-nav.ts`）並於該層 TDD，SHALL NOT 只寫在元件內——
依 `nextjs-pickball/CLAUDE.md` 的分層規範，元件的行為邏輯須下放到可單元測試的層級
（既有先例為 `lib/scoreboard/radio-navigation.ts`）。

#### Scenario: 對戰頁可經路由開啟

- **WHEN** 使用者開啟 `/matchmaker`
- **THEN** 顯示對戰頁的場次舞台區域，不出現 404
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「對戰頁可經 /matchmaker 開啟並顯示場次舞台」

#### Scenario: 區段導覽標示目前所在頁

- **WHEN** 以 `/matchmaker` 與 `/matchmaker/players` 兩個路徑分別呼叫分頁清單函式
- **THEN** 對應該路徑的分頁 `active` 為 `true`，另一個為 `false`
- **驗收**：`nextjs-pickball/lib/matchmaker/section-nav.test.ts`，it 名稱「目前路徑對應的分頁為 active，其餘分頁為非 active」

#### Scenario: 兩頁可互相切換

- **WHEN** 於對戰頁點擊區段導覽的「參賽者」，再於名單頁點擊「對戰」
- **THEN** 依序導向 `/matchmaker/players` 與 `/matchmaker`，兩頁皆顯示區段導覽
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「區段導覽可在對戰頁與參賽者名單頁之間來回切換」

---

### Requirement: 本輪設定控制項的預設值與範圍

對戰頁 SHALL 提供本輪設定控制項：對戰方式、場地數。預設對戰方式 MUST 為單打、預設場地數
MUST 為 1、場地數合法範圍 MUST 為 1～8（含兩端）（`prd.md` 4.2、4.3、13.3）。

上述預設值與範圍 MUST 取自 `match-allocation` capability 已匯出的具名常數
（`DEFAULT_FORMAT`、`DEFAULT_COURT_COUNT`、`MIN_COURT_COUNT`、`MAX_COURT_COUNT`），
SHALL NOT 在 UI 層另行寫死——該 capability 的規格已明訂「SHALL 由本 capability 以具名常數
匯出，供上層 UI 取用，SHALL NOT 由 UI 各自寫死」。

場地數的加減與夾值 MUST 由純函式模組 `nextjs-pickball/lib/matchmaker/round-settings.ts`
承載並於該層 TDD。加減按鈕在觸及上下限時 MUST 為 `disabled`，SHALL NOT 讓超界值傳入分配
引擎——引擎對超界 `courtCount` 是拋錯而非夾值，UI 讓它有機會被觸發等於把程式錯誤丟給使用者。

對戰方式 MUST 只有單打與雙打兩個選項，SHALL NOT 出現任何以性別篩選出場人選的模式
（僅混雙／僅男雙／僅女雙），與 `prd.md` 4.2 的產品決策一致。

#### Scenario: 預設為單打與 1 個場地

- **WHEN** 建立一組全新的本輪設定
- **THEN** 對戰方式為 `DEFAULT_FORMAT`（單打）、場地數為 `DEFAULT_COURT_COUNT`（1）
- **AND** 這兩個值取自 `match-allocation` 匯出的常數而非字面量
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「預設為單打與 1 個場地且取用分配引擎匯出的常數」

#### Scenario: 場地數加減夾在合法範圍內

- **WHEN** 對場地數 8 再加一、或對場地數 1 再減一
- **THEN** 結果仍分別為 8 與 1，且回報「不可再加」／「不可再減」
- **AND** 場地數 4 加一為 5、減一為 3
- **驗收**：`nextjs-pickball/lib/matchmaker/round-settings.test.ts`，it 名稱「場地數加減夾在 1～8 並回報是否已達邊界」

#### Scenario: 邊界時加減按鈕為 disabled

- **WHEN** 場地數為 1
- **THEN** 減號按鈕帶 `disabled` 屬性、加號按鈕可用
- **AND** 場地數為 8 時加號按鈕帶 `disabled` 屬性、減號按鈕可用
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「場地數為 1 時減號 disabled、為 8 時加號 disabled」

#### Scenario: 對戰方式只有單打與雙打

- **WHEN** 檢視對戰方式控制項的可選項目
- **THEN** 只有「單打」與「雙打」兩個選項，不存在任何性別限定模式
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「對戰方式只提供單打與雙打且無性別限定模式選項」

---

### Requirement: 目標分數選擇器

對戰頁 SHALL 提供目標分數選擇器，選項 MUST 為 11、15、21 三者，預設 MUST 為 11
（`prd.md` 6.3.1）。目標分數為**每輪設定**，同一輪的所有場地共用，於「產生本輪對戰」時
寫入該輪。

選擇器**是否鎖定** MUST 委派 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 的鎖定判定
純函式（輸入為目前回合與計分板槽集合，輸出為布林值與繁體中文鎖定原因；判定條件見
`round-lifecycle` capability 的「開始計分後鎖定本輪目標分數」Requirement），SHALL NOT 在元件內
自行以「目前回合是否存在」判斷——鎖定條件在本次變更後同時取決於回合的場次狀態與計分板槽狀態，
兩處各判一次必然分岔，而分岔的失敗模式是「該鎖沒鎖」（本輪打到一半換分制）或「該開沒開」
（使用者無法在開打前修正誤選的分制，且沒有任何解除手段）。

鎖定生效時，選擇器 MUST 為 `disabled` 並顯示該輪已鎖定的目標分數，同時 MUST 顯示該純函式回傳
的繁體中文鎖定原因（形如「本輪已開始計分，目標分數不可更改」），SHALL NOT 只把控制項變灰而不
解釋原因（`prd.md` 12.3）。

**尚未鎖定時**（目前回合存在，但所有場次仍為 `pending`，且沒有任何計分板槽離開 `"setup"`）
選擇器 MUST 為 enabled；變更 MUST 委派回合 capability 的 `setTargetScore(round, n)`，
SHALL NOT 在 UI 層直接改寫回合物件。此為本次變更相對於前一版本行為的**放寬**：前一版採
「目前回合存在時一律鎖定」，其兩個前提（回合 capability 未承諾 `targetScore` 可事後修改、
且「開始計分」在當時無可觀察的定義）在本 milestone 皆已不成立——`setTargetScore` 已是回合
capability 的既有入口，計分板槽也讓「開始計分」有了明確且可觀察的判準。`prd.md` 6.3.1 的原文
（「該輪一旦有場次**開始計分**即不可更改」）因此得以逐字落實。

選擇器 MUST 以 `role="radiogroup"` + 三顆 `role="radio"`（帶 `aria-checked`）表達，並實作
WAI-ARIA APG 的 radio group 鍵盤模式：roving tabindex（僅選中項 `tabIndex=0`）、方向鍵
移動即選取並循環。索引計算 MUST 重用 `nextjs-pickball/lib/scoreboard/radio-navigation.ts`
的 `nextRadioIndex`，SHALL NOT 另寫一份。

目標分數的三個選項 MUST 取自回合 capability 匯出的具名常數（該 capability 的 Round schema
已把 `targetScore` 定為 `11 | 15 | 21`）。若該 capability 只匯出型別而沒有可迭代的選項清單，
MUST 於其模組補一個具名匯出再由本 capability 取用，SHALL NOT 在元件內另寫 `[11, 15, 21]`
字面量——matchmaker 側只能有一個來源。

#### Scenario: 選項為 11／15／21 且預設 11

- **WHEN** 尚無目前回合時檢視目標分數選擇器
- **THEN** 顯示 11、15、21 三個選項，`aria-checked="true"` 者為 11
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「目標分數選項為 11／15／21 且預設選中 11」

#### Scenario: 本輪已開始計分時鎖定

- **GIVEN** 目前回合的目標分數為 15，且該輪已開始計分（任一場次已完成，或任一計分板槽的 `status !== "setup"`）
- **WHEN** 檢視目標分數選擇器
- **THEN** 三顆選項皆帶 `disabled` 屬性，`aria-checked="true"` 者為 15
- **AND** 畫面顯示鎖定判定回傳的繁體中文原因（形如「本輪已開始計分，目標分數不可更改」）
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因」

#### Scenario: 回合存在但尚未開始計分時仍可更改

- **GIVEN** 目前回合存在、目標分數為 15，所有場次皆為 `pending`，且沒有任何計分板槽離開 `"setup"`
- **WHEN** 於目標分數選擇器選取 21
- **THEN** 三顆選項皆為 enabled，且回合 capability 的 `setTargetScore` 被以 `21` 呼叫一次
- **AND** 畫面不顯示鎖定說明
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「回合存在但尚未開始計分時目標分數選擇器 enabled 且變更委派 setTargetScore」

#### Scenario: 方向鍵導覽與 roving tabindex

- **GIVEN** 尚無目前回合、目標分數為 11
- **WHEN** 以 Tab 進入目標分數群組後按下方向鍵右鍵
- **THEN** 選取移到 15（移動即選取），且群組內僅選中項的 `tabIndex` 為 0
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」

### Requirement: 產生本輪與重設／再排的操作入口

對戰頁 SHALL 提供「產生本輪對戰」主要操作入口。按下後 MUST 委派回合 capability 的產生
pipeline，SHALL NOT 在 UI 層重新實作候選排序、配對、重複迴避或評分——這些規則已由
`match-allocation` 與評分 capability 以純函式定型並逐條測試過，UI 複製一份等於製造第二個
真相來源（`prd.md` 6.1）。

「重設／再排」入口 MUST **只在**目前回合存在**且**仍有未完成場次時顯示；不符合此條件時
SHALL NOT 顯示（`prd.md` 6.2）。

可出場人數不足以組成一場（單打 < 2 人、雙打 < 4 人，含全員暫停出場與名單為空）時，
「產生本輪對戰」MUST 為 `disabled`，並 MUST 顯示繁體中文說明目前為何無法產生與該怎麼做，
SHALL NOT 只顯示技術錯誤碼或靜默無反應（`prd.md` 第 11 節、12.3）。

#### Scenario: 產生本輪委派回合 capability

- **WHEN** 可出場人數足夠時按下「產生本輪對戰」
- **THEN** 回合 capability 的產生函式被呼叫一次，並帶入目前的對戰方式、場地數與目標分數
- **AND** UI 自身不呼叫任何分配或評分函式
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「按下產生本輪對戰會以目前設定呼叫回合產生函式一次」

#### Scenario: 人數不足時停用並說明原因

- **WHEN** 對戰方式為雙打、可出場人數為 3
- **THEN** 「產生本輪對戰」帶 `disabled` 屬性
- **AND** 顯示繁體中文說明（指出雙打每場需 4 人、目前可出場人數，並提示可前往名單頁調整）
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「可出場人數不足一場時產生按鈕 disabled 並顯示繁體中文原因」

#### Scenario: 沒有可重排的場次時不顯示重設入口

- **WHEN** 目前回合不存在，或目前回合的所有場次皆已完成
- **THEN** 畫面上不存在「重設／再排」入口
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「無目前回合或場次全部完成時不顯示重設再排入口」

#### Scenario: 有未完成場次時顯示重設入口

- **WHEN** 目前回合存在且至少一場未完成
- **THEN** 顯示「重設／再排」入口，按下後委派回合 capability 的重排 pipeline
- **驗收**：`nextjs-pickball/components/matchmaker/RoundControls.test.tsx`，it 名稱「目前回合仍有未完成場次時顯示重設再排入口並委派回合 capability」

---

### Requirement: 單打場地的滿版色塊呈現

單打每場 MUST 以**兩個 1x1 方型色塊左右排列**呈現，SHALL NOT 使用傳統垂直卡片列表作為主要
對戰呈現（`prd.md` 7.1、7.2、13.3）。

每格 MUST 顯示該員的姓名、性別與強度分數三項資訊；背景 MUST 使用該員自訂的雙色漸層
（`colorFrom` → `colorTo`），前景文字色 MUST 由 `nextjs-pickball/lib/matchmaker/colors.ts`
的 `pickTextColor` 決定，SHALL NOT 另寫一套亮度判斷（`prd.md` 4.1.1）。

色塊的版面推導（每格屬於哪一隊、位於第幾列第幾欄）MUST 抽為純函式
（`nextjs-pickball/lib/matchmaker/stage-layout.ts`），色塊的樣式推導（漸層、前景色、完成
場次的減弱）MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/tile-style.ts`），兩者皆於該層
TDD。

#### Scenario: 單打為兩格左右排列

- **WHEN** 以一場單打對戰呼叫版面推導函式
- **THEN** 回傳兩格，第一格屬第一隊、第二格屬第二隊，兩格同列（`row` 相同）、`column` 相異
- **驗收**：`nextjs-pickball/lib/matchmaker/stage-layout.test.ts`，it 名稱「單打回傳兩格且兩格同列左右相鄰分屬兩隊」

#### Scenario: 每格顯示姓名、性別與強度分數

- **WHEN** 渲染一場單打對戰
- **THEN** 每格內同時出現該員姓名、性別文字（男／女／其他）與兩位小數的強度分數
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「每個色塊顯示姓名、性別與強度分數」

#### Scenario: 色塊背景為雙色漸層且文字自動對比

- **WHEN** 以某位參賽者呼叫色塊樣式函式
- **THEN** `background` 為由 `colorFrom` 到 `colorTo` 的線性漸層
- **AND** `color` 等於 `pickTextColor(colorFrom, colorTo)` 的回傳值
- **驗收**：`nextjs-pickball/lib/matchmaker/tile-style.test.ts`，it 名稱「色塊背景為雙色漸層且前景取 pickTextColor 的結果」

#### Scenario: 不以垂直卡片列表呈現

- **GIVEN** viewport 為 1280x800，畫面上有一場單打對戰
- **WHEN** 量測兩個球員色塊的 boundingBox
- **THEN** 兩格的寬高比接近 1（容許 ±0.15），且兩格的垂直中心相同（左右排列而非上下堆疊）
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「單打場地為兩個接近正方形的色塊且左右排列」

---

### Requirement: 雙打場地的 2x2 色塊呈現

雙打每場 MUST 以**四個 1x1 方型色塊排成 2x2** 呈現，SHALL NOT 縮小為一般列表卡片
（`prd.md` 7.3、13.3）。

同一隊的兩格 MUST 相鄰於同一列：上排兩格為第一隊、下排兩格為第二隊，中央為隊伍比分與送出
控制區。此為 `prd.md` 7.3「對角或左右兩格代表同一隊」二選一的落地結果，選擇理由與被否決的
對角配置見 design Decision 4。

雙打場次 MUST 顯示由 `match-allocation` 產生的組成標示（男雙／女雙／混雙／一般雙打）。
該標示為**事後顯示用途**，SHALL NOT 被 UI 拿來影響任何選人或排列。

#### Scenario: 雙打為四格 2x2

- **WHEN** 以一場雙打對戰呼叫版面推導函式
- **THEN** 回傳四格，`row` 取值為 0 與 1 各兩格、`column` 取值為 0 與 1 各兩格
- **驗收**：`nextjs-pickball/lib/matchmaker/stage-layout.test.ts`，it 名稱「雙打回傳四格並排成 2x2」

#### Scenario: 同隊兩格位於同一列

- **WHEN** 以一場雙打對戰呼叫版面推導函式
- **THEN** 上排（`row` 為 0）兩格皆屬第一隊、下排（`row` 為 1）兩格皆屬第二隊
- **驗收**：`nextjs-pickball/lib/matchmaker/stage-layout.test.ts`，it 名稱「雙打上排兩格為第一隊下排兩格為第二隊」

#### Scenario: 顯示雙打組成標示

- **WHEN** 渲染一場 `doublesComposition` 為 `mixed` 的雙打對戰
- **THEN** 該場次顯示「混雙」文字標示
- **AND** `mens`／`womens`／`general` 分別顯示為「男雙」／「女雙」／「一般雙打」
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「雙打場次顯示男雙女雙混雙或一般雙打的組成標示」

---

### Requirement: 休息名單輔助區

對戰頁 SHALL 於輔助區域顯示本輪休息名單，每筆 MUST 至少包含姓名、顏色標記與該員目前的
累計休息次數（`prd.md` 7.4）。

休息名單為空時 MUST 顯示可判讀的空狀態文案，且「本輪全員出場」與「目前沒有任何可出場的
參賽者（全員暫停出場）」MUST 為**兩段不同的文案**——分配引擎不把暫停者列入休息名單
（`match-allocation` 的「暫停出場者不進入候選池」Requirement），因此兩種情況的休息名單
同樣為空，只給一段文案會讓使用者把「全員暫停」誤讀為「大家都上場了」。

#### Scenario: 休息名單顯示三項資訊

- **WHEN** 本輪有 2 人休息
- **THEN** 每筆顯示姓名、該員雙色漸層的顏色標記，以及「休息 N 次」的累計次數
- **驗收**：`nextjs-pickball/components/matchmaker/RestingPanel.test.tsx`，it 名稱「休息名單顯示姓名顏色標記與累計休息次數」

#### Scenario: 兩種空狀態文案不同

- **WHEN** 休息名單為空且仍有可出場參賽者
- **THEN** 顯示「本輪全員出場」類文案
- **AND** 休息名單為空且沒有任何可出場參賽者時，顯示另一段指出「全員暫停出場」的文案
- **驗收**：`nextjs-pickball/components/matchmaker/RestingPanel.test.tsx`，it 名稱「休息名單為空時區分本輪全員出場與全員暫停出場兩種文案」

---

### Requirement: 空白球場狀態

尚無目前回合時，對戰頁 MUST 顯示空白球場狀態，SHALL NOT 顯示任何假名單、假比分或假場次
（`prd.md` 7.5、13.1）。

空白狀態 MUST 提供操作入口，且入口內容依名單狀態分流：
- 已有可出場參賽者時 MUST 提供「建立第一輪」，按下即等同「產生本輪對戰」。
- 名單為空（或全員暫停出場）時 MUST 提供導向 `/matchmaker/players` 的「加入參賽者」入口，
  SHALL NOT 只給一顆按不動的「建立第一輪」——那會讓使用者停在死路上。

#### Scenario: 有參賽者但尚無回合

- **GIVEN** 名單有 4 位可出場參賽者、尚未產生任何回合
- **WHEN** 開啟 `/matchmaker`
- **THEN** 顯示空白球場與「建立第一輪」入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「有可出場參賽者但尚無回合時顯示空白球場與建立第一輪入口」

#### Scenario: 名單為空時導向加入參賽者

- **GIVEN** 名單為空
- **WHEN** 開啟 `/matchmaker`
- **THEN** 空白狀態提供「加入參賽者」入口，點擊後導向 `/matchmaker/players`
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「名單為空時空白狀態提供前往參賽者名單的入口」

#### Scenario: 空白狀態不顯示假資料

- **GIVEN** 名單為空、無任何本機資料
- **WHEN** 開啟 `/matchmaker`
- **THEN** 畫面上不存在任何球員色塊、比分欄位或場地區塊
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「空白狀態不顯示任何球員色塊或比分欄位」

---

### Requirement: 手動輸入比分與送出

每個未完成場次 MUST 提供兩個比分欄位（分別對應第一隊與第二隊）與一個送出控制
（`prd.md` 6.3）。手動輸入是 `prd.md` 6.3 明訂**不得移除**的 fallback，MUST 能獨立完成一場，
SHALL NOT 依賴場邊計分路徑存在。

比分欄位 MUST 設定 `inputMode="numeric"` 以在行動裝置喚起數字鍵盤（`prd.md` 12.3）。

送出 MUST 委派回合 capability 的送出 pipeline（記錄最終比分 → 更新評分 → 寫入歷史），
SHALL NOT 在 UI 層自行更新任何評分或歷史資料。比分驗證規則（空白、非數字、平局、場次已完成）
歸屬回合 capability，UI SHALL NOT 複製一份；UI 的責任是把 pipeline 回傳的驗證失敗以**繁體
中文**呈現在該場次區塊內，並帶 `role="alert"` 使讀屏能即時播報（`prd.md` 6.3.2、第 11 節、
12.5）。

已完成場次的比分欄位與送出控制 MUST 為 `disabled`，使同一份比分無法再次送出
（`prd.md` 6.5）。

#### Scenario: 比分欄位喚起數字鍵盤

- **WHEN** 渲染一場未完成的對戰
- **THEN** 兩個比分欄位皆帶 `inputMode="numeric"`，且各有可讀的標籤或 `aria-label` 指出屬於哪一隊
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「比分欄位為 inputMode numeric 並標示所屬隊伍」

#### Scenario: 送出委派回合 capability

- **WHEN** 於某場次填入 11 與 7 後按下送出
- **THEN** 回合 capability 的送出函式被呼叫一次，帶入該場次識別與兩隊分數
- **AND** UI 自身不呼叫任何評分或歷史寫入函式
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「送出比分會以場次識別與兩隊分數呼叫回合送出函式一次」

#### Scenario: 驗證失敗以繁體中文呈現

- **WHEN** 送出 pipeline 回傳驗證失敗（欄位空白、非數字或平局）
- **THEN** 該場次區塊內出現 `role="alert"` 的繁體中文訊息，說明原因與可採取的修正方式
- **AND** 訊息不含未經轉譯的技術錯誤碼
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「送出失敗時於該場次以 role alert 顯示繁體中文錯誤訊息」

#### Scenario: 已完成場次不可再送出

- **WHEN** 場次狀態為已完成
- **THEN** 兩個比分欄位與送出控制皆帶 `disabled` 屬性
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次的比分欄位與送出按鈕皆為 disabled」

---

### Requirement: 完成場次的視覺與資訊

已完成的場次 MUST 以**半透明、低飽和度**樣式呈現，與未完成場次形成明顯區隔
（`prd.md` 6.5）。該樣式 MUST 由 `nextjs-pickball/lib/matchmaker/tile-style.ts` 的純函式
推導，SHALL NOT 散落在各元件的 class 字串裡。

已完成場次 MUST 顯示最終比分、勝方與完成時間。勝方 MUST 以**文字標籤**標示（例如「勝」），
SHALL NOT 僅以顏色或飽和度差異表達——色彩不得作為唯一資訊來源（`prd.md` 12.5）。

#### Scenario: 完成場次為半透明低飽和

- **WHEN** 以 `completed: true` 呼叫色塊樣式函式
- **THEN** 回傳的樣式相對未完成版本降低了不透明度並降低了飽和度
- **AND** `completed: false` 時不帶這兩項減弱
- **驗收**：`nextjs-pickball/lib/matchmaker/tile-style.test.ts`，it 名稱「已完成場次的色塊樣式降低不透明度與飽和度」

#### Scenario: 完成場次顯示比分勝方與時間

- **WHEN** 渲染一場已完成、比分 11:7、第一隊獲勝的對戰
- **THEN** 顯示 11 與 7 兩個分數、勝方所屬隊伍，以及該場次的完成時間
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次顯示最終比分勝方與完成時間」

#### Scenario: 勝方以文字標示

- **WHEN** 渲染一場已完成的對戰
- **THEN** 勝方隊伍帶有可讀的文字標籤，非勝方沒有該標籤
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「勝方以文字標籤標示而非僅以顏色區分」

---

### Requirement: 強度分數觸頂與觸底標示

參賽者的 `rating` 達到上限 8.00 或下限 1.00 時，色塊 MUST 明確標示「已達上限」或「已達下限」，
SHALL NOT 靜默卡住讓使用者誤以為功能故障（`prd.md` 6.4.6、13.4）。

標示 MUST 以文字（可搭配圖示）表達，SHALL NOT 只用顏色（`prd.md` 12.5）。

判定 MUST 抽為純函式（`nextjs-pickball/lib/matchmaker/rating-bounds.ts`）並於該層 TDD；
上下限值 MUST 取自評分 capability 匯出的界限常數，SHALL NOT 在本檔另寫 `1` 與 `8` 字面量
（見 design Open Questions）。

#### Scenario: 達上限時判定為觸頂

- **WHEN** 以 `rating` 為 8.00 呼叫判定函式
- **THEN** 回傳觸頂狀態
- **驗收**：`nextjs-pickball/lib/matchmaker/rating-bounds.test.ts`，it 名稱「rating 為上限時判定為已達上限」

#### Scenario: 達下限時判定為觸底

- **WHEN** 以 `rating` 為 1.00 呼叫判定函式
- **THEN** 回傳觸底狀態
- **驗收**：`nextjs-pickball/lib/matchmaker/rating-bounds.test.ts`，it 名稱「rating 為下限時判定為已達下限」

#### Scenario: 未觸界時不標示

- **WHEN** 以 `rating` 為 1.01、4.50 或 7.99 呼叫判定函式
- **THEN** 皆回傳「未觸界」，不產生任何標示
- **驗收**：`nextjs-pickball/lib/matchmaker/rating-bounds.test.ts`，it 名稱「rating 介於上下限之間時不判定為觸界」

#### Scenario: 色塊顯示觸界標示

- **WHEN** 渲染一場包含 `rating` 為 8.00 與 1.00 兩位參賽者的對戰
- **THEN** 前者色塊顯示「已達上限」文字、後者顯示「已達下限」文字
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「色塊在觸頂或觸底時顯示已達上限或已達下限標示」

---

### Requirement: 對戰頁的響應式三斷點

對戰頁 SHALL 依 `prd.md` 7.6 提供三種斷點行為：

| 裝置 | 版面 |
|---|---|
| 桌面（寬 ≥ 1024px） | 場地內容置於中央，休息名單為右側欄，兩者左右並排 |
| 平板（768px ≤ 寬 < 1024px） | 場地內容優先佔滿寬度，休息名單移至場地內容下方 |
| 手機（寬 < 768px） | 單欄呈現，色塊、比分欄位與按鈕需適合觸控 |

手機斷點下，比分欄位與主要按鈕的可觸控區域 MUST 不小於 44x44 CSS px，且頁面 MUST NOT
橫向溢出（`document.scrollingElement` 的 `scrollWidth <= clientWidth + 1`，容許次像素誤差）。

支援範圍下限為 **390px 寬**（與既有 `site-navbar` 規格一致）。

#### Scenario: 桌面斷點左右並排

- **GIVEN** viewport 為 1280x800、目前回合有 2 場對戰
- **WHEN** 檢視場地內容與休息名單的 boundingBox
- **THEN** 休息名單的左緣不小於場地內容的右緣（左右並排，非上下堆疊）
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「桌面斷點場地內容與休息名單左右並排」

#### Scenario: 平板斷點休息名單下移

- **GIVEN** viewport 為 768x1024
- **WHEN** 檢視場地內容與休息名單的 boundingBox
- **THEN** 休息名單的上緣不小於場地內容的下緣（位於下方）
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「平板斷點休息名單移至場地內容下方」

#### Scenario: 手機斷點單欄且觸控友善

- **GIVEN** viewport 為 390x844
- **WHEN** 量測比分欄位與送出按鈕的 boundingBox 與整頁捲動寬度
- **THEN** 每個控制項的寬與高皆不小於 44px，且 `scrollWidth <= clientWidth + 1`
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「手機斷點觸控目標不小於 44px 且不橫向溢出」

---

### Requirement: 對戰頁的可用性與無障礙

主要按鈕 MUST 具備清楚的 hover、focus 與 disabled 狀態；停用狀態 MUST 以 `disabled` 屬性
表達，SHALL NOT 只把視覺變淡而仍可被點擊或被 Tab 聚焦（`prd.md` 12.3）。

所有互動控制 MUST 具備可辨識的文字或 `aria-label`；所有功能 SHALL NOT 只能以滑鼠操作
（`prd.md` 12.3、12.5）。

色彩 SHALL NOT 作為唯一資訊來源：場地 MUST 有可讀的場地標題（例如「第 1 場地」），每支隊伍
MUST 有文字隊伍標籤（例如「第一隊」／「第二隊」），球員色塊 MUST 顯示姓名（`prd.md` 12.5）。

#### Scenario: 鍵盤可聚焦且停用狀態正確

- **GIVEN** 對戰頁的主要按鈕中有一顆為停用狀態
- **WHEN** 以 Tab 逐一走過頁面控制項
- **THEN** 可用按鈕能取得 focus 並顯示可見的 focus 樣式；停用按鈕帶 `disabled` 屬性且不會取得 focus
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「主要按鈕可由鍵盤聚焦並顯示 focus 樣式，停用者帶 disabled 屬性」

#### Scenario: 互動控制皆有可讀名稱

- **WHEN** 蒐集對戰頁上所有 button、input 與連結
- **THEN** 每個元素皆具備非空的可存取名稱（文字內容或 `aria-label`）
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「對戰頁所有互動控制皆具備可存取名稱」

#### Scenario: 場地與隊伍有文字標籤

- **WHEN** 渲染一場雙打對戰
- **THEN** 出現場地標題文字與兩支隊伍各自的文字標籤，兩者不倚賴顏色辨識
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「場地與隊伍皆有文字標籤使色彩不是唯一資訊來源」

### Requirement: 場地區塊的計分板入口

對戰頁的每個場地區塊 SHALL 提供「進入計分板」入口，作為 `prd.md` 6.3 兩條比分來源中「場邊計分」那一條的起點。手動輸入比分的既有入口 MUST 原樣保留並可獨立完成一場——它是必要的 fallback（主持人可能在其他工具計分、臨時換人代打或賽後補登），SHALL NOT 因為計分板入口存在而被移除或隱藏（`prd.md` 6.3）。

點擊入口時系統 MUST 依序完成兩件事，且順序不可對調：

1. **寫入該場的計分板初始狀態（seed）** 至分槽 `scoreboard:matches:v1`：`matchId` 為該場次 id、`targetScore` 取自**該輪**的 `targetScore`、`mode` 取自該輪的對戰方式（單打／雙打）、`firstServer` 為預設值。**該 `matchId` 已有條目時 MUST 原樣保留、SHALL NOT 覆蓋**——覆蓋會讓「未完成的計分進度可離開後再進入接續」（`prd.md` 13.4）失效，且失效方式是靜默的分數歸零。
2. **導向 `/scoreboard?match=<matchId>`**。

先寫 seed 再導向是**必要順序**：計分板以「分槽有無該條目」判定綁定是否有效（見 `scoreboard` capability 的「對戰場次綁定與失效處理」Requirement），先導向會讓使用者看到一瞬間的「場次已失效」畫面。

隊伍對應 MUST 為：該場的**第一隊**對應計分板的 `us`（顯示為「我方」）、**第二隊**對應 `them`（顯示為「對方」）。此對應 MUST 由單一具名常數或函式表達並同時供入口與回填使用，SHALL NOT 在兩處各寫一次——兩處若不一致，回填的比分會左右顛倒，而比分本身仍是合法數字，任何驗證都攔不下來。

**已完成的場次 SHALL NOT 提供計分板入口**（`prd.md` 6.5：已完成場次不得再次送出相同比分）。

實作位於 M5 既有的場地區塊元件與 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`（seed 建立、`ensureMatchSlot` 與隊伍對應的純函式層）。導向的對戰頁路由 MUST 取用 M5 既有的路由常數，SHALL NOT 另行寫死字串。

#### Scenario: 進入計分板時建立 seed 並帶入該輪目標分數

- **GIVEN** 目前回合為 15 分制、雙打，場地 2 的對戰尚未開始計分
- **WHEN** 使用者按下場地 2 的「進入計分板」
- **THEN** `scoreboard:matches:v1` 新增該場次的條目，其 `targetScore` 為 15、`mode` 為 `"doubles"`、`matchId` 為該場次 id、分數為 0-0、`status` 為 `"setup"`
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」

#### Scenario: 已有進度時再次進入不覆蓋

- **GIVEN** 場地 2 的計分板槽已有進度（8-5、`status === "playing"`）
- **WHEN** 使用者再次按下場地 2 的「進入計分板」
- **THEN** 該條目的分數、history 與 `targetScore` 完全不變，SHALL NOT 被 seed 覆蓋
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「已有進度的場次再次進入時保留既有進度不覆蓋」

#### Scenario: 隊伍對應為第一隊 us、第二隊 them

- **WHEN** 建立某場的 seed 並於回填時把計分板比分轉回該場的兩隊分數
- **THEN** `scores.us` 對應第一隊、`scores.them` 對應第二隊，來回轉換後兩隊分數與原輸入一致
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「第一隊對應 us、第二隊對應 them，來回轉換不顛倒」

#### Scenario: 已完成場次不提供計分板入口

- **GIVEN** 場地 1 的對戰已完成（已有最終比分與勝方）
- **WHEN** 檢視該場地區塊
- **THEN** 不出現「進入計分板」入口
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「已完成場次不顯示進入計分板入口」

#### Scenario: 手動輸入路徑不受影響

- **GIVEN** 某場尚未完成
- **WHEN** 使用者不經計分板，直接於該場地區塊填入兩隊比分並送出
- **THEN** 該場照常完成、評分更新並寫入歷史，流程與本次變更前一致
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「手動輸入比分的路徑仍可獨立完成一場」

### Requirement: 計分中場次的標示與返回後呈現

對戰頁 SHALL 依每場的計分板槽狀態呈現該場的進行情形，使主持人在多場地並行時能一眼看出哪幾場正在場邊計分：

| 計分板槽狀態 | 場地區塊呈現 |
|---|---|
| 無條目 | 一般未開始樣式，提供「進入計分板」與手動輸入兩個入口 |
| `status === "setup"` 或 `"playing"` | 標示「計分中」並顯示當前比分，入口文案為「繼續計分」 |
| `status === "finished"` 且該場尚未完成 | 返回時自動回填後轉為已完成（見 `round-lifecycle` capability） |

「計分中」標示 SHALL NOT 只以顏色表達，MUST 併同文字（`prd.md` 12.5：色彩不可作為唯一資訊來源）。

回到對戰頁時，已判定勝負的場次 MUST 呈現最終比分、勝方與完成時間並套用已完成樣式；尚未結束的場次 MUST 保留進度且可再次進入接續計分（`prd.md` 6.3.1、13.4）。

實作位於 M5 既有的場地區塊元件與 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`。

#### Scenario: 計分中的場次標示為計分中並顯示當前比分

- **GIVEN** 場地 2 的計分板槽為 `status === "playing"`、比分 8-5
- **WHEN** 檢視對戰頁的場地 2 區塊
- **THEN** 顯示文字「計分中」與比分 8-5，入口文案為「繼續計分」
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「計分中的場次顯示計分中標示與當前比分」

#### Scenario: 未結束的進度可離開後再進入接續

- **GIVEN** 使用者在場地 2 的計分板計到 8-5 後按「返回對戰」
- **WHEN** 再次按下場地 2 的「繼續計分」
- **THEN** 計分板顯示 8-5 而非 0-0，`targetScore` 仍為該輪設定值
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「未完成的計分進度可離開後再進入接續」

#### Scenario: 多場地同時計分互不覆蓋

- **GIVEN** 目前回合有場地 1 與場地 2 兩場
- **WHEN** 使用者於場地 1 計到 5-2、返回對戰頁、再進入場地 2 計到 3-1、返回對戰頁
- **THEN** 場地 1 顯示 5-2、場地 2 顯示 3-1，兩者互不覆蓋；再次進入場地 1 時顯示 5-2
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「多場地同時計分時各場進度互不覆蓋」
