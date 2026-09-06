> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **`components/scoreboard/` 沿用既有的 E2E-only 驗收分層**（design Context）：`TeamPanel.tsx`
> 的渲染改動沒有元件單元測試，紅燈以 `tests/e2e/specs/scoreboard-binding.spec.ts` 呈現。
>
> **紅燈要是真的**：若某項行為早已實作使新測試立即全綠，MUST 誠實標註為 regression guard，
> **SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**。需要新套件時回報 BLOCKED。
>
> **單向相依是硬約束**：`nextjs-pickball/lib/scoreboard/**` 與
> `nextjs-pickball/components/scoreboard/**` 全程 SHALL NOT 出現任何對
> `lib/matchmaker/`（或其元件對應）的 import（design Decision 1、Context）。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的假設與現況對齊，避免 §2
> 之後整批建立在錯的簽章上。

- [x] 1.1 確認目前 cwd 為 environment.md 宣告的工作路徑（主 repo）、`git branch --show-current` 為 `change/matchmaker-scoreboard-team-labels`，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [x] 1.2 確認 `main` 上 **M11（`matchmaker-player-stats`）已合併**：檢查 `openspec/changes/archive/` 是否有對應歸檔紀錄，或以 `git log --oneline main` 確認其提交已在目前分支歷史中。**不存在則立即停止並回報**，SHALL NOT 在本 change 內補做 M11（見 proposal 的「執行相依」與 design Open Questions 第 1 條）
- [x] 1.3 讀 `nextjs-pickball/lib/scoreboard/types.ts`，記錄 `ScoreboardStateSchema`／`MatchSettings` 目前的實際欄位（含 `matchId`、`courtNumber` 的既有寫法是否與本文件所述一致）。差異一律補記進 design.md 的 Open Questions，不要默默改實作去遷就
- [x] 1.4 讀 `nextjs-pickball/lib/scoreboard/reducer.ts`，記錄 `createInitialState(overrides)`／`settingsOf(state)` 的實際簽章與既有欄位帶入方式
- [x] 1.5 讀 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts` 與其測試檔 `scoreboard-binding.test.ts`，記錄 `buildMatchSlotSeed(round, match)` 的現況簽章，並**逐一列出**該測試檔內全部呼叫 `buildMatchSlotSeed(round, match)` 的 `it` 名稱與呼叫次數（§3.2 會據此清單逐一補上第三參數）。同時讀 `nextjs-pickball/components/matchmaker/CourtCard.tsx`，確認 `handleEnterScoreboard` 內 `ensureMatchSlot(buildMatchSlotSeed(round, match))` 的呼叫處與該元件既有的 `players: readonly Player[]` prop
- [x] 1.6 讀 `nextjs-pickball/components/scoreboard/TeamPanel.tsx`，記錄既有名稱行的實際 JSX 結構（`<span>{label}</span>` 與 `· {targetScore} 分制` 的相對位置），確認新增內容的插入點
- [x] 1.7 確認 `nextjs-pickball/lib/matchmaker/colors.ts` 的 `pickTextColor(colorFrom, colorTo): string` 簽章、`nextjs-pickball/lib/matchmaker/round-types.ts` 的 `RoundTeam.playerIds: string[]`、`nextjs-pickball/lib/matchmaker/types.ts` 的 `Player`（`name`／`colorFrom`／`colorTo`）三者與 design Context 假設一致
- [x] 1.8 確認 `nextjs-pickball/package.json` 目前無任何新增相依需求前提不變（本 change 結束時 MUST 仍為零新增，Final Review 會以 `git diff package.json` 機械確認）

> **§1 執行結論（2026-09-06，基底 `b7541af`）**：全部八項通過，**零漂移**。baseline `pnpm test`
> 全綠（前端 70 files／664 tests、後端 4 files／16 tests，無 EPERM）。M11（`e8e97cf`）與
> M10（`56331b0`）對本 change 引用的所有檔案零改動，兩處 MODIFIED delta 為主 spec 現況的逐字
> 超集。§1.5 實測更正：`scoreboard-binding.test.ts` 內共 **7 個** `buildMatchSlotSeed` 呼叫
> 運算式分佈於 **6 個 `it`**（「多場次時 seed 取該場自己的場地編號，而非回合的第一場」該 it 內
> 有 2 次呼叫），design.md Decision 4 誤記為「三處」已補記進 Open Questions 第 4 條。
> 其餘實測記錄詳見 design.md Open Questions 第 1 條的「apply §1 已執行」段落。

## 2. 計分板 schema／reducer 擴充（teamPlayers 欄位）

Depends on: §1

- [ ] 2.1 RED: `nextjs-pickball/lib/scoreboard/reducer.test.ts` 補兩個 it：「UNDO 與 RESET 後保留 teamPlayers，不退回 null」（比照既有的「UNDO 與 RESET 後保留 matchId，不退回 null」寫法）、「HYDRATE 原樣保留帶入的 teamPlayers」（比照既有的「HYDRATE 原樣保留帶入的 matchId」寫法）；`nextjs-pickball/lib/scoreboard/match-slots.test.ts` 補一個 it：「舊版資料缺 teamPlayers 時補為 null 且不清除該筆」（`scoreboard:matches:v1` 內寫入一筆不含 `teamPlayers` 的合法舊資料，呼叫 `readMatchSlots()` 後斷言該筆 `teamPlayers` 為 `null` 且未被丟棄）。三者此時皆因 `teamPlayers` 尚不存在於 schema／`MatchSettings` 而斷言失敗。確認紅燈並貼出輸出
- [ ] 2.2 GREEN: `nextjs-pickball/lib/scoreboard/types.ts` 新增 `PlayerBadgeSchema`（`name`／`colorFrom`／`colorTo`／`foreground` 皆為 `z.string()`）與 `TeamPlayersSchema`（`{ us: z.array(PlayerBadgeSchema).min(1).max(2); them: z.array(PlayerBadgeSchema).min(1).max(2) }`，design Decision 6）；`ScoreboardStateSchema` 新增 `teamPlayers: TeamPlayersSchema.nullable().default(null)`；`MatchSettings` 新增 `teamPlayers: TeamPlayers | null`。`nextjs-pickball/lib/scoreboard/reducer.ts` 的 `createInitialState`／`settingsOf` 比照 `courtNumber` 既有寫法帶入 `teamPlayers`
- [ ] 2.3 REFACTOR: 確認 `PlayerBadgeSchema`／`TeamPlayersSchema` 與其型別匯出緊鄰既有 schema 定義、命名風格與既有 `PascalCase`／`camelCase` 慣例一致；確認 `types.ts` 內沒有為 `colorFrom`／`colorTo` 另外引入 hex regex 驗證（design Decision 6 已裁決維持 `z.string()`）

## 3. 計分板 seed 的球員顯示資訊（scoreboard-binding.ts 與 CourtCard.tsx 接線）

Depends on: §2

- [ ] 3.1 RED: `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts` 補三個 it：「seed 依對戰方式帶入對應人數的球員顯示資訊：單打 1 人、雙打 2 人」（分別以單打與雙打呼叫 `buildMatchSlotSeed`，斷言 `teamPlayers.us`／`teamPlayers.them` 的陣列長度與姓名依序對應）、「球員顯示資訊的前景色等於 pickTextColor 的回傳值」（斷言某筆 `foreground` 等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值，不硬寫顏色字串）、「名單中找不到該球員時球員顯示資訊以替代文字呈現且不拋錯」。三者呼叫 `buildMatchSlotSeed` 時傳入第三個 `players` 參數，此時函式仍是舊的兩參數簽章，額外參數在執行期被忽略，`teamPlayers` 因此為 `undefined`，三個新斷言皆失敗。確認紅燈並貼出輸出
- [ ] 3.2 GREEN: `buildMatchSlotSeed` 新增必填的 `players: readonly Player[]` 第三參數（design Decision 4）；新增私有函式解析 `RoundTeam.playerIds → PlayerBadge[]`：查得到時取該員 `name`／`colorFrom`／`colorTo`，並以 `pickTextColor` 算出 `foreground`（design Decision 1）；查不到時（該員已被移除）以本模組私有的具名常數呈現替代文字「已離開名單」與中性灰色 `#9CA3AF`／`#4B5563`，該筆的 `foreground` 同樣經 `pickTextColor` 算出（design Decision 3，措辭與色碼沿用 `export-scene.ts` 既有慣例但不 import）。同步把 §1.5 記錄的 `scoreboard-binding.test.ts` 內全部既有呼叫 `buildMatchSlotSeed(round, match)` 的呼叫點（含「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」「seed 帶入該場次的場地編號」「多場次時 seed 取該場自己的場地編號，而非回合的第一場」「已有進度的場次再次進入時保留既有進度不覆蓋」「尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed」「SSR（無 window）時 ensureMatchSlot 不寫入也不 throw，仍回傳 seed」）補上第三個 `players` 參數，**斷言一律不變**；`nextjs-pickball/components/matchmaker/CourtCard.tsx` 的 `handleEnterScoreboard` 呼叫處補上既有的 `players` prop 作為第三參數。完成後確認 `pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過
- [ ] 3.3 REFACTOR: `grep -rn "lib/matchmaker" nextjs-pickball/lib/scoreboard/` 確認為空（單向相依未被打破，本組全部改動都在 matchmaker 側）；確認替代文字與中性色的具名常數只宣告一份，且檔頭或緊鄰處有註解說明「與 `visual-export` capability 的既有判斷同構但各自實作、不跨 capability import」（design Decision 3）；確認 `CourtCard.tsx` 除補上第三參數外沒有其他改動（色塊本身姓名／顏色呈現邏輯零變動）

