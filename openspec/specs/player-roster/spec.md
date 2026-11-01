## Purpose

定義「匹克球對戰分配機」參賽者名單（`/matchmaker/players`）的完整規格：資料模型、新增／編輯／刪除、出場狀態切換、雙色漸層與文字對比、空白初始狀態、重置流程與 LocalStorage 持久化。

本 capability 是 `prd.md` 所述分配機的地基 —— 分配演算法、對戰畫面、評分更新、歷史紀錄與匯入匯出都以參賽者名單為前置條件。資料模型已預留 `restCount` 與 `gamesPlayed` 兩個累計欄位（本 capability 只初始化不累加），使後續階段不需對 `matchmaker:roster:v1` 做破壞性遷移。

與 `/scoreboard`（單場 side-out 計分板）是兩個不同的東西：兩者的 LocalStorage 資料互不干涉，本 capability 的重置範圍以列舉的 key 清單實作，不影響 `scoreboard:current:v1`。

## Requirements

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

`restCount` 與 `gamesPlayed` MUST 存在於 schema 並初始化為 0，但本 capability SHALL NOT 寫入其累加邏輯 —— **兩者的累加皆屬於 `round-lifecycle`**：`restCount` 於「產生新一輪」時對上一輪休息名單的成員累加（`prd.md` 5.3 的「本輪結束」即產生新一輪的那一刻），`gamesPlayed` 於「比分送出並完成該場」時對該場出賽者累加。分配演算法與評分計算皆為純函式，MUST NOT 修改任何 `Player` 物件——`match-allocation` 的「候選排序與出場名單決策」已明訂「本 capability SHALL NOT 修改任何 `Player` 物件，包含 `restCount` 的累加」，本條先前寫的「累加分別屬於分配演算法與評分更新」與該規格互相矛盾，於此更正。先納入欄位是為了避免後續階段對 `matchmaker:roster:v1` 做破壞性遷移（見 design Decision 2）。

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

自動配色的**選色規則** MUST 為「掃描名單中已佔用的調色盤 index，取最小未使用者」（實作為 `roster.ts` 的 `nextAutoGradient`），SHALL NOT 依名單長度取用（`defaultGradient(roster.length)`）—— 刪除是本 capability 明列的功能，一旦發生刪除，名單長度就與「已佔用的最大 index + 1」脫鉤，依長度取色會與既有成員撞色。所有 index 皆已佔用時（人數超過調色盤組數）才退回上述的循環取用。

新增表單的顏色**預覽**與 `addPlayer` 實際套用的顏色 MUST 取自同一個函式，SHALL NOT 各自計算 —— 兩處的計算方式一旦分歧，名單發生過刪除後使用者看到的預覽色會與實際拿到的不同。

`colorFrom` 與 `colorTo` MUST **同時提供**才視為使用者指定配色；只提供其中一端時該端 SHALL 被忽略，整組改走自動配色 —— 半組顏色無法構成漸層，而以預設值補另一端等於產生一組使用者從未選擇的配色。

**「互異」MUST 指視覺上可區分，而非僅是字串不相等。** 序列化比對（`colorFrom|colorTo` 不同即判為互異）會放行兩組色相幾乎重合的漸層——那在名單頁上看起來是同一個顏色，滿足了字面要求卻達不到辨識目的。因此調色盤 MUST 同時滿足：

- 任兩組的 `colorFrom` **色相角度差 ≥ 13 度**（環狀距離，取 `min(d, 360-d)`）
- 任兩組 **不得共用相同的 `colorTo`**

**門檻為何是 13 度而非更高**：既有 6 組中 teal（174.84°）與 emerald（161.38°）的色相差為 **13.46 度**，是既有調色盤的實際下限。門檻若訂在 13.46 度以上，就等於要求改動既有色——而改動既有色會讓**既有使用者的既有參賽者換色**，代價遠高於這一對的辨識度損失。13 度是「不迫使既有色變動」前提下能訂的最嚴門檻。

日後若要提高此門檻，必須連帶處理既有 6 組的重新配色與使用者資料遷移，屬破壞性變更。

**已知的門檻侷限（供未來調整參考，非目前的缺陷）**：此判準只用**色相單一維度**校準，但人眼辨識是多維度的（色相＋飽和度＋明度）。目前調色盤中最薄的一對是 red `#DC2626`（H 0.0°, S 72.2%, L 50.6%）與 rose `#E11D48`（H 346.8°, S 77.2%, L 49.8%）——色相差 13.16°、剛好合規，但兩者的飽和度與明度幾乎相同，**區分完全依賴那 13 度色相差**。

對照之下，作為門檻校準基準的 teal／emerald 除了 13.46° 色相差，明度還相差 6.7 個百分點可作輔助線索。也就是說 red／rose 的實際可辨識裕度比校準基準還薄。

若未來要提升辨識度，正確的方向不是單純調高色相門檻（那會迫使既有色變動），而是**加入明度或飽和度的輔助判準**——例如要求色相差接近門檻的配對必須在明度上有一定差距。

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
- **THEN** 任兩組的 `colorFrom` 色相角度差（環狀距離）MUST ≥ 13 度
- **AND** 任兩組 MUST NOT 共用相同的 `colorTo`
- **驗收**：`nextjs-pickball/lib/matchmaker/colors.test.ts`，it 名稱「調色盤任兩組色相差至少 13 度且不共用 colorTo」

#### Scenario: 刪除後新增不與剩餘成員撞色

