## ADDED Requirements

### Requirement: 場地區塊的換人操作

對戰頁的每個場地區塊，在**該場次為 `pending` 且尚未於計分板開始計分**時，SHALL 為每位在場
球員提供「換人」操作，選項為該輪休息名單中目前 `active` 的球員（`prd.md` 6.3 的「臨時換人
代打」）。選取後 MUST 委派 `round-lifecycle` 的 `swapMatchPlayer`（見該 capability 的
「臨時換人」Requirement），SHALL NOT 在本元件內直接改寫回合物件或另行判斷換人是否合法。

「尚未於計分板開始計分」的判定 MUST 與該場地區塊是否已顯示「計分中」標示一致（見
「計分中場次的標示與返回後呈現」Requirement 的計分板槽狀態）：計分板槽存在即代表主持人
已在該場地實際開打，此時 SHALL NOT 顯示換人操作——場次的 `status` 欄位在本輪仍可能是
`"pending"`（`round-lifecycle` 明訂 `scoring` 的實際產生屬後續 milestone），僅以 `status`
判斷會讓已經開打的場次仍顯示換人操作。

已完成場次（`status === "completed"`）SHALL NOT 顯示換人操作。

換人操作 MUST 具備可辨識文字或 `aria-label`，且該可存取名稱 MUST 能區分是替哪一位球員換人
（`prd.md` 12.5：色彩不是唯一資訊來源；一個場地區塊同時有多個球員格，操作必須可被讀屏使用者
逐一分辨）；MUST 可由鍵盤操作，SHALL NOT 只能以滑鼠觸發。

該輪休息名單中沒有任何 `active` 球員可供替換時，換人操作 MUST 以 `disabled` 表達且顯示
可見文字說明原因（例如「無可換之人」），SHALL NOT 隱藏操作或只把視覺變淡而仍可觸發
（`prd.md` 12.3）。

換人被拒絕時（`swapMatchPlayer` 回傳 `ok: false`），MUST 顯示繁體中文錯誤訊息，帶
`role="alert"` 使讀屏能即時播報，SHALL NOT 只顯示技術錯誤碼。

實作位於 `nextjs-pickball/components/matchmaker/CourtCard.tsx`。

#### Scenario: pending 且未開始計分的場次每位球員格提供換人操作

- **GIVEN** 一場 `pending` 且沒有計分板槽的雙打場次
- **WHEN** 檢視該場地區塊
- **THEN** 四位球員格皆各自提供一個換人操作
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「pending 且未開始計分的場次每位球員格皆提供換人操作」

#### Scenario: 選擇休息名單中的球員後委派換人

- **GIVEN** 某球員格的換人操作列出休息名單中的 active 球員 C
- **WHEN** 選取 C
- **THEN** 呼叫換人的回呼函式，並帶入該場次 id、被換出者 id 與 C 的 id
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「選擇休息名單中的球員後呼叫 onSwapPlayer 並帶入場次 id、換出者與換入者 id」

#### Scenario: 已完成場次不顯示換人操作

- **GIVEN** 某場次 `status` 為 `"completed"`
- **WHEN** 檢視該場地區塊
- **THEN** 不出現任何換人操作
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已完成場次不顯示換人操作」

#### Scenario: 已在計分板開始計分的場次不顯示換人操作

- **GIVEN** 某場次 `status` 仍為 `"pending"`，但該場次已有計分板槽
- **WHEN** 檢視該場地區塊
- **THEN** 不出現任何換人操作
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「已有計分板槽的場次不顯示換人操作」

#### Scenario: 無可換之人時操作停用並顯示文字說明

- **GIVEN** 該輪休息名單中沒有任何 `active` 球員
- **WHEN** 檢視 `pending` 且未開始計分場次的換人操作
- **THEN** 操作帶 `disabled` 屬性，且顯示可見文字說明目前無可換之人
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「休息名單無 active 球員可換時換人操作停用並顯示無可換之人」

#### Scenario: 換人操作具備可存取名稱且可由鍵盤操作

- **GIVEN** 對戰頁存在一個 `pending` 且未開始計分、雙打的場地區塊
- **WHEN** 以 Tab 依序走訪該場地區塊的換人操作
- **THEN** 每個操作皆能取得 focus，且各自的可存取名稱含所屬球員姓名而彼此不同
- **驗收**：`nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`，test 名稱「換人操作具備可存取名稱且可由鍵盤操作，並能區分不同球員」

#### Scenario: 換人被拒絕時顯示繁體中文錯誤訊息

- **GIVEN** 換人的回呼函式回傳的結果為 `ok: false`
- **WHEN** 該結果被傳回場地區塊
- **THEN** 場地區塊出現帶 `role="alert"` 的繁體中文錯誤訊息，不含技術錯誤碼
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「換人被拒絕時顯示帶 role alert 的繁體中文錯誤訊息」
