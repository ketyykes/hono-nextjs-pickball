# Specification: match-stage

## MODIFIED Requirements

### Requirement: 場地區塊的計分板入口

對戰頁的每個場地區塊 SHALL 提供「進入計分板」入口，作為 `prd.md` 6.3 兩條比分來源中「場邊計分」那一條的起點。手動輸入比分的既有入口 MUST 原樣保留並可獨立完成一場——它是必要的 fallback（主持人可能在其他工具計分、臨時換人代打或賽後補登），SHALL NOT 因為計分板入口存在而被移除或隱藏（`prd.md` 6.3）。

點擊入口時系統 MUST 依序完成兩件事，且順序不可對調：

1. **寫入該場的計分板初始狀態（seed）** 至分槽 `scoreboard:matches:v1`：`matchId` 為該場次 id、`targetScore` 取自**該輪**的 `targetScore`、`mode` 取自該輪的對戰方式（單打／雙打）、`firstServer` 為預設值、`teamPlayers` 為兩隊球員的姓名與雙色漸層顯示資訊（見下方「隊伍球員顯示資訊」段落）。**該 `matchId` 已有條目時 MUST 原樣保留、SHALL NOT 覆蓋**——覆蓋會讓「未完成的計分進度可離開後再進入接續」（`prd.md` 13.4）失效，且失效方式是靜默的分數歸零。
2. **導向 `/scoreboard?match=<matchId>`**。

先寫 seed 再導向是**必要順序**：計分板以「分槽有無該條目」判定綁定是否有效（見 `scoreboard` capability 的「對戰場次綁定與失效處理」Requirement），先導向會讓使用者看到一瞬間的「場次已失效」畫面。

隊伍對應 MUST 為：該場的**第一隊**對應計分板的 `us`（顯示為「我方」）、**第二隊**對應 `them`（顯示為「對方」）。此對應 MUST 由單一具名常數或函式表達並同時供入口與回填使用，SHALL NOT 在兩處各寫一次——兩處若不一致，回填的比分會左右顛倒，而比分本身仍是合法數字，任何驗證都攔不下來。

**已完成的場次 SHALL NOT 提供計分板入口**（`prd.md` 6.5：已完成場次不得再次送出相同比分）。

**隊伍球員顯示資訊**：`teamPlayers` 的 `us`／`them` 兩個陣列 MUST 分別為該場第一隊／第二隊的球員顯示資料，人數依對戰方式而定（單打各 1 筆、雙打各 2 筆），每筆 MUST 含該員姓名、`colorFrom`／`colorTo` 雙色漸層與前景文字色。前景文字色 MUST 於 seed 建立時以 `nextjs-pickball/lib/matchmaker/colors.ts` 的 `pickTextColor` 依該員的 `colorFrom`／`colorTo` 算好存入，SHALL NOT 由 `scoreboard` capability 重新計算——`scoreboard` capability 不得 import `lib/matchmaker/` 的既有單向相依（`matchmaker-scoreboard-binding` design Decision 2）因此必須維持，前景色只能由建立 seed 的這一端算好交過去。

回合僅保存球員 id（`RoundTeam.playerIds`），姓名與顏色須由傳入的名單解析。若某 id 在名單中找不到（該員已被移除），該筆球員顯示資料 MUST 以可判讀的替代文字與中性色呈現，SHALL NOT 拋錯、SHALL NOT 使該隊少一筆——跳過會讓雙打面板變成一人一格，使主持人誤以為排錯對戰（`prd.md` 第 11 節的錯誤處理精神）。此判斷與 `visual-export` capability 「名單中找不到球員時以替代文字呈現」的既有判斷同構，但兩者各自獨立實作，不跨 capability import（沿用 `matchmaker-scoreboard-binding` design Decision 6「各自實作而不跨 change import」的既有慣例）。

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

#### Scenario: seed 依對戰方式帶入對應人數的球員顯示資訊

- **WHEN** 分別以單打與雙打的場次呼叫 seed 建立函式
- **THEN** 單打的 `teamPlayers.us`／`teamPlayers.them` 各為 1 筆，雙打的各為 2 筆，且每筆的姓名與 `match.teams` 對應隊伍的 `playerIds` 依序一致
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「seed 依對戰方式帶入對應人數的球員顯示資訊：單打 1 人、雙打 2 人」

#### Scenario: 球員顯示資訊的前景色由 pickTextColor 決定

- **WHEN** 某位球員的 `colorFrom` 與 `colorTo` 為兩個相異 hex 色碼
- **THEN** seed 中該員的球員顯示資料帶有這兩個色碼，且其 `foreground` 等於直接呼叫 `pickTextColor(colorFrom, colorTo)` 的回傳值（不硬寫顏色字串）
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「球員顯示資訊的前景色等於 pickTextColor 的回傳值」

#### Scenario: 名單中找不到球員時以替代文字呈現

- **WHEN** 某場次某隊的 `playerIds` 中有一個 id 不存在於傳入的名單
- **THEN** 該筆球員顯示資料以可判讀的替代文字與中性色呈現，該隊其餘球員與另一隊照常輸出，呼叫不拋出例外
- **驗收**：`nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`，it 名稱「名單中找不到該球員時球員顯示資訊以替代文字呈現且不拋錯」
