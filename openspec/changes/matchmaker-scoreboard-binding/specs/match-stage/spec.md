## ADDED Requirements

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

## MODIFIED Requirements

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
