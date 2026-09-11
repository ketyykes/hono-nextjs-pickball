> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> **範圍說明**：本 change 的六份 delta spec 皆為 MODIFIED，每個 Requirement 都保留了
> 大量**逐字複製、行為未變**的既有 Scenario（例如「比分欄位空白」「合法歷史紀錄通過驗證」）
> ——它們已有既有測試覆蓋，本 change 不新增也不修改對應測試，因此**本檔只列出行為有變
> （新增或既有斷言內容改變）的 Scenario**，不逐一重複列出全部既有 Scenario。tasks.md
> 的「§1 前置確認」與各群組 task 會標明「哪些既有 Scenario 保持不動，不需要 RED」。
>
> Tier 對照本 change 觸及的分層：
> - `unit`：`lib/matchmaker/` 的純函式模組（`round.ts`、`round-types.ts`、`rating.ts`、
>   `history.ts`、`history-csv.ts`、`backup.ts`、`export-scene.ts`），Vitest + happy-dom
> - `integration`：`components/matchmaker/` 的元件（`CourtCard.tsx`、`HistoryRecordCard.tsx`），
>   Vitest + `@testing-library/react`
> - `e2e`：`tests/e2e/specs/matchmaker-history.spec.ts`（Playwright），用於「歷史頁的顯示
>   欄位」這類無法只靠元件單元測試涵蓋整條 UI 呈現路徑的 Scenario
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。

## round-lifecycle

### Requirement: 回合資料模型

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| winner 欄位新增 draw 列舉值且 completed 場次可帶 draw | winner 欄位新增 draw 列舉值 | `RoundMatchSchema.safeParse` 對 `winner: "draw"`（`status: "completed"`、`scores` 兩隊相同）回傳 `success: true`；`winner: "tie"` 回傳 `success: false` | golden path：這是本 change 對 `RoundMatch` 型別擴增的唯一直接驗證點，沒有這條測試，`round.ts` 端所有回傳 `winner: "draw"` 的分支在型別上就無法通過 `RoundSchema` 的執行期驗證 | unit |

### Requirement: 比分驗證

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 兩隊比分相同時拒絕送出 | 兩隊比分相同 | 以 `isTimedRound: false` 呼叫 `validateScoreInput(match, "11", "11", false)` → `ok: false`、`code: VALIDATE_SCORE_FAILURE_CODE.TIE`，`message` 含「非計時回合」子字串（例如「非計時回合不得送出平局」） | regression guard＋signature 變更：既有測試呼叫 `validateScoreInput` 時只帶 3 個參數，新增第 4 個必填參數後 `tsc --noEmit` 會直接報錯——這是本 change 對既有測試的唯一容許修改（補參數＋更新訊息斷言），須先改到位其餘 task 才能編譯 | unit |
| 計時回合兩隊比分相同時允許送出 | 計時回合兩隊比分相同時允許送出為平局 | 以 `isTimedRound: true` 呼叫 `validateScoreInput(match, "11", "11", true)` → `ok: true`、`scoreA: 11`、`scoreB: 11` | golden path：本 change 新增的唯一放行分支，沒有這條測試，`isTimedRound` 參數形同虛設 | unit |

### Requirement: 比分送出的完成流程

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 計時回合送出平局比分後場次標記為完成且 winner 為 draw | 計時回合送出平局比分後場次標記為完成且 winner 為 draw | 以一個 `round.timer !== null` 的計時回合、`pending` 單打場次送出 `11` 比 `11` → `status: "completed"`、`scores: { teamA: 11, teamB: 11 }`、`winner: "draw"`、`completedAt` 為注入的 `now` | golden path：`submitScore` 端到端接線的核心斷言——沒有它，`validateScoreInput` 放行了平局，但 `submitScore` 若仍寫死 `scoreA > scoreB ? "teamA" : "teamB"` 會在此處靜默把平局誤記為 `"teamB"` 獲勝 | unit |
| 計時回合平局時 playerRatings 仍逐一對應該場每位球員 | 計時回合平局時 playerRatings 仍逐一對應該場每位球員 | 計時回合的雙打場次送出平局 → `playerRatings` 恰有 4 筆，每筆 `before`／`after` 皆為以 `winnerIndex: "draw"`（`S = 0.5`）呼叫 `updateRatings` 後的結果 | golden path：驗證 `submitScore` 把 `winner === "draw"` 正確轉譯為 `updateRatings` 的 `winnerIndex: "draw"`，而非誤傳 `winnerIndex: 0` 或 `1`——這是本 change 對 `round.ts` ↔ `rating.ts` 唯一新增的呼叫路徑 | unit |