- **GIVEN** 名單依序新增三位參賽者，分別取得調色盤 index 0、1、2
- **WHEN** 刪除中間那位（index 1）後再新增一位
- **THEN** 新成員取得 index 1（最小未使用值），SHALL NOT 與剩餘兩位的任一配色相同
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「刪除中間成員後新增，配色不與剩餘成員撞色」

#### Scenario: 只提供漸層的單一端點

- **WHEN** 新增時只提供 `colorFrom` 而未提供 `colorTo`（或反之）
- **THEN** 已提供的那一端被忽略，整組顏色改由自動配色決定
- **驗收**：`nextjs-pickball/lib/matchmaker/roster.test.ts`，it 名稱「只提供 colorFrom／colorTo 其中一端時，該端會被忽略並整組走自動配色」

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

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。前綴掃描在本次變更後另有一個更硬的理由不可用：重置範圍已跨出 `matchmaker:` 前綴（見下）。

目前的清單為四個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）、`matchmaker:history:v1`（歷史賽果）與 `scoreboard:matches:v1`（對戰場次的計分板分槽），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

`scoreboard:matches:v1` 於本次變更納入清單：該 key 的每個條目都以某個對戰場次的 id 為索引，回合被清掉後那些條目即成孤兒——使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，且孤兒條目會無界累積在 LocalStorage 中（見 `round-lifecycle` capability 的「重排本輪或重置名單時清除對應計分板進度」Requirement）。

四個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。`scoreboard:matches:v1` 的字面值 MUST 取自 `nextjs-pickball/lib/scoreboard/` 的分槽 key 具名匯出（`match-slots.ts` 的 `MATCH_SLOTS_KEY`，見本 change 的 `scoreboard` delta），由 matchmaker 側的 key 清單模組 import 後併入，SHALL NOT 在 matchmaker 側再寫一次字串——同一個 key 出現兩份字面值時，改版（`:v2`）只會改到其中一份。

`scoreboard:current:v1` **不**在重置範圍內：獨立計分板的進度與分配機的活動無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。重置範圍涵蓋分槽 key 而不涵蓋獨立槽，正是「一場一槽」與「全站唯一一場」兩種語意的分界所在。

