> 所有指令皆從 repo root 執行。`--run` 前**不可**加 `--`。
> 前端單檔測試：`pnpm --filter ./nextjs-pickball test --run <workspace 相對路徑>`

## 1. 型別與 schema（`lib/scoreboard/types.ts` — 行為邏輯，必 TDD）

- [x] 1.1 **紅**：於 `nextjs-pickball/lib/scoreboard/storage.test.ts` 新增 it「舊版資料缺 targetScore 時補為 11 且不清除 key」——寫入一份不含 `targetScore` 的合法 state 到 `localStorage["scoreboard:current:v1"]`，斷言 `readScoreboard()?.targetScore === 11` 且該 key 未被移除。執行 `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/storage.test.ts` 於 shell 實際看到紅燈（此為**真紅燈**：schema 尚無該欄位，回傳物件的 `targetScore` 為 `undefined`）
- [x] 1.2 **綠**：於 `types.ts` 新增 `TargetScoreSchema = z.union([z.literal(11), z.literal(15), z.literal(21)]).default(11)`，加入 `ScoreboardStateSchema` 的 `targetScore` 欄位，匯出 `TargetScore` 型別；於 `Action` union 新增 `{ type: "SET_TARGET_SCORE"; targetScore: TargetScore }`。重跑 1.1 指令至綠
  - **連帶改動（型別系統逼出，非越界）**：`targetScore` 在 output type 為必填，`createInitialState` 的回傳物件字面值與 `rules.test.ts` 的 4 處手寫 fixture 若不補此欄位則 `tsc` 不過。故本步驟一併在 `reducer.ts` 的 `createInitialState` 加硬編碼 `targetScore: 11`（Task 3.4 才改為由 settings 帶入），並在 `rules.test.ts` 的 fixture 補欄位（不動任何 it 名稱與斷言）。`reducer.test.ts` 因兩處皆用 `...createInitialState()` spread 而不需修改
- [x] 1.3 **refactor**：檢視 schema 定義是否與既有 `ServerNumberSchema` 的 union-of-literals 風格一致、註解是否說明 `.default()` 的相容性用途（見 design Decision 2）。**skipped** —— code review 確認風格已一致、註解已載明相容性理由，無壞味道

## 2. 勝利判定（`lib/scoreboard/rules.ts` — 行為邏輯，必 TDD）

- [x] 2.1 **紅**：於 `nextjs-pickball/lib/scoreboard/rules.test.ts` 新增 it「15 分制：11-0 尚未達標 → 未贏」，斷言 `isGameWon({ us: 11, them: 0 }, 15)` 回傳 `{ won: false, winner: null }`。執行 `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/rules.test.ts` 看到紅燈（**真紅燈**：現行實作只看 `max < 11`，11-0 會誤判為我方獲勝）
- [x] 2.2 **綠**：`isGameWon(scores, targetScore)` 新增**必填**第二參數（SHALL NOT 給預設值，見 design Decision 3），判定改為 `max < targetScore` 即未勝；同步更新 `reducer.ts` 的呼叫點使其可編譯。重跑 2.1 指令至綠
- [x] 2.3 更新既有 5 個 it 的呼叫，補上第二參數 `11`（**更新而非刪除**：這些案例仍是 11 分制的有效驗收）。新增 it「15 分制：達 15 且差距 ≥ 2 → 勝，差距 1 → 延長」與「21 分制：達 21 且差距 ≥ 2 → 勝，差距 1 → 延長」。重跑 2.1 指令確認全綠
  - ⚠️ **誠實標註**：2.3 新增的兩個 it 中，多數斷言在 2.2 實作前即會通過，屬 **regression guard 而非 TDD 紅燈** —— 15-13、16-14、21-19 在舊實作下同樣達 `max >= 11` 且差距 ≥ 2 而判勝；15-14、21-20 在舊實作下同樣因 `diff < 2` 而判延長。真正的新紅燈只有兩筆：2.1 的 `{us:11, them:0}` 在 15 分制、以及本步驟的 `{us:20, them:18}` 在 21 分制（兩者在舊邏輯下皆會誤判為獲勝）。**不得**以修改斷言看紅再改回的方式偽造紅燈
  - code review 後補：21 分制那組原本缺「對方獲勝」的對稱斷言（`isGameWon` 的 `them` 分支在 21 分制下未被走到），已補 `{us:19, them:21} → winner: "them"`
