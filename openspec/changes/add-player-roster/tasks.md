> 所有指令皆從 repo root 執行。`--run` 前**不可**加 `--`。
> 前端單檔測試：`pnpm --filter ./nextjs-pickball test --run <workspace 相對路徑>`
>
> **關於本 change 的紅燈**：`lib/matchmaker/` 與 `hooks/useRosterStore.ts` 皆為全新檔案，
> 每個模組的第一個測試，其紅燈形式為 **import 失敗（模組不存在）**，之後的測試才是斷言失敗。
> 兩者都是真紅燈。本 change 不存在「行為早已實作」的情況，因此**不應出現任何 regression guard 標註**；
> 若實作過程中發現某測試未經實作即通過，那是測試寫得不夠精確，應修正測試而非標註跳過。
> **不得**以修改斷言看紅再改回的方式偽造紅燈。

## 1. 資料模型（`lib/matchmaker/types.ts` — 行為邏輯，必 TDD）

- [ ] 1.1 **紅**：新增 `nextjs-pickball/lib/matchmaker/types.test.ts`，寫 it「合法欄位通過驗證，restCount 與 gamesPlayed 未提供時補 0」——以完整合法欄位（省略 `restCount`／`gamesPlayed`）呼叫 `PlayerSchema.safeParse`，斷言 `success === true` 且兩欄位皆為 `0`。執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/types.test.ts` 於 shell 實際看到紅燈（**真紅燈**：`types.ts` 尚不存在，import 失敗）
- [ ] 1.2 **綠**：建立 `nextjs-pickball/lib/matchmaker/types.ts`，定義 `GenderSchema`（`"male" | "female" | "other"`）、`PlayerSchema`、`RosterSchema`（外層容器 `{ version, players }`），`restCount`／`gamesPlayed` 用 `z.number().int().nonnegative().default(0)`，並匯出對應 TS 型別。重跑 1.1 指令至綠
- [ ] 1.3 **紅**：新增 it「rating 超出 1.00～8.00 時驗證失敗」，斷言 `rating: 0.99` 與 `rating: 8.01` 兩者 `success === false`。看到紅燈（**真紅燈**：1.2 若只寫 `z.number()` 則兩者皆通過）
- [ ] 1.4 **綠**：`rating` 加上 `.min(1).max(8)`。重跑至綠
- [ ] 1.5 **紅**：新增 it「name 僅含空白時驗證失敗」，斷言 `name: "   "` 的 `success === false`。看到紅燈（**真紅燈**：`z.string().min(1)` 對三個空白字元仍通過）
- [ ] 1.6 **綠**：`name` 改為 `z.string().trim().min(1)`。重跑至綠
- [ ] 1.7 **紅**：新增 it「Hex 色碼格式不合法時驗證失敗」，斷言 `colorFrom: "0E6B63"`（缺 `#`）與 `"#GGG"` 皆失敗、`"#0E6B63"` 通過。看到紅燈
- [ ] 1.8 **綠**：`colorFrom`／`colorTo` 加上 `.regex(/^#[0-9a-fA-F]{6}$/)`。重跑至綠
- [ ] 1.9 **refactor**：檢視 schema 是否與 `lib/scoreboard/types.ts` 的風格一致（union-of-literals、schema 與型別成對匯出）；`restCount`／`gamesPlayed` 上方應有註解說明「本 capability 只初始化不累加，先納入是為避免後續破壞性遷移」（見 design Decision 2）。無壞味道則註記 skipped

## 2. 顏色對比（`lib/matchmaker/colors.ts` — 行為邏輯，必 TDD）