## 4. 計分板面板渲染與 E2E 驗收

Depends on: §2, §3

- [ ] 4.1 RED: `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts` 補兩個 test：「由對戰頁進入時面板顯示球員姓名」（種入名單並產生一輪雙打對戰、點擊「進入計分板」後，於兩隊面板查得雙方球員姓名文字，且各自的姓名色塊 `background` 含對應的 `colorFrom`／`colorTo`）、「綁定模式含球員姓名色塊時多 viewport 仍零捲動」（以雙打綁定場次於 390x844／844x390／768x1024／1024x600 四個 viewport 下開啟，斷言 `scrollHeight <= clientHeight + 1` 且「贏這球+」與 Undo／重置按鈕的 boundingBox 完整落在 viewport 內）。此時 `TeamPanel.tsx` 尚未渲染 `teamPlayers`，姓名文字與色塊查不到。確認紅燈並貼出輸出
- [ ] 4.2 GREEN: `nextjs-pickball/components/scoreboard/TeamPanel.tsx` 在既有名稱行內、`<span>{label}</span>` 之後、`· {targetScore} 分制` 之前，當 `state.teamPlayers` 非 `null` 時依序渲染該隊每位球員的姓名色塊（`background: linear-gradient(...)` 取自 `colorFrom`／`colorTo`、`color` 取自已算好的 `foreground`、`truncate` 加固定 `max-width`、原生 `title` 屬性提供完整姓名，design Decision 5）；`teamPlayers` 為 `null` 時該區塊不渲染，既有 JSX 分支維持原樣
- [ ] 4.3 REFACTOR: 確認 `TeamPanel.tsx` 內沒有任何亮度或對比計算邏輯（只讀取 `foreground`，design Decision 1）；`git diff` 確認 `teamPlayers` 為 `null` 時的既有渲染路徑逐字未變；確認姓名色塊的 class 與既有 `components/scoreboard/`、`components/matchmaker/PlayerTile.tsx` 的視覺語言（圓角、字級單位）不衝突

