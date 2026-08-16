---
name: project_matchmaker_architecture
description: add-player-roster change（lib/matchmaker/ 全新目錄）的設計決策與 Task 1-6 審查記錄
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

## Task 1（types.ts）審查記錄（2f42161→f6e2c0e，commit f6e2c0e；re-review 修正 commit 698d345，APPROVED，無 High）

- 10 個欄位齊全、順序與 spec 表格逐一對應；風格完全比照 `lib/scoreboard/types.ts`（schema/型別成對匯出、`GenderSchema` 用 `z.enum` 呼應 `ModeSchema`/`TeamSchema`/`StatusSchema` 慣例）。
- **現場用 node 執行 zod 4.4.3 驗證過的事實**（供之後審查同類 schema 直接引用，不必重跑）：
  - `z.number().min(1).max(8)` 的 `.min()`/`.max()` **inclusive**——1 與 8 都通過，0.999999/8.000001 都失敗。
  - `z.string().trim().min(1)` 的 `.trim()` 是**真正的 transform**，會改寫 output（`"  王小明  "` → `"王小明"`），不是單純驗證。
  - `.default(0)` 搭配 `z.number().int().nonnegative()`：`z.infer`（output type）該欄位為**必填**，`z.input`（input type）為 optional——用 `@ts-expect-error` 現場驗證過。
  - zod 4.4.3 有 `z.iso.datetime()`（建議的 ISO 8601 驗證寫法），舊版 `z.string().datetime()` 在 4.x 仍可用但屬相容寫法非慣用 API。
  - `z.iso.datetime()` **預設只接受 `Z` 尾碼的 UTC**，帶時區 offset（如 `+08:00`）與純日期（`2026-08-15`）皆驗證失敗——現場測過 `"2026-08-15T00:00:00.000Z"`／`"2026-08-15T00:00:00Z"` 通過，`"...+08:00"`／`"2026-08-15"`／`"2026-08-15T00:00:00"`（無 Z）／`"not-a-date"` 皆失敗。**但這不構成風險**：`Date.prototype.toISOString()` 本身無論 `process.env.TZ` 為何都固定輸出 UTC `Z` 格式（現場以 `TZ=Asia/Taipei`／`America/New_York`／`Pacific/Kiritimati` 分別執行驗證過，格式完全一致），所以只要 `createdAt` 一律由本 app 呼叫 `toISOString()` 產生（Decision 4：呼叫端注入），跨裝置時區就不會造成 JSON 匯入（prd.md 9.2）驗證失敗。風險僅存在於「使用者手動編輯 JSON 塞入 offset 格式時間戳」這種非本 app 產生的資料，目前不在 9.2 的匯出入對稱範圍內，**Task 4 若要支援外部來源 JSON 匯入才需要重新評估**。
  - `z.literal(1)` 在欄位缺漏／型別錯誤／數值不符三種情況下，錯誤訊息一致為 `"Invalid input: expected 1"`（`path: ["version"]`），足以指出問題欄位與期望值，可接受。