- [ ] 2.1 **紅**：新增 `nextjs-pickball/lib/matchmaker/colors.test.ts`，寫 it「深色漸層回傳淺色前景」——`pickTextColor("#0E6B63", "#134E4A")` 斷言回傳淺色前景常數。執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/colors.test.ts` 看到紅燈（**真紅燈**：模組不存在）
- [ ] 2.2 **綠**：建立 `colors.ts`，實作 WCAG 相對亮度 `relativeLuminance(hex)` 與對比度 `contrastRatio(a, b)`，`pickTextColor` 依 design Decision 5 的公式取「兩端最小對比較高」的前景色。重跑至綠
- [ ] 2.3 **紅**：新增 it「淺色漸層回傳深色前景」——`pickTextColor("#E8F5F0", "#A7F3D0")` 斷言深色前景。看到紅燈（若 2.2 寫死回傳淺色則為真紅燈；若 2.2 已正確實作公式則此測試會直接綠 —— 此時**應強化 2.2 的最小實作為真正的最小**，而非在此標註 regression guard）
- [ ] 2.4 **綠**：確保公式對兩個方向皆成立。重跑至綠
- [ ] 2.5 **紅**：新增 it「一深一淺漸層取兩端最小對比較高的前景色」——`pickTextColor("#0E1A1A", "#E8F5F0")`，斷言「回傳色與兩端點的對比度最小值」≥「另一候選前景色的對應最小值」。此測試直接驗證 Decision 5 的核心不變式，**不可**改寫為斷言特定顏色字面值（那會把實作細節焊進測試）。看到紅燈
- [ ] 2.6 **綠**：修正 `pickTextColor` 使其在此情境成立。重跑至綠
- [ ] 2.7 **紅**：新增 it「defaultGradient 依序提供不重複的預設漸層」——連續呼叫 `defaultGradient(0)`～`defaultGradient(n)`，斷言相鄰兩次結果不同、且回傳值為合法 Hex（可用 1.2 的 `PlayerSchema` 驗證色碼欄位）。看到紅燈
- [ ] 2.8 **綠**：實作 `defaultGradient(index)`，以固定的預設調色盤依 index 取模。重跑至綠
- [ ] 2.9 **refactor**：檢視 `relativeLuminance` 是否正確處理 sRGB gamma（低於 0.03928 的分支）；深／淺前景色是否取自 `app/globals.css` 的既有 OKLCH semantic token 而非硬編碼新色。無壞味道則註記 skipped

## 3. 名單 CRUD（`lib/matchmaker/roster.ts` — 行為邏輯，必 TDD）

- [ ] 3.1 **紅**：新增 `nextjs-pickball/lib/matchmaker/roster.test.ts`，寫 it「addPlayer 回傳新陣列且不修改原陣列，id 與 createdAt 取自注入值」——對空陣列呼叫 `addPlayer(roster, input, { id: "p1", now: "2026-08-15T00:00:00.000Z" })`，斷言回傳長度 1、`id`／`createdAt` 為注入值、`restCount`／`gamesPlayed` 為 0、`isActive` 為 `true`，且**原陣列仍為空**（`toBe` 比對參考不相同）。執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/roster.test.ts` 看到紅燈
- [ ] 3.2 **綠**：建立 `roster.ts`，實作 `addPlayer`，簽章 MUST 接受 `{ id, now }` 注入（見 design Decision 4，**不得**於函式內呼叫 `crypto.randomUUID()` 或 `new Date()`）。重跑至綠
- [ ] 3.3 **紅**：新增 it「updatePlayer 只改指定欄位，其餘欄位與他人不受影響」——三人名單中改 `p2` 的 `rating`，斷言 `p2` 其餘欄位不變、`p1`／`p3` 完全不變。看到紅燈
- [ ] 3.4 **綠**：實作 `updatePlayer(roster, id, patch)`。重跑至綠
- [ ] 3.5 **紅**：新增 it「updatePlayer 遇到不存在的 id 時不新增也不改動」，斷言回傳長度不變且內容相等。看到紅燈（**真紅燈**：若 3.4 用 upsert 語意則會多一筆）
- [ ] 3.6 **綠**：確保找不到 id 時原樣回傳。重跑至綠
- [ ] 3.7 **紅**：新增 it「removePlayer 移除指定 id 並保持其餘順序」，三人名單移除中間者，斷言剩餘兩人的 id 順序為 `["p1", "p3"]`。看到紅燈
- [ ] 3.8 **綠**：實作 `removePlayer`。重跑至綠
- [ ] 3.9 **紅**：新增 it「rating 寫入前 round 至兩位小數」——以 `rating: 3.456` 新增、以 `rating: 5.994` 編輯，分別斷言 `3.46` 與 `5.99`。看到紅燈（**真紅燈**：3.2／3.4 未做 round）
- [ ] 3.10 **綠**：在 `addPlayer` 與 `updatePlayer` 的寫入點統一 round（`Math.round(v * 100) / 100`，見 design Decision 7）。重跑至綠
- [ ] 3.11 **紅**：新增 it「togglePlayerActive 切換 isActive 且不影響 restCount」——對 `isActive: true`、`restCount: 3` 的參賽者呼叫後，斷言 `isActive === false` 且 `restCount === 3`。看到紅燈
- [ ] 3.12 **綠**：實作 `togglePlayerActive`。重跑至綠
- [ ] 3.13 **紅**：新增 it「togglePlayerActive 可來回切換」，連續呼叫兩次後斷言回到 `true`。看到紅燈（若 3.12 已正確實作則此測試直接綠 —— 應強化 3.12 的最小實作為真正最小，例如原本寫死 `isActive: false`）
- [ ] 3.14 **綠**：確保為布林反轉而非寫死。重跑至綠
- [ ] 3.15 **refactor**：檢視四個函式是否共用同一個「找到 index 後替換」的內部 helper，是否有重複的不可變複製邏輯可收斂；round 是否只出現在單一寫入點而非散落。無壞味道則註記 skipped