**登入時（雲端模式，`user-data-sync`「前端依 session 選擇儲存模式」）**：確認後系統 MUST 呼叫 `POST /api/matchmaker/reset`
（後端在單一 batch 內刪除雲端的名單、回合、分槽與歷史，見 `round-lifecycle`「回合與送出比分的雲端 API」），
**成功後**才清空畫面上的名單。登入時 SHALL NOT 清除任何本機 key（`RESET_KEYS` 的四個 key 皆不動）——雲端模式的名單、回合、分槽與歷史皆不讀寫本機，
本機資料是訪客時期的資料，清掉會讓之後的「匯入本機資料」無資料可匯。B6 的過渡函式 `resetLocalMatchProgress()` 已於 B8 刪除。呼叫失敗時（`requestJson` 結果為 `failed`、`rejected` 或 `conflict` 皆同；重置不可逆，SHALL NOT 自動重試）名單 MUST 保持不變並回報 `rejected`（顯示「雲端拒絕儲存，請重新整理頁面」）；結果為 `unauthorized` 時改為呼叫 `onUnauthorized`。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。雲端分支位於 `nextjs-pickball/hooks/useRemoteRosterStore.ts`。

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

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetMatchmakerData()`
- **THEN** 三個 `matchmaker:` key 與 `scoreboard:matches:v1` 皆被移除
- **AND** `scoreboard:current:v1` **不受影響**
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「重置只移除列舉的四個 key，不影響獨立計分板資料」

#### Scenario: resetLocalMatchProgress 只清除本次活動的進度

> B8 起本 Scenario 改為守住「過渡函式已刪除」：OpenSpec 的 MODIFIED 不可丟棄主 spec 既有 Scenario，故沿用原標題、改寫內容（design「apply §1 查證紀錄」）。
> 「本次活動的進度」在 B8 起已全部位於雲端，由後端 reset batch 清除（見「登入時重置名單」），前端不再清除任何本機 key。

- **GIVEN** B8 起登入時的重置不再清除任何本機 key
- **WHEN** 在 `nextjs-pickball/` 搜尋 `resetLocalMatchProgress`
- **THEN** 沒有任何結果；本機重置只剩 `resetMatchmakerData()` 一個入口（見「重置只清除列舉範圍內的 key」）
- **驗收**：指令 `rg resetLocalMatchProgress nextjs-pickball` 無輸出（tasks 6.2）；本機 key 皆保留由 `nextjs-pickball/hooks/useRemoteRosterStore.test.tsx` 的「resetRoster 成功後清空名單且不清除任何本機資料」驗證

#### Scenario: 登入時重置名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 204
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 該 POST 被呼叫一次；名單變為空、`syncStatus` 為 `synced`；本機 `RESET_KEYS` 的四個 key 與 `scoreboard:current:v1` 皆保留
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 成功後清空名單且不清除任何本機資料」

#### Scenario: 登入時重置名單前停止所有待送與重試中的變更

- **GIVEN** 雲端模式，p1 的 v0 PUT 回 503 正在等待退避重試
- **WHEN** 呼叫 `resetRoster()`，`POST /api/matchmaker/reset` 回 204，之後推進時間超過退避表全長
- **THEN** reset 送出後不再有任何對 `/api/matchmaker/players/p1` 的 PUT（否則重試的 v0 PUT 會在雲端重置後讓 p1「復活」）；名單為空
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 送出前停止所有參賽者的待送與重試中變更」

#### Scenario: 登入時重置失敗不動名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 500
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 名單仍為 3 位、`syncStatus` 為 `rejected`；本機任何 key 皆未被移除
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 失敗時名單不變並回報 rejected」

#### Scenario: 登入時重置名單清空雲端並保留本機訪客名單

- **GIVEN** 以測試帳號登入，雲端名單有 2 位；瀏覽器的本機 `matchmaker:roster:v1` 有一份訪客名單
- **WHEN** 在參賽者頁按「重置名單」並確認，之後重新整理
- **THEN** 參賽者頁為空白狀態；本機 `matchmaker:roster:v1` 內容與重置前相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時重置名單清空雲端名單並保留本機訪客名單」

#### Scenario: 登入時重置名單後對戰頁沒有回合

- **GIVEN** 以測試帳號登入，已產生一輪並完成一場
- **WHEN** 在參賽者頁確認重置名單後開啟 `/matchmaker`
- **THEN** 對戰頁沒有任何場地卡；`GET /api/matchmaker/round` 回 `{ data: null, version: 0 }`、`GET /api/matchmaker/slots` 回空清單
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時重置名單後雲端回合與分槽一併清除」

### Requirement: LocalStorage 持久化與逐筆降級

系統 SHALL 將名單保存於 LocalStorage key `matchmaker:roster:v1`，並在重新整理後還原。

`hasLocalStorage()` 的 SSR／私密模式防護 MUST 比照 `nextjs-pickball/lib/scoreboard/storage.ts` 既有模式；LocalStorage 不可用或寫入超出配額時 SHALL NOT 拋出例外中斷操作。

損壞資料的處理 MUST 採**逐筆降級**，SHALL NOT 比照 scoreboard 整份清除 —— 計分板的資料是一場比賽，清掉重開即可；名單是使用者逐筆手建的數十筆資料，因單筆不合法而清空整團人，損失不成比例（見 design Decision 3）：

- 外層 JSON 解析失敗，或外層容器結構不合法 → 清除 key，回空名單（無筆可救）。
- 外層合法但個別 `player` 驗證失敗 → **保留合法者、丟棄不合法者**，回傳丟棄筆數，並將清理後的名單寫回，使損壞不再累積。

丟棄筆數大於 0 時，UI SHALL 提示使用者有資料損毀被略過，SHALL NOT 靜默處理。

重置後 SHALL NOT 把空名單寫回，否則剛移除的 key 會立即復活。此「跳過寫入」的意圖 MUST 保存在 **reducer state** 中，SHALL NOT 以一次性的 ref 旗標實作 —— React automatic batching 會把同一個 handler 內連續呼叫的 `resetRoster()` 與 `addPlayer()` 合併為單次 render，一次性旗標被重置設下後不會被後續 action 復位，該次寫入因此被整批跳過：記憶體中有新參賽者、LocalStorage 卻是空的，使用者此刻重新整理即**靜默遺失資料**。折進 state 後，批次內的多個 action 會依序 reduce，最後一個 action 的決定自然覆蓋前面的，不需另外處理批次合併。

**儲存模式**：本 Requirement 規範**本機模式**（訪客、auth 停用、session 載入中）的名單持久化。雲端模式下名單改由「登入時名單以雲端為準」Requirement 規範，
使用者在雲端模式下的操作 SHALL NOT 改變 `matchmaker:roster:v1` 的內容（該 key 保留訪客時期的名單）；本機實作在雲端模式下仍會掛載，依既有逐筆降級規則讀取並回寫該 key（不含使用者在雲端模式下的任何變更）。本機實作位於 `useRosterStore.ts` 內的 `useLocalRosterStore`，程式碼與本 change 前的 `useRosterStore` 相同。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts` 與 `nextjs-pickball/hooks/useRosterStore.ts`。

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
- **AND** 回寫後再次讀取時，MUST 同時斷言 `players` 的**筆數與內容**仍為那 2 筆，SHALL NOT 只斷言 `droppedCount` 為 0 —— 「回寫正確」與「回寫時把名單整個寫丟」兩種情況的 `droppedCount` 皆為 0（後者是空陣列沒東西可壞），該訊號無法區分兩者，只驗它會讓「整份名單靜默消失」的 regression 溜過測試
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1」

#### Scenario: 外層結構不合法時整份清除

- **GIVEN** `matchmaker:roster:v1` 的內容為合法 JSON 但非預期結構（如 `[1, 2, 3]`）
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「外層結構不合法時清除 key 並回空名單」

#### Scenario: 版本號不符時整份清除

- **GIVEN** `matchmaker:roster:v1` 的內容為 `{ version: 2, players: [三筆合法參賽者] }`
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單、`droppedCount` 為 0，且該 key 已被移除
- **AND** SHALL NOT 走逐筆降級路徑 —— 版本不符屬**結構層級**損壞，即使每一筆 `player` 都合法也不得保留（見 design Decision 9）
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「version 不符時整份清除，不走逐筆降級」

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

#### Scenario: 同批次內重置後緊接新增仍正確持久化

- **GIVEN** 名單中已有參賽者且已寫入 LocalStorage
- **WHEN** 於同一個 handler 內連續呼叫 `resetRoster()` 與 `addPlayer()`（React 會合併為單次 render）
- **THEN** 記憶體中的名單含該新參賽者，**且** `matchmaker:roster:v1` 的內容同樣含該筆
- **AND** SHALL NOT 出現「state 有資料但 LocalStorage 為空」的狀態
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「同一批次內 resetRoster 後緊接 addPlayer 仍正確持久化」

#### Scenario: 雲端模式不寫入本機名單

