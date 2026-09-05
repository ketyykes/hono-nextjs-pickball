> **TDD 三步**：每個行為邏輯 task 拆為 ① 新增失敗測試並用
> `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈（貼出輸出）
> ② 最小實作至綠 ③ refactor（無壞味道可註記 skipped）。**`--run` 前不可加 `--`**。
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> **紅燈要是真的**：`nextjs-pickball/components/matchmaker/MatchStage.tsx` 與
> `nextjs-pickball/app/matchmaker/page.tsx` 屬本 workspace 的 TDD 例外層
> （`app/**/page.tsx` 恆為例外；`MatchStage.tsx` 目前零單元測試、純呈現組裝，沿用既有慣例），
> §5 的兩個 GREEN task 因此不強制紅燈，以 §6 的 E2E 驗收。若某個測試加入後**立即全綠**，
> MUST 在該項後方誠實標註為 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **本 change 不得新增任何 npm 相依**。需要新套件時回報 BLOCKED。

## 1. 前置確認（不寫任何產品程式碼）

> 本節全部是「讀與記錄」，不動任何檔案內容；目的是把 design.md 的 Context／Open Questions
> 從撰寫當下的 `main` 快照變成 apply 當下的事實，避免 §2 之後整批建立在過期資訊上。

- [ ] 1.1 確認目前 cwd 為 environment.md 宣告的 worktree，且 baseline `pnpm test` 全綠；把 baseline 結果與初始 commit hash 回填 environment.md 的 Verification 三欄位
- [ ] 1.2 確認 `main` 上 **M12（`matchmaker-scoreboard-team-labels`）已合併**：於 `openspec/changes/archive/` 或 `git log --oneline main` 找到對應的合併紀錄。**找不到則立即停止並回報**，SHALL NOT 在本 change 內臆測 M12 的實際內容或逕自繼續（見 proposal 的「執行相依」）
- [ ] 1.3 讀 `nextjs-pickball/components/matchmaker/CourtCard.tsx`、`MatchStage.tsx`、`nextjs-pickball/app/matchmaker/page.tsx` 的目前內容，記錄 `CourtCardProps`／`MatchStageProps` 的實際欄位、`inProgress`／`matchSlot` 的計算方式，以及 page.tsx 如何持有 `useRoundStore` 的回傳值。與 design.md Context 段與 Open Questions 第 1、4 條逐項比對，**差異一律補記進 design.md**，不要默默改實作去遷就舊記載
- [ ] 1.4 讀 `nextjs-pickball/lib/matchmaker/round.ts` 既有的 `setTargetScore`／`resetIncompleteMatches`／`submitScore` 三個函式簽章與失敗代碼命名模式、私有函式 `resolveTeamPlayers`；讀 `nextjs-pickball/lib/matchmaker/pairing.ts` 的 `labelDoublesComposition` 匯出簽章與 `nextjs-pickball/lib/matchmaker/rating-math.ts` 的 `roundRating` 簽章。確認與 design.md Context 記載一致，§2 依實際簽章取用，SHALL NOT 另寫一套判定或計算邏輯
- [ ] 1.5 讀 `nextjs-pickball/lib/matchmaker/labels.ts` 目前收錄的常數與 `nextjs-pickball/components/ui/select.tsx`（Radix `Select` 的 shadcn 包裝）的既有用法（`PlayerForm.tsx` 的性別選單），確認可直接沿用同一組件與擺放慣例

## 2. 臨時換人純函式（round-lifecycle）

Depends on: §1

- [ ] 2.1 RED: 於 `nextjs-pickball/lib/matchmaker/round.test.ts` 補四個 it：「換人成功時以休息名單球員取代該場的在場球員」「單打場次換人後重算該隊隊伍分數為換入球員的 rating」「雙打場次換人後重算該隊隊伍分數為兩位隊員 rating 總和」「換人後換出者進入休息名單、換入者自休息名單移除」。跑單檔確認紅燈並貼出輸出
- [ ] 2.2 GREEN: 實作 `nextjs-pickball/lib/matchmaker/round.ts` 的 `swapMatchPlayer(round, matchId, outPlayerId, inPlayerId, players)` 骨架：找到 `matchId` 對應的場次與 `outPlayerId` 所在隊伍索引，以 `inPlayerId` 取代該隊 `playerIds` 中的 `outPlayerId`；該隊 `rating` 重算為換人後全體成員 `rating` 總和（沿用 `roundRating` 正規化，design Decision 2）；`restingPlayerIds` 移除 `inPlayerId`、加入 `outPlayerId`（design Decision 8：附加於陣列尾端）。本階段先只處理輸入合法的成功路徑，前置條件檢查留到 §2.6
- [ ] 2.3 RED: 補四個 it：「雙打場次換人後以換人後四位球員重新判定組成標示」「換人不影響 restCount 與 seenSignatures」「雙打場次有隊友已從名單移除時組成標示維持換人前的值」「matchId 不存在於該回合時拒絕換人」。確認紅燈
- [ ] 2.4 GREEN: 補齊雙打組成標示重算——以換人後 `[teamA 成員 0, teamA 成員 1, teamB 成員 0, teamB 成員 1]` 呼叫 `pairing.ts` 已匯出的 `labelDoublesComposition`（design Decision 3）；四位球員中任一位無法從 `players` 解析時，`doublesComposition` 維持換人前的值（design Decision 9）；確認回傳的 `seenSignatures` 為原值的參照或深層相等、不觸碰任何 `Player` 物件；新增 `matchId` 存在性檢查與對應失敗代碼
- [ ] 2.5 RED: 補四個 it：「場次非 pending 時拒絕換人」「outPlayerId 不在該場次的任一隊伍時拒絕換人」「inPlayerId 不在該輪休息名單時拒絕換人」「inPlayerId 存在於休息名單但非 active 時拒絕換人」。確認紅燈
- [ ] 2.6 GREEN: 補齊其餘四個前置條件檢查（`status === "pending"`、`outPlayerId` 屬該場任一隊伍、`inPlayerId` 屬 `restingPlayerIds`、`inPlayerId` 解析出的 `Player.isActive === true`），任一不成立回傳 `{ ok: false, code, message }` 且原回合不變。五個失敗代碼定義為 `SWAP_MATCH_PLAYER_FAILURE_CODE`（以函式名前綴命名，比照 `SET_TARGET_SCORE_FAILURE_CODE` 的既有模式，不重蹈 M3 `ROUND_FAILURE_CODE` 未以函式名命名的教訓）
- [ ] 2.7 REFACTOR: 確認本函式為純函式——零 `window`／`document`／`Blob`／`localStorage` 引用、不修改輸入的 `round`／`players`；五個失敗訊息各自具名常數，緊鄰函式定義（design Decision 7：不進 `labels.ts`）；隊伍分數重算與雙打組成標示重算各只有一處計算，SHALL NOT 在兩個分支（單打／雙打）各寫一份相同邏輯

## 3. useRoundStore 接線

Depends on: §2

- [ ] 3.1 RED: 於 `nextjs-pickball/hooks/useRoundStore.test.tsx` 補兩個 it：「swapMatchPlayer 成功時套用新回合、失敗時 round 參考不變」「尚無目前回合時呼叫 swapMatchPlayer 回傳失敗且不 dispatch」。確認紅燈
- [ ] 3.2 GREEN: 於 `nextjs-pickball/hooks/useRoundStore.ts` 新增 `swapMatchPlayer(matchId, outPlayerId, inPlayerId)` 動作，形態比照既有 `resetIncompleteMatches`／`setTargetScore`（呼叫純函式 → 判 `ok` → dispatch；`state.round === null` 時直接回傳失敗結果，不呼叫純函式，比照 `setTargetScore`／`submitScore` 既有的型別安全防線寫法）；`UseRoundStoreResult` 新增對應欄位並更新其 JSDoc

## 4. CourtCard 換人操作（match-stage）

Depends on: §2, §3

- [ ] 4.1 RED: 於 `nextjs-pickball/components/matchmaker/CourtCard.test.tsx` 補六個 it：「pending 且未開始計分的場次每位球員格皆提供換人操作」「選擇休息名單中的球員後呼叫 onSwapPlayer 並帶入場次 id、換出者與換入者 id」「已完成場次不顯示換人操作」「已有計分板槽的場次不顯示換人操作」「休息名單無 active 球員可換時換人操作停用並顯示無可換之人」「換人被拒絕時顯示帶 role alert 的繁體中文錯誤訊息」。確認紅燈
- [ ] 4.2 GREEN: 於 `nextjs-pickball/lib/matchmaker/labels.ts` 新增換人操作的兩個靜態文案具名常數（「換人」／「無可換之人」，design Decision 7）；`CourtCardProps` 新增 `onSwapPlayer: (matchId: string, outPlayerId: string, inPlayerId: string) => void` 與 `swapError: string | null` 兩個 props（design Decision 6：不新增候選人 prop）；`CourtCard` 內以既有的 `round.restingPlayerIds` 與 `players` prop 推導出「目前 active 的休息名單球員」（不修改 `PlayerTile.tsx`，容器由 `CourtCard` 自行渲染於每個球員格旁，design Decision 5）；`!completed && !inProgress` 時（沿用既有的 `inProgress` 區域變數，design Decision 4）為每位在場球員渲染一個 `Select` 觸發器：候選人清單為空時 `disabled` 並顯示「無可換之人」，否則顯示「換人」且 `aria-label` 含該球員姓名；選取候選人時呼叫 `onSwapPlayer(match.id, tile.player.id, 選取的 id)`；`swapError !== null` 時渲染帶 `role="alert"` 的訊息區塊
- [ ] 4.3 REFACTOR: 確認換人相關文案皆來自 `labels.ts` 具名常數（零裸字串）；候選人清單只計算一次並在球員格迴圈內重用；`aria-label` 的組字模板集中一處，不在每格重複拼接邏輯

## 5. MatchStage／page.tsx 接線

Depends on: §4

- [ ] 5.1 GREEN（例外層，不強制紅燈，以 §6 E2E 驗收）：`MatchStage.tsx` 新增 `onSwapPlayer: (matchId: string, outPlayerId: string, inPlayerId: string) => void` 與 `swapError: MatchStageSwapError | null` 兩個 props（`MatchStageSwapError` 型別比照既有的 `MatchStageSubmitError`：`{ matchId: string; message: string }`），下傳給每個 `CourtCard`（`swapError` 依 `matchId` 比對後轉為該卡片的 `string | null`，比照既有 `submitError` 的下傳方式）
- [ ] 5.2 GREEN（例外層，不強制紅燈，以 §6 E2E 驗收）：`app/matchmaker/page.tsx` 新增 `handleSwapPlayer(matchId, outPlayerId, inPlayerId)`：呼叫 `useRoundStore` 回傳的 `swapMatchPlayer`，失敗時以 `{ matchId, message: result.message }` 更新一個新的 `swapError` state（比照既有 `submitError` 的 `useState` 寫法），成功時清除該 state；掛入 `MatchStage` 的 `onSwapPlayer`／`swapError` props

## 6. E2E：換人操作的可存取性

Depends on: §4, §5

- [ ] 6.1 RED: 於 `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts` 補一個 test：「換人操作具備可存取名稱且可由鍵盤操作，並能區分不同球員」——種入名單並產生一輪雙打對戰（沿用既有 helper），以 Tab 依序走訪該場地區塊的四個換人操作，斷言各自可取得 focus 且四者的可存取名稱互不相同（各含所屬球員姓名）。確認紅燈或如實標註為 regression guard（unit／integration 測試無法驗證真實 Tab 順序與可存取名稱的跨元素唯一性，此測試很可能是本 change 第一次真正驗證這件事）
- [ ] 6.2 GREEN: 若 §4／§5 的既有實作已能通過，確認並貼出綠燈輸出；若可存取名稱組字方式不足以在真實 DOM 下彼此區分（例如被瀏覽器正規化空白字元），於 `CourtCard.tsx` 調整 `aria-label` 組字方式至通過

## 7. 收尾驗證

- [ ] 7.1 逐條核對 delta spec 的每個「驗收」錨點：檔案路徑存在、`it`／`test` 名稱逐字相符。以腳本抽取 `**驗收**：\`<path>\`，it 名稱「<name>」` 逐條比對，**不靠目視**
- [ ] 7.2 `pnpm --filter ./nextjs-pickball test --run lib/matchmaker/round` 與 `--run hooks/useRoundStore` 與 `--run components/matchmaker/CourtCard` 全綠，貼出輸出
- [ ] 7.3 `pnpm test` 全套通過（確認未破壞既有前端測試與 `hono-pickball` 後端測試）
- [ ] 7.4 `pnpm -r exec tsc --noEmit` 與 `pnpm lint` 皆通過（`lint` 0 errors；既有 warning 數與本 change 開工前相同，不得新增）
- [ ] 7.5 `pnpm --filter ./nextjs-pickball test:e2e --workers=1` 全套通過，既有 `match-stage.spec.ts`／`scoreboard-binding.spec.ts` 等 spec **原樣**通過
- [ ] 7.6 `git diff main -- package.json pnpm-lock.yaml` 為空（零新增相依）；`git diff main --stat` 確認 `lib/matchmaker/allocation.ts`／`pairing.ts`／`duplication.ts`／`candidates.ts`／`round-types.ts`／`components/matchmaker/PlayerTile.tsx`／`hono-pickball/**` 皆零改動、`hooks/` 目錄零新增檔案
- [ ] 7.7 `DO_NOT_TRACK=1 openspec validate matchmaker-player-swap --strict` 通過
- [ ] 7.8 spec 條目重複檢查：依 root `CLAUDE.md` 指定的 python 計數法逐標題計數，**不使用 BSD `uniq`**（macOS 的 `uniq` 會把內容不同的中文標題誤判為重複）

### 本 change 唯一容許變動的既有測試

**無**——`round.test.ts`／`useRoundStore.test.tsx`／`CourtCard.test.tsx`／`match-stage.spec.ts`
皆只**新增** it／test，不修改任何既有 it 的斷言本體。唯一例外是 `CourtCard.test.tsx` 既有的
共用 fixture 函式（例如 `buildProps`）需要**新增** `onSwapPlayer`／`swapError` 兩個欄位的
預設值（比照 M9 §7 對 `ExportActions.test.tsx` fixture 的既有裁決：「只補欄位、不動任何既有
斷言」，不計入本清單）——若 §1.3 或 §4 的 Implementer 發現既有 fixture 因此需要調整，
MUST 確認調整後**所有既有 it 的斷言本體逐字未變**，且新增欄位的預設值不改變任何既有 it
的可觀察行為（例如 `onSwapPlayer` 預設給一個不做任何事的假函式、`swapError` 預設為
`null`）。若調整過程中發現任何既有 it 的斷言因此需要改寫，**視為迴歸**，MUST 停止並回報，
不得逕自修改後沿用本裁決。
