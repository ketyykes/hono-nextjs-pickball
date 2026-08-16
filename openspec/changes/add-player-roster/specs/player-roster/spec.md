## ADDED Requirements

### Requirement: 參賽者資料模型

系統 SHALL 以 zod schema 定義參賽者，欄位與規格對應 `prd.md` 4.1：

| 欄位 | 型別 | 規格 |
|---|---|---|
| `id` | string | 由呼叫端提供的唯一識別碼 |
| `name` | string | 不可為空白（trim 後長度 > 0） |
| `gender` | `"male" \| "female" \| "other"` | 對應男／女／其他不指定 |
| `colorFrom` | string | Hex 色碼，`#RRGGBB` |
| `colorTo` | string | Hex 色碼，`#RRGGBB` |
| `rating` | number | 1.00～8.00，寫入前 round 至兩位小數 |
| `restCount` | number | 非負整數，`.default(0)` |
| `gamesPlayed` | number | 非負整數，`.default(0)` |
| `isActive` | boolean | `true` 為出場中，`false` 為暫停出場 |
| `createdAt` | string | ISO 8601，由呼叫端提供 |

`restCount` 與 `gamesPlayed` MUST 存在於 schema 並初始化為 0，但本 capability SHALL NOT 寫入其累加邏輯 —— 累加分別屬於分配演算法與評分更新。先納入是為了避免後續階段對 `matchmaker:roster:v1` 做破壞性遷移（見 design Decision 2）。

`rating` 超出 1.00～8.00 或 Hex 色碼格式不合法時 MUST 驗證失敗，SHALL NOT 靜默夾值或改寫。

`createdAt` MUST 驗證為 ISO 8601 格式，SHALL NOT 接受任意字串 —— 此欄位會隨持久化資料回讀並經同一 schema 驗證，不驗格式等於讓損壞或被竄改的時間戳靜默通過。

外層容器 `RosterSchema` 的 `version` MUST 為字面量 `1`，SHALL NOT 使用開放的 `z.number()` —— 開放型別會讓未來的 v2 結構通過外層驗證，再於逐筆驗證時整批落空，使用者看到的是「名單莫名少了很多人」而非明確的版本不符（見 design Decision 9）。

`name` 的 `.trim()` 是**刻意的正規化**，不受上述「SHALL NOT 靜默改寫」約束 —— 該約束的主詞僅限 `rating` 與 Hex 色碼。

實作位於 `nextjs-pickball/lib/matchmaker/types.ts`。

#### Scenario: 合法參賽者通過驗證

- **WHEN** 以完整合法欄位呼叫 `PlayerSchema.safeParse`
- **THEN** `success` 為 `true`，且 `restCount` 與 `gamesPlayed` 在未提供時補為 0
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「合法欄位通過驗證，restCount 與 gamesPlayed 未提供時補 0」

#### Scenario: 強度分數超出範圍

- **WHEN** `rating` 為 `0.99` 或 `8.01`
- **THEN** 驗證失敗
- **AND** 邊界值 `1` 與 `8` 本身 MUST 通過（範圍為 inclusive）
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「rating 超出 1.00～8.00 時驗證失敗」

#### Scenario: 建立時間非 ISO 8601

- **WHEN** `createdAt` 為 `"not-a-date"`
- **THEN** 驗證失敗；`"2026-08-15T00:00:00.000Z"` 則通過
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「createdAt 非 ISO 8601 時驗證失敗」

#### Scenario: 外層版本號不符

- **WHEN** `RosterSchema.safeParse` 收到 `version: 2`
- **THEN** 驗證失敗；`version: 1` 則通過
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「RosterSchema 的 version 僅接受 1」

#### Scenario: 名稱僅有空白

- **WHEN** `name` 為 `"   "`
- **THEN** 驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「name 僅含空白時驗證失敗」

#### Scenario: Hex 色碼格式不合法

- **WHEN** `colorFrom` 為 `"0E6B63"`（缺 `#`）或 `"#GGG"`
- **THEN** 驗證失敗
- **驗收**：`nextjs-pickball/lib/matchmaker/types.test.ts`，it 名稱「Hex 色碼格式不合法時驗證失敗」