- **GIVEN** mock `useSession` 為已登入，雲端 GET 回空清單
- **WHEN** 透過 `useRosterStore()` 新增一位參賽者
- **THEN** `localStorage.getItem("matchmaker:roster:v1")` 為 `null`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「雲端模式下變更名單不寫入 matchmaker:roster:v1」

### Requirement: 快速帶入強度分數

新增與編輯參賽者的表單 SHALL 提供三顆快速帶入按鈕，級別與分數對應 `prd.md` 4.1.3：

| 級別 | 分數 |
|---|---:|
| 新手 | 1.00 |
| 中階 | 3.00 |
| 高階 | 5.00 |

按鈕的可及名稱 MUST 同時包含級別名稱與該級別的分數（例如「中階 3.00」），SHALL NOT 只顯示級別名稱 —— 主持人替一位不熟的球友估分時，需要看到級別實際換算成幾分才能判斷要不要改；只寫「中階」等於要求使用者記住 `prd.md` 的對照表。

點擊任一按鈕後，系統 SHALL 將該級別分數以**小數點後兩位**的格式填入強度分數欄位（`3` MUST 顯示為 `3.00`）—— 該欄位的內容是使用者接下來要繼續編輯的文字，格式必須與「參賽者資料模型」對 `rating` 的兩位小數定義一致，否則使用者會誤以為快速分數與手填分數是兩種不同的東西。連續點擊不同級別時，後點者 MUST 覆蓋前一次填入的值。

快速帶入 MUST 只是輸入捷徑，SHALL NOT 取代或限縮手動輸入：填入後使用者 SHALL 仍可將欄位改為 1.00～8.00 範圍內、小數點後兩位的任意值，該值 MUST 沿用「參賽者資料模型」既有的 `rating` 驗證規則（超出範圍時驗證失敗，SHALL NOT 靜默夾值）。三個級別 SHALL NOT 構成可選分數的封閉清單。

快速帶入按鈕 MUST 宣告為 `type="button"`，SHALL NOT 觸發表單送出 —— HTML 表單內的按鈕預設型別是 `submit`，一旦漏標，使用者點下「中階 3.00」會直接送出一張尚未填妥姓名的表單並看到驗證錯誤，快速帶入反而成為障礙。

三組級別與分數 MUST 定義為**單一常數**並由其渲染出全部按鈕（實作為 `PlayerForm.tsx` 的 `RATING_PRESETS`），SHALL NOT 在 JSX 內逐顆寫死 —— 逐顆寫死會讓「調整某級別的分數」變成三處各改一次，且按鈕標籤與實際填入值可能各自漂移（標籤寫「中階 3.00」卻填入 `3.5` 不會有任何機制擋下）。

實作位於 `nextjs-pickball/components/matchmaker/PlayerForm.tsx`。

#### Scenario: 三個級別的快速帶入按鈕齊備

- **WHEN** 開啟新增參賽者表單
- **THEN** 強度分數欄位旁出現三顆按鈕，可及名稱分別為「新手 1.00」、「中階 3.00」、「高階 5.00」
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「表單提供新手 1.00、中階 3.00、高階 5.00 三顆快速帶入按鈕」

#### Scenario: 點擊快速帶入按鈕填入該級別分數

- **WHEN** 點擊「中階 3.00」
- **THEN** 強度分數欄位的值為 `"3.00"`
- **AND** 接著點擊「高階 5.00」後為 `"5.00"`、點擊「新手 1.00」後為 `"1.00"`，後點擊者覆蓋前一次的值
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「點擊快速帶入按鈕後強度分數欄位填入該級別的兩位小數分數」

#### Scenario: 快速帶入後仍可手動輸入任意合法分數

- **GIVEN** 已點擊「新手 1.00」使欄位為 `"1.00"`
- **WHEN** 將欄位改為 `4.25` 並送出表單
- **THEN** 送出的 `rating` 為 `4.25`，SHALL NOT 被改回 `1.00`，也 SHALL NOT 被限制為三個級別之一
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「快速帶入後仍可手動改為 1.00～8.00 範圍內的兩位小數分數並送出」

#### Scenario: 快速帶入按鈕不觸發表單送出

- **GIVEN** 姓名欄位仍為空白
- **WHEN** 點擊「高階 5.00」
- **THEN** 表單未被送出（送出處理常式未被呼叫）
- **AND** 畫面 SHALL NOT 出現任何驗證錯誤訊息
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「快速帶入按鈕不會觸發表單送出」

#### Scenario: 快速帶入後手動改為超出範圍的分數時驗證失敗

- **GIVEN** 已填入姓名，並點擊「高階 5.00」使欄位為 `"5.00"`
- **WHEN** 將欄位改為 `8.01` 並送出表單
- **THEN** 表單未被送出（送出處理常式未被呼叫），且畫面出現錯誤提示區塊
- **AND** 強度分數欄位的值仍為 `"8.01"`，SHALL NOT 被夾回 `8.00`，也 SHALL NOT 被改回 `5.00`
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「快速帶入後手動改為超出範圍的分數時驗證失敗且不夾值」

#### Scenario: 編輯模式同樣提供快速帶入按鈕

- **WHEN** 以強度為 `4.37` 的既有參賽者開啟編輯參賽者表單
- **THEN** 強度分數欄位預填為 `"4.37"`，旁邊同樣出現可及名稱為「新手 1.00」、「中階 3.00」、「高階 5.00」的三顆按鈕
- **AND** 點擊「中階 3.00」後欄位的值為 `"3.00"`，覆蓋原本的 `"4.37"`
- **驗收**：`nextjs-pickball/components/matchmaker/PlayerForm.test.tsx`，it 名稱「編輯模式同樣提供三顆快速帶入按鈕並可覆蓋既有分數」

