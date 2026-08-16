---
name: project_matchmaker_architecture
description: add-player-roster change（lib/matchmaker/ 全新目錄）的設計決策與 Task 1 審查記錄
type: project
---

`lib/matchmaker/` 是全新 capability「add-player-roster」（分配機第一塊），與既有 `lib/scoreboard/` 平行但**刻意在幾個地方不照抄**其模式，見 `openspec/changes/add-player-roster/design.md`：

- **Decision 2**：`restCount`／`gamesPlayed` 一次納入 schema 並 `.default(0)`（本次只初始化不累加），理由與 scoreboard 的 `targetScore` 教訓相同——欄位後加會導致「舊資料缺欄位→驗證失敗→整份清除」的靜默資料遺失。
- **Decision 3**：`storage.ts`（Task 4）持久化失敗策略**刻意偏離** `lib/scoreboard/storage.ts` 的「整份清除」——改成**逐筆降級**（外層 JSON/結構不合法才整份清除；個別 player 驗證失敗則保留合法者、丟棄不合法者並回報 `droppedCount`）。理由：名單是使用者手建的幾十筆資料，不像 scoreboard 是「一場比賽」，清空損失不成比例。**審查 Task 4 時要用這個標準檢查，不能拿 scoreboard/storage.ts 的整份清除模式來對照要求一致。**
- **Decision 4**：`id`／`createdAt` 由呼叫端注入（`addPlayer(roster, input, { id, now })`），`roster.ts` 的 CRUD 純函式**不得**內部呼叫 `crypto.randomUUID()`／`new Date()`——否則測試只能用 `expect.any(String)` 寬鬆斷言。
- **Decision 6**：重置用**列舉 key 清單**（`RESET_KEYS = ["matchmaker:roster:v1"]`），不用前綴掃描，避免誤刪未來加入的、不該被重置的資料。
- **Decision 7**：`rating` 存 `number`（非整數化 ×100），寫入前於 `roster.ts` 的寫入點統一 `Math.round(v*100)/100`——**round 邏輯屬於 Task 3，不屬於 Task 1 的 types.ts**。
- **Decision 8**：hydration 沿用 `useScoreboardStore` 的 HYDRATE 模式（SSR/CSR 皆空狀態起手，`useEffect` 讀取後 dispatch）。

**TDD 分工**（design.md 表格）：`types.ts`／`roster.ts`／`colors.ts`／`storage.ts`／`useRosterStore.ts` 皆行為邏輯必 TDD；`page.tsx`、`components/matchmaker/*.tsx`、`tests/e2e/specs/player-roster.spec.ts` 為例外層，E2E 驗收。

**tasks.md 開頭有特別聲明**：本 change 全新目錄，每個模組第一個測試的紅燈形式是「import 失敗（模組不存在）」而非斷言失敗，兩者都算真紅燈；**不應**出現任何 regression guard 標註。

## Task 1（types.ts）審查記錄（2f42161→f6e2c0e，commit f6e2c0e，APPROVE 傾向，無 High）

- 10 個欄位齊全、順序與 spec 表格逐一對應；風格完全比照 `lib/scoreboard/types.ts`（schema/型別成對匯出、`GenderSchema` 用 `z.enum` 呼應 `ModeSchema`/`TeamSchema`/`StatusSchema` 慣例）。
- **現場用 node 執行 zod 4.4.3 驗證過的事實**（供之後審查同類 schema 直接引用，不必重跑）：
  - `z.number().min(1).max(8)` 的 `.min()`/`.max()` **inclusive**——1 與 8 都通過，0.999999/8.000001 都失敗。
  - `z.string().trim().min(1)` 的 `.trim()` 是**真正的 transform**，會改寫 output（`"  王小明  "` → `"王小明"`），不是單純驗證。
  - `.default(0)` 搭配 `z.number().int().nonnegative()`：`z.infer`（output type）該欄位為**必填**，`z.input`（input type）為 optional——用 `@ts-expect-error` 現場驗證過。
  - zod 4.4.3 有 `z.iso.datetime()`（建議的 ISO 8601 驗證寫法），舊版 `z.string().datetime()` 在 4.x 仍可用但屬相容寫法非慣用 API。