- **發現的 Medium 缺口**（非 blocking，**已於 re-review 修正 commit 698d345 解決**，見下）：① `rating` 的測試只測了 0.99/8.01 兩個界外值，沒有對 inclusive 邊界（1、8 本身應通過）寫斷言——實作正確但沒有測試釘住這個契約；② `createdAt: z.string()` 沒有格式驗證，任何非 ISO 字串都會通過——但這不算「漏做 tasks.md 交辦的事」，因為 tasks.md 1.1-1.9 本身就沒有任何步驟要求對 createdAt 加格式驗證，是 spec 表格描述（「ISO 8601」）與實際驗證強度之間的落差，需要跟 spec 作者確認是否要走一次新的 TDD 三步驟來補。
- **re-review（commit 698d345，tasks.md 1.10-1.15 補做）**：四項全數確認處理正確——`createdAt` 改 `z.iso.datetime()`（1.10-1.11，真紅燈：`z.string()` 舊實作接受任意字串）；`RosterSchema.version` 改 `z.literal(1)`（1.12-1.13，真紅燈：`z.number()` 舊實作接受任何數字）；`rating` 邊界正向斷言＋baseline（1.14，**誠實標註為 regression guard**，現場核對 diff 確認純新增 3 個 `expect`，無任何「改斷言看紅再改回」痕跡，標註屬實）；`name.trim()` 補註解（1.15）。`git show 698d345 --stat` 確認只動 `types.ts`（+6/-3）與 `types.test.ts`（+42/-1）兩檔，未越界碰 `colors.ts` 或其他檔案（那些是同一序列中其他獨立 commit 06a893d／bea3ff9／77435c5／50786be 的產物，非本 fix commit 內容）。`pnpm test --run lib/matchmaker/types.test.ts` 6 passed、`tsc --noEmit`／`eslint` 皆無輸出。
- **name 的 `.trim()` 是否違反 spec「SHALL NOT 靜默夾值或改寫」**：判定**不違反**——spec 原文那句話的主詞明確只限定「rating 超出範圍或 Hex 格式不合法」兩種情況（緊接在該子句之後），不包含 name；且 tasks.md 1.5/1.6 本身就明文指示改成 `z.string().trim().min(1)`，是規格作者刻意要求的行為。日後若再遇到類似「某個 transform 是否違反某句 SHALL NOT」的疑問，先看該 SHALL NOT 子句的語法範圍（主詞是否真的涵蓋該欄位），不要望文生義擴大解釋到全欄位。
- **`RosterSchema.version: z.number()` 無約束**（第一輪判定）：實作者當時判斷屬 Task 4 範圍。**第二輪（698d345）改判需要現在處理**，已收斂為 `z.literal(1)`（design Decision 9，理由：開放 number 會讓未來 v2 結構通過外層驗證後在逐筆驗證整批落空，使用者看到「名單莫名少了很多人」而非明確版本不符）。`z.literal(1)` 對缺漏／型別錯誤／數值不符三種輸入的錯誤訊息一致為 `"Invalid input: expected 1"`，可理解、未引入新問題。
- 範圍極乾淨：`git diff 2f42161..f6e2c0e --stat` 只有 `types.ts` + `types.test.ts` 兩個新檔案，單一 commit，未觸碰 `lib/scoreboard/`、`openspec/` 或任何 UI／hook。
- 現場執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/types.test.ts`（4 passed）、`tsc --noEmit`（無輸出）、`eslint lib/matchmaker/types.ts lib/matchmaker/types.test.ts`（無輸出）皆綠燈。
- `prd.md` 是 repo root 下的既有檔案（非本次 diff 產物），與本 change 的 PRD 引用（`prd.md` 4.1 等）一致，不是這次新增的雜訊檔案。

## Task 2（colors.ts）審查記錄（單一 commit 06a893d，BASE 50786be，APPROVE 傾向，無 High）

- WCAG 公式**現場用 node 重新實作一份獨立驗算**過（不是只讀程式碼）：`relativeLuminance`／`contrastRatio` 與官方定義逐項核對無誤，白對黑算出 21:1（sanity check 通過）。`pickTextColor` 的 2.5 情境（`#0E1A1A`→`#E8F5F0`）現場算出 `lightScore=1.1199774072192692`、`darkScore=1.1326451526897003`，與實作者自述「已用 Node 腳本驗證過的紅燈數值」**完全吻合**——這是判斷「實作者自述可信」的直接證據，不是道聽途說。
- `pickTextColor` 確認是**真正的 argmax**：`minContrastFor` 對 `colorFrom`／`colorTo` 兩端都取 `Math.min`，不是平均亮度法；讀完整份檔案未發現殘留的平均亮度中間態程式碼。
- `DARK_FOREGROUND = "#030712"` 對 `app/globals.css` 的 `--foreground: oklch(0.129 0.042 264.695)`：**現場用完整 OKLab→線性 sRGB 矩陣算出精確值為 `#020618`**，與硬編碼的 `#030712`（Tailwind gray-950）有微小落差，但兩者對白色的對比度分別是 20.16:1 vs 20.13:1，差距在小數點後兩位，**實務上無感知差異**，判定近似合理、註解也已提醒未來 design token 異動要重新檢查。這組「OKLCH 精確轉換值 vs 近似值」的計算腳本／矩陣係數可在需要時重新推導，不必假設下次還記得。
- Tie-break（`lightScore >= darkScore ? LIGHT : DARK`）在兩者相等時選淺色：確認這**是可達的真實邊界**（存在一個「中性灰」亮度 L≈0.1791，使對深色/淺色前景對比度相等），非純理論case；spec 未規範，判定屬 Low（建議補一行註解說明是任意決定）而非需要修正的缺陷。
- `defaultGradient` 只有 6 組預設，PRD 12.1 使用規模 8～40 人、4.1.1 明文「快速辨識球場位置」是此功能目的：技術上滿足 spec 唯一明文要求（相鄰不重複，modulo 保證），但規模到 40 人時每 6 人重複一次配色，與 PRD 4.1.1 的意圖有落差。判定為 **Medium**（非 spec 違反，是 spec 對 PRD 意圖覆蓋不足的落差，值得跟 spec 作者確認是否要擴充調色盤或另加辨識手段），不是 blocking。
- 測試檔的 2.5 it 確認是**不變式斷言**（比較 `resultMinContrast`／`otherMinContrast`），沒有把顏色字面值焊進斷言，符合 tasks.md 2.5 的明文禁止事項；4 個 it 名稱與 spec Scenario 標題逐字比對**完全一致**。
- `defaultGradient` 測試只跑 `Array.from({ length: 6 })`（剛好等於陣列長度），modulo 的 wraparound／負數 index 路徑完全沒被測試覆蓋到——實作正確但這個分支缺測試證據，判定 Low。
- 範圍極乾淨：`git show 06a893d --stat` 只有 `colors.ts` + `colors.test.ts` 兩個新檔案，未觸碰 `types.ts`／`lib/scoreboard/`／`app/globals.css`／openspec 檔案。現場跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/colors.test.ts`（4 passed）、`tsc --noEmit`、`eslint colors.ts colors.test.ts` 皆無輸出（乾淨綠燈）。

### Task 2 re-review（fix commit b7ca45e，BASE 06a893d，判定 APPROVED、有 1 個新 Medium 待追蹤）

- **16 組互異**：現場用 node 重新實作 `DEFAULT_GRADIENTS` 陣列並跑 `new Set(...).size`，確認 **16/16 互異**（`colorFrom|colorTo` 序列化）；`colorFrom` 單獨也互異，無重複。spec（`openspec/changes/add-player-roster/specs/player-roster/spec.md` 174-189 行，commit 8edb70b 新增）明文「16 組結果兩兩互異」，測試（`colors.test.ts` 46-56 行）逐字對應 Scenario 標題，字面要求**滿足**。
- **前 6 組完全未動**：`git diff 06a893d..b7ca45e -- .../colors.ts` 確認前 6 組 `colorFrom`/`colorTo` 數值逐一比對無差異，只在同一行加了 `// xxx（既有）` 行內註解，屬純加法變更，實作者「保留原順序避免既有使用者換色」的聲稱屬實。
- **pickTextColor 對全部 16 組實測**：現場用 node 完整重新實作 WCAG 公式跑過一輪，**全部 16 組（含既有 6 組）都回傳 LIGHT_FOREGROUND**，無一組回傳深色前景——「新增 10 組皆為深色調色板」的聲稱**成立**。但 amber/yellow（index 7）與 lime（index 8）的 `lightScore` 對 `darkScore` margin 明顯薄於其他組（2.94 vs 2.32、3.09 vs 2.31，約 25% margin，其餘組多在 60%~120%+），屬於「目前仍回傳 LIGHT 但安全邊際較窄」的觀察，非 bug，記錄供未來若這兩組色碼被微調時參考。
- **重大發現（新 Medium）**：index 0（teal 既有，`#0E6B63`/`#134E4A`）與 index 9（cyan-teal 新增，`#0D9488`/`#134E4A`）**共用完全相同的 colorTo**，且 `colorFrom` 的 HSL 色相角度只差 **0.2 度**（174.8° vs 174.7°，等於同一色相，只有飽和度/明度不同：S76.9%/L23.7% vs S83.9%/L31.6%）——現場對全部 120 組 pair 算過色相角度差，這是**唯一**共用 colorTo 的配對，也是色相差距最小的配對，第二名（blue vs slate，5.9°）差距是它的近 30 倍，且第二名 colorTo 不同。這**直接牴觸程式碼自己的註解聲稱**（`colors.ts` 84-87 行：「色相依 HSL 環狀分散於既有 6 組之間（約每 36 度取一色相）」）——cyan-teal 並未落在既有 6 色的色相缺口中，而是幾乎精確疊在既有 teal 的色相上。這與第一輪判定 Medium 的「滿足字面要求（兩兩互異）卻達不到目的（PRD 4.1.1 快速辨識球場位置）」是同一模式的**具體實例**，而非純理論疑慮：兩組在名單頁小色塊上很可能難以區分。**不算 blocking**（字面 spec 要求仍滿足，測試綠燈），但應記錄為 Medium 供下一個 fix commit 處理（建議：把 index 9 的色相移出這個缺口，或至少改用不同的 colorTo）。
- **`hexToRgb` 的 JSDoc 理由站得住腳**：「不加執行期驗證，避免與 PlayerSchema/HexColorSchema 產生第二個真相來源」與 `colors.ts`／`colors.test.ts` 檔頭既有的「刻意不 import types.ts 保持獨立」架構決策一致（`colors.test.ts` 4-5 行本來就有相同論述用在測試檔的 `HEX_COLOR_PATTERN` 上），不是這次才發明的新理由。`prd.md` 69-79、424-425、470 行證實 hex 色碼確實有「使用者自訂」與「Hex 色碼不合法」的錯誤情境，隱含驗證責任在表單／`PlayerSchema` 層（Task 3 `roster.ts` 範圍，尚未審查），colors.ts 停留在「信任呼叫端」是合理的架構邊界。唯一殘餘風險是「若未來有新呼叫路徑繞過 PlayerSchema 直接餵字串給 colors.ts」，`parseInt` 對非法字元會回傳 `NaN` 並靜默往下傳（`lightScore >= darkScore` 於雙 `NaN` 時為 `false`，會靜默回傳 DARK_FOREGROUND 而非報錯）——目前無這種呼叫路徑存在，屬推測性風險，不成立為現在的 issue。
- **範圍**：`git show b7ca45e --stat` 只有 `colors.ts`（+31/-6）與 `colors.test.ts`（+12）——確認乾淨。**注意**：`git diff 06a893d..b7ca45e`（區間 diff，非單一 commit）會額外顯示 `types.ts`／`types.test.ts` 的變更，那些屬於同區間內另一個獨立 commit `698d345`（Task 1 re-review，已於 Task 1 章節記錄 APPROVED），不是這次 fix 的內容，審查時用 `git show <commit> --stat` 而非區間 diff 來判斷單一 commit 的範圍。
- 現場跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/colors.test.ts`（**5 passed**，新增第 5 個 it）、`tsc --noEmit`、`eslint colors.ts colors.test.ts` 皆無輸出，乾淨綠燈。

## Task 3（roster.ts）審查記錄（單一 commit 9e44b7e，BASE b7ca45e/f11b2d0，判定：有 1 個新 Medium，非 blocking）

- **不可變性確認**：四個函式都不就地修改。`addPlayer` 用 `[...roster, player]`；`removePlayer` 用 `roster.filter(...)`；`updatePlayer`／`togglePlayerActive` 共用 `replaceById`（`findIndex` + `slice + spread` 組回新陣列），連「找不到 id」的分支也回傳 `[...roster]`（新陣列參考，不是原陣列本身）——比 spec 字面要求更嚴謹，是刻意的好選擇。函式簽章用 `roster: readonly Player[]`，型別層面就擋掉就地修改，是本次審查過的三個模組（types/colors/roster）裡第一次看到用 `readonly` 修飾陣列參數。
- **Decision 4 遵守**：`grep -n "crypto.randomUUID\|new Date(" lib/matchmaker/roster.ts` 只命中檔頭註解裡「不呼叫這兩者」的說明文字，程式碼本身確實沒有呼叫。`hooks/useRosterStore.ts` 尚未存在（Task 5 未開始），確認範圍乾淨。
- **round 單一寫入點確認**：`roundRating()` 只在 `addPlayer` 建構 player 物件時、以及 `updatePlayer` 的 `patch.rating !== undefined` 分支被呼叫，`togglePlayerActive`／`removePlayer` 完全不碰 rating。符合 Decision 7。
- **測試品質**：7 個 it 名稱與 spec（`specs/player-roster/spec.md` 81-136 行指定的 it 名稱）逐字比對**完全一致**，無一字出入。「不修改原陣列」的斷言用 `expect(result).not.toBe(roster)`（參考比較，非只比長度），符合 tasks.md 3.1 的明文要求。現場跑 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/roster.test.ts`（**7 passed**）、`tsc --noEmit`、`eslint roster.ts roster.test.ts` 皆乾淨無輸出。
- **TDD 誠實性**：`tasks.md` 3.1-3.15 在本 commit 前後都維持 `[ ]` 未勾選、也沒有像 1.14 那樣補上「⚠️ 誠實標註」——`git log --oneline -- .../tasks.md` 確認 tasks.md 最後一次變更是 `8edb70b`（Task 2 相關），本次 commit 完全沒動 tasks.md。實作者口頭自陳的「3.5 原本非真紅燈、退回最小版重新取得真紅燈」這段過程**沒有留下任何書面紀錄**（不像 Task 1 的 1.14 有寫進 tasks.md）。程式碼本身沒有「改斷言看紅再改回」的痕跡（單一 commit，看不到中間態），但這屬於流程文件缺口，判定 Low：建議之後把 tasks.md 3.5 補一行類似 1.14 的誠實標註，避免只存在對話紀錄裡、下次審查者查無實據。
- **範圍**：`git show 9e44b7e --stat` 只有 `roster.ts`（+89）與 `roster.test.ts`（+127）兩個新檔案，未觸碰 `colors.ts`（另一個 agent 正在改，本輪未對其現況下判斷）、`types.ts` 或任何 UI/hook。