#### Scenario: 於名單頁以快速分數新增參賽者

- **GIVEN** 於 `/matchmaker/players` 開啟新增參賽者 Dialog 並填入姓名
- **WHEN** 點擊「中階 3.00」後送出
- **THEN** 名單卡片顯示該參賽者的強度為 `3.00`
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「以快速分數新增的參賽者，卡片顯示對應強度」

### Requirement: 登入時名單以雲端為準

`useRosterStore()` SHALL 為選擇器（`user-data-sync`「前端依 session 選擇儲存模式」）：`resolveStorageMode(useSession())` 為 `"remote"` 時回傳
`hooks/useRemoteRosterStore.ts` 的結果，否則回傳本機實作 `useLocalRosterStore`。回傳物件 MUST 保留既有的 `players`、`droppedCount`、`addPlayer`、`updatePlayer`、
`removePlayer`、`togglePlayerActive`、`resetRoster`（簽章不變），另加 `syncStatus`（本機模式恆為 `"local"`）、`applyRemotePlayers` 與 `reloadRemotePlayers`（本機模式皆為不做任何事的函式）。
呼叫端（含 `useRoundStore` 經 `updatePlayer` port 寫入的休息次數）不需要知道目前模式；送出比分的評分在雲端模式改由後端寫入，前端以 `applyRemotePlayers` 接收（見下方第 9 點）。

雲端實作 `useRemoteRosterStore({ enabled, onUnauthorized })` MUST 依 `user-data-sync`「多筆使用者資料的逐筆版本化契約」：

1. `enabled` 由 false 變 true 時 `GET /api/matchmaker/players`（`loading`）；成功後以回應取代名單、記下每位參賽者的 `version`（`synced`），SHALL NOT 立即寫回。
   `droppedCount` 在雲端模式恆為 0（後端寫入前已以 `PlayerSchema` 驗證）。
2. `addPlayer` 比照本機實作在呼叫端注入 `crypto.randomUUID()` 與目前時間，以既有純函式 `addPlayer` 產生參賽者後樂觀加入，並以 `version: 0` PUT。
3. `updatePlayer`、`togglePlayerActive` 以既有純函式計算變更後的參賽者並樂觀更新，以該參賽者目前的 `version` PUT；成功後採用回應的 `version`。
4. `removePlayer` 樂觀移除並送出 `DELETE`。
5. 同一參賽者的連續變更只保留最新一份（每位參賽者一個最新優先佇列；刪除也進同一個佇列，後到者勝）。
6. 任一請求回 409 → 停止所有佇列、重新 GET、以雲端名單取代、`conflict`；回 401 → 呼叫 `onUnauthorized` 並停止送出。
7. 載入失敗時為 `load-failed`，此時所有變更操作 MUST 不送出請求、不改變名單。
8. `resetRoster` 見「重置名單與二次確認」的登入分支。
9. `applyRemotePlayers(items)` MUST 以 `items` 中每筆的 `data` 與 `version` 取代名單中同 id 的參賽者，SHALL NOT 送出任何請求（資料已由後端寫入）。
   若其中任一 id 有尚未送出或在途的變更，MUST 視同衝突：停止所有佇列、重新 GET、以雲端名單取代並回報 `conflict`——
   否則待送的 PUT 會帶著舊 version 得到 409，或覆蓋後端剛寫入的評分。
10. `reloadRemotePlayers()` MUST 停止所有佇列、重新 GET 並以雲端名單取代；狀態轉為 `synced`（呼叫端已自行回報衝突），失敗時為 `load-failed`。

使用 `useRosterStore` 的頁面（`app/matchmaker/page.tsx`、`app/matchmaker/players/page.tsx`、`app/matchmaker/stats/page.tsx`）在 `syncStatus` 為 `loading` 或 `load-failed` 時
MUST 以 `SyncStatusNotice` 取代頁面主要內容（此時沒有可信的名單可供產生對戰或統計），其餘非 `local` 狀態照常顯示並疊加 `SyncStatusNotice`，
頁面主要內容的根元素 MUST 帶 `data-sync-status`；`local` 時 SHALL NOT 渲染任何同步元素或屬性。

名單 API 的請求 MUST 經 `nextjs-pickball/lib/sync/roster-api.ts` 的薄包裝（`fetchRemotePlayers`、`putRemotePlayer`、`deleteRemotePlayer`、`importRemotePlayers`、`resetRemoteMatchmaker`），
包裝只負責方法、路徑、body 與回應 schema，一律經 `requestJson`。

#### Scenario: 名單 API 包裝的請求形狀

- **WHEN** 分別呼叫五個包裝函式
- **THEN** `requestJson` 依序收到 `GET /api/matchmaker/players`、`PUT /api/matchmaker/players/<id>`（body `{ data, version }`）、`DELETE /api/matchmaker/players/<id>`、
  `POST /api/matchmaker/players/import`（body `{ players }`）、`POST /api/matchmaker/reset`，且各自帶對應的回應 schema
- **驗收**：`nextjs-pickball/lib/sync/roster-api.test.ts`，it 名稱「名單 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」

#### Scenario: 選擇器在已登入時改用雲端名單

- **GIVEN** mock `useSession` 為已登入，GET 回兩位參賽者
- **WHEN** `useRosterStore()` mount
- **THEN** `players` 為那兩位、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「已登入時改用雲端名單並回傳 syncStatus」

#### Scenario: 訪客或 session 載入中時走本機