---

### Requirement: 參賽者的新增、編輯與刪除

系統 SHALL 提供純函式 `addPlayer`、`updatePlayer`、`removePlayer` 操作名單，且 MUST 為不可變操作 —— 回傳新的名單物件，SHALL NOT 就地修改傳入的陣列。

`id` 與 `createdAt` MUST 由呼叫端注入，SHALL NOT 於函式內部呼叫 `crypto.randomUUID()` 或 `new Date()` —— 內部產生會使回傳值每次不同，測試只能寬鬆斷言而失去驗證力（見 design Decision 4）。

新增時若未提供顏色，系統 SHALL 自動配色。刪除單一參賽者 MUST 經使用者確認（`prd.md` 第 10 節）。

實作位於 `nextjs-pickball/lib/matchmaker/roster.ts`。

#### Scenario: 新增參賽者

- **GIVEN** 一份空名單
- **WHEN** 呼叫 `addPlayer(roster, input, { id: "p1", now: "2026-08-15T00:00:00.000Z" })`
- **THEN** 回傳含一筆參賽者的**新**陣列，其 `id` 與 `createdAt` 為注入值，`restCount`／`gamesPlayed` 為 0，`isActive` 為 `true`，且原陣列未被修改
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「addPlayer 回傳新陣列且不修改原陣列，id 與 createdAt 取自注入值」

#### Scenario: 編輯既有參賽者

- **GIVEN** 名單中存在 `id` 為 `"p1"` 的參賽者
- **WHEN** 呼叫 `updatePlayer(roster, "p1", { rating: 4.5 })`
- **THEN** 該筆的 `rating` 變為 `4.5`，其餘欄位與其他參賽者不變
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「updatePlayer 只改指定欄位，其餘欄位與他人不受影響」

#### Scenario: 編輯不存在的 id

- **WHEN** 對不存在的 `id` 呼叫 `updatePlayer`
- **THEN** 回傳的名單與原名單內容相等，SHALL NOT 新增任何參賽者
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「updatePlayer 遇到不存在的 id 時不新增也不改動」

#### Scenario: 刪除參賽者

- **GIVEN** 名單中有三位參賽者
- **WHEN** 呼叫 `removePlayer(roster, "p2")`
- **THEN** 回傳僅含另外兩位的新陣列，順序不變
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「removePlayer 移除指定 id 並保持其餘順序」

#### Scenario: 強度分數 round 至兩位小數

- **WHEN** 以 `rating: 3.456` 新增或編輯
- **THEN** 儲存值為 `3.46`
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「rating 寫入前 round 至兩位小數」

---

### Requirement: 出場狀態切換

參賽者 SHALL 可在「出場中」與「暫停出場」之間切換。暫停出場者在後續的分配演算法中不得被納入候選池，也不得因該輪休息而增加 `restCount`（`prd.md` 4.1.2）。

本 capability MUST 只負責保存與切換此狀態；候選池的排除行為屬於分配演算法，SHALL NOT 在本次實作。

實作位於 `nextjs-pickball/lib/matchmaker/roster.ts`。

#### Scenario: 切換為暫停出場

- **GIVEN** 一位 `isActive` 為 `true` 的參賽者
- **WHEN** 呼叫 `togglePlayerActive(roster, "p1")`
- **THEN** 該筆 `isActive` 變為 `false`，`restCount` 不變
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「togglePlayerActive 切換 isActive 且不影響 restCount」

#### Scenario: 恢復出場

- **GIVEN** 一位 `isActive` 為 `false` 的參賽者
- **WHEN** 再次呼叫 `togglePlayerActive(roster, "p1")`
- **THEN** 該筆 `isActive` 回到 `true`
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「togglePlayerActive 可來回切換」

---

### Requirement: 雙色漸層與文字對比

參賽者 SHALL 可自訂雙色 Hex 漸層，系統在名單頁與後續的對戰舞台使用相同漸層。

前景文字色 MUST 依**漸層兩個端點**決定，SHALL NOT 只依平均亮度 —— 一深一淺的漸層（如 `#0E1A1A` → `#E8F5F0`）其平均落在中間，選深色或淺色都會有一端不可讀。