- **發現的 Medium 缺口**（非 blocking）：① `rating` 的測試只測了 0.99/8.01 兩個界外值，沒有對 inclusive 邊界（1、8 本身應通過）寫斷言——實作正確但沒有測試釘住這個契約；② `createdAt: z.string()` 沒有格式驗證，任何非 ISO 字串都會通過——但這不算「漏做 tasks.md 交辦的事」，因為 tasks.md 1.1-1.9 本身就沒有任何步驟要求對 createdAt 加格式驗證，是 spec 表格描述（「ISO 8601」）與實際驗證強度之間的落差，需要跟 spec 作者確認是否要走一次新的 TDD 三步驟來補。
- **name 的 `.trim()` 是否違反 spec「SHALL NOT 靜默夾值或改寫」**：判定**不違反**——spec 原文那句話的主詞明確只限定「rating 超出範圍或 Hex 格式不合法」兩種情況（緊接在該子句之後），不包含 name；且 tasks.md 1.5/1.6 本身就明文指示改成 `z.string().trim().min(1)`，是規格作者刻意要求的行為。日後若再遇到類似「某個 transform 是否違反某句 SHALL NOT」的疑問，先看該 SHALL NOT 子句的語法範圍（主詞是否真的涵蓋該欄位），不要望文生義擴大解釋到全欄位。
- **`RosterSchema.version: z.number()` 無約束**：實作者判斷屬 Task 4 範圍，判定**合理**——design.md 與 tasks.md 皆未定義 version 欄位的允許值契約，版本控管目前是靠 `STORAGE_KEY = "matchmaker:roster:v1"` 這種「版本號寫死在 key 名稱」的模式（與 scoreboard 一致）。但建議 Task 4 動工前要明確決定 version 欄位本身的用途（是否用於 payload 內部 migration 判斷），否則這個完全開放的 number 欄位會讓部分驗證分支永遠不會因 version 而觸發。
- 範圍極乾淨：`git diff 2f42161..f6e2c0e --stat` 只有 `types.ts` + `types.test.ts` 兩個新檔案，單一 commit，未觸碰 `lib/scoreboard/`、`openspec/` 或任何 UI／hook。
- 現場執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/types.test.ts`（4 passed）、`tsc --noEmit`（無輸出）、`eslint lib/matchmaker/types.ts lib/matchmaker/types.test.ts`（無輸出）皆綠燈。
- `prd.md` 是 repo root 下的既有檔案（非本次 diff 產物），與本 change 的 PRD 引用（`prd.md` 4.1 等）一致，不是這次新增的雜訊檔案。

## How to apply

審查後續 Task 2-9 時：
- Task 2（colors.ts）：核心不變式驗證用「兩端最小對比較高」而非斷言特定顏色字面值（tasks.md 2.5 明文禁止），審查時注意有沒有把實作細節焊進測試。
- Task 3（roster.ts）：核對 round 是否**只在** `addPlayer`/`updatePlayer` 的寫入點做一次（不應散落在 types.ts 或其他地方），且 `id`/`createdAt`/`now` 必須是注入而非內部產生（Decision 4）。
- Task 4（storage.ts）：核對是否真的做到「逐筆降級」而非整份清除（Decision 3），這是與 scoreboard/storage.ts **刻意不同**的地方，不要用 scoreboard 的模式來評判對錯。同時可以趁機確認 version 欄位的語意是否已被定義清楚（見上方 Task 1 的遺留問題）。
- Task 5（useRosterStore.ts）：核對 hydration 是否比照 `useScoreboardStore`（Decision 8），以及 `droppedCount` 是否有從 storage 層傳遞到 store 供 UI 顯示（spec「LocalStorage 持久化與逐筆降級」Requirement 明文要求「SHALL NOT 靜默處理」）。
