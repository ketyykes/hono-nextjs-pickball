> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**。若某個測試加入後**立即全綠**，MUST 在該項後方誠實標註為
> regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**。需要新套件時回報 BLOCKED。
>
> **本 change 六份 delta spec 皆保留大量逐字複製、行為未變的既有 Scenario**（見
> test-plan.md 開頭「範圍說明」）。以下各群組只列出**行為有變**（新增或既有斷言內容改變）
> 的 task；未列出的既有 Scenario 不需要新的 RED，沿用既有測試即可，Stage 1 審查時對照
> spec.md 全文確認即可，不需要另外派工。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Open Questions 從假設
> 變成事實，避免 §2 之後整批建立在錯的介面上。**本節重點是 M14（`matchmaker-round-timer`）
> 的欄位重新對齊**——本文件撰寫時 M14 尚未存在，design.md 的 `round.timer` 純屬假設。

- [ ] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把
      baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [ ] 1.2 確認 `main` 上 **M10～M14（含 `matchmaker-round-timer`）已合併**：以
      `git log --oneline main` 或等效方式確認七棒（M10 stage-gaps → M11 player-stats →
      M12 scoreboard-team-labels → M13 player-swap → M14 round-timer）皆已合併回 `main`。
      **不存在則立即停止並回報**，SHALL NOT 在本 change 內補做 M10～M14（見 proposal 的
      「執行相依」）
- [ ] 1.3 讀 `main` 上合併後的 `nextjs-pickball/lib/matchmaker/round-types.ts`（或 M14
      實際存放計時欄位的檔案），找出「本輪是否為計時制」的實際判定條件（欄位名稱、型別、
      `null`／非 `null` 或布林值的語意）。與 design.md 全篇假設的 `round.timer !== null`
      逐項比對，**差異一律補記進 design.md 的 Open Questions**，不要默默改實作去遷就假設。
      若判定條件的欄位名稱不同，MUST 把本 change 六份 delta spec（`round-lifecycle`、
      `match-stage`）與 design.md 中所有寫死 `round.timer` 字樣之處**同步改名**，SHALL NOT
      依本文件的假設欄位名稱開工（見 design Open Questions 第 1 條）
- [ ] 1.4 讀 M14 是否已對 `round-lifecycle` 的「回合資料模型」Requirement 做過 MODIFIED
      （新增計時欄位的表格列）。若已修改，本 change 的 `specs/round-lifecycle/spec.md` 的
      「回合資料模型」MODIFIED 區塊 MUST 以 M14 合併後的實際版本為基礎重新複製、再疊加本
      change 的 `winner` 欄位擴增，SHALL NOT 以本文件寫作時（M14 尚未存在）的舊版本文字為
      準，否則會在 archive 時覆寫掉 M14 已合併的欄位描述
- [ ] 1.5 讀 `nextjs-pickball/lib/matchmaker/round.ts` 現況，記錄 `validateScoreInput`／
      `submitScore`／`VALIDATE_SCORE_FAILURE_CODE`／`TIE_MESSAGE` 的實際簽章與內容，並以
      `grep -rn "validateScoreInput" nextjs-pickball --include="*.ts" --include="*.tsx"`
      確認全 repo 呼叫點清單（本文件撰寫時僅 `round.ts` 自身與 `round.test.ts`）。若 M14
      新增了其他呼叫點，MUST 記錄下來供 §5 群組一併處理
- [ ] 1.6 讀 `nextjs-pickball/lib/matchmaker/rating.ts`／`rating-types.ts` 現況，確認
      `updateRatings`／`RatingUpdateInput.winnerIndex` 的實際簽章與 design Context 描述
      一致（`winnerIndex: 0 | 1`，`rating.ts` 內 `const s = winnerIndex === teamIndex ? 1 : 0`
      為唯一讀取點）
- [ ] 1.7 讀 `nextjs-pickball/lib/matchmaker/history.ts`／`round-types.ts`，確認
      `MatchHistoryEntrySchema.winner`／`RoundMatchSchema.winner` 目前確實為
      `z.enum(["teamA", "teamB"])`（前者不可為 `null`、後者 `.nullable()`），與本 change
      MODIFIED 的起點一致