- **GIVEN** mock `useSession` 分別為 `loading` 與 `ready`／`authEnabled: false`
- **WHEN** `useRosterStore()` mount 並新增一位參賽者
- **THEN** `syncStatus` 為 `local`；`matchmaker:roster:v1` 含該參賽者；沒有任何對 `/api/matchmaker/*` 的請求
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「session 載入中或訪客時走本機且 syncStatus 為 local」

#### Scenario: 雲端名單載入後不立即寫回

- **GIVEN** `enabled: true`，GET 回兩位參賽者（version 皆為 3）
- **WHEN** hook mount 並等待載入完成
- **THEN** `players` 為那兩位、狀態依序經過 `loading` 到 `synced`；沒有任何 PUT 或 DELETE
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「啟用後 GET 成功即載入名單並回報 synced，且不立即寫回」

#### Scenario: 新增參賽者以 version 0 建立

- **WHEN** 呼叫 `addPlayer({ name: "新球員", ... })`
- **THEN** 名單立即多一位；送出 `PUT /api/matchmaker/players/<新 id>`，body 的 `data.id` 等於該 id、`version` 為 0
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「addPlayer 以注入的 id 送出 version 0 的 PUT」

#### Scenario: 編輯與切換出場以目前版本儲存

- **GIVEN** 參賽者 p1 的 version 為 3
- **WHEN** `updatePlayer("p1", { name: "改名" })`，PUT 回 `version: 4` 後再 `togglePlayerActive("p1")`
- **THEN** 兩次 PUT 的 `version` 依序為 3、4，畫面即時反映變更
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「updatePlayer 與 togglePlayerActive 以該參賽者目前 version 送出 PUT，成功後沿用回應的 version」

#### Scenario: 刪除參賽者

- **WHEN** `removePlayer("p1")`
- **THEN** p1 立即自名單移除；送出 `DELETE /api/matchmaker/players/p1`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「removePlayer 送出 DELETE 並立即自畫面移除」

#### Scenario: 同一參賽者連續變更只送最新

- **GIVEN** p1 的第一次 PUT 尚未完成
- **WHEN** 連續兩次 `updatePlayer("p1", …)`，接著讓第一次 PUT 回 ok
- **THEN** PUT 總共兩次，第二次的 `data` 為最後一次變更後的參賽者
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「同一參賽者連續變更時只送最新一份」

#### Scenario: 任一筆衝突時整份重新載入

- **GIVEN** 名單有 p1、p2
- **WHEN** p1 的 PUT 回 409，重新 GET 回 p1（雲端版本）與 p3
- **THEN** `players` 為雲端的 p1 與 p3、`syncStatus` 為 `conflict`；p2 的待送變更不再送出
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「任一 PUT 回 409 時停止所有儲存、重新載入名單並回報 conflict」

#### Scenario: 載入失敗時不送出變更

- **GIVEN** GET 回 500
- **WHEN** 呼叫 `addPlayer`、`updatePlayer`、`removePlayer`
- **THEN** `syncStatus` 為 `load-failed`；名單不變；沒有任何 PUT 或 DELETE
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「GET 失敗時回報 load-failed 且變更操作不送出請求」

#### Scenario: 401 交回 session 處理

- **WHEN** 分別在 GET 與 PUT 收到 401
- **THEN** `onUnauthorized` 各被呼叫一次，之後不再送出請求
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「GET 或寫入回 401 時呼叫 onUnauthorized」

#### Scenario: 停用時不發請求

- **WHEN** 以 `enabled: false` mount 並呼叫各操作
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「enabled 為 false 時不發出任何請求」

#### Scenario: 登入後新增的參賽者由雲端還原

- **GIVEN** 以測試帳號的 storage state 開啟 `/matchmaker/players`，雲端資料已清空
- **WHEN** 新增兩位參賽者、等到 `[data-sync-status="synced"]`、重新整理
- **THEN** 兩位仍在；本機 `matchmaker:roster:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入後新增的參賽者在重新整理後由雲端還原且不寫入本機」

#### Scenario: 另一個裝置看到相同名單

- **GIVEN** context A 已新增兩位參賽者並同步完成
- **WHEN** 以同一 storage state 開 context B 進入參賽者頁
- **THEN** B 看到相同兩位
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「另一個瀏覽器 context 看到相同名單」

#### Scenario: 另一裝置先編輯同一位參賽者

- **GIVEN** A 與 B 都已載入含 p1 的名單
- **WHEN** A 把 p1 改名並同步完成，之後 B 也把 p1 改成另一個名字
- **THEN** B 顯示「資料已在其他裝置更新，已重新載入最新資料」，p1 的名字為 A 改的那個
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「另一裝置先編輯同一位參賽者時顯示衝突提示並載入最新名單」

#### Scenario: 刪除後重新整理不再出現

- **WHEN** 刪除一位參賽者、等到同步完成、重新整理
- **THEN** 該參賽者不在名單中
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「刪除參賽者後重新整理不再出現」

#### Scenario: 送出比分的評分寫回雲端名單

- **GIVEN** 雲端名單有四位參賽者
- **WHEN** 在對戰頁產生對戰、輸入比分並送出，等到同步完成後重新整理參賽者頁
- **THEN** 勝方兩位的強度分數高於送出前、敗方兩位低於送出前（評分由後端在送出比分的 batch 內寫入，前端不逐人 PUT）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時送出比分後評分寫入雲端名單」

#### Scenario: applyRemotePlayers 只取代畫面上的參賽者且不送出請求

- **GIVEN** `enabled: true`，名單有 p1（version 2）與 p2，沒有待送變更
- **WHEN** `applyRemotePlayers([{ data: <p1 的 rating 為 4.2>, version: 3 }])`，之後 `updatePlayer("p1", { name: "改名" })`
- **THEN** `applyRemotePlayers` 後沒有任何請求、p1 的 rating 為 4.2；之後的 PUT 帶 `version: 3`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「applyRemotePlayers 以回應取代參賽者與 version 且不送出請求」

#### Scenario: applyRemotePlayers 遇到待送變更時整份重新載入

- **GIVEN** p1 的 PUT 在途
- **WHEN** `applyRemotePlayers([{ data: <p1>, version: 3 }])`，重新 GET 回雲端名單
- **THEN** 在途與待送的變更不再送出；`players` 為重新載入的名單、`syncStatus` 為 `conflict`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「applyRemotePlayers 遇到該參賽者有待送或在途變更時視同衝突並整份重新載入」

#### Scenario: reloadRemotePlayers 重新載入雲端名單

- **WHEN** 呼叫 `reloadRemotePlayers()`，GET 回另一份名單
- **THEN** `players` 為該名單、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「reloadRemotePlayers 停止佇列並以雲端名單取代」

#### Scenario: 雲端名單載入失敗

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/players` 回 500
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，新增參賽者的表單不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「雲端名單載入失敗時參賽者頁顯示錯誤提示」