### 新發現（Medium）：`defaultGradient(roster.length)` 在刪除後新增會撞色

`addPlayer`（`roster.ts:56`）用「新增當下的陣列長度」當作調色盤 index，隱含假設「陣列長度 = 累計新增次數」——這假設只在**只增不減**時成立。一旦刪除任一位（不只是刪最後一位），後續新增會重用某個仍在名單中成員的色票 index，兩人拿到同一組漸層。

- 用具體例子驗證：`[A(idx0), B(idx1), C(idx2)]` → 刪 B → `[A(idx0), C(idx2)]`（length=2）→ 新增 D 拿 `defaultGradient(2)` = C 的同一組。純程式碼推導即可確認，不需要跑起來——`roster.length` 在刪除後必然小於「仍在名單中最大已用 index + 1」，重疊是必然而非機率性的。
- **與 Task 2 re-review 記錄的 index0/index9 色相 0.2 度撞色是同一模式的第三／四個實例**：字面滿足 spec Scenario「相鄰新增的參賽者不會拿到相同配色」（因為 Scenario 描述的是純新增序列，沒提刪除），但達不到 PRD 4.1.1「快速辨識球場位置」的目的——這正是 spec 本文（雙色漸層 Requirement）自己點名警告的失敗模式。判定 **Medium**：不是資料遺失/當機/安全性問題（PRD 12.5 本就要求顏色不可為唯一辨識依據，姓名等其他資訊仍在），但刪除／新增是最常見的日常操作（抓漏球員、換人很常見），比 Task 2 那個 0.2 度色相差距的觸發門檻低很多、更容易在真實使用中出現。
- **完全沒有測試覆蓋**：7 個 it 沒有任何一個涵蓋「刪除後新增」序列，甚至連 `addPlayer` 的單一 it 本身都沒斷言 `colorFrom`/`colorTo`（只斷言 id/createdAt/restCount/gamesPlayed/isActive）。`addPlayer` 的手動指定顏色分支（56 行三元運算子的「兩者皆提供才視為手動」）與「只提供一端會被靜默丟棄」的邊界也完全沒有 it 涵蓋。
- **修法方向評估**（供 Task 3 fix commit 或 Task 5 設計參考）：
  - **不建議**加欄位到 `PlayerSchema`／`RosterSchema`（例如 monotonic counter）——這是「配色演算法」的實作細節，不是參賽者網域資料，硬塞進持久化 schema 會綁死一個未來可能想換掉的演算法選擇；而且截至本 commit，`storage.ts`（Task 4）與 `useRosterStore.ts`（Task 5）都還沒開始寫，schema 現在改動的成本其實還很低（不是「已經來不及」），只是概念上不乾淨。
  - **建議**方向：改由 `roster.ts`／`colors.ts` 內部從「目前名單裡實際還在用的顏色」反推下一個可用 index（在 `colors.ts` 加一個 `paletteIndexOf(colorFrom, colorTo)` 或等價的反查函式，`addPlayer` 用「目前名單中已出現的 index 集合」找最小未用值），完全不用碰 schema、不用讓 `useRosterStore` 多背一個要持久化的計數器。對「使用者手動選了剛好等於某個預設組合的顏色」這種邊界，順帶正確處理（會被視為佔用該 index，避免真的撞色）。
  - 次選方向：把 index 當作 `AddPlayerContext` 的第三個注入值（比照 `id`/`now` 的 Decision 4 精神），由呼叫端維護；但呼叫端要嘛得重新計算（等同上一個方向搬到 store 層做，多一層間接）、要嘛得額外持久化一個計數器（等於變相在做第一個「不建議」選項，只是換了個容器）。除非有明確理由要讓 `roster.ts` 保持完全不碰 `colors.ts` 以外的顏色邏輯，否則不必捨近求遠。