- [ ] 1.8 讀 `nextjs-pickball/lib/matchmaker/labels.ts`，確認 `TEAM_LABELS_BY_KEY`／
      `TEAM_LABELS` 現況與本 change 假設一致，且尚未存在名為 `DRAW_LABEL` 的匯出（避免
      §7、§8、§9 群組重複定義）
- [ ] 1.9 讀 `nextjs-pickball/lib/matchmaker/backup.ts`／`transfer-types.ts`，確認
      `BackupSchema` 目前確實透過 `RoundSchema`／`MatchHistoryEntrySchema` 組合而非重新
      宣告 `winner`（design Decision 5 的前提），這是 §9 群組「零修改也該有效」論證能成立
      的必要條件
- [ ] 1.10 讀 `nextjs-pickball/components/matchmaker/CourtCard.tsx`／`ScoreEntry.tsx`／
      `HistoryRecordCard.tsx` 現況，記錄 `onSubmitScore`／`renderTeamLabel`／`isWinner`
      等既有邏輯的實際寫法與行號，與 design Context 描述一致；確認 `ScoreEntry.tsx` 確實
      沒有複製任何比分驗證規則
- [ ] 1.11 確認 `nextjs-pickball/package.json` 目前無任何與本 change 相關的新增相依（本
      change 結束時此事實 MUST 不變，Final Review 會以 `git diff package.json` 機械確認）

## 2. 回合資料模型的 winner 擴增（round-types.ts）

Depends on: §1

- [ ] 2.1 RED: 於 `nextjs-pickball/lib/matchmaker/round-types.test.ts` 新增 it「winner 欄位新增 draw 列舉值且 completed 場次可帶 draw」：`RoundMatchSchema.safeParse` 對一個 `status: "completed"`、`winner: "draw"`、`scores` 兩隊比分相同、其餘欄位合法的物件斷言 `success: true`；另對 `winner: "tie"` 斷言 `success: false`。確認紅燈並貼出輸出
- [ ] 2.2 GREEN: 把 `nextjs-pickball/lib/matchmaker/round-types.ts` 的 `RoundMatchSchema.winner` 由 `z.enum(["teamA", "teamB"]).nullable()` 改為 `z.enum(["teamA", "teamB", "draw"]).nullable()`
- [ ] 2.3 REFACTOR: 確認 `RoundMatch`／`Round` 的衍生型別（`z.infer`）正確反映三值聯集，`tsc --noEmit` 對本檔通過；欄位旁註解補一句說明 `"draw"` 僅可能出現於計時回合（引用 `round-lifecycle` 的「比分驗證」）

## 3. 評分更新的 winnerIndex 擴增（rating-types.ts／rating.ts）

Depends on: §1

- [ ] 3.1 RED: 於 `nextjs-pickball/lib/matchmaker/rating.test.ts` 新增兩個 it：「平局時雙方 S 皆為 0.5 而非任一方視為勝負」、「平局時勢均力敵雙方 E 與 S 皆為 0.5 而變動值為零」。以 `winnerIndex: "draw"` 呼叫 `updateRatings`（此時型別尚未支援 `"draw"`，預期為 `tsc` 型別錯誤或編譯失敗）。確認紅燈並貼出輸出
- [ ] 3.2 GREEN: 把 `nextjs-pickball/lib/matchmaker/rating-types.ts` 的 `RatingUpdateInput.winnerIndex` 由 `0 | 1` 改為 `0 | 1 | "draw"`，並更新該欄位的既有 JSDoc 說明；於 `nextjs-pickball/lib/matchmaker/rating.ts` 把 `const s = winnerIndex === teamIndex ? 1 : 0;` 改為 `const s = winnerIndex === "draw" ? 0.5 : (winnerIndex === teamIndex ? 1 : 0);`
- [ ] 3.3 RED: 新增 it「平局時實力不同的雙方變動方向相反，高分方下降低分方上升」：`rating` 6.00 與 4.00（`gamesPlayed` 皆 0）以 `winnerIndex: "draw"` 呼叫 → 斷言高分方變動值 < 0、低分方變動值 > 0、兩者絕對值相等。確認紅燈（此時 GREEN 尚未驗證方向性，理論上應已因 3.2 的公式而轉綠——若寫入當下即綠，MUST 誠實標註為 regression guard）
- [ ] 3.4 REFACTOR: 確認 `applyDelta` 內對 `s` 的來源只有一處計算（不因 `winnerIndex` 是否為 `"draw"` 而複製一份 clamp／四捨五入邏輯）；`rating-types.ts` 的 JSDoc 更新「winnerIndex 表勝隊的索引」為同時涵蓋平局的完整說明