- [x] 2.4 **refactor**：檢視 `isGameWon` 的註解是否已更新（現行註解寫死「任一方達 11 分」）。**已更新** —— 註解改為說明門檻依 targetScore、不設 cap，並載明第二參數為何刻意不給預設值；其餘無壞味道

## 3. Reducer 與賽前設定（`lib/scoreboard/reducer.ts` — 行為邏輯，必 TDD）

- [x] 3.1 **紅**：於 `nextjs-pickball/lib/scoreboard/reducer.test.ts` 新增 it「setup 階段可切換 targetScore 且保留 mode 與 firstServer」，dispatch `{ type: "SET_TARGET_SCORE", targetScore: 15 }` 後斷言 `targetScore === 15`、`mode` 與 `firstServer` 不變、分數維持 0-0。執行 `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/reducer.test.ts` 看到紅燈（**真紅燈**：reducer 無此 case，走 default 回傳原 state）
- [x] 3.2 **綠**：新增 `SET_TARGET_SCORE` case（比照 `SET_MODE`：`status !== "setup"` 時 return state，否則重建初始 state 並保留另外兩項設定）。**同時**讓 `createInitialState` 的 `overrides` 接受 `targetScore`（取代 Task 1.2 的硬編碼 `targetScore: 11`，改為 `overrides.targetScore ?? 11`）—— 三個 `SET_*` case 都走「重建初始 state」，若 `createInitialState` 仍硬編碼 11，切換分制後會立刻被覆寫回 11，3.1 的紅燈無法轉綠。重跑 3.1 指令至綠
- [x] 3.3 **紅**：新增 it「UNDO 後保留 targetScore，不退回預設 11」——設 `targetScore = 21`、dispatch 數次 RALLY_WON 後 UNDO，斷言 `targetScore` 仍為 21 且 `status !== "finished"`。看到紅燈（**真紅燈**：`UNDO` 的 `createInitialState({ mode, firstServer })` 未帶 `targetScore`，replay 後靜默退回 11，且分數若已 ≥ 11 會誤判為結束）
- [x] 3.4 **綠**：`UNDO` 與 `RESET` 的重建路徑帶入 `targetScore`（`createInitialState` 本身已於 3.2 支援）。重跑 3.1 指令至綠
- [x] 3.5 新增 it「playing 階段 ignore SET_TARGET_SCORE」與「finished 階段 ignore SET_TARGET_SCORE」；更新既有 it 名稱「RESET 保留 mode 與 firstServer，清空分數與 history、status 回 setup」為「RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup」並補上對應斷言。重跑 3.1 指令確認全綠
  - ⚠️ **誠實標註**：兩個 ignore 測試屬 **regression guard**——reducer 的 `default` 分支對未知 action 本就回傳原 state，故它們在 3.2 實作前即為綠。其價值在於鎖定 3.2 的 `status` guard 不被日後移除
- [x] 3.6 **refactor**：將 `mode` / `firstServer` / `targetScore` 收斂為 `MatchSettings` 型別（定義於 `types.ts`），`createInitialState(overrides: Partial<MatchSettings> = {})`，並新增 `settingsOf(state)` helper；五處重建點（`SET_MODE`／`SET_FIRST_SERVER`／`SET_TARGET_SCORE`／`UNDO`／`RESET`）改為「取出目前 settings → 套用差異」（見 design Decision 4）。三個 `SET_*` case 維持各自獨立分支，不合併為 fallthrough。重跑 3.1 指令確認仍全綠
  - 參數用 `Partial<MatchSettings> = {}` 而非必填 —— 既有測試有多處無參數呼叫 `createInitialState()`，改必填會逼出十餘處無關改動；防漏欄位的實際機制是 `settingsOf()` 而非簽章