- 其餘兩個小發現（皆 Low，未單獨開條目）：① `UpdatePlayerPatch` 型別上允許 patch 帶 `restCount`/`gamesPlayed`，目前無任何呼叫路徑用到，判斷是為 M2/M4 預留的合理設計，但要留意這是「覆寫」語意而非「累加」語意，M2/M4 實作時若誤用覆寫寫入會蓋掉既有值；② `tsconfig.json` 未開 `exactOptionalPropertyTypes`，理論上呼叫端可傳 `{ rating: undefined }` 讓 `{...player, ...patch}` 把 `rating` 覆寫成 `undefined`（型別檢查不會擋），屬理論邊界、目前無實際呼叫路徑觸發。

## Task 4（storage.ts）審查記錄（單一 commit ec73578，判定：APPROVED，無 High，1 個新 Medium 待追蹤）

- **範圍乾淨**：`git show ec73578 --stat` 只有 `storage.ts`（+133）與 `storage.test.ts`（+92）兩個新檔案。
- **兩段式驗證確認正確**：`RosterContainerSchema` 用 `players: z.array(z.unknown())`（只驗容器形狀），刻意不用 `RosterSchema.safeParse()`（那會連每一筆一起驗，一筆壞掉就整份清除）。這正是 tasks.md 4.4→4.5→4.6 的真紅燈教訓（4.4 一開始真的用了 `RosterSchema.safeParse`，4.5 補測試證明會整份清空，4.6 才改成兩段式）——诚实的 TDD 過程有留下書面紀錄，值得肯定。
- **Decision 9（`version: z.literal(1)`）現場驗證過**：寫了一支隔離腳本（`{version:2, players:[三筆全部合法]}`），用 vitest 實跑 `readRoster()`，確認回傳 `{players:[], droppedCount:0}` 且 key 被移除——版本不符確實走「無筆可救」清除路徑，不會誤入逐筆降級。但**這條路徑目前沒有測試鎖住**（`storage.test.ts` 5 個 it 都不是這個情境），已被記錄在 spec Scenario「版本號不符時整份清除」與 tasks.md 4.13-4.14（commit 94f9f71，尚未打勾）。**判定 Low**——依審查 rubric「缺少邊界測試」的明文範例，且已有 tasks 追蹤，非新發現。
- **Decision 6（RESET_KEYS 列舉）確認正確**：`resetMatchmakerData()` 用 `for (const key of RESET_KEYS)` 逐一 `removeItem`，不是前綴掃描。測試「重置只移除列舉的 key，不影響 scoreboard 資料」會同時寫入 `matchmaker:roster:v1` 與 `scoreboard:current:v1`（後者透過 `import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "../scoreboard/storage"` 取得真實 key，不是硬編碼字串）並斷言後者內容完全不變，現場跑過確認 5/5 pass。**評估這個跨模組 import 是好決策**：單向、唯讀依賴一個穩定的 public export，若 scoreboard 改 key 名，測試會編譯失敗強迫同步更新，比硬編碼字串「繼續綠燈但保護不存在的 key」更安全。唯一小缺口是這行 import 沒有註解說明理由（Low，可補一行）。
- **`hasLocalStorage()` 與 `lib/scoreboard/storage.ts` 逐字比對完全一致**（同樣的 `typeof window !== "undefined" && !!window.localStorage` + try/catch），四個公開函式（`readRoster`/`writeRoster`/`clearRoster`/`resetMatchmakerData`）都在進入點呼叫它。唯一觀察：`readRoster()` 裡 `localStorage.getItem(STORAGE_KEY)` 那一行（storage.ts:47）在 try/catch 區塊**之外**，若 `getItem` 本身丟例外（而非 `window.localStorage` 屬性存取丟例外）會沒被接住——但這與 `lib/scoreboard/storage.ts` 現有模式逐字相同，不是本次新引入的缺陷，且真實瀏覽器的私密模式通常是屬性存取本身丟例外（已被 `hasLocalStorage()` 擋下），判定 Low／純資訊性記錄。
- **新發現（Medium）：`droppedCount>0` 回寫正確性的斷言強度不足，測不出「回寫時把資料寫丟」的 regression**。`storage.test.ts` 第 67-69 行「再讀一次」只斷言 `secondResult.droppedCount === 0`，沒有同時斷言 `secondResult.players.length === 2`。**用突變測試實際證明過**：把 `storage.ts:75` 的 `writeRoster(players)` 改成 `writeRoster([])`（模擬「回寫時參數用錯變數」這種常見 copy-paste 型 bug，複製到暫存檔驗證，未觸碰原始檔），既有 5 個測試（含這個 it）**全數依然 PASS**，因為第二次讀取回傳 `{players:[], droppedCount:0}`——droppedCount 為 0 這件事在「回寫正確、名單剩 2 筆」與「回寫時把名單整個寫丟」兩種情況下**看起來一樣**，測試無法區分。這正是本 task 被定位為風險最高的那個失敗模式（「使用者的整份名單靜默消失」），而且 `hooks/useRosterStore.ts`（Task 5）目前還沒開始寫，沒有其他測試層能補這個洞。現行程式碼本身沒有這個 bug（已確認 storage.ts:75 就是 `writeRoster(players)`），純屬測試覆蓋不足，但因為直擊本 task 名義上的最高風險、且觸發門檻極低（單一變數打錯字即可），判定 **Medium** 而非 Low。建議修法：在 4.7 的 it 裡補一行 `expect(secondResult.players.length).toBe(2)`（或進一步斷言 id 仍是 p1/p3），可與既有 4.13/4.14 一起在下一個 fix commit 處理。
- **`writeRoster` 寫入的 `version` 為字面 `1`**（storage.ts:93 `JSON.stringify({ version: 1, players })`），與 `RosterContainerSchema`/`RosterSchema` 的期望一致，round-trip 正確。
- **5 個 it 名稱與 spec Scenario 的「驗收」欄位逐字比對完全一致**（JSON 解析失敗時清除 key 並回空名單／外層結構不合法時清除 key 並回空名單／單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1／localStorage 不可用時不拋出例外／重置只移除列舉的 key，不影響 scoreboard 資料）。`vi.spyOn(window, "localStorage", "get")` 搭配檔案層級 `afterEach(() => vi.restoreAllMocks())`，現場跑過確認不會污染同檔案其他 it。
- 現場執行 `pnpm exec vitest --run lib/matchmaker/storage.test.ts`（5 passed）、`pnpm exec vitest --run lib/matchmaker`（4 檔 26 passed，確認 `useRosterStore.ts` 確實還沒開始）、`npx tsc --noEmit`、`pnpm exec eslint lib/matchmaker/storage.ts lib/matchmaker/storage.test.ts` 皆乾淨無輸出。
- **突變測試法值得記錄**：本輪第一次在這個專案的 review 中用「複製檔案到 `__scratch_*` 暫存檔、注入一個具體的 bug、重跑既有測試看會不會紅」的方式驗證測試的偵錯能力，而不只是讀程式碼推論。這比純靜態閱讀更能發現「斷言強度不足」這類測試本身有洞的問題，之後審查其他模組（尤其是 Task 5 `useRosterStore.ts` 的 dispatch 邏輯、或任何「寫回」/「回填」步驟）可以複用這個技巧：改一行實作、跑測試、看還過不過。