### Requirement: 參賽者雲端 API

`hono-pickball/src/routes/matchmaker.ts` SHALL 以 `/api/matchmaker` sub-app 提供下列端點（`user-data-sync`「多筆使用者資料的逐筆版本化契約」的第一個實作），
`data` 一律以核心套件的 `PlayerSchema` 驗證，唯批次匯入的每一筆改以 `PlayerWriteSchema` 驗證（見下方「寫入雲端的參賽者 id」）：

| 方法與路徑 | 行為 |
|---|---|
| `GET /api/matchmaker/players` | `200 { items }`，依 `sort_order` |
| `PUT /api/matchmaker/players/:id` | 建立（`version: 0`）或依版本更新；path id ≠ `data.id` → 400 |
| `DELETE /api/matchmaker/players/:id` | `204`，冪等 |
| `POST /api/matchmaker/players/import` | `{ players }` 整份附加（D1 `batch()`）；任一 id 已存在 → 409 且不寫入；body 超過 `PLAYER_IMPORT_BODY_LIMIT_BYTES`（1,000,000 位元組）或超過 `MAX_PLAYERS_PER_IMPORT`（500）位 → `413 PAYLOAD_TOO_LARGE` 且不寫入 |
| `POST /api/matchmaker/reset` | `204`，以 `batch()` 刪除本人的對戰分配機資料（本 change：`matchmaker_players`） |

資料存取 SHALL 位於 `hono-pickball/src/matchmaker/players-repository.ts`。所有查詢 MUST 以 `user_id = c.var.user.id` 為條件。

**批次匯入的上限**（`user-data-sync`「批次寫入端點的筆數與 body 上限」）：body 上限 middleware 掛在 validator 之前；筆數檢查在 schema 通過之後、讀取 `sort_order` 與 `db.batch()` 之前。
恰 500 位 MUST 照常匯入。body 上限 1,000,000 位元組小於 D1 單一列上限 2,000,000 位元組，因此通過上限的請求中任一位參賽者的 `data` 都不會超過 D1 的列大小。
D1 的「每次 Worker 呼叫的 query 數」把一次 `db.batch()` 計為一個 query（Context7 查證，見 design），逐筆一條陳述式的匯入不受 Free 方案 50 個 query 的限制；500 位的上限用於約束單次 batch 的執行時間與 Worker CPU，並涵蓋球聚名單的實際規模。

**寫入雲端的參賽者 id**：`@pickball/core/api/players` SHALL 匯出 `PlayerWriteSchema = PlayerSchema.extend({ id: z.string().min(1) })`；`PlayerImportRequestSchema` 的每一筆與 `user-data-sync` 的 `LocalImportRequestSchema.players` MUST 以它驗證，
`id` 為空字串時 MUST 回 `400 INVALID_BODY` 且不寫入。`PUT /api/matchmaker/players/:id` 不需另行收緊：path 的 `:id` 不可能為空字串（`/api/matchmaker/players/` 不符合該路由），而 `data.id` MUST 等於 path id。
**`PlayerSchema` 本身 SHALL NOT 改變**：它同時用於訪客本機名單的逐筆降級（「LocalStorage 持久化與逐筆降級」）、本機 JSON 還原（`BackupSchema`）與雲端回應的解析；
收緊它會讓訪客既有的 id 為空字串的參賽者在下次讀取時被捨棄並回寫清除，因此只在寫入雲端的邊界收緊。

#### Scenario: auth 停用時所有端點回 404

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`
- **WHEN** 分別呼叫上表五個端點（合法 body）
- **THEN** 皆回 404
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404」

#### Scenario: 未登入時所有端點回 401

- **WHEN** 不帶 cookie 分別呼叫上表五個端點
- **THEN** 皆回 401 與 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「未登入呼叫所有 /api/matchmaker 端點皆回 401」

#### Scenario: 他人的參賽者不可見也不可改

- **GIVEN** A 有參賽者 p1（version 1）
- **WHEN** B 呼叫 GET、以 `version: 1` PUT p1、DELETE p1
- **THEN** B 的 GET 不含 p1；B 的 PUT 回 409（B 沒有 p1）；B 的 DELETE 回 204；之後 A 的 GET 仍有 p1 且 version 為 1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A」

#### Scenario: 他人的匯入與重置不影響本人

- **GIVEN** A 有兩位參賽者
- **WHEN** B 以與 A 相同的 id 匯入兩位參賽者，再呼叫重置
- **THEN** B 的匯入成功（id 只在使用者內唯一）；B 重置後 A 的 GET 仍為原本兩位
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 的匯入與重置不影響 A 的名單」

#### Scenario: 尚無參賽者時回空清單

- **WHEN** 已登入、從未寫入時 GET
- **THEN** 200，`{ "items": [] }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「尚無參賽者時 GET 回空的 items」