## match-rating

### Requirement: 評分更新公式與常數

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局時雙方 S 皆為 0.5 而非任一方視為勝負 | 平局時雙方 S 皆為 0.5 | 以 `winnerIndex: "draw"` 呼叫 `updateRatings` → 兩隊變動值皆為 `kEff × (0.5 - E)` 或 `kEff × (0.5 - (1 - E))`，SHALL NOT 等於以 `S = 1` 或 `S = 0` 計算的結果 | golden path：`match-rating` 移除平局禁令後的核心公式驗證，是本 capability 唯一直接測 `S = 0.5` 這個新分支的地方 | unit |

### Requirement: 零和的成立條件

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局時勢均力敵雙方 E 與 S 皆為 0.5 而變動值為零 | 平局時勢均力敵雙方變動皆為零 | `rating` 皆 4.00、`gamesPlayed` 皆 0 的兩人平局（`winnerIndex: "draw"`）→ 雙方賽後分數皆與賽前相同（變動值為 `0`） | edge case：`(S - E) = 0` 是本 change 新增的唯一「雙方變動皆為零」邊界情境（既有 win/lose 路徑因 `S ∈ {0,1}` 與 `E ∈ (0,1)` 永遠不會讓 `S - E` 恰為 0），須驗證不誤判為「方向保證失效」 | unit |
| 平局時實力不同的雙方變動方向相反，高分方下降低分方上升 | 平局時實力不同雙方變動方向相反 | `rating` 6.00 與 4.00（`gamesPlayed` 皆 0）平局 → `E > 0.5` 的高分方變動值為負、`E < 0.5` 的低分方變動值為正，兩者互為相反數 | edge case：這是「零和結構性保證延伸至平局」的關鍵驗證——確認即使 `S = 0.5` 對雙方相同，實際變動方向仍由 `E` 決定而非恆為零 | unit |

## match-history

### Requirement: 歷史紀錄欄位 schema

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| winner 欄位新增 draw 列舉值時通過驗證 | winner 欄位新增 draw 列舉值時通過驗證 | `MatchHistoryEntrySchema.safeParse` 對 `winner: "draw"`（其餘欄位合法）回傳 `success: true`；`winner: "tie"` 回傳 `success: false` | golden path：`toHistoryEntry` 若寫入 `winner: "draw"` 而 schema 不接受，寫入流程會在驗證層直接失敗，這是本 change 對歷史 schema 擴增的唯一直接驗證點 | unit |

### Requirement: 歷史紀錄的顯示欄位

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局紀錄顯示平手而非任一隊勝方 | 平局紀錄顯示平手而非任一隊勝方 | `matchmaker:history:v1` 含一筆 `winner: "draw"` 的紀錄，開啟歷史頁 → 畫面顯示「平手」文字，第一隊與第二隊皆無「勝」標籤 | golden path：確認 `HistoryRecordCard.tsx` 的既有二元 `isWinner` 判斷（`entry.winner === "teamA"`／`"teamB"`）在平局下不會誤判為「兩隊都沒赢」卻又不顯示任何說明——這是使用者看得到的畫面，只靠型別檢查抓不到「忘了加平手標籤」這種遺漏 | e2e |

## data-transfer