## Task 5（useRosterStore.ts）審查記錄（單一 commit d00fea6，由協調者本人實作，判定：APPROVED，1 個新 Medium 待追蹤，用 mutation test 實測發現）

- **範圍**：`git show d00fea6 --stat` 只有 `hooks/useRosterStore.ts`（+157）與 `hooks/useRosterStore.test.tsx`（+141）兩個新檔案。**`tasks.md` 5.1～5.7 在此 commit 前後皆維持 `[ ]` 未打勾**（`grep "^- \[.\] 5\."` 現場核對），與 Task 1/4 fix commit 都會同步勾選 tasks.md 的慣例不一致——功能與測試皆已完整實作且綠燈，純粹是文件同步的疏漏，判定 **Low**。
- **Decision 4 遵守**：`addPlayer` wrapper（useRosterStore.ts:119-126）用 `crypto.randomUUID()`／`new Date().toISOString()` 注入，`roster.ts` 本身仍不呼叫兩者（Task 3 已確認過）。`toISOString()` 固定輸出 UTC `Z` 格式，與 `PlayerSchema` 的 `z.iso.datetime()` 相容（Task 1 審查已現場驗證過此事實，見上方 Task 1 章節）。
- **Decision 6 遵守**：`resetRoster()`（useRosterStore.ts:142-146）委派 `resetMatchmakerData()`，非 `clearRoster()`，確認正確。
- **StrictMode 雙掛載現場驗證安全**：用 scratch 測試檔（`renderHook` 搭配 `wrapper: <React.StrictMode>`）驗證兩種情境皆無資料損毀——① 既有持久化資料在雙掛載下不會被覆寫成空陣列 ② `resetRoster()` 在雙掛載下仍正確移除 key。`hasHydratedRef` 的 cleanup（useRosterStore.ts:111-116，unmount 時重置為 `false`）與 `useScoreboardStore` 模式逐字一致，經驗證同樣安全。
- **`droppedCount` 的 HYDRATE OR 條件**（useRosterStore.ts:104-110，`players.length > 0 || droppedCount > 0`）：推導過所有布林組合，確認無遺漏——`{0,0}` 不 dispatch 但視覺上與預設 state 無差異，無害；`{0,>0}`（全損）與`{>0,0}`／`{>0,>0}` 皆會正確 dispatch。判定正確。
- **重大發現（新 Medium，已用 mutation test 實測證實）：`skipNextWriteRef` 在「同一批次內 resetRoster() 後緊接其他 mutation」時會誤吃該次寫入**。React 18/19 automatic batching 下，若 `resetRoster()` 與另一個 store 方法（如 `addPlayer`）在同一個事件處理常式／同一個 `act()` block 內同步呼叫，兩個 dispatch 會被合併成單一次 render，`skipNextWriteRef.current` 是在 `resetRoster()` 呼叫當下就同步設為 `true`（不隨批次內的後續 dispatch 復位），導致合併後那一次 render 觸發的 write effect 誤判為「這是 RESET 造成的變動」而整批跳過寫入——即使最終 `state.players` 其實包含新增的那位參賽者。**現場用獨立 scratch 測試檔實測重現**：`resetRoster(); addPlayer(...)` 包在同一個 `act()` 內後，`result.current.players` 正確顯示長度 1，但 `localStorage.getItem(STORAGE_KEY)` 為 `null`——記憶體內 state 與持久化資料當場失去同步。**此狀態非永久卡死**：緊接著補一次獨立的 `addPlayer` 呼叫（各自獨立 `act()`，各自觸發一次 render），localStorage 會自我修復為完整兩筆資料——因為 `skipNextWriteRef` 會在那次 render 的 write effect 被正常消耗歸零。換句話說，bug 的視窗僅存在於「reset 與下一個 mutation 被批次合併的那個瞬間」，此時若使用者剛好重新整理頁面，剛新增的那筆資料會靜默遺失（無錯誤、無警告）；只要沒有在那個瞬間重整，下一次任何獨立的 mutation 就會自動補寫回正確內容。
  - **觸發門檻評估**：目前規劃的 Task 6 UI（confirm dialog → 單獨呼叫 `resetRoster()`）不會觸發此路徑，因為使用者的每次點擊都是獨立的 React event handler、天然形成獨立的 batch。真正會觸發的是「單一 handler 內連續呼叫 store 的多個方法」這種模式（例如未來若做「清空並套用預設範本」這類一鍵操作）。**判定 Medium 而非 High**：① 目前無可達的呼叫路徑會觸發 ② UI 顯示的 state 從未出錯，只有持久化那一份短暫落後 ③ 自我修復，不會無限卡住。但因為命中的正是本 change 被反覆強調的最高風險模式（「名單靜默消失」），且觸發門檻只是「同一個 handler 裡連續呼叫兩個 store 方法」這種完全合理、未來很可能出現的寫法，值得在下一個 fix commit 處理並補上回歸測試。**Task 6 審查已確認**：實際 UI（ResetRosterDialog 的 onConfirm、PlayerList 的刪除確認）確實都是各自獨立的 event handler，未觸發此路徑，見下方 Task 6 章節。
  - **已評估的更穩健替代方案**（供 fix commit 參考，兩者皆比「布林 latch」更能抵抗批次合併）：
    1. 把「是否跳過持久化」的意圖折進 reducer state 本身（例如 state 多一個 `skipNextPersist` 欄位，RESET 分支設為 `true`、其餘分支一律設為 `false`），而非放在外部 ref。因為同一批次內的多個 action 會被 reducer **依序 reduce 成單一最終 state**，最後一個 action 的決定會自然覆蓋前面的，不會像獨立 ref 那樣被「呼叫當下」提前鎖死。
    2. 用「共用的空陣列參考」取代「一次性旗標」：`createInitialState()` 改回傳模組層級共用的 `EMPTY_PLAYERS` 常數（而非每次呼叫都 new 一個 `[]`），`resetRoster()` 呼叫當下同步把 `persistedRef.current = EMPTY_PLAYERS`，write effect 改為比較 `state.players === persistedRef.current` 來決定是否跳過（而非檢查一次性旗標）。這個寫法在「同批次內 RESET 後又接 ADD_PLAYER」時會自動修正：批次結束後 `state.players` 是新陣列（非 `EMPTY_PLAYERS`），比對不相等，effect 會正常寫入——完全不需要額外處理批次合併的情況。**這是目前想到最簡單且能自我修正此 bug 的方案**，優於方案 1。
  - **測試層面的教訓**：既有 7 個 it 都是單一 `act()` 內只呼叫一個 store 方法，完全沒有覆蓋「同一批次內連續呼叫」這個情境；commit 訊息聲稱的突變測試（移除 `skipNextWriteRef` 會讓 `resetRoster` 測試失敗於 `expected '{"version":1,"players":[]}' to be null`）**本審查已獨立複製一份移除守門的 scratch 版本重跑確認，錯誤訊息逐字相符**——這部分的自我驗證是誠實且準確的；只是原本的驗證範圍沒有覆蓋到「批次合併」這個更隱蔽的反例。