#### Scenario: 建立參賽者並依建立順序列出

- **WHEN** 依序以 `version: 0` PUT p2、p1
- **THEN** 兩者皆回 `version: 1`；GET 的順序為 p2、p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以 version 0 建立參賽者並依建立順序列出」

#### Scenario: 依版本更新參賽者

- **GIVEN** p1 的 version 為 1
- **WHEN** 以 `version: 1` PUT 改名後的 p1
- **THEN** 回 `version: 2`；GET 取回新名字，且順序不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以目前 version 更新參賽者並遞增 version」

#### Scenario: 參賽者版本不符

- **GIVEN** p1 的 version 為 2
- **WHEN** 分別以 `version: 1`、`version: 3` PUT
- **THEN** 皆回 409 `{ "error": "VERSION_CONFLICT" }`；GET 仍為 version 2 的資料
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者 version 不符時回 409 且資料不變」

#### Scenario: 參賽者已存在時以 version 0 寫入

- **GIVEN** p1 已存在
- **WHEN** 以 `version: 0` PUT p1
- **THEN** 回 409；資料不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者已存在時以 version 0 寫入回 409」

#### Scenario: 不合法的參賽者寫入

- **WHEN** 以 path `p1`、`data.id` 為 `p2` PUT；以 `rating` 為 99 的資料 PUT；以 `Content-Type: text/plain` PUT
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，且沒有任何資料被建立
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「path id 與 data.id 不一致或資料不合 PlayerSchema 時回 400」

#### Scenario: 刪除冪等

- **GIVEN** p1 存在
- **WHEN** 連續兩次 DELETE p1
- **THEN** 兩次皆回 204；GET 不含 p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「刪除參賽者回 204 且重複刪除仍回 204」

#### Scenario: 匯入附加在既有名單之後

- **GIVEN** 已有 p1
- **WHEN** POST import `[p2, p3]`
- **THEN** 200，回應 `items` 為 p2、p3 且 version 皆為 1；GET 順序為 p1、p2、p3
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入的參賽者附加在既有名單之後並各自為 version 1」

#### Scenario: 匯入整份原子性

- **GIVEN** 已有 p1
- **WHEN** POST import `[p4, p1, p5]`
- **THEN** 回 409；GET 只有 p1（p4、p5 皆未寫入）
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入時任一 id 已存在則整份不寫入並回 409」

#### Scenario: 不合法的匯入請求

- **WHEN** POST import `{ players: [] }` 與含兩筆相同 id 的清單
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，沒有任何資料被寫入
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入清單為空或含重複 id 時回 400」

#### Scenario: 重置刪除本人全部參賽者

- **GIVEN** 本人有三位參賽者
- **WHEN** POST reset
- **THEN** 回 204；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置刪除本人全部參賽者並回 204」

#### Scenario: 名單匯入超過 500 位時回 413 且不寫入

- **WHEN** 分別以不同使用者匯入恰 500 位與 501 位參賽者
- **THEN** 前者回 200 且 GET 有 500 位；後者回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入恰 500 位參賽者成功，501 位時回 413 PAYLOAD_TOO_LARGE 且不寫入」

#### Scenario: 名單匯入的 body 超過上限時回 413 且不寫入

- **WHEN** 匯入一位 `name` 長度使 body 超過 1,000,000 位元組的參賽者
- **THEN** 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入請求 body 超過上限時回 413 PAYLOAD_TOO_LARGE 且不寫入」

#### Scenario: 名單匯入的參賽者 id 為空字串時回 400

- **WHEN** 匯入 `[p1, { ...p2, id: "" }]`
- **THEN** 回 `400 { "error": "INVALID_BODY" }`；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入含 id 為空字串的參賽者時回 400 且不寫入」

#### Scenario: 寫入雲端的參賽者 schema 只在邊界收緊 id

- **WHEN** 以 `PlayerSchema`、`PlayerWriteSchema`、`PlayerImportRequestSchema`、`LocalImportRequestSchema` 分別解析含 `id: ""` 的參賽者（其餘欄位合法），並以 `PlayerWriteSchema` 解析 `id: "p1"` 的同一筆
- **THEN** `PlayerSchema` 通過；`PlayerWriteSchema`、`PlayerImportRequestSchema`、`LocalImportRequestSchema` 皆失敗；`id: "p1"` 時 `PlayerWriteSchema` 通過且輸出與 `PlayerSchema` 相同
- **驗收**：`packages/pickball-core/test/api/players.test.ts`，it 名稱「PlayerWriteSchema 拒絕空字串 id 而 PlayerSchema 照舊接受」

#### Scenario: 訪客本機名單照舊保留 id 為空字串的參賽者

- **GIVEN** 本機 `matchmaker:roster:v1` 含一位 `id` 為 `""` 與一位 `id` 為 `"p2"` 的合法參賽者
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳兩位、`droppedCount` 為 0，且 key 的內容未被回寫改變
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「id 為空字串的參賽者照常讀回且不被捨棄」