系統 SHALL 分別計算兩端點色對深色前景與淺色前景的 WCAG 對比度，取「兩端最小對比較高」者：

```
foreground = argmax( min( contrast(colorFrom, fg), contrast(colorTo, fg) ) )   fg ∈ { 深色, 淺色 }
```

即使兩者的最小對比皆低於 4.5:1，系統仍 SHALL 取較高者並允許使用者使用該配色，SHALL NOT 阻擋或強制改色 —— `prd.md` 12.5 已要求色彩不得作為唯一資訊來源。

實作位於 `nextjs-pickball/lib/matchmaker/colors.ts`。

#### Scenario: 深色漸層選淺色文字

- **WHEN** 漸層為 `#0E6B63` → `#134E4A`
- **THEN** `pickTextColor` 回傳淺色前景
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「深色漸層回傳淺色前景」

#### Scenario: 淺色漸層選深色文字

- **WHEN** 漸層為 `#E8F5F0` → `#A7F3D0`
- **THEN** `pickTextColor` 回傳深色前景
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「淺色漸層回傳深色前景」

#### Scenario: 一深一淺的漸層取兩端皆可讀者

- **WHEN** 漸層為 `#0E1A1A` → `#E8F5F0`
- **THEN** 回傳的前景色，其與兩端點的對比度**最小值**，不低於另一候選前景色的對應最小值
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「一深一淺漸層取兩端最小對比較高的前景色」

系統 SHALL 於使用者未指定顏色時自動配色。預設調色盤 MUST **至少涵蓋 16 組**互異漸層 —— `prd.md` 12.1 的使用規模為 8～40 人，而 4.1.1 明訂漸層的目的是「讓使用者快速辨識球場位置」。若調色盤過小（例如僅 6 組），名單頁上多數參賽者會撞色，功能雖滿足「相鄰不重複」的字面要求，卻達不到其存在目的。

超出調色盤長度後 SHALL 循環取用，SHALL NOT 因此拋錯或回傳空值；40 人規模下的循環撞色由姓名與其他非顏色標示輔助辨識（`prd.md` 12.5：色彩不得作為唯一資訊來源）。

**「互異」MUST 指視覺上可區分，而非僅是字串不相等。** 序列化比對（`colorFrom|colorTo` 不同即判為互異）會放行兩組色相幾乎重合的漸層——那在名單頁上看起來是同一個顏色，滿足了字面要求卻達不到辨識目的。因此調色盤 MUST 同時滿足：

- 任兩組的 `colorFrom` **色相角度差 ≥ 15 度**（環狀距離，取 `min(d, 360-d)`）
- 任兩組 **不得共用相同的 `colorTo`**

#### Scenario: 未指定顏色時自動配色

- **WHEN** 新增參賽者未提供 `colorFrom`／`colorTo`
- **THEN** `defaultGradient` 依序提供可辨識的預設漸層，相鄰新增的參賽者不會拿到相同配色
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「defaultGradient 依序提供不重複的預設漸層」

#### Scenario: 調色盤規模與循環

- **WHEN** 連續取用 `defaultGradient(0)` 至 `defaultGradient(15)`
- **THEN** 16 組結果**兩兩互異**
- **AND** `defaultGradient(16)` 等於 `defaultGradient(0)`（循環取用），負數 index 亦回傳合法漸層而非拋錯
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「defaultGradient 提供 16 組互異漸層並循環取用」

#### Scenario: 調色盤在視覺上可區分

- **WHEN** 計算 16 組漸層兩兩之間的差異
- **THEN** 任兩組的 `colorFrom` 色相角度差（環狀距離）MUST ≥ 15 度
- **AND** 任兩組 MUST NOT 共用相同的 `colorTo`
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「調色盤任兩組色相差至少 15 度且不共用 colorTo」

---

### Requirement: 空白初始狀態

首次開啟時參賽者名單 MUST 為空白。系統 SHALL NOT 自動帶入任何假姓名、假分數或假資料。

空白狀態 SHALL 提供新增第一位參賽者的操作入口。