- **測試品質**：7 個 it 全數對應 tasks.md 5.1-5.6 要求；spec.md 明文指定的兩個 it 名稱（「無持久化資料時初始 players 為空陣列」「新增參賽者後自動寫回 localStorage」）逐字使用；tasks.md 5.6 指定的第三個 it 名稱（「持久化資料含損壞筆數時 store 回報 droppedCount」）亦逐字使用（此名稱來自 tasks.md 而非 spec.md 本文，spec.md 只明文列了前兩個）。每個會寫入的操作測試都同時斷言 `result.current.players`（state 側）與 `JSON.parse(localStorage.getItem(STORAGE_KEY))`（持久化側）兩者，是好的雙重驗證習慣。
- **`_arg` lint warning 與 `useScoreboardStore.ts` 同源**：現場對兩檔分別跑 `eslint`，皆為「`'_arg' is defined but never used`」同一則警告、同樣位置（`useReducer` 的 lazy initializer 型別標註）。保持一致而非消除，判斷合理。
- **HYDRATE 後多寫一次 localStorage**：確認屬實且與 `useScoreboardStore` 同源，屬已知取捨。額外觀察（Low，未在原始 review 要求中，屬本輪新發現）：當 `droppedCount > 0` 時，`storage.ts` 的 `readRoster()` 內部已經自己呼叫過一次 `writeRoster(players)`（見 Task 4 審查記錄），`useRosterStore` 的 HYDRATE 又會透過 write effect 再寫一次相同內容——同一次載入最多產生 2 次多餘的重複寫入（而非 1 次）。無害（冪等），但值得未來若要優化 effect 觸發次數時一併考慮。
- 現場執行 `pnpm exec vitest --run hooks/useRosterStore.test.tsx lib/matchmaker`（**5 檔 34 passed**）、`npx tsc --noEmit`（無輸出）、`eslint hooks/useRosterStore.ts hooks/useRosterStore.test.tsx`（0 errors，1 warning 如上）皆確認乾淨。

## Task 6（UI 元件與路由，`page.tsx` + `components/matchmaker/*`）審查記錄（單一 commit 14ac7ea，例外層／E2E 驗收，判定：APPROVED，無 High，3 個新 Medium 待追蹤）