## 4. 持久化（`lib/matchmaker/storage.ts` — 行為邏輯，必 TDD）

- [ ] 4.1 **紅**：新增 `nextjs-pickball/lib/matchmaker/storage.test.ts`，寫 it「JSON 解析失敗時清除 key 並回空名單」——將 `localStorage["matchmaker:roster:v1"]` 設為 `"{ 不是合法 JSON"`，呼叫 `readRoster()`，斷言 `players` 為空陣列且該 key 已被移除。執行 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/storage.test.ts` 看到紅燈
- [ ] 4.2 **綠**：建立 `storage.ts`，比照 `lib/scoreboard/storage.ts` 實作 `hasLocalStorage()`、`STORAGE_KEY = "matchmaker:roster:v1"`、`readRoster()`／`writeRoster()`／`clearRoster()`。重跑至綠
- [ ] 4.3 **紅**：新增 it「外層結構不合法時清除 key 並回空名單」——寫入合法 JSON 但結構為 `[1, 2, 3]`，斷言回空名單且 key 被移除。看到紅燈
- [ ] 4.4 **綠**：外層以 `RosterSchema.safeParse` 驗證，失敗即清除。重跑至綠
- [ ] 4.5 **紅**：新增 it「單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1」——寫入含 3 筆的合法外層，其中 1 筆 `rating: 99`，斷言回傳 `players.length === 2`、`droppedCount === 1`，且 key **未被移除**。執行看到紅燈（**真紅燈**：4.4 的整份 `safeParse` 會讓外層驗證失敗而清空全部，這正是 design Decision 3 要避免的行為）
- [ ] 4.6 **綠**：改為兩段式驗證——外層只驗容器形狀（`players` 為陣列），再逐筆 `PlayerSchema.safeParse`，保留合法者、計數丟棄者，回傳 `{ players, droppedCount }`。重跑 4.1／4.3／4.5 三個情境全綠
- [ ] 4.7 **綠（續）**：`droppedCount > 0` 時將清理後的名單寫回，使損壞不再累積。於 4.5 的 it 追加斷言：呼叫後再讀一次，`droppedCount` 為 0
- [ ] 4.8 **紅**：新增 it「localStorage 不可用時不拋出例外」——以 `vi.spyOn` 讓 `window.localStorage` 的 getter 拋出，斷言 `readRoster()` 不拋出且回空名單、`writeRoster()` 不拋出。看到紅燈
- [ ] 4.9 **綠**：確保 `hasLocalStorage()` 的 try/catch 涵蓋讀寫兩側。重跑至綠
- [ ] 4.10 **紅**：新增 it「重置只移除列舉的 key，不影響 scoreboard 資料」——同時寫入 `matchmaker:roster:v1` 與 `scoreboard:current:v1`，呼叫 `resetMatchmakerData()`，斷言前者被移除、**後者仍存在且內容不變**。看到紅燈
- [ ] 4.11 **綠**：實作 `RESET_KEYS = ["matchmaker:roster:v1"] as const` 與 `resetMatchmakerData()`，逐一 `removeItem`。**不得**用前綴掃描（見 design Decision 6）。重跑至綠
- [ ] 4.12 **refactor**：檢視 `RESET_KEYS` 上方是否有註解說明「新增資料域時必須主動決定是否納入重置範圍」；逐筆降級的分支是否清楚區分「無筆可救」與「部分可救」兩種情況。無壞味道則註記 skipped

## 5. 狀態管理（`hooks/useRosterStore.ts` — 行為邏輯，必 TDD）

- [ ] 5.1 **紅**：新增 `nextjs-pickball/hooks/useRosterStore.test.tsx`，寫 it「無持久化資料時初始 players 為空陣列」——清空 localStorage 後 `renderHook(() => useRosterStore())`，斷言 `players` 為 `[]`。執行 `pnpm --filter ./nextjs-pickball test --run hooks/useRosterStore.test.tsx` 看到紅燈
- [ ] 5.2 **綠**：建立 `useRosterStore.ts`，比照 `hooks/useScoreboardStore.ts` 的 reducer + `HYDRATE` 模式（見 design Decision 8）：初始 state 為空名單，`useEffect` 讀取後 dispatch `HYDRATE`。重跑至綠
- [ ] 5.3 **紅**：新增 it「新增參賽者後自動寫回 localStorage」——透過 store 的 `addPlayer` 新增一位，斷言 `localStorage["matchmaker:roster:v1"]` 解析後含該筆。看到紅燈
- [ ] 5.4 **綠**：在 state 變更時 `writeRoster()`。重跑至綠
- [ ] 5.5 **綠（續）**：補齊 store 對外介面——`updatePlayer`／`removePlayer`／`togglePlayerActive`／`resetRoster`，各自委派給 `lib/matchmaker/roster.ts` 的純函式；`id` 與 `createdAt` 在此層產生（`crypto.randomUUID()`、`new Date().toISOString()`）後注入純函式。為每個新增的介面補對應 it
- [ ] 5.6 **綠（續）**：`readRoster()` 回報 `droppedCount > 0` 時，store 需保留該筆數供 UI 提示（例如 `droppedCount` 狀態欄位）。補 it「持久化資料含損壞筆數時 store 回報 droppedCount」
- [ ] 5.7 **refactor**：檢視 hydration 是否會造成 SSR／CSR 首次輸出不一致；`writeRoster` 是否在每次 render 都被呼叫（應只在 state 實際變更時）。無壞味道則註記 skipped

## 6. UI 元件（例外層 — 純呈現型元件，以 E2E 驗收）

> 優先使用 `components/ui/` 既有的 11 個 shadcn 元件。若確實需要新元件，
> 用 `pnpm dlx shadcn@latest add <component>` 並**必須在 `nextjs-pickball/` 內執行**（`components.json` 在此），
> 且於本節註明新增了哪個元件與理由。

- [ ] 6.1 `components/matchmaker/PlayerCard.tsx`：單筆參賽者，背景為 `linear-gradient(colorFrom → colorTo)`，前景色取自 `pickTextColor`；顯示姓名、性別、強度分數（`toFixed(2)`）、出場狀態。暫停中者需有非顏色的狀態標示（`prd.md` 12.5：色彩不得為唯一資訊來源）
- [ ] 6.2 `components/matchmaker/PlayerForm.tsx`：新增／編輯表單。姓名 `input`、性別 `select`、兩個顏色用原生 `<input type="color">`、強度分數 `input` + 快速帶入按鈕（新手 1.00／中階 3.00／高階 5.00）。送出前以 `PlayerSchema` 驗證，錯誤訊息為繁體中文且說明修正方式（`prd.md` 11）
- [ ] 6.3 `components/matchmaker/PlayerList.tsx`：列表容器，組合 `PlayerCard`，提供編輯與刪除入口。刪除 MUST 二次確認（`prd.md` 第 10 節）
- [ ] 6.4 `components/matchmaker/EmptyRoster.tsx`：空白狀態，含「新增第一位參賽者」入口
- [ ] 6.5 `components/matchmaker/ResetRosterDialog.tsx`：以既有 `components/ui/alert-dialog` 實作，提示文字採 `prd.md` 4.1.5 的原文：「確定要重置參賽者名單嗎？這會清除全部參賽者、目前回合與歷史賽果，且無法復原。」並建議先匯出備份（本階段尚無匯出功能，文案先不承諾操作入口）
- [ ] 6.6 `droppedCount > 0` 時於名單頁顯示提示（例如「有 N 筆資料損毀已略過」），SHALL NOT 靜默處理
- [ ] 6.7 所有元件頂部標 `"use client"`，與既有 `components/scoreboard/` 慣例一致

## 7. 路由（例外層 — 入口）

- [ ] 7.1 `app/matchmaker/players/page.tsx`：組合 `useRosterStore` 與上述元件；不加入全站 navbar（見 proposal 的不在範圍）
- [ ] 7.2 確認 `pnpm --filter ./nextjs-pickball dev` 後可於 `http://localhost:3005/matchmaker/players` 開啟且無 console error