## 5. 收尾驗證

- [ ] 5.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 5.2 `pnpm --filter ./nextjs-pickball test --run lib/scoreboard/` 與 `--run lib/matchmaker/scoreboard-binding.test.ts` 全綠，貼出輸出
- [ ] 5.3 `pnpm lint` 通過（0 errors；既有 warning 不得新增）
- [ ] 5.4 `pnpm -r exec tsc --noEmit` 通過
- [ ] 5.5 `pnpm test` 全套通過（確認未破壞既有 matchmaker／scoreboard 前端測試與 `hono-pickball` 後端測試）
- [ ] 5.6 `pnpm --filter ./nextjs-pickball test:e2e --workers=1` 全套通過；`scoreboard.spec.ts`、`scoreboard-binding.spec.ts`、`match-stage.spec.ts` 既有 test **原樣**通過
- [ ] 5.7 `git diff package.json` 與 `git diff pnpm-lock.yaml` 皆為空（本 change 零新增相依）；`git diff --stat` 確認 `hooks/` 零新增、`components/matchmaker/CourtCard.tsx` 除 `buildMatchSlotSeed` 呼叫處補參數外零其他改動
- [ ] 5.8 `DO_NOT_TRACK=1 openspec validate matchmaker-scoreboard-team-labels --strict` 通過
- [ ] 5.9 delta spec 重複標題檢查：對 `openspec/changes/matchmaker-scoreboard-team-labels/specs/scoreboard/spec.md` 與 `.../specs/match-stage/spec.md` 各跑一次 root `CLAUDE.md` 指定的 python 計數法（**不使用 BSD `uniq`**），確認 `### Requirement:` 與 `#### Scenario:` 皆無重複
- [ ] 5.10 同步 `nextjs-pickball/CLAUDE.md`：確認架構總覽對 `/matchmaker` 與 `/scoreboard` 的既有描述是否需要補記「計分板顯示綁定場次的球員姓名與隊色」，若已有等價敘述則不重複補寫

> **本 change 唯一容許變動的既有測試**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`
> 內六個既有 `it`（「seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手」「seed 帶入該場次的
> 場地編號」「多場次時 seed 取該場自己的場地編號，而非回合的第一場」「已有進度的場次再次進入時
> 保留既有進度不覆蓋」「尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed」「SSR（無 window）時
> ensureMatchSlot 不寫入也不 throw，仍回傳 seed」）因 `buildMatchSlotSeed` 新增必填第三參數而
> 補上呼叫參數，**斷言一律不變**。除此之外，其餘既有測試轉紅**一律視為迴歸**，不得標記為此清單
> 的一部分。