- **範圍**：`git show 14ac7ea --stat` 確認只有 6 個新檔案——`app/matchmaker/players/page.tsx`（125）、`components/matchmaker/{EmptyRoster,PlayerCard,PlayerForm,PlayerList,ResetRosterDialog}.tsx`（26/76/275/76/47），共 625 行。**確認未觸碰 `hooks/useRosterStore.ts`**（`git show --stat` 無該檔案）；`components/ui/` 沿用既有 11 個檔案，無新增 shadcn 元件。
- **重置提示文字逐字核對**：用 Python 從 `prd.md` 4.1.5 抽出 blockquote 原文與 `ResetRosterDialog.tsx` 的 `AlertDialogDescription` 內容直接字串比對，**完全相同**：「確定要重置參賽者名單嗎？這會清除全部參賽者、目前回合與歷史賽果，且無法復原。」整段放單一元素內（不拆到 Title），對未來 E2E 整句文字比對友善。
- **二次確認（PRD 第 10 節）雙項確認落實**：刪除單一參賽者（`PlayerList.tsx` 的 `pendingDelete` state + `AlertDialog`）與重置名單（`ResetRosterDialog.tsx`）皆走 `AlertDialogAction variant="destructive"` + `AlertDialogCancel` 模式，確認 `alert-dialog.tsx` 的 `AlertDialogAction`／`AlertDialogCancel` 有把 `variant` prop 轉發給底層 `Button`，destructive 樣式與取消行為皆正確接上。
- **`droppedCount` 非靜默處理確認**：`page.tsx:77-85` 用 `role="alert"` 容器渲染「有 {droppedCount} 筆資料損毀已略過，其餘參賽者資料不受影響。」screen reader 會自動播報，滿足 spec「SHALL NOT 靜默處理」。**但**訊息只描述狀況，沒有給出可採取的修正動作（見下方 Medium）。
- **非顏色狀態標示驗證（PRD 12.5）**：`PlayerCard.tsx` 的暫停徽章用 `Badge variant="outline" className="border-current bg-transparent text-current"` + `Pause` 圖示 + 「暫停出場」文字。**推導並確認 twMerge 衝突解析正確**：`badgeVariants({variant:"outline"})` 產生的 `text-foreground` 與傳入 `className` 的 `text-current` 屬同一 twMerge 衝突群組，`cn(badgeVariants(...), className)` 讓後者（`text-current`）勝出；`text-current` 透過 CSS `currentColor` 繼承自 `Card` 元素自身的 inline `style={{color: foreground}}`（`foreground` 為 `pickTextColor(colorFrom, colorTo)` 算出），且 `card.tsx` 的 `text-card-foreground` 類別無 `!important`，inline style 必勝——整條鏈路確認暫停徽章的文字／圖示顏色在任意使用者自訂漸層上都與 `pickTextColor` 的計算結果一致（lucide-react 圖示預設 `stroke="currentColor"`，同步繼承）。
- **錯誤訊息品質（PRD 11）逐條核對 `describeIssuePath`**（`PlayerForm.tsx:331-345`）：`name`→「請輸入姓名，不可留空或僅有空白字元」、`rating`→「強度分數需介於 1.00 至 8.00 之間，請重新輸入」、`colorFrom`/`colorTo`→「顏色格式不正確，請重新選擇顏色」、`gender`→「請選擇性別」、`default`→「表單資料有誤，請確認後再試一次」；另有獨立於 zod 之外攔截 `Number.isNaN` 的「強度分數需為數字，請重新輸入」。**全數繁體中文、皆說明修正動作**，符合 PRD 11。
- **`noValidate` 修法驗證（實作者主動回報項目）**：
  1. **分析正確**：`<input type="number" min max>` 在無 `noValidate` 時，若值超出範圍，瀏覽器的 constraint validation 會在 `submit` 事件派發前攔截並顯示原生（非繁中、無法控制文案）提示泡泡，`handleSubmit` 完全不會被呼叫——這是標準 HTML5 表單驗證行為，非臆測。
  2. **`noValidate` 確實讓所有驗證統一走 zod**：`noValidate` 關閉表單層級的互動式 constraint validation，程式碼內無任何呼叫 `checkValidity()`/`reportValidity()` 的殘留路徑，`handleSubmit` 送出後唯一驗證來源是 `PlayerFormSchema.safeParse`。
  3. **保留 `min`/`max` 而非移除的理由站得住腳**：`min`/`max` 屬性即使在表單 `noValidate` 時仍會作用於原生 spinner（上下箭頭）的 `stepUp()`/`stepDown()` 邊界鉗制——`noValidate` 只關閉「送出時的互動式驗證攔截」，不影響輸入元件自身的 stepper 行為。**現場檢查 `app/globals.css` 與 `input.tsx` 皆無 `:invalid`/`:out-of-range` 選擇器**，故也不存在「保留 min/max 導致原生紅框視覺污染」的風險。註解本身也明確解釋了保留原因並指向下方屬性（「見下方」），對讀者可發現性足夠。判定：**保留優於移除**，不構成困惑風險。
- **Hydration 安全**：6 個新檔案皆無直接 `localStorage`／`Date.now()`／`Math.random()` 呼叫；`useId()` 用於表單欄位 id（React 官方 SSR-safe 作法）；`page.tsx` 的 `suggestedGradient = defaultGradient(players.length)` 在 SSR 與 CSR 首次 render 皆讀到 `useRosterStore` 的 HYDRATE-before 空陣列（Task 5 已確認的 HYDRATE 模式），故兩端算出相同值，無 mismatch 風險。
- **inline style 僅一處且必要**：`grep "style={{"` 只命中 `PlayerCard.tsx` 的漸層背景／前景色，其餘皆用 Tailwind class，未濫用。
- **Radix Dialog 正確 unmount-on-close**：`dialog.tsx` 未使用 `forceMount`，`isAddOpen`/`editingPlayer` 為 false/null 時 `PlayerForm` 會整個被卸載，下次開啟重新 mount 拿到全新 `useState` 初始值，不會有「取消後殘留上次輸入」的 stale state 問題。
- **hover/focus/disabled（PRD 12.3）**：`button.tsx` 既有 cva 變體已內建 `hover:`／`focus-visible:`／`disabled:pointer-events-none disabled:opacity-50`，Task 6 各按鈕皆未覆蓋這些狀態類別，直接繼承。
- **`import type` 一致性**：6 個檔案的型別匯入（`FormEvent`、`z`、`Gender`/`Player`、`PlayerFormSubmitValues`）皆用 `import type`，符合 `verbatimModuleSyntax`。

### Task 6 新發現（3 個 Medium）

1. **新增對話框的顏色預覽與實際指定顏色會不一致**（`app/matchmaker/players/page.tsx:49` vs `lib/matchmaker/roster.ts:57-69`）。`page.tsx` 用 `defaultGradient(players.length)`（純以陣列長度為 index）算出色票預覽並填入新增表單的顏色選擇器初始值；但 `addPlayer` 實際套用的自動配色邏輯是 `roster.ts` 內部（未匯出）的 `nextAutoGradient()`，會反查目前名單「已入座」的 palette index 找最小未用值以避開撞色（這正是 Task 3 Medium 修好的邏輯）。當名單發生過刪除、`players.length` 與「已用最大 index+1」脫鉤時，兩者算出**不同的顏色**：使用者在新增表單看到的預覽色與未觸碰顏色選擇器直接送出後實際拿到的顏色會不一致，可能造成「我明明看到的是 A 色，怎麼新增出來是 B 色」的困惑。最終持久化的顏色是正確的（不撞色），這不是資料錯誤，純粹是 Task 6 的預覽計算沒有複用 Task 3 的防撞色邏輯。修法：把 `nextAutoGradient`（或等價的唯讀反查函式）從 `roster.ts` 匯出（或搬到 `colors.ts`），`page.tsx` 改呼叫它算預覽，而非直接呼叫 `defaultGradient(players.length)`。
2. **`droppedCount` 提示訊息只描述狀況，未說明可採取的修正方式**（`page.tsx:83`）：「有 {droppedCount} 筆資料損毀已略過，其餘參賽者資料不受影響。」滿足「不得靜默」，但 PRD 11「並說明可採取的修正方式」在此處落空——沒有告訴使用者例如「如遺失重要資料，請重新新增」之類的下一步。與 `PlayerForm` 的錯誤訊息（皆有「請重新輸入」類指引）形成對比。
3. **次要文字用 `opacity-90` 會弱化 `pickTextColor` 已計算好的對比度**（`PlayerCard.tsx`，性別/強度那行 `<p className="text-sm opacity-90">`）。`pickTextColor` 是針對「文字完全不透明」對兩端背景取 argmax 算出的前景色（見 Task 2 記錄），對某些漸層組合（如 amber/yellow index 7、lime index 8）margin 僅約 25%，再疊加 10% 透明度會讓實際呈現的對比度低於原本計算值，理論上可能跌破可讀門檻。姓名那行（主要資訊）沒有這個問題，只有次要文字受影響。建議次要文字改用字重/字級做視覺層級區分，而非犧牲透明度。