## 8. E2E（例外層 — 測試基礎建設）

- [ ] 8.1 新增 `nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，每個 test 前清空 `matchmaker:roster:v1`
- [ ] 8.2 test「首次開啟顯示空白狀態與新增入口」
- [ ] 8.3 test「重整後名單仍在」——新增一位 → `page.reload()` → 斷言該筆仍在
- [ ] 8.4 test「確認重置後名單清空且持久化資料被移除」
- [ ] 8.5 test「取消重置後名單維持不變」
- [ ] 8.6 執行 `pnpm --filter ./nextjs-pickball test:e2e --grep "player-roster"` 確認五個 browser project 全綠

## 9. 最終驗證（對應 root `README.md` 部署前手動檢查清單）

- [ ] 9.1 `pnpm lint`
- [ ] 9.2 `pnpm typecheck`
- [ ] 9.3 `pnpm test:web` 全綠，且確認新增的測試檔皆有被收集
- [ ] 9.4 `pnpm test:e2e` 全綠（`webServer` 會自動帶起前後端）
- [ ] 9.5 `pnpm --filter ./nextjs-pickball preview` 於 workerd runtime 確認 `/matchmaker/players` 可正常運作
- [ ] 9.6 確認未讀取、修改或刪除 `scoreboard:current:v1`——手動在瀏覽器開一場計分板、切到名單頁操作後返回，計分進度應完好