## 4. 歷史紀錄的 winner 擴增（history.ts）

Depends on: §1

- [ ] 4.1 RED: 於 `nextjs-pickball/lib/matchmaker/history.test.ts` 新增 it「winner 欄位新增 draw 列舉值時通過驗證」：`MatchHistoryEntrySchema.safeParse` 對 `winner: "draw"`（其餘欄位合法）斷言 `success: true`；對 `winner: "tie"` 斷言 `success: false`。確認紅燈並貼出輸出
- [ ] 4.2 GREEN: 把 `nextjs-pickball/lib/matchmaker/history.ts` 的 `HistoryEntryBaseSchema.winner` 由 `z.enum(["teamA", "teamB"])` 改為 `z.enum(["teamA", "teamB", "draw"])`
- [ ] 4.3 REFACTOR: 確認 `MatchHistoryEntry` 的衍生型別正確反映三值聯集，`tsc --noEmit` 對本檔通過；確認未動到 `AssertFormatCovered` 型別斷言（該斷言只與 `format` 有關，與 `winner` 無關）

## 5. 比分驗證與送出流程（round.ts）

Depends on: §2, §3, §4

- [ ] 5.1 RED: 修改 `nextjs-pickball/lib/matchmaker/round.test.ts` 既有 it「兩隊比分相同時拒絕送出」——呼叫改為 `validateScoreInput(match, "11", "11", false)`（新增第四個參數），斷言不變但 `message` 改為含「非計時回合」子字串（例如「非計時回合不得送出平局」）。同時新增 it「計時回合兩隊比分相同時允許送出」：`validateScoreInput(match, "11", "11", true)` → 斷言 `ok: true`、`scoreA: 11`、`scoreB: 11`。確認紅燈（既有測試因缺少第四個必填參數而 `tsc` 失敗，新測試因 `isTimedRound` 尚未實作而斷言不符）並貼出兩者的輸出
- [ ] 5.2 GREEN: 把 `nextjs-pickball/lib/matchmaker/round.ts` 的 `validateScoreInput` 簽章改為 `(match: RoundMatch, rawScoreA: string, rawScoreB: string, isTimedRound: boolean)`；「兩隊比分相同」分支改為 `if (scoreA === scoreB && !isTimedRound) { return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.TIE, message: TIE_MESSAGE }; }`；`TIE_MESSAGE` 常數文字更新為明確指出「非計時回合不得送出平局」（MUST 含「非計時回合」子字串以滿足 test-plan.md 的斷言，且與 match-stage 的字面要求一致）
- [ ] 5.3 RED: 新增 it「計時回合送出平局比分後場次標記為完成且 winner 為 draw」：一個計時回合（`round.timer !== null`，依 §1.3 確認的實際欄位）中 `pending` 的單打場次送出 `11` 比 `11` → 斷言 `status: "completed"`、`scores: { teamA: 11, teamB: 11 }`、`winner: "draw"`、`completedAt` 為注入的 `now`。同時新增 it「計時回合平局時 playerRatings 仍逐一對應該場每位球員」：計時回合的雙打場次送出平局 → 斷言 `playerRatings` 恰有 4 筆。確認紅燈（`submitScore` 此時仍寫死 `scoreA > scoreB ? "teamA" : "teamB"`，比分相同時會把 `winner` 誤判為 `"teamB"`）並貼出輸出
- [ ] 5.4 GREEN: 於 `submitScore` 內新增 `const isTimedRound = round.timer !== null;`（依 §1.3 實際欄位調整），傳給 `validateScoreInput`；`winner` 判定改為 `const winner: "teamA" | "teamB" | "draw" = scoreA === scoreB ? "draw" : scoreA > scoreB ? "teamA" : "teamB";`；`updateRatings` 呼叫的 `winnerIndex` 改為 `winner === "draw" ? "draw" : winner === "teamA" ? 0 : 1`；`toHistoryEntry` 的 `winner` 參數型別放寬為 `"teamA" | "teamB" | "draw"`
- [ ] 5.5 REFACTOR: 確認 `isTimedRound` 只計算一次（不在函式內重複推導）；確認 `TIE_MESSAGE` 仍集中於具名常數；確認 `toHistoryEntry` 的簽章與呼叫端一致；`pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過

> **交棒給 §6／§7 的約束**：`RoundMatch.winner` 現可為 `"draw"`，`export-scene.ts` 的
> `TEAM_LABELS_BY_KEY[match.winner]` 查表在此之後**預期會出現 `tsc` 型別錯誤**（`winner`
> 已於 §2 擴為三值，`TEAM_LABELS_BY_KEY` 仍是 `Record<"teamA" | "teamB", string>`）——這是
> design Risks 明訂的**刻意編譯期安全網**，SHALL NOT 在本群組回頭修 `export-scene.ts`
> （那是 §6 的範圍），也 SHALL NOT 為了讓 `tsc` 全綠而臨時加 `as any` 之類的收斂。

## 6. 匯出內容的平手顯示（export-scene.ts）

Depends on: §2

- [ ] 6.1 RED: 於 `nextjs-pickball/lib/matchmaker/export-scene.test.ts` 新增 it「已完成場次為平局時顯示比分與平手而非任一隊勝方」：場次 `status: "completed"`、`scores: { teamA: 11, teamB: 11 }`、`winner: "draw"` → 呼叫 `buildExportScene` 後斷言該場地區塊的狀態文字同時含 `"11"`、`"11"` 與「平手」，且不含 `TEAM_LABELS` 的任一隊隊名。確認紅燈（此時 `tsc` 因 §5 已完成的 `winner` 三值化而報型別錯誤，或執行期因 `TEAM_LABELS_BY_KEY["draw"]` 為 `undefined` 而斷言不符——兩者皆為真紅燈）並貼出輸出
- [ ] 6.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/labels.ts` 新增具名常數 `DRAW_LABEL = "平手"`（含一句 JSDoc 說明用途與出處，見 design Decision 7）；於 `export-scene.ts` 的 `buildStatusText` 新增分支：`match.winner === "draw"` 時回傳 `${match.scores.teamA}${SCORE_SEPARATOR}${match.scores.teamB}${STATUS_SEPARATOR}${DRAW_LABEL}`（不含 `WINNER_SUFFIX`），其餘（`"teamA"`／`"teamB"`）維持原有 `TEAM_LABELS_BY_KEY` 查表邏輯
- [ ] 6.3 REFACTOR: 確認 `buildStatusText` 的三個分支（未完成／勝負／平局）彼此互斥且窮舉 `winner` 的全部合法值；確認 `DRAW_LABEL` 為本檔唯一「平手」字面量的匯入來源，本檔不重複寫死；`pnpm --filter ./nextjs-pickball exec tsc --noEmit` 通過

