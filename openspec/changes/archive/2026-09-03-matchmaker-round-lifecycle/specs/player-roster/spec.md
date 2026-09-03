## MODIFIED Requirements

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

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。

目前的清單為三個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）與 `matchmaker:history:v1`（歷史賽果），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

三個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。

`scoreboard:current:v1` 不在重置範圍內：計分板是獨立 capability 的資料，兩者的 LocalStorage 互不干涉。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。

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

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetMatchmakerData()`
- **THEN** 前三個 `matchmaker:` key 皆被移除
- **AND** `scoreboard:current:v1` **不受影響**
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「重置只移除列舉的 key，不影響 scoreboard 資料」