### Task 6 新發現（2 個 Low）

1. `PlayerForm.tsx` 的「非數字」錯誤分支（`Number.isNaN(ratingNumber)`）在真實瀏覽器的 `<input type="number">` 下，多數無效鍵盤輸入／貼上內容會被 DOM 值消毒演算法直接清成空字串（`Number("")` 是 `0` 不是 `NaN`），這條分支透過一般使用者操作可能難以觸發（多半只有輸入單獨的 `-` 這種中繼態才會落到 `NaN`）。不影響其餘兩則訊息的正確性，也不違反 PRD（PRD 11「非數字」明文對象是比分欄位，非強度分數），但若 Task 7 E2E 想涵蓋這個分支，需留意 Playwright 對 `type=number` 欄位的 `fill()` 是否真能重現此路徑。
2. 顏色選擇器 `<input type="color">` 同時有 `<Label htmlFor>` 與 `aria-label`（內容相同），屬輕微冗餘（`aria-label` 會蓋過 label 關聯作為 accessible name），不影響功能。

## How to apply

審查後續 Task 5-9 時：
- Task 2（colors.ts）：核心不變式驗證用「兩端最小對比較高」而非斷言特定顏色字面值（tasks.md 2.5 明文禁止），審查時注意有沒有把實作細節焊進測試。
- Task 3（roster.ts）：**已審查（commit 9e44b7e，原 Medium：`defaultGradient(roster.length)` 刪除後撞色）**。**已於 tasks.md 3.16-3.19（`[x]`，Task 5 審查時現場核對）解決**——`roster.ts` 目前用 `paletteIndexOf`／`nextAutoGradient` 反查目前名單已用 index，正是當初建議的方向，未在 schema 加欄位。此 Medium 視為已結案，不需再追蹤。round 是否只在 `addPlayer`/`updatePlayer` 的寫入點做一次、`id`/`createdAt`/`now` 是否為注入而非內部產生（Decision 4）——這兩點皆已確認通過。**但 Task 6 審查發現 `nextAutoGradient` 未匯出，`page.tsx` 的顏色預覽因此繞開它、改用裸 `defaultGradient(players.length)`，同一撞色模式在 UI 預覽層又冒出一次（見 Task 6 Medium #1）**——下次處理時應一併把這個函式匯出供 UI 層重用，而不是各自維護一份。
- Task 4（storage.ts）：**已審查（commit ec73578，APPROVED，1 個新 Medium 待追蹤：回寫正確性斷言不足，見上）**。若後續有 fix commit 補 4.13/4.14 或補寫回斷言，優先確認 `secondResult.players.length` 是否真的被斷言，而不只是 `droppedCount`。**tasks.md 4.13-4.16 已於後續 commit（94f9f71／7582318／fdbc9bb／0ec0592）補上並打勾**，此 Medium 視為已結案。
- Task 5（useRosterStore.ts）：**已審查（commit d00fea6，由協調者本人實作，APPROVED，1 個新 Medium 待追蹤，見上「Task 5 審查記錄」章節）**。核心發現：`skipNextWriteRef` 這種「布林 latch 掛在外部 ref、由呼叫端同步設定、由 effect 消耗」的模式，在 React 18/19 automatic batching 下無法抵抗「同一批次內連續多次 dispatch」——latch 是在呼叫當下設定，不會隨批次內後續的 dispatch 而復位或修正，效果等同於「只認第一個呼叫的意圖」。若之後看到類似「用 ref 記錄意圖、讓下一次 effect 讀取後消耗」的模式（不限這個 hook），都要用「同一個 `act()`／同一個 event handler 內連續呼叫多個會觸發同一個 effect 的方法」這個角度去測，不能只測「單一操作、等 effect 跑完、再測下一個操作」這種天然被序列化、測不出批次合併問題的寫法。`tasks.md` 5.1-5.7 尚未打勾（Low，已記錄），若有 fix commit 記得一併補上。**Task 6 審查已確認**：實際 UI 呼叫（`ResetRosterDialog.onConfirm` 單獨呼叫 `resetRoster`、`PlayerList` 的刪除確認單獨呼叫 `onRemove`）皆為獨立 event handler，不構成「同批次連續呼叫」的觸發條件，此 Medium 目前無可達路徑，但仍值得在 fix commit 處理以防未來新增「一鍵操作」類 UI。
- Task 6（page.tsx + components/matchmaker/*）：**已審查（commit 14ac7ea，APPROVED，3 個新 Medium：① 新增表單顏色預覽未複用 `nextAutoGradient` 導致預覽與實際不一致 ② droppedCount 提示缺修正動作說明 ③ 次要文字 `opacity-90` 弱化已計算對比度；2 個 Low：非數字錯誤分支在原生瀏覽器下可能難觸發／顏色選擇器 label 冗餘，見上「Task 6 審查記錄」章節）**。審查時用「PRD 硬性要求逐條核對＋現場字串比對（reset 文案）＋twMerge/CSS 繼承鏈路推導（badge 顏色）＋HTML5 constraint validation 語意複核（noValidate）」的方式，沒有起瀏覽器（因為是純呈現層元件、無 TDD 要求），純靠讀程式碼＋工具鏈規則推導；`droppedCount`／二次確認／非顏色標示／hydration 安全／inline style 節制／無新增 shadcn 元件／`hooks/useRosterStore.ts` 未被誤觸，六項全數確認通過。Task 7（E2E）審查時，應特別留意 `player-roster.spec.ts` 是否有涵蓋「刪除後新增看預覽色」的情境（會撞到 Medium #1）、以及是否真的能在 Playwright 下觸發「非數字」錯誤路徑（Low #1）。