## 7. 對戰頁的平手標籤與 UI pass-through 驗證（CourtCard.tsx）

Depends on: §2, §5

- [ ] 7.1 RED: 於 `nextjs-pickball/components/matchmaker/CourtCard.test.tsx` 新增 it「平局場次不顯示任一隊勝方標籤而顯示平手標籤」：渲染一場已完成、比分 `11:11`、`winner: "draw"` 的對戰 → 斷言第一隊與第二隊皆查不到「勝」文字標籤，且畫面另外查得到「平手」文字。同時新增 it「兩隊比分相同時 UI 仍照常委派送出而不自行攔截」：兩個比分欄位皆填入 `"11"` 後按下送出 → 斷言 `onSubmitScore` 被呼叫一次、帶入該場次識別與兩個 `"11"`。確認紅燈（前者因目前沒有任何「平手」顯示邏輯而查無此文字；後者若寫入當下即綠，MUST 誠實標註為 regression guard——`onSubmitScore` 目前本來就是無條件轉發）並貼出兩者輸出
- [ ] 7.2 GREEN: 於 `CourtCard.tsx` 匯入 `nextjs-pickball/lib/matchmaker/labels.ts` 的 `DRAW_LABEL`；於已完成場次的資訊列（`data-testid="court-${match.id}-score"` 附近）新增條件渲染：`match.winner === "draw"` 時顯示帶 `DRAW_LABEL` 文字的 `Badge`（比照既有「勝」`Badge` 的視覺權重，見 design Decision 7）
- [ ] 7.3 REFACTOR: 確認 `renderTeamLabel` 不需要為 `"draw"` 新增任何分支（`match.winner === winnerKey` 在 `winnerKey` 為 `"teamA"`／`"teamB"` 時對 `"draw"` 自然為 `false`，這是既有程式碼的正確行為，不需修改，只需在旁補一句註解說明「平手」的顯示位置不在這裡）；確認 `onSubmitScore` 委派邏輯與 §1.10 記錄的現況逐位元組相同（design Decision 6 的分層驗證）