本 capability 為全新，`matchmaker:roster:v1` 不存在既有資料，因此 SHALL NOT 實作任何「舊版種子資料一次性清除」的遷移程式碼（`prd.md` 4.1.4 該句對本 capability 無適用對象）。

#### Scenario: 首次開啟為空名單

- **GIVEN** LocalStorage 中不存在 `matchmaker:roster:v1`
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** 名單為空，畫面顯示空白狀態與新增入口，不出現任何參賽者資料
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「首次開啟顯示空白狀態與新增入口」

#### Scenario: store 初始狀態為空

- **WHEN** 在無持久化資料的情況下初始化 `useRosterStore`
- **THEN** `players` 為空陣列
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「無持久化資料時初始 players 為空陣列」

---

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。本次清單僅含 `matchmaker:roster:v1`。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。

#### Scenario: 確認重置後名單清空

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」並於確認提示中確認
- **THEN** 名單回到空白狀態，且 `matchmaker:roster:v1` 已從 LocalStorage 移除
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「確認重置後名單清空且持久化資料被移除」

#### Scenario: 取消重置不動任何資料

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」後於確認提示中取消
- **THEN** 名單內容與重置前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「取消重置後名單維持不變」

#### Scenario: 重置只清除列舉範圍內的 key

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetMatchmakerData()`
- **THEN** `matchmaker:roster:v1` 被移除，`scoreboard:current:v1` **不受影響**
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「重置只移除列舉的 key，不影響 scoreboard 資料」

---

### Requirement: LocalStorage 持久化與逐筆降級

系統 SHALL 將名單保存於 LocalStorage key `matchmaker:roster:v1`，並在重新整理後還原。

`hasLocalStorage()` 的 SSR／私密模式防護 MUST 比照 `nextjs-pickball/lib/scoreboard/storage.ts` 既有模式；LocalStorage 不可用或寫入超出配額時 SHALL NOT 拋出例外中斷操作。

損壞資料的處理 MUST 採**逐筆降級**，SHALL NOT 比照 scoreboard 整份清除 —— 計分板的資料是一場比賽，清掉重開即可；名單是使用者逐筆手建的數十筆資料，因單筆不合法而清空整團人，損失不成比例（見 design Decision 3）：

- 外層 JSON 解析失敗，或外層容器結構不合法 → 清除 key，回空名單（無筆可救）。
- 外層合法但個別 `player` 驗證失敗 → **保留合法者、丟棄不合法者**，回傳丟棄筆數，並將清理後的名單寫回，使損壞不再累積。

丟棄筆數大於 0 時，UI SHALL 提示使用者有資料損毀被略過，SHALL NOT 靜默處理。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`。

#### Scenario: 重整後還原名單

- **GIVEN** 已新增數位參賽者
- **WHEN** 重新整理頁面
- **THEN** 名單內容與重整前相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「重整後名單仍在」

#### Scenario: JSON 解析失敗時清除並回空名單

- **GIVEN** `matchmaker:roster:v1` 的內容為 `"{ 不是合法 JSON"`
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「JSON 解析失敗時清除 key 並回空名單」

#### Scenario: 單筆損壞時保留其餘參賽者

- **GIVEN** 持久化資料含 3 筆參賽者，其中 1 筆的 `rating` 為 `99`（超出範圍）
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳另外 2 筆合法參賽者，`droppedCount` 為 1，且**不清除**整份資料
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1」

#### Scenario: 外層結構不合法時整份清除

- **GIVEN** `matchmaker:roster:v1` 的內容為合法 JSON 但非預期結構（如 `[1, 2, 3]`）
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「外層結構不合法時清除 key 並回空名單」

#### Scenario: LocalStorage 不可用時不拋出例外

- **GIVEN** `window.localStorage` 存取會拋出例外
- **WHEN** 呼叫 `readRoster()` 與 `writeRoster()`
- **THEN** 兩者皆不拋出，`readRoster()` 回空名單
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「localStorage 不可用時不拋出例外」

#### Scenario: 名單變更後自動寫回

- **GIVEN** 已初始化的 `useRosterStore`
- **WHEN** 透過 store 新增一位參賽者
- **THEN** `matchmaker:roster:v1` 的內容包含該筆參賽者
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「新增參賽者後自動寫回 localStorage」