- [x] 3.7 執行 `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/` 確認 rules／reducer／storage 三檔全綠

## 4. UI 呈現（例外層 — 純呈現型元件，以 E2E 驗收）

- [x] 4.1 `components/scoreboard/ScoreboardSetup.tsx` 新增「目標分數」分段按鈕（11 | 15 | 21）：外層 `role="radiogroup"` + `aria-label="目標分數"`，三顆按鈕各為 `role="radio"` + `aria-checked`（見 design 已決議事項），鎖定狀態使用原生 `disabled={locked}`（與其餘兩控制項一致）；props 增加 `targetScore` 與 `onTargetScoreChange`
- [x] 4.2 `components/scoreboard/Scoreboard.tsx` 傳入 `state.targetScore` 與 `onTargetScoreChange={(targetScore) => dispatch({ type: "SET_TARGET_SCORE", targetScore })}`
- [x] 4.3 `components/scoreboard/TeamPanel.tsx` 名稱行改為顯示「{label} · {targetScore} 分制」（沿用既有 label 節點，**不新增獨立列**——頁面為 `h-dvh` + `overflow-hidden` 鎖高，見 design Decision 7）
  - ⚠️ **隊伍名必須獨立成一個子節點**：既有 E2E 有三處 `page.getByText("我方", { exact: true })`（`tests/e2e/specs/scoreboard.spec.ts:26,27,111`），若整行文字變成「我方 · 15 分制」，exact 比對會失配而使既有測試全紅。故 MUST 寫成 `<span>{label}</span><span> · {targetScore} 分制</span>` 的巢狀結構，讓內層 span 的文字內容維持恰好是「我方」／「對方」。此舉同時讓分制可套用較淡的視覺權重，語意上亦更合理
- [ ] 4.4 於 `pnpm dev:web` 手動確認：橫向（844x390）設定列單列容納三控制項；直向（390x844）設定列折為兩列且兩顆「贏這球+」仍完整可見。**折行為預期行為**，正式驗收以 5.3 的 E2E 為準

## 5. E2E 驗收（例外層 — 不強制三步）

- [ ] 5.1 於 `nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts` 新增 test「15 分制下連贏 11 球不觸發 GameOverDialog」——以 `getByRole("radio", { name: "15" })` 切換目標分數為 15 後連按我方「贏這球+」11 次，斷言比分為 11 – 0 且 GameOverDialog 未出現
- [ ] 5.2 新增 test「比賽開始後三個賽前設定控制項皆為 disabled」與「專注模式下隊伍面板仍顯示目標分數」
- [ ] 5.3 重跑既有 test「多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見」，確認設定列增為三控制項後 390x844／844x390／768x1024／1024x600 四個 viewport 仍全數通過（此為直向折行是否造成靜默裁切的唯一防線）
- [ ] 5.4 確認既有 test「我方連贏 11 球觸發 GameOverDialog…」仍通過（預設值仍為 11，不應受影響）
- [ ] 5.5 執行 `pnpm test:e2e` 全套通過

## 6. 收尾驗證

- [ ] 6.1 `pnpm lint` 通過
- [ ] 6.2 `pnpm typecheck` 通過（`isGameWon` 改必填參數後，所有呼叫點皆須已更新）
- [ ] 6.3 `pnpm test` 全套通過
- [ ] 6.4 `pnpm --filter ./nextjs-pickball preview` 於 workerd runtime 確認 `/scoreboard` 可正常操作三種分制
- [ ] 6.5 手動驗證向後相容：於瀏覽器 devtools 寫入一份**不含 `targetScore`** 的舊格式 state 到 `localStorage["scoreboard:current:v1"]`，重整 `/scoreboard`，確認分數與 history 完整保留且以 11 分制運作（對應 design Decision 2）
- [ ] 6.6 `DO_NOT_TRACK=1 openspec verify scoreboard-target-score`（或 `/opsx:verify`）通過