### Requirement: 歷史賽果的 CSV 匯出

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局歷史的勝方欄輸出平手而非任一隊隊名 | 平局歷史的勝方欄輸出平手 | 一筆 `winner: "draw"` 的歷史紀錄匯出 CSV → 該列「勝方」欄為「平手」 | regression guard：`history-csv.ts` 現有的 `entry.winner === "teamA" ? TEAM_LABELS[0] : TEAM_LABELS[1]` 是二元判斷，在不修改的情況下會把 `"draw"` 靜默判成 `TEAM_LABELS[1]`（第二隊獲勝）——這是本 change 六個消費點中**行為最容易被誤判**的一處，須有測試直接釘住 | unit |

### Requirement: JSON 匯入的結構驗證與整份原子性

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 備份內回合或歷史含平局的 winner 為 draw 時仍通過驗證 | 備份內回合或歷史含平局時仍通過驗證 | 備份的 `currentRound.matches` 或 `history` 中有一筆 `winner: "draw"`，呼叫 `parseBackup` → 回傳成功結果，該筆 `winner` 於還原後仍為 `"draw"` | regression guard：`backup.ts` 本身零程式碼修改（design Decision 5），這條測試驗證的是「`RoundSchema`／`MatchHistoryEntrySchema` 的擴增確實透過既有 import 鏈傳導到 `BackupSchema`」這個**結構性假設**，而非新程式碼——寫入當下即綠（見 design Decision 5），是本 change 對「零修改也該有效」這個論證的唯一自動化證據 | unit |

## match-stage

### Requirement: 手動輸入比分與送出

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 兩隊比分相同時 UI 仍照常委派送出而不自行攔截 | 兩隊比分相同時 UI 仍照常委派送出不自行攔截 | 於 `CourtCard` 的兩個比分欄位皆填入 `11` 後按下送出 → `onSubmitScore` 仍被呼叫一次、帶入該場次識別與兩個 `"11"` 字串；元件自身不因兩隊比分相同而提前阻擋或另外顯示錯誤 | regression guard：`round-lifecycle` 放行計時回合的平局後，若 `CourtCard.tsx` 或 `ScoreEntry.tsx` 有任何一處「helpfully」複製了一份「兩隊比分相同就攔下」的防呆邏輯，會讓計時回合的平局永遠送不出去——這條測試直接證明 UI 層沒有這種複製 | integration |

### Requirement: 完成場次的視覺與資訊

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 平局場次不顯示任一隊勝方標籤而顯示平手標籤 | 平局場次不顯示任一隊勝方標籤而顯示平手標籤 | 渲染一場已完成、比分 `11:11`、`winner: "draw"` 的對戰 → 第一隊與第二隊皆無「勝」文字標籤，畫面另外出現「平手」文字標籤 | golden path：`CourtCard.tsx` 現有的 `match.winner === winnerKey` 判斷在平局下兩者皆為 `false`（不會誤判成某隊獲勝），但**沒有這條測試就不會有人發現「兩者皆不顯示」等於使用者完全看不到這場打平了**——色彩之外沒有任何文字告知 | integration |

## visual-export

### Requirement: 匯出內容的組成

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 已完成場次為平局時顯示比分與平手而非任一隊勝方 | 已完成場次為平局時顯示比分與平手而非任一隊勝方 | 場次 `status: "completed"`、`scores: { teamA: 11, teamB: 11 }`、`winner: "draw"` → `buildExportScene` 回傳的狀態文字同時含 `11`、`11` 與「平手」，不含任一隊隊名 | golden path：`export-scene.ts` 的 `TEAM_LABELS_BY_KEY[match.winner]` 在 `winner` 型別擴為三值後對 `"draw"` 查表會是 `undefined`（`tsc --noEmit` 會先擋下，見 design Risks），這條測試是該分支補齊後的行為驗證，確保 JPG／PDF 匯出的「平手」文字與其他三處消費點（歷史、CSV、對戰頁）一致 | unit |

---

## Checklist

- [x] Every requirement listed above has at least one matching test
- [x] 每個新增或行為變更的 Scenario 皆有對應測試；未列出的既有 Scenario 為行為不變、
      沿用既有測試（見本檔開頭「範圍說明」）
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use 中文完整句子，且與 delta spec 的「驗收」錨點逐字一致