## 8. 歷史頁的平手顯示（HistoryRecordCard.tsx）

Depends on: §4

- [ ] 8.1 RED: 於 `nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts` 新增 test「平局紀錄顯示平手而非任一隊勝方」：以 helper 種入一筆 `winner: "draw"` 的 `matchmaker:history:v1` 紀錄，開啟 `/matchmaker/history` → 斷言畫面顯示「平手」文字，第一隊與第二隊皆查不到「勝」標籤。確認紅燈並貼出輸出
- [ ] 8.2 GREEN: 於 `nextjs-pickball/components/matchmaker/HistoryRecordCard.tsx` 匯入 `DRAW_LABEL`；在既有 `isWinner={entry.winner === "teamA"}`／`isWinner={entry.winner === "teamB"}` 兩處旁新增條件渲染：`entry.winner === "draw"` 時顯示帶 `DRAW_LABEL` 文字的標籤（比照既有勝方標籤的視覺權重）
- [ ] 8.3 REFACTOR: 確認新增的平手標籤與既有勝方標籤共用同一套樣式 class（不另立一套視覺語彙）；確認本檔沒有把「平手」寫成第二份字面量

## 9. CSV 勝方欄與 JSON 匯入的回歸保護（history-csv.ts／backup.ts）

Depends on: §4, §2

- [ ] 9.1 RED: 於 `nextjs-pickball/lib/matchmaker/history-csv.test.ts` 新增 it「平局歷史的勝方欄輸出平手而非任一隊隊名」：一筆 `winner: "draw"` 的歷史紀錄匯出 CSV → 斷言該列「勝方」欄逐字為「平手」。確認紅燈（既有 `entry.winner === "teamA" ? TEAM_LABELS[0] : TEAM_LABELS[1]` 會把 `"draw"` 誤判為 `TEAM_LABELS[1]`）並貼出輸出
- [ ] 9.2 GREEN: 於 `history-csv.ts` 匯入 `DRAW_LABEL`；把「勝方」欄的 `getValue` 由二元三元運算改為三分支：`entry.winner === "teamA" ? TEAM_LABELS[0] : entry.winner === "teamB" ? TEAM_LABELS[1] : DRAW_LABEL`
- [ ] 9.3 RED: 於 `nextjs-pickball/lib/matchmaker/backup.test.ts` 新增 it「備份內回合或歷史含平局的 winner 為 draw 時仍通過驗證」：以 `buildBackup` 產生的快照中，`currentRound.matches` 或 `history` 有一筆 `winner: "draw"`，序列化後餵給 `parseBackup` → 斷言回傳成功結果，該筆 `winner` 於還原後仍為 `"draw"`。**依 design Decision 5，此測試寫入當下預期即綠**（`backup.ts` 零程式碼修改，`BackupSchema` 透過 §2／§4 的 schema 擴增自動生效）——若確實為綠，MUST 誠實標註為 regression guard 並直接進入 REFACTOR，SHALL NOT 為了製造紅燈而先破壞 `backup.ts`
- [ ] 9.4 REFACTOR: 執行 `git diff nextjs-pickball/lib/matchmaker/backup.ts nextjs-pickball/lib/matchmaker/transfer-types.ts` 確認為空，把這個結果記在本項後方作為 design Decision 5 的機械證據；確認 `history-csv.ts` 的「勝方」欄三分支窮舉 `winner` 全部合法值，且 `DRAW_LABEL` 未在本檔重複寫死

## 10. 收尾驗證

- [ ] 10.1 逐條核對六份 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 10.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/` 與 `--run components/matchmaker/` 全綠，貼出輸出
- [ ] 10.3 `pnpm lint` 通過（0 errors；既有 warning 清單沿用前幾棒紀錄，本 change 不得新增）
- [ ] 10.4 `pnpm typecheck` 通過（`pnpm -r exec tsc --noEmit`）
- [ ] 10.5 `pnpm test` 全套通過（確認未破壞既有測試與 `hono-pickball` 後端測試）
- [ ] 10.6 `pnpm --filter ./nextjs-pickball test:e2e` 全套通過，**五個 browser project 皆跑、`--workers=1`**；`matchmaker-history.spec.ts` 的既有 test 原樣通過，§8 新增的一條同步通過
- [ ] 10.7 `git diff main -- **/package.json`、`pnpm-lock.yaml` **皆為空**（零新增相依）；`git diff --stat` 確認 `hooks/`、`lib/scoreboard/**`、`scoreboard-binding.ts`、`hono-pickball/**`、`components/matchmaker/ScoreEntry.tsx` **零改動**；`nextjs-pickball/lib/matchmaker/backup.ts`／`transfer-types.ts` **零改動**（design Decision 5 的最終機械確認，複查 §9.4 的結果）
- [ ] 10.8 **Migration Plan 的人工／半自動實測（design.md「Migration Plan」一節，無法完全自動化）**：① 手動建立含 `winner: "draw"` 的 `matchmaker:round:v1`，切到**不含本 change**的 commit 啟動前端，確認 `readRound()` 回傳「無目前回合」而非拋出例外；② 對 `matchmaker:history:v1` 手動建立一筆 `winner: "draw"` 的紀錄，確認舊版只丟棄那一筆（`droppedCount` 增加 1），其餘紀錄照常顯示；③ 執行完畢後 MUST 切回本 worktree 的分支，SHALL NOT 讓 worktree 停留在錯誤的 commit 上。逐項記錄實測結果（通過／不通過與現象），**不得只憑推論略過**
- [ ] 10.9 同步 `nextjs-pickball/CLAUDE.md`（若架構總覽提及對戰頁的比分送出或歷史顯示行為，補記「計時回合可送出平局」；若無對應段落則本項記為「無需同步，未在該檔提及此細節」）
- [ ] 10.10 `DO_NOT_TRACK=1 openspec validate matchmaker-timed-draw --strict` 通過
- [ ] 10.11 六份 delta spec 各自的條目重複檢查（依 root `CLAUDE.md` 指定的 python 計數法，**不使用 BSD `uniq`**——它會把內容不同的中文標題誤判為重複）
- [ ] 10.12 **本 change 唯一容許變動的既有測試**：`nextjs-pickball/lib/matchmaker/round.test.ts` 的既有 it「兩隊比分相同時拒絕送出」（§5.1，因 `validateScoreInput` 新增第四個必填參數而必須改動呼叫與訊息斷言）。除此之外，其餘既有測試轉紅**一律視為迴歸**，不得以「本 change 需要」為由修改
- [ ] 10.13 `grep -rn "平手" nextjs-pickball/lib nextjs-pickball/components` 確認除 `labels.ts` 的 `DRAW_LABEL` 定義本身外，其餘出現處皆為 `DRAW_LABEL` 的匯入與使用，無任何獨立字面量重複（Final Review checklist 的機械化版本）
