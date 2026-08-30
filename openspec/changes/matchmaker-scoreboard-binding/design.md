## Context

見 [proposal.md](./proposal.md) 的 Why。此處只記錄影響實作結構的現狀與約束。

**現狀（本 change 撰寫時的 `main`）**：

- `lib/scoreboard/storage.ts` 只有一個 key `scoreboard:current:v1`，`readScoreboard()`／`writeScoreboard(state)`／`clearScoreboard()` 皆無參數，語意就是「全站唯一的一場」。
- `lib/scoreboard/types.ts` 的 `ScoreboardStateSchema` 已含 `targetScore`（以 `.default(11)` 做向後相容），`MatchSettings` 是「setup 期間可調、且 UNDO replay 與 RESET 後必須保留」的三欄位聚合。
- `lib/scoreboard/reducer.ts` 的 `createInitialState(overrides: Partial<MatchSettings>)` 與 `settingsOf(state)` 是一對：新增「要被保留的欄位」時只需改這兩處，不必巡視所有呼叫點。`matchId` 正好屬於這一類。
- `hooks/useScoreboardStore.ts` 的兩個 effect 順序（write 在前、read 在後、以 `hasHydratedRef` 守門、cleanup 時 reset ref）是為了避開 mount 競態與 React Strict Mode 的二次 mount。本次擴充 MUST 沿用這個結構，SHALL NOT 重寫成 `useSyncExternalStore` 之類的其他形態——那會把一個已被 E2E 驗證過的競態處理重新打開。
- `app/scoreboard/page.tsx` 是 server component，只匯出 `metadata` 與渲染 `<Scoreboard />`；`Scoreboard.tsx` 為 `"use client"`。
- 頁面為 `h-dvh` + `overflow-hidden` 鎖高，**新增節點不會撐出捲軸，只會被靜默裁切**（見 `scoreboard` spec 的「RWD 排版」Requirement）。任何動到設定列組成的改動都必須重跑多 viewport 零捲動驗收。

**M4／M5 的相依（本 change 撰寫時尚未合併回 `main`）**：

- 回合資料模型與 LocalStorage key `matchmaker:round:v1`、歷史 key `matchmaker:history:v1` 由 M4 定案；本段引用其欄位（回合的 `targetScore`、對戰方式、對戰清單的場地編號／兩隊球員／狀態／比分／勝方／完成時間）與**送出比分 pipeline** 的既有入口。
- 對戰頁路由、場地色塊元件與手動輸入送出入口由 M5 交付。
- 本文件以共用契約的語意描述這些相依，**不寫死函式名與路徑**；apply 的第一步是先對齊 M4／M5 的實際命名（見 tasks §0）。

## Goals / Non-Goals

**Goals：**

- 讓「多場地同時計分互不覆蓋」成為**資料形狀上的必然**，而非靠呼叫端小心翼翼——寫入槽位由 `state.matchId` 推導，呼叫端沒有機會傳錯。
- 讓「回填與手動輸入結果相同」可被單元測試逐欄比對：把判定與轉換抽成純函式，實際送出仍走 M4 既有入口。
- `/scoreboard` 的既有獨立用法**零行為變更**，既有進行中的比賽不因升版歸零。
- `prd.md` §11「由計分板返回時該場次已被刪除或該輪已重設」有明確且**可觀察**的處理，而不是白畫面或靜默退回。

**Non-Goals：**

- 不改計分規則、Undo、全螢幕、專注模式的任何行為。
- 不做跨分頁即時同步（`storage` 事件／`BroadcastChannel`）。
- 不在計分板顯示實際球員姓名或漸層色。
- 不做 LocalStorage 配額的主動管理（壓縮、LRU 淘汰）。回填後即清槽已使孤兒條目的來源收斂到「使用者中途放棄的場次」，量級與回合數同階。
- 不追求「回填的即時性」。回填發生在回到對戰頁時，不在計分板判勝的當下——後者需要計分板反向依賴回合模組（見 Decision 5）。

## Decisions

### Decision 1：URL search param 標示「哪一場」，storage 分槽存放「進度」，兩者分工

`?match=<matchId>` 是**這次開啟計分板是為了哪一場**的唯一來源；`scoreboard:matches:v1` 是**進度存在哪裡**。兩件事分開，是因為它們的生命週期不同：前者隨導覽與分頁存在，後者要跨重整、跨關閉瀏覽器存活。

| 替代方案 | 否決理由 |
|---|---|
| 只用 URL 參數，storage 維持單槽 | 沒解決任何問題——多場地仍互相覆蓋，直接違反 `prd.md` 13.4 |
| 只用 storage 分槽，另存一個「目前綁定的 matchId」全域欄位 | 「哪一場」變成隱藏狀態：瀏覽器上一頁、開新分頁、書籤全部會錯亂，且無法同時開兩個分頁分別計兩個場地。而分頁分計正是多場地主持人的真實用法 |
| 用 route segment `/scoreboard/[matchId]` | 要新增路由檔並讓兩個頁面共用同一份元件與 metadata；search param 對既有頁面零破壞，且 PRD 沒有「可分享連結」需求，route segment 換不到任何好處 |

### Decision 2：綁定有效性以「分槽有無該條目」判定，計分板不反查回合資料

不變式：**該 `matchId` 在 `scoreboard:matches:v1` 有條目 ⟺ 綁定有效**。維持它的兩端是——對戰頁在導向**前**寫 seed（`match-stage`），重設／重排本輪時清槽（`round-lifecycle`）。

替代方案是計分板自行讀 `matchmaker:round:v1` 反查該 `matchId` 是否還在、順便取回 `targetScore`。否決理由有三：

1. 會讓 `scoreboard` capability **反向相依**於 matchmaker 的回合模型。`/scoreboard` 是先於分配機存在的獨立工具頁，讓它去理解回合 schema，等於把 M4 的任何 schema 調整都變成計分板的迴歸風險。
2. 「取回 `targetScore`」在 seed 方案下是免費的——seed 建立時就寫進去了，不需要第二個資料來源。
3. 兩個來源會產生「回合說 15 分制、槽裡寫 11 分制」的不一致狀態，而該不一致沒有任何自然的仲裁規則。

代價是 seed 必須先寫再導向（順序錯了會閃一下失效畫面），已寫進 `match-stage` 的 Requirement 作為硬性順序。

### Decision 3：`matchId` 由 server page 讀 `searchParams` 以 prop 注入，不用 `useSearchParams()`

`app/scoreboard/page.tsx` 讀出 `searchParams` 後傳 `<Scoreboard matchId={...} />`。

替代方案是在 `Scoreboard.tsx` 內呼叫 `useSearchParams()`。否決理由：client hook 需要 Suspense 邊界，且靜態預渲染時值不可得，會出現「先以獨立模式渲染、hydrate 後才變綁定模式」的閃動——而這一瞬間的獨立模式若被 write effect 命中，就會把 seed 寫進 `scoreboard:current:v1`，正是本 change 要消滅的那類靜默污染。prop 注入另有一個測試上的好處：`Scoreboard` 與 `useScoreboardStore` 可直接餵值，不必 mock `next/navigation`。

代價見 Risks：讀 `searchParams` 會使 `/scoreboard` 由靜態預渲染轉為 dynamic rendering。

> 實作前 MUST 依 `nextjs-pickball/AGENTS.md` 的指示，先讀 `node_modules/next/dist/docs/` 內關於 `searchParams` 的段落確認 Next.js 16 的實際簽章（是否為 Promise、是否需 `await`），SHALL NOT 依訓練資料的記憶書寫。

### Decision 4：分槽採單一 map key，而非每場一個 key

`scoreboard:matches:v1` 的內容是 `Record<matchId, ScoreboardState>`，而非 `scoreboard:match:<id>:v1` 這種一場一 key。

| 替代方案 | 否決理由 |
|---|---|
| 一場一個 key | 「清除本輪全部場次」要列舉 `localStorage` 的所有 key 再用字串前綴過濾——這是全域掃描，會掃到其他 capability 的 key，且前綴比對一旦寫錯就是靜默誤刪。map 形態下同一件事是一次 `removeItem` 或一次物件過濾 |
| 存成陣列 `{ matchId, state }[]` | 查找變 O(n) 且允許重複 `matchId`；「一場一槽」是本設計的核心保證，用天生允許重複的結構表達它是本末倒置（同 M2 對 `SignatureIndex` 選 `Set` 的理由） |

代價是任一次寫入都要重寫整份 map。規模上限是場地數 1～8（`prd.md` 4.3），可忽略。

**逐筆降級**沿用 `player-roster` capability 的「LocalStorage 持久化與逐筆降級」既有做法：整份不是合法 JSON／不是物件才清整個 key，否則只丟不合法的條目並回報 `droppedCount`。理由是連坐的成本不對稱——一個場地的損壞資料清空另外七個正在進行中的場地，是使用者完全無法理解的事故。

### Decision 5：回填在「回到對戰頁」時 reconcile，不由計分板端寫回合

對戰頁掛載時讀取該輪所有場次的槽，凡 `finished` 且該場尚未完成者，經 M4 的送出 pipeline 送出，成功後清該槽。

| 替代方案 | 否決理由 |
|---|---|
| 計分板判勝的當下直接寫回合 | `scoreboard` capability 會反向相依 matchmaker（同 Decision 2），且獨立使用 `/scoreboard` 的使用者也得背這份相依 |
| 只在按下「返回對戰」按鈕時回填 | 只覆蓋一條動線。使用者用瀏覽器上一頁、直接改網址、或關掉分頁隔天再開，比分就永遠回不去。reconcile-on-mount 對所有動線都成立，按鈕只是**動線的 affordance**，不是回填的觸發點 |
| 用 `storage` 事件／`BroadcastChannel` 即時同步 | 只有「兩個分頁同時開著」才用得到，PRD 未要求；且要處理雙向衝突，複雜度與收益不成比例 |

`prd.md` 6.3.1 寫「由計分板**返回時**……自動回填」，reconcile-on-mount 正是這句話的忠實實作。

冪等由三個條件（槽為 `finished`、場次仍在回合中、場次尚未完成）與「送出後清槽」共同保證。兩道防線刻意重疊：清槽是主要機制，「尚未完成」是清槽失敗（例如 LocalStorage 寫入被配額擋下）時的最後防線——重複送出的後果是評分雙倍變動與歷史重複，代價高到值得兩道。

### Decision 6：`matchId` 進入 `ScoreboardState`，並歸入「重建初始狀態時要帶入」的欄位

`matchId` 放進 zod schema（`z.string().nullable().default(null)`）與 `MatchSettings`，而不是只當作 hook 的參數。

理由是 UNDO 的實作方式：它以「重建初始 state 後 replay `history`」還原，重建時只帶入 `MatchSettings` 的欄位。若 `matchId` 不在其中，使用者按下 Undo 的瞬間 state 會靜默變成 `matchId: null`，接著 write effect 把整場比賽寫進 `scoreboard:current:v1`——同時失去綁定、同時污染獨立計分板。這個失效路徑與既有 spec 記錄的「UNDO 後 `targetScore` 退回 11」是**完全同構**的洞，因此採用完全相同的解法與測試策略（獨立測試覆蓋，見 delta 的「UNDO 與 RESET 保留 matchId」Scenario）。

替代方案是把 `matchId` 留在 hook 層、寫入時再併入。否決理由：那讓 reducer 的輸出與實際落盤的內容不一致，`reducer.test.ts` 就再也無法用來驗證持久化語意。

### Decision 7：delta 的 ADDED／MODIFIED 逐條依「有沒有推翻既有字句」判定

判準只有一條：**新的規則有沒有讓某條既有 Requirement 的既有字句不再成立**。有，就 MODIFIED（貼完整更新後全文）；沒有，就 ADDED。本段共四個 capability，逐條判定如下。

| capability / Requirement | 判定 | 理由 |
|---|:---:|---|
| `match-stage`「場地區塊的計分板入口」「計分中場次的標示與返回後呈現」 | ADDED | 在既有場地色塊上追加新的互動入口與狀態標示，M5 既有 Requirement 的任何字句都仍然成立 |
| `match-stage`「目標分數選擇器」 | **MODIFIED** | M5 寫死「目前回合存在時，選擇器 MUST 為 `disabled`」，本段放寬為「本輪已開始計分才鎖」，直接推翻該句 |
| `round-lifecycle` 三條（回填 pipeline、鎖定判定、清槽） | ADDED | 新的生命週期步驟，M4 既有 Requirement 的字句都仍然成立 |
| `player-roster`「重置名單與二次確認」 | **MODIFIED** | 該 Requirement 明文擁有重置的**列舉 key 清單**（「目前的清單為三個 key」），本段把 `scoreboard:matches:v1` 加入清除範圍即是改寫該清單 |
| `scoreboard`「localStorage 持久化」「賽前設定與階段鎖定」 | **MODIFIED** | 前者的字句直接說了「寫入 `scoreboard:current:v1`」，後者直接說了 setup 階段可改 `targetScore`——兩句在綁定模式下不再成立 |

兩條 MODIFIED 的補充理由：

- **「目標分數選擇器」為何非改不可。** M5 的 design Decision 5 選擇「有回合就鎖」，其兩個前提是：(a) M4 沒有承諾 `targetScore` 可事後修改；(b)「開始計分」在 M5 範圍內沒有可觀察的定義。到本 milestone 兩者都不成立——M4 的 `round-lifecycle` spec 明確提供 `setTargetScore(round, n)`（且已規定「所有場次皆為 `pending` 時可改」），而計分板槽正好給了「開始計分」一個可觀察的判準。M5 Decision 5 自己也預告過「M6 接上場邊計分後若要放寬，那是一次明確的規格變更」。若不 MODIFIED 而只在 `round-lifecycle` 追加鎖定 Requirement，兩條規則會對「回合存在但全部場次 `pending`」給出相反答案，且 M5 的既有單元測試（`RoundControls.test.tsx`）會被本段的行為直接打紅——衝突會在實作時以測試失敗的形式爆出來，而不是在規格層被解決。
  **代價**：M5 既有的 it「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」需改名並改斷言，另補一條「未開始計分時 enabled 且委派 `setTargetScore`」的新測試，已列入 tasks §8。
- **「重置名單與二次確認」的基底版本。** 本 change 從**已含 M4** 的 `main` 開出，MODIFIED 的完整全文 MUST 以 M4 的三 key 版本為基底再擴為四個 key；若誤取目前主 spec 的單一 key 前身版本，archive 時會把 M4 對該 Requirement 的整段修訂靜默回退。分槽 key 的字面值取自 `lib/scoreboard/match-slots.ts` 的 `MATCH_SLOTS_KEY`（由 matchmaker 側的 key 清單模組 import），維持該 Requirement 原有的「單一來源」原則。

並行協作上的顧慮（M7 歷史頁、M8 CSV 匯出與本段並行開 worktree，三者若對**同一段** Requirement 各貼一份 MODIFIED 全文，archive 時會互相覆蓋）仍然成立，但它只支持「不要為了整齊而 MODIFIED」，不能拿來迴避真正的行為變更。實際檢查：M7／M8 的 delta 都不觸碰「目標分數選擇器」與「重置名單與二次確認」這兩段，本段的兩條 MODIFIED 沒有落在它們的改動面上。

### Decision 8：綁定模式的目標分數以唯讀文字呈現，不用 disabled 的 radiogroup

綁定模式下設定列的組成改為：場地標示（「場地 3」）、先發球方下拉、目標分數唯讀文字（「本輪 15 分制」）、「返回對戰」按鈕、專注模式按鈕。比賽形式下拉不渲染（由該輪決定），目標分數 radiogroup 不渲染。

| 替代方案 | 否決理由 |
|---|---|
| radiogroup 保留但 `disabled` | disabled 的互動控制項向使用者暗示「這裡本來可以改」，但綁定模式下它**永遠**不會解鎖，這個暗示是假的。既有 spec 的 disabled 語意是「setup 階段可改、開打後鎖住」，兩者混用會讓同一個視覺表達承載兩種不同承諾 |
| 另起一列顯示綁定資訊 | 頁面 `h-dvh` + `overflow-hidden` 鎖高，新增一列會壓縮分數面板的高度預算，且溢出的失敗模式是**靜默裁切**（見 `scoreboard` spec 的「RWD 排版」與「目標分數可見性」Requirement 都明文警告過這件事） |

先發球方保留為可調：它是每場現場決定的事（誰先發），與該輪設定無關，且不影響回填的比分。

節點數量：獨立模式 4 個控制項（比賽形式、先發球方、目標分數 radiogroup 三顆、專注模式），綁定模式為 5 個節點但其中兩個是純文字，總寬與總高不高於獨立模式。即便如此，多 viewport 零捲動驗收 MUST 在綁定 URL 下重跑一次（已列入 delta 的 Scenario 與 tasks）。

## Risks / Trade-offs

- **[讀 `searchParams` 使 `/scoreboard` 轉為 dynamic rendering]** → 該頁沒有任何資料抓取，dynamic rendering 只是多一次 Worker 呼叫，成本可忽略；`metadata` 為靜態常數，SEO 與既有的「開放索引」Requirement 不受影響。若日後量測到問題，可改為 Decision 3 的替代方案並補 Suspense 邊界，屬局部改動。

- **[M4／M5 的實際型別名、欄位名與路由常數在本文件撰寫時尚未存在]** → 本文件與 delta 一律以語意描述（「該輪的 `targetScore`」「送出比分入口」「對戰頁路由常數」），不寫死識別字。tasks §0 是一個強制的對齊步驟：apply 開始前先讀 M4／M5 的實際產物，把名稱填進 §1 之後的任務。若對齊時發現契約不符（例如回合沒有 `targetScore` 欄位），MUST 停下來回報，SHALL NOT 自行在本段補上 M4 應有的欄位。

- **[回填時機與 M5 對戰頁的 hydration 可能競態]** → reconcile 讀的是 LocalStorage，必須在 client 端 mount 後執行；若 M5 的回合狀態也在 mount 後 hydrate，兩者順序不定，可能以空回合去比對而漏掉回填。**緩解**：reconcile MUST 以「回合已 hydrate」為前置條件觸發（例如作為回合 state 的衍生效果而非獨立的 mount effect），並在 E2E 以「進入計分板 → 判勝 → 返回 → 對戰頁顯示已完成」驗收整條路徑。這與 `useScoreboardStore` 既有的 write/read effect 順序問題同源，處理方式一致：讓「資料就緒」成為觸發條件，而不是靠 effect 宣告順序碰運氣。

- **[LocalStorage 寫入超出配額]**（`prd.md` §11）→ 既有 `storage.ts` 的寫入已包 try/catch 並 `console.warn`，本段沿用。map 形態下單次寫入的 payload 是「全部場次」而非單場，配額壓力略高於一場一 key；但場地上限為 8、每場 state 含 history 陣列（每球一筆物件），量級仍在數十 KB。回填後即清槽使孤兒條目不累積。

- **[兩個分頁同時計同一場]** → 後寫入者覆蓋先寫入者，且沒有提示。判定為**可接受**：這是使用者主動製造的狀況（同一場開兩個分頁），且與既有獨立計分板在兩個分頁同開的行為一致，本段沒有讓它更差。跨分頁同步列為 Open Question。

- **[E2E 的前置資料建構成本]** → 本段的 E2E 需要「已有回合與場次」的狀態，而回合由 M4／M5 產生。**緩解**：E2E MUST 以「經 UI 建立參賽者 → 產生本輪對戰」的真實路徑鋪設前置，或以 `page.addInitScript` 直接寫入 `matchmaker:round:v1`；後者較快但會把 M4 的 schema 複製一份到測試檔，schema 一改就漂移。優先採真實路徑，僅在耗時不可接受時才用 `addInitScript`，且必須在測試檔頭註明複製來源。

- **[綁定模式的設定列在專注模式下不渲染，返回入口一併消失]** → 這是既有「專注模式」Requirement 的必然結果，已寫進 delta 作為預期行為。使用者退出專注模式即可返回，且目標分數仍由隊伍面板名稱行呈現，不會出現「不知道打幾分制」的狀況。

## Migration Plan

**無資料遷移。** 既有 `scoreboard:current:v1` 原地沿用為獨立槽，不搬移、不轉換、不刪除；新欄位 `matchId` 以 zod `.default(null)` 補值，使本次變更前寫入的資料被讀成「獨立計分板」。新 key `scoreboard:matches:v1` 於首次由對戰進入計分板時才建立。

**部署**：前後端無 API 變更，`hono-pickball` 完全不受影響，仍依 root `README.md` 的部署前手動檢查清單（lint → tsc → 前端 unit → 後端 unit → e2e → preview → 先後端後前端）。

**Rollback**：revert 本 change 的 commits 即可。回退後 `scoreboard:matches:v1` 會成為無人讀取的殘留 key（不影響任何功能，瀏覽器端可自行清除）；`scoreboard:current:v1` 內多出的 `matchId` 欄位會被舊版的 `ScoreboardStateSchema` 判為未知欄位——zod 物件預設會**剝除**未知欄位而非拒絕，因此舊版仍能正常讀取。此點 MUST 於 apply 時以一個測試實測確認（見 tasks §1），SHALL NOT 只憑推論寫進本文件。

## Open Questions

1. **計分板要不要顯示實際球員姓名／隊伍顏色？** 目前維持「我方／對方」。seed 的結構留有空間（可加 `teamLabels`），且由對戰頁寫入不會產生反向相依。本段刻意不做以控制範圍；若使用者測試顯示「不知道自己在計哪一場」仍是痛點（目前的緩解是場地標示），應另開 change。
2. **跨分頁即時同步（`storage` 事件／`BroadcastChannel`）** 是否值得？涉及雙向衝突處理，PRD 未要求，暫不做。
3. **`firstServer` 是否也該由回合決定？** 目前保留為現場可調。若日後 PRD 加入「發球權輪替」規則，此決定需重審。
4. **M4 的送出比分入口是否為純函式？** 若它同時負責持久化，「回填與手動輸入逐欄相同」的單元測試需要在同一層比對（比較回傳的回合與歷史物件）。apply 的 §0 對齊步驟需確認這一點；若該入口不可在單元層呼叫，此 Scenario 的 Tier 需由 unit 調整為 integration，並在 tasks 誠實記錄。
   **已結案（實測）**：該入口是**純函式** `submitScore(input: SubmitScoreInput): SubmitScoreResult`，位於 `nextjs-pickball/lib/matchmaker/round.ts` 第 825 行，不負責持久化、可在單元層直接呼叫。因此 test-plan 的「回填與手動輸入的送出結果逐欄相同」維持 `unit` tier，§0.2 只需複核簽章即可。
5. **對戰頁路由沒有可 import 的具名常數**（apply §0.4 實測，2026-08-24）。`match-stage` delta 要求「導向的對戰頁路由 MUST 取用 M5 既有的路由常數，SHALL NOT 另行寫死字串」，但 M5 實際只有 module-private 的 `MATCHMAKER_SECTION_HREFS`（`nextjs-pickball/lib/matchmaker/section-nav.ts` 第 13 行），未對外匯出。
   **處置**：不視為 execution-plan 所指的「上游契約不符」（缺欄位／缺型別）而停工——落差僅是「常數未匯出」，且同一份 delta 對 `TARGET_SCORE_OPTIONS` 已明文授權同一種補救（「若該 capability 只匯出型別而沒有可迭代的選項清單，MUST 於其模組補一個具名匯出再由本 capability 取用」）。本段於 `section-nav.ts` 補 `export const MATCHMAKER_ROUTE = "/matchmaker"` 並讓 `MATCHMAKER_SECTION_HREFS` 由它組成，行為零變更、既有測試不受影響。此為對 M5 檔案的**最小**改動，SHALL NOT 順手重構該模組的其他部分。

6. **apply 階段於 §1 實作完成後暫停（2026-08-24，非設計問題，為使用者要求中斷）**——工作區乾淨、tasks.md **15／78** 勾選（§0 六項 + §1 九項）。基準線見 environment.md：hono-pickball 4 檔／16 測試、nextjs-pickball 54 檔／410 測試全綠，initial commit `3fefb029`。

   **⚠️ §1 的審查狀態：Stage 1 已通過（`PASS`），Stage 2（Code-Quality Reviewer, opus）尚未派出。** 續作者 MUST 先補跑 **§1 的 Stage 2** 再往下走，SHALL NOT 因為「§1 的 task 都勾了」就當它已完成審查；但**不需要**重跑 Stage 1。

   **§1 Stage 1（Spec Reviewer, sonnet）判定：`PASS`**（結論落盤如下，續作者可直接採信）：
   - Reviewer 先把收到的派工摘錄與 worktree 內的 `specs/scoreboard/spec.md`、`test-plan.md` 逐字對照，確認派工單未被竄改，才開始審查。
   - 四個 Scenario **全數有對應測試**；四個 it 名稱（含全形符號、逗號、頓號）與 test-plan **逐字相符**；斷言確實覆蓋各自的 WHEN／THEN。
   - 四條 SHALL NOT **全數有測試把關**：損壞條目不得連坐清空其他場地（`match-slots.test.ts:52-53`）、整份損壞不得連帶清 `scoreboard:current:v1`（`:69`）、寫分槽不得寫入獨立槽（`:36`，且實作全檔未出現該 key 字串）、清除不存在的 id 不得拋錯（`:80`）。
   - **SSR 第 5 個 it 判定「不構成 scope creep」**，四點理由：該 commit（`4ef61ad`）**只改測試檔**、未新增任何 production 行為；`hasLocalStorage()` 守門早在 `1120d21` 就存在且註解已宣告沿用 `storage.ts`；`storage.test.ts:98` 已有同構的 sibling 測試；動機是 mutation 找到的真實偵測缺口。判為**測試覆蓋率補強**而非行為新增。
   - 1.8 的分工偏離判為「純記帳問題，不影響任何 Scenario 的行為覆蓋」，不予不通過；1.9 skipped 的理由經核實成立。
   - 未發現其他 scope creep：無多餘 storage key（`MATCH_SLOTS_KEY` 與 spec 表格逐字相符）、無 UI、無 spec 未要求的行為分支。

   **Stage 1 依分工不審、明文移交給 Stage 2 裁決的兩項——皆已由 Stage 2 結案（見下方 §1 Stage 2 判定）**：
   - **`MatchSlotsSchema`（`match-slots.ts:9`）曾是 dead export**——`readMatchSlots()` 改採逐筆 `ScoreboardStateSchema.safeParse` 後，這個整份 schema 已無任何呼叫點，只在註解中被提及「刻意不用」。→ **Stage 2 裁決：移除**（commit `a783873`），已自下方命名契約刪除。
   - **`console.warn` 訊息偏「描述狀況」而非「說明可採取的修正方式」**。Stage 1 判定不阻擋（這些是開發者除錯 log 而非使用者可見錯誤訊息，且 spec 該處只要求「記錄被丟棄的筆數」）。→ **Stage 2 裁決：維持現狀**，依 execution-plan 的 Escalation「風格爭議時既有 codebase 風格勝出」。

   **已落盤的審查結論（leader 於中斷前親自完成的機械複驗，續作者可直接採信、不需重做）**：依 root `CLAUDE.md`「紅燈要是真的」，以 `git show <commit>^:<path>` 複驗 §1 的四次紅燈宣稱，**四次皆為真紅燈**，無任何一項需改標為 regression guard——
   - `35551ad`（1.1 RED）：該 commit 樹內確認**不存在** `lib/scoreboard/match-slots.ts`，紅燈形式為 import 失敗，成立。
   - `95bf96e`（1.3 RED）當下的實作快照同時證明了三件事：`readMatchSlots()` 用的是**整份** `MatchSlotsSchema.safeParse`（故 1.3「逐筆降級」必紅）、JSON 解析失敗路徑**沒有** `removeItem`（故 1.5「整份非 JSON 應清 key」必紅）、`clearMatchSlots()` 是帶 `void matchIds;` 的 **no-op stub**（故 1.7「批次清除」必紅）。三者皆為斷言失敗型真紅燈。

   **§1 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**（2026-08-24，結論落盤如下，續作者可直接採信）：
   - **獨立 mutation 測試 27 次，原狀 18 轉紅／9 存活**（Implementer 自述為 6 次 1 存活，再次證明不可採信）。存活項補上斷言後 **27/27 全數轉紅**。commit `4a885ab`。
   - **最重要的發現：`readMatchSlots()` 的「解析成功但不是物件」分支零覆蓋。** 既有測試用 `"{{{"`，會在 `JSON.parse` 就拋錯而走 catch 分支，因此 `Array.isArray(parsed)` guard 與該分支整段從未被執行——拿掉 guard、整段刪除、或改成只 warn 不清除，測試全綠。而 spec 的 Scenario 逐字寫著「不是合法 JSON（**或解析後不是物件**）」，`"[]"` 這類 JSON 陣列正是該 guard 存在的唯一理由。
   - 其餘存活缺口：`clearAllMatchSlots()` 的 SSR 守門、`writeMatchSlot`／`clearMatchSlots` 的 `console.warn`、`raw === null` 早退、`hasLocalStorage()` 的 try/catch。
   - Stage 2 新增 4 個 it（既有五個 it 名稱**未更動**，仍是 spec 驗收錨點）：「整份解析後不是物件（JSON 陣列或純量）時清除分槽 key 且不動獨立槽」、「分槽 key 不存在時視為空集合，不 warn 也不觸發清除」、「寫入與批次清除遇 localStorage 拋例外時不 throw，僅 warn」、「存取 localStorage 本身即拋例外（如 Firefox 私密模式）時安全降級」；並強化既有 it「SSR（無 window）時 read／write／clear 皆不寫入也不 throw」加入 `clearAllMatchSlots()` 斷言。
   - 邊界檢查全數通過：`matchId` 空字串、槽內容為 `null`、SSR／私密模式、`QuotaExceededError`、清除範圍（三條清除路徑只碰 `MATCH_SLOTS_KEY` 或具名 `matchId`，無前綴掃描）。註解逐則檢視無重述函式名、無誤植 milestone 編號。
   - 交件驗證：`match-slots.test.ts` 9 passed、`tsc --noEmit` exit 0、前端完整單元 **55 files / 419 tests** 全綠、ESLint exit 0。

   **Stage 2 移交給 §3 的三項（MUST 寫進 §3 派工單）**：
   1. **`hasLocalStorage()` 收斂的目標形態**：新增葉節點模組 `nextjs-pickball/lib/scoreboard/storage-keys.ts`，匯出 `hasLocalStorage()`（可一併收 `STORAGE_KEY` 與 `MATCH_SLOTS_KEY`），由 `storage.ts` 與 `match-slots.ts` **單向** import。
      ❌ **不可**改成「`storage.ts` 匯出 `hasLocalStorage()` 給 `match-slots.ts` import」——§3 的核心工作正是讓 `storage.ts` import `match-slots.ts`（分派入口需要 `writeMatchSlot`），反向也成立就形成循環匯入；`lib/matchmaker/storage-keys.ts` 的頁首註解逐字記錄了同一個陷阱。
      ❌ **不可**連 `lib/matchmaker/storage-keys.ts` 那份一起收——`lib/scoreboard/` SHALL NOT import `lib/matchmaker/`（Decision 2 單向相依），反向則會讓 matchmaker 的葉節點長出專案內部相依。
      相容性：`STORAGE_KEY` 目前有三個外部匯入點（`lib/scoreboard/storage.test.ts`、`hooks/useScoreboardStore.test.tsx`、`lib/matchmaker/storage.test.ts`）。若 key 一併搬進葉節點，比照 `lib/matchmaker/storage.ts` 開頭的做法在 `storage.ts` 留一行 re-export，既有匯入點就不必改。
      收斂後 MUST **至少保留一份**「存取 localStorage 本身即拋例外」的測試（`storage.test.ts` 與 `match-slots.test.ts` 現各有一份）。
   2. **`writeMatchSlot` 的簽章收斂**（Stage 2 建議、leader 核可）：§2 讓 `ScoreboardState` 長出 `matchId` 之後，`writeMatchSlot(matchId, state)` 就有 `matchId !== state.matchId` 的靜默失效可能。§3 MUST 於其 REFACTOR 步驟收斂為由 `state.matchId` 推導（例如 `writeMatchSlot(state: ScoreboardState & { matchId: string })`），使 spec 的「寫入槽位 MUST 由 `state.matchId` 推導，SHALL NOT 由呼叫端另外傳入槽位參數」成為**結構上的必然**而非事後檢查。
      —— 此為對下方命名契約的**已核可修訂**；§1 當下不可能做（`matchId` 欄位由 §2 才加入）。`readMatchSlot(matchId)` 與 `clearMatchSlots(matchIds)` **不變**（無 state 可推導）。
   3. 非阻擋觀察（僅記錄，不需處理）：`__proto__` 作為 matchId 時該筆會靜默消失，但**不會**污染全域 `Object.prototype`（Stage 2 已實測），危害侷限且機率極低，不值得為此改用 `Object.create(null)`。

   **下一步（依序，SHALL NOT 跳過）**：
   1. ~~§1 Stage 2~~ **已完成，`PASS`**。
   2. **§2「綁定欄位與 reducer 鎖定」**（tasks 2.1～2.7，`lib/scoreboard/types.ts` 與 `reducer.ts`）。
   3. 之後依序 §3 → §4 → §5 → §6 → §7 → §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer**（execution-plan 明訂，本段任務高度集中在 `lib/scoreboard/` 與 `hooks/`，平行必然互撞）。

   **§1 Implementer 的自述事項（三項皆已由 Stage 1 裁決通過，此處僅留背景）**：
   - test-plan 之外多寫的第 5 個 it `SSR（無 window）時 read／write／clear 皆不寫入也不 throw`，動機是交件前 mutation 自測時「拿掉 `hasLocalStorage()` 守門」是**唯一存活**的一項（happy-dom 恆有 `window.localStorage`，SSR 分支從未被觸發），補測試後同一 mutation 才轉紅。
   - Implementer 自述的 mutation 自測為 6 次、1 次存活（即上述守門項），已於交件前補斷言。**Stage 2 仍 MUST 自行獨立再做一次，不採信此自述。**
   - 1.9 REFACTOR 標註 skipped 的理由是 `hasLocalStorage()` 與 `lib/scoreboard/storage.ts` 重複、但該檔未匯出此函式且 §1 不得修改它。→ **這件事該在 §3 收掉**：§3 本來就要改 `storage.ts`，屆時應評估把 `hasLocalStorage()` 收斂為單一來源，而不是讓兩份長期並存。

   **§1 已固定的命名契約（§3～§6 會 import，續作者 MUST 沿用，不要改名）**：
   `MATCH_SLOTS_KEY`、`MatchSlots`、`ReadMatchSlotsResult`、`readMatchSlots()`、`readMatchSlot(matchId)`、`writeMatchSlot(matchId, state)`、`clearMatchSlots(matchIds)`、`clearAllMatchSlots()`。
   **兩處已核可的修訂**：① `MatchSlotsSchema` 經 Stage 2 判為 dead export 並移除（`a783873`），已自本清單刪除；② `writeMatchSlot` 的簽章將於 §3 收斂為由 `state.matchId` 推導（見上方「Stage 2 移交給 §3 的三項」第 2 點）。
   註記：`match-slots.ts` 是低階 map 操作層，以 `matchId` 為鍵是既定設計；spec 的「寫入槽位 MUST 由 `state.matchId` 推導」是針對 §3 要做的**對外分派入口** `storage.ts` 的 `writeScoreboard(state)`。reviewer **不應**因 `writeMatchSlot(matchId, state)` 帶參數而判不通過。

   **這一輪的坑與提醒**：
   - **模型偏離（使用者硬性要求，非疏失）**：Implementer 一律用 `sonnet`，**不用** execution-plan 的預設 `haiku`。理由是先前 milestone 的 haiku 連續兩輪被退回（失效的假測試、複述式註解），每次退回要付一次 opus 審查成本，反而更貴。Spec Reviewer 用 `sonnet`，Code-Quality Reviewer 與 Final Reviewer 用 `opus`。**任何情況不得使用 `fable`，也不得省略 `model` 參數。**
   - **派工單 MUST 逐字貼完整原文**（該組全部 task 原文、test-plan 列、觸及的 spec Requirement 全文、相關 design Decision），SHALL NOT 只給檔案路徑要 subagent 自己去讀——schema 的 Forbidden 明列此項。四個 capability 的 delta **不得**整包貼給同一位。
   - **派工單 MUST 要求 Implementer 交件前自己先跑一輪 mutation 測試**並列出「做了幾次、每次改什麼、是否轉紅」，有存活就先補斷言再交件。§1 這樣做確實在交件前就抓出一個存活項（見上），值得延續。
   - **單檔測試 `--run` 前不可加 `--`**：`test -- --run <path>` 會讓 vitest 收不到路徑而跑完整套，紅燈證據會被既有綠燈淹沒。
   - **E2E 一律帶 `--workers=1`**（§7、§8 會用到）。預設併發下本機不穩定，先前實測三次每次失敗集合都不同，根因是 Turbopack dev 的延遲 chunk 競態。
   - **每一組做完就立刻 commit，不要囤積**——審查結論只存在 leader 的脈絡裡，一旦中斷就永久遺失（這正是本項存在的理由）。

7. **apply 階段於 §1 完成兩階段審查後再次暫停（2026-08-24，非設計問題，為使用者要求中斷）**——工作區乾淨、tasks.md **15／78** 勾選（§0 六項 + §1 九項，與第 6 項相同；本輪未新增勾選，因為 §1 的 task 早已勾完，本輪只補跑審查）。

   **本輪（第二棒 leader）實際完成的事，只有一件：把 §1 的 Stage 2 補跑完並落盤。**
   - **§1 Stage 2（Code-Quality Reviewer, opus）判定 `PASS`**，完整結論已寫在上方第 6 項內（含 mutation 表、四個新增 it 的名稱、移交 §3 的三項）。**續作者不需重跑 §1 的任何審查。**
   - mutation：**獨立做 27 次，原狀 18 轉紅／9 存活**；補完斷言後 **27／27 全數轉紅**。Implementer 自述為「6 次 1 存活」——再次證明 **Stage 2 的獨立 mutation 不可省略、不可採信 Implementer 自述**。
   - 兩項移交裁決皆已結案：**`MatchSlotsSchema` → 移除**（commit `a783873`，命名契約已同步更新）、**`console.warn` 措辭 → 維持現狀**（依 execution-plan Escalation「風格爭議時既有 codebase 風格勝出」）。
   - coordinator 交辦的第三項（`hasLocalStorage()` 全庫三份的收斂）**已完整寫進上方「Stage 2 移交給 §3 的三項」第 1 點**，含目標形態（新增葉節點 `lib/scoreboard/storage-keys.ts`）與**兩個被否決的做法及其理由**（循環匯入、單向相依）。§3 派工單直接抄那一段即可。

   **⚠️ 沒有任何審查結論只存在 leader 脈絡裡**——本項寫下時，§1 Stage 1（第 6 項）與 Stage 2（第 6 項）的判定全文皆已落盤，紅燈機械複驗結論亦已落盤。**本輪無未落盤事項。**

   **§2 的狀態：已派工、隨即依使用者指示召回，`0` 檔案異動。**
   - 派工單已送出（Implementer, `sonnet`），該 subagent 收到停止指令時**尚未修改任何檔案**，自行確認 `git status --short` 為空、無 commit。
   - 因此 **§2 是乾淨的未開始狀態**，續作者直接重派即可，不需清理、不需接續半成品。

   **下一步（依序，SHALL NOT 跳過）**：
   1. 派 **§2「綁定欄位與 reducer 鎖定」**（tasks 2.1～2.7）：`lib/scoreboard/types.ts` 加 `matchId: z.string().nullable().default(null)` 並併入 `MatchSettings`；`reducer.ts` 的 `SET_TARGET_SCORE` 在 `state.matchId !== null` 時回傳原 state；`createInitialState`／`settingsOf` 帶入 `matchId`。可修改的檔案**僅四個**：`types.ts`、`reducer.ts`、`reducer.test.ts`、`storage.test.ts`。
   2. §2 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §3 → §4 → §5 → §6 → §7 → §8 → §9。
   3. 全部群組完成後才做 Final Code Review（`opus`）。

   **§2 派工時務必先講清楚的一個連帶影響（本輪派工單已寫入，續作者請沿用）**：
   `matchId` 加入 `ScoreboardStateSchema` 後，`ScoreboardState` 型別會**多一個必填欄位**（zod 的 `.default()` 只讓輸入可省略，輸出型別仍必填——`targetScore` 已是同一個既有前例）。凡是「以物件字面量直接組出完整 `ScoreboardState`」的地方都會 tsc 失敗。
   **失敗點已由 leader 實測掃描定位（不是推測，`grep -rn ": ScoreboardState = {"` 與 `Partial<ScoreboardState>` 的完整結果）**：
   - `lib/scoreboard/rules.test.ts` **共四處**逐欄手寫的 `ScoreboardState` 字面量會炸開——第 5 行 `singlesInitial()`、第 83 行 `doublesPlaying()` 兩個 helper 的回傳物件，以及第 145、164 行的兩個 inline `const state: ScoreboardState = {...}`。四處都只需補 `matchId: null` 一行。
   - `lib/scoreboard/reducer.test.ts` 內的 11 處**不會**炸開：它們一律是 `{ ...createInitialState(), ... }` 或以 spread 為基底，`createInitialState()` 在 2.6 之後自然帶出 `matchId`。
   - 其餘檔案（`match-slots.ts`、`hooks/useScoreboardStore.ts`、`components/scoreboard/**`）只有型別標註、無逐欄字面量，**不受影響**。

   **因此 §2 的可改檔案清單 MUST 由四個擴為五個**，第五個是 `nextjs-pickball/lib/scoreboard/rules.test.ts`，且**僅限**機械性補 `matchId: null`——**it 名稱、斷言與其他欄位一律不得動**。這不是行為變更，也不算 tasks 9.5 所指的「容許變動的既有測試」（那三處指的是改名或改斷言），因此不需要額外的 spec 依據。
   仍然的規則：若 tsc 在**上述五個檔案以外**的地方失敗，**MUST 停止回報**，不得擅改、不得為了讓 tsc 過而放寬型別。

   **這一輪的坑與提醒（補充第 6 項，不重複）**：
   - **Stage 2 的價值已被本輪量化證實**：§1 的 Stage 1 判 `PASS`、Implementer 自述 mutation 只有 1 存活，但 Stage 2 獨立複做找出 **9 個存活**，其中最嚴重的一項是 `readMatchSlots()` 的「解析成功但不是物件」分支**零覆蓋**（既有測試用 `"{{{"`，會在 `JSON.parse` 就拋錯而走 catch 分支，該分支從未被執行）。**每一組都 MUST 派 Stage 2，且 MUST 要求它自行獨立 mutation。**
   - **`MatchSlotsSchema` 這類 dead export 的判準**：Stage 2 的移除理由值得沿用——「留著一個具名、已匯出、看起來完全正確的整份 schema，等於在陷阱旁邊放一塊寫著『請勿使用』的牌子」。後續若再出現「定義了但註解說刻意不用」的符號，一律移除。
   - **subagent 無法被 leader 用 TaskStop 中止**（實測：`Task ... is owned by ...; agent ... cannot stop it`）。要召回進行中的 subagent，只能用 `SendMessage` 送停止指令，它會在下一個 tool round 收到。**因此「脈絡將盡時就在派下一組之前停止」這條規則要更保守地執行**——一旦派出去就收不回即時控制權。
   - **一次只派一位、派完立刻等結果**：本輪 §1 Stage 2 跑了約 13 分鐘（opus、27 次 mutation、35 個 tool call）。估算後續每組 Implementer + Stage 1 + Stage 2 至少三次派工，時間成本要納入交棒判斷。

8. **apply 階段於 §2 完成兩階段審查後暫停（2026-08-27，非設計問題，為接力交棒）**——工作區乾淨、tasks.md **22／78** 勾選（§0 六項 + §1 九項 + §2 七項）。基準線見 environment.md（`Initial commit hash` = `3fefb02`）。

   **本輪（第三棒 leader）完成的事：§2「綁定欄位與 reducer 鎖定」實作 + Stage 1 `PASS` + Stage 2 `PASS`，共 8 個 commit。**

   **§2 實作摘要**：`types.ts` 的 `ScoreboardStateSchema` 新增 `matchId: z.string().nullable().default(null)` 並併入 `MatchSettings`（四欄位）；`reducer.ts` 的 `SET_TARGET_SCORE` guard 併排為單行 `if (state.status !== "setup" || state.matchId !== null) return state;`；`createInitialState` 與 `settingsOf` 帶入 `matchId`。未 bump 任何 storage key。

   **紅燈機械複驗（leader 親自以 `git show <commit>^:<path>` 執行，續作者可直接採信）——三處皆為真紅燈**：
   - `f51804a^` 的 `types.ts` 完全不含 `matchId`（`grep -c matchId` = 0），2.1 的新測試必紅。
   - `51765a4^` 的 `SET_TARGET_SCORE` 只有 `if (state.status !== "setup") return state;`，無 `matchId` 條件，2.3 必紅。
   - `35d5647^` 的 `createInitialState` 與 `settingsOf` 皆無 `matchId`，2.5 必紅。
   另：commit `a65f649`（2.4 GREEN）當下會讓既有 it「setup 階段可切換 targetScore 且保留 mode 與 firstServer」**暫時**失敗（`createInitialState` 尚未帶入 `matchId`，值為 `undefined` 而非 `null`），至 `bdea5e7`（2.6）修復。Implementer 已在該 commit message 中誠實揭露，兩階段審查均判定為正當的 TDD 中繼狀態。

   **§2 Stage 1（Spec Reviewer, sonnet）判定：`PASS`**：四個 Scenario 全數有對應測試、it 名稱逐字相符；既有 it 名稱**一個都沒被改**（`git diff` 中 `it(` 行只有新增 2 筆、無刪除）；既有三個 setup 轉換 it 皆已補 `matchId` 不變斷言；`z.string().nullable().default(null)` 逐字相符且 `STORAGE_KEY` 未動；`SET_MODE` 與 `SET_FIRST_SERVER` **未**被多鎖（無 scope creep）；`rules.test.ts` 僅四處機械補 `matchId: null`。Stage 1 明文移交兩項給 Stage 2（見下）。

   **§2 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**，**獨立 mutation 26 組，原狀 22 轉紅／4 存活**（Implementer 自述為 5 組全紅 —— **第三度證實 Implementer 自述不可採信，Stage 2 的獨立 mutation 不可省略**）。四個存活項的處置：
   - **`SET_FIRST_SERVER` 誤加 `matchId` guard → 存活，已補測封住。** spec 明文「`firstServer` 仍 SHALL 於 setup 階段可調整」，但原本沒有任何測試直接驗證「`matchId` 非 null 時 `SET_FIRST_SERVER` 仍生效」。
   - **`HYDRATE` 抹掉 `matchId` → 存活，已補測封住。** `HYDRATE` 原為**零測試覆蓋**（`grep HYDRATE reducer.test.ts` 無結果），而它是重整後唯一的還原路徑，掉欄位等同每次重整就靜默脫離綁定。
   - **`createInitialState` 的 `??` 改成 `||` → 存活，刻意不補**（見下方移交 §3／§5 第 1 點）。
   - **`writeScoreboard` 序列化時抹掉 `matchId` → 存活，移交 §3**（見下方第 2 點）。
   Stage 2 為此新增 commit `983197e`，只改 `reducer.test.ts`，新增兩個 it：「綁定場次時 setup 階段仍可切換 firstServer」與「HYDRATE 原樣保留帶入的 matchId」（兩者皆**不在** test-plan 中，屬測試偵測力補強而非行為新增；既有 it 名稱未動）。
   Stage 2 對 Stage 1 移交第二項的裁決：**「`matchId:"m1"` + `status:"playing"` 組合測試不值得補」** —— M12（拿掉 `matchId` 條件）與 M16（`||` 改 `&&`）各自獨立轉紅，兩個條件都已被獨立把關，組合案例在現行 OR 結構下不增加任何偵測力。
   交件驗證：`tsc --noEmit` exit 0、`lib/scoreboard/` 5 files／69 tests 全綠、**完整前端單元 55 files／424 tests 全綠**（§1 完成後基準為 419，§2 淨增 5）、ESLint exit 0。

   **§2 已固定的契約（§3～§5 會依賴）**：
   - `ScoreboardState` 多一個**必填**欄位 `matchId: string | null`；`MatchSettings` 由三欄位變**四欄位**（`mode`、`firstServer`、`targetScore`、`matchId`）。
   - `SET_TARGET_SCORE` 的 guard 為單行 `if (state.status !== "setup" || state.matchId !== null) return state;`。**SHALL NOT** 為了加條件而把它拆成兩個獨立 `if` —— Stage 2 的偵測力論證依賴目前的 OR 結構。
   - reducer 層**刻意不鎖** `SET_MODE`（UI 不提供切換入口是 §5 的事）。

   **Stage 2 移交給後續群組的三項（MUST 寫進對應派工單）**：
   1. **空字串 `matchId` 的邊界正規化（§3 與 §5）**：`/scoreboard?match=`（空 query param）會產生 `""`，而 `""` 不是 `null`，現行 guard 會視其為「已綁定」。**§5 讀 `searchParams` 時 MUST 把空字串正規化為 `null`**，否則使用者會進入「綁定到不存在場次」的 `missing` 狀態。**§3 的 `readScoreboard`／`writeScoreboard` 分派也 MUST 對 `""` 有明確定義。** Stage 2 刻意**不**在 §2 補「`createInitialState({matchId:""})` 應保留 `""`」的斷言，理由是那會把正規化責任釘死在 reducer 層，妨礙 §3／§5 在邊界處理 —— `??`（而非 `||`）是較忠實的寫法：原樣傳遞，正規化交給邊界。
   2. **`writeScoreboard` 的 `matchId` 落盤（§3）**：目前**沒有**任何測試證明 `matchId` 真的被序列化寫進 localStorage（mutation M26 存活）。§3 的 3.3「只有 `m1` 條目變動、`scoreboard:current:v1` 未被寫入」MUST 確實斷言到欄位層級，否則此洞會延續到 §3 之後。
   3. **`SET_MODE` 在綁定模式的定位（§5）**：reducer 層刻意不鎖。若 §5 決定 UI 也要鎖（綁定場次的單／雙打由該輪的對戰方式決定），MUST 在 §5 明確記載那是 **UI 層決策**，SHALL NOT 回頭改 reducer 而不更新 spec。

   **§3 派工單 MUST 一併帶入的既有交辦（來自第 6 項「Stage 2 移交給 §3 的三項」，此處不重複全文，直接抄那一段）**：
   1. `hasLocalStorage()` 三份收斂的目標形態（新增葉節點 `nextjs-pickball/lib/scoreboard/storage-keys.ts`），含**兩個被否決的做法及其理由**（循環匯入、`lib/scoreboard/` 對 `lib/matchmaker/` 的單向相依）。
   2. `writeMatchSlot` 的簽章收斂為由 `state.matchId` 推導（§2 已讓 `ScoreboardState` 長出 `matchId`，**§3 的 REFACTOR 步驟 MUST 做**）。`readMatchSlot(matchId)` 與 `clearMatchSlots(matchIds)` 不變。
   3. `__proto__` 作為 matchId 的非阻擋觀察（僅記錄，不需處理）。

   **下一步（依序，SHALL NOT 跳過）**：
   1. 派 **§3「storage 分派與 hook 綁定」**（`lib/scoreboard/storage.ts`、`hooks/useScoreboardStore.ts`）。⚠️ **execution-plan 的 Implementer 升級條款在 §3 觸發**：該組觸及 `hooks/useScoreboardStore.ts` 的 effect 順序（write 在前、read 在後、`hasHydratedRef` 守門、cleanup 時 reset ref 是刻意設計，改壞的失敗模式是靜默競態）。使用者硬性規定 Implementer 一律用 `sonnet`，此升級條款正好與之一致。
   2. §3 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §4 → §5 → §6 → §7 → §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer。**
   3. 全部群組完成後才做 Final Code Review（`opus`）。

   **⚠️ 本輪無未落盤事項**：§2 的 Stage 1 與 Stage 2 判定全文、紅燈機械複驗結論、四個 mutation 存活項的處置，皆已寫在本項內。

   **這一輪的坑與提醒（補充第 6、7 項，不重複）**：
   - **Stage 2 的獨立 mutation 連續三次證明有價值**：§1 是「Implementer 自述 1 存活 → Stage 2 找到 9」，§2 是「Implementer 自述 0 存活 → Stage 2 找到 4」。**兩次找到的最嚴重缺口都是「某個分支零測試覆蓋」**（§1 是 `readMatchSlots()` 的「解析成功但不是物件」分支，§2 是 `HYDRATE` action）。給 Stage 2 的派工單 MUST 明列「反向 mutation」（把 guard **誤加**到不該加的 case）與「零覆蓋盤點」兩種手法 —— §2 的兩個實質缺口正是靠這兩招找到的。
   - **授權 Stage 2 直接動手補斷言是划算的**：§2 的 Stage 2 自行 commit `983197e` 封住兩個存活項，省下一次退回 Implementer 的往返。但 MUST 要求它在「偏離」欄如實記載改了什麼、為什麼，且**新增的 it 名稱若不在 test-plan 中 MUST 列出並說明動機**（因為 verify 階段會機械核對 test-plan 與 it 名稱）。
   - **leader 自己要複驗紅燈，不要外包**：本輪三處 `git show <commit>^:<path>` 複驗只花一次 Bash 呼叫，卻是「紅燈要是真的」唯一的機械證據來源。
   - **§2 的實際成本**：Implementer（sonnet）約 11 分鐘／72 tool call、Stage 1（sonnet）約 1.6 分鐘／7 tool call、Stage 2（opus）約 7 分鐘／22 tool call。**§3 觸及 hook 與競態，預期顯著高於此。**

9. **§3「storage 分派與 hook 綁定」完成兩階段審查（2026-08-28，第四棒 leader）**——工作區乾淨、tasks.md **29／78** 勾選（§0 六項 + §1 九項 + §2 七項 + §3 七項）。基準線見 environment.md（`Initial commit hash` = `3fefb02`）。前端單元測試由 §2 結束時的 55 檔／424 測試增為 **55 檔／433 測試全綠**，`pnpm -r exec tsc --noEmit` exit 0，`pnpm lint` 0 error／4 warning（全部既有）。

   **本輪 §3 共 8 個 commit**（`5385f10` → `f1acee4`），全部異動落在白名單 8 檔內，未觸及 `components/**`、`app/**`、`lib/matchmaker/**`、主 spec 與 E2E。

   **§3 實作摘要**：
   - 新增葉節點 `nextjs-pickball/lib/scoreboard/storage-keys.ts`，收斂 `STORAGE_KEY`、`MATCH_SLOTS_KEY` 與 `hasLocalStorage()` 為單一來源；相依方向確認為 `storage.ts → match-slots.ts → storage-keys.ts` **單向**，`storage.ts` 與 `match-slots.ts` 各留 re-export 維持既有匯入點相容（各 3 個真實匯入點，無 dead export）。
   - `storage.ts` 的 `readScoreboard(matchId)`／`writeScoreboard(state)`／`clearScoreboard(matchId)` 依 `matchId` 分派；判斷收斂為單一 predicate `isStandaloneMatchId()`（`null` 與 `""` 皆視為獨立槽）。
   - `writeMatchSlot` 簽章收斂為 `writeMatchSlot(state: ScoreboardState & { matchId: string })`，使「寫入槽位由 `state.matchId` 推導」成為**型別層面的必然**。`readMatchSlot(matchId)`、`clearMatchSlots(matchIds)` 不變。
   - `useScoreboardStore(matchId?: string | null)` 回傳 `readonly [ScoreboardState, Dispatch<Action>, ScoreboardBindingStatus]`；`ScoreboardBindingStatus` 為 `"standalone" | "bound" | "missing"`，自該檔匯出。空字串在 hook 邊界正規化為 `null`。
   - **effect 順序、`hasHydratedRef` 守門與 Strict Mode cleanup 一行未改**；`missing` 狀態的「不寫入任何槽」guard 放在 write effect 內（`writeScoreboard` 本身無從得知槽是否存在）。
   - `bindingStatus` 以 identity-reducer 的 `useReducer` 承載而非 `useState`，因 ESLint `react-hooks/set-state-in-effect` 禁止在 effect 內同步呼叫 setter。依 Escalation「既有 codebase 風格勝出」判為合規（`hooks/useRosterStore.ts` 有同形態前例）。

   **紅燈機械複驗（leader 親自以 `git show <commit>^:<path>` 執行，續作者可直接採信）**：
   - `5385f10^` 的 `hooks/useScoreboardStore.ts` 完全不含 `bindingStatus` 與 `matchId`（grep 計數 0），3.1 為**真紅燈**。
   - 3.3 與 3.5 被誠實標為 **regression guard**：測試 commit `b1bc424` 確實排在 GREEN commit `9c821a8` **之後**，git 歷史與自述一致，**無偽造紅燈**。理由是 3.2 的實作把 `standalone`／`bound`／`missing` 建成一個內聚狀態機，拆成部分實作只會產出丟棄式程式碼。兩者皆已補 mutation 驗證。

   **§3 Stage 1（Spec Reviewer, sonnet）判定：`PASS`**：三個 Scenario 全數有對應測試、it 名稱與 test-plan 逐字相符（機械 grep 核對）；`bound` 已斷言到 `slots.m1.matchId` 欄位層級（滿足 §2 移交的 8-C）；`standalone` 以 `vi.spyOn` 斷言分槽 key **全程**未被讀寫而非只測「沒被寫」；`missing` 覆蓋「不建立新條目」與「獨立槽未寫入」兩項 SHALL NOT。無 scope creep（未碰 `app/`、`Scoreboard.tsx`、`MatchBindingNotice.tsx`，未提前讀 `searchParams`）。`git diff | grep '^[-+].*it('` 只有 4 行 `+`、**0 行 `-`**，既有 it 名稱一個都沒被動。

   **§3 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**，**獨立 mutation 35 組，25 轉紅／10 存活**（Implementer 自述為 8 次 1 存活 —— **第四度證實自述不可採信**）。補測後 7 組轉紅、3 組維持存活（其中 1 組為等價 mutant、2 組升級給 leader）。
   - Stage 2 新增 commit `2f5c11b`（補 5 個 it + 1 個既有 it 加斷言，**未改任何實作檔一行**）與 `f1acee4`（落盤 mutation 結果）。
   - **五個 test-plan 之外的新 it**（verify 階段機械核對時需知悉，皆為偵測力補強、非行為新增）：
     ① `storage.test.ts`「clearScoreboard 帶 matchId 時只清該場次分槽，不動獨立槽與其他場次」——封 `clearScoreboard` **綁定分支零覆蓋**（此為本輪最嚴重缺口，失效形式正是「清除範圍過寬」：清一個場次卻清掉獨立計分板）。
     ② `storage.test.ts`「兩個 LocalStorage key 名稱由 storage-keys 單一來源匯出」——封「key 字面值無人釘住」（所有測試都用匯出常數，改 v1→v2 全綠）。寫法比照既有 `lib/matchmaker/round-storage.test.ts`。
     ③ `useScoreboardStore.test.tsx`「matchId 為空字串時沿用獨立槽並回報 standalone」——封 hook 層正規化零覆蓋。
     ④ `useScoreboardStore.test.tsx`「綁定模式下打到結束並 UNDO 後仍只寫回該槽」——封 finished 落盤與 Decision 6 在 hook 層的第二道防線。
     ⑤ `useScoreboardStore.test.tsx`「React Strict Mode 二次 mount 不以初始 state 覆蓋既有進度」——封 design Context 指名要守的競態，**原本零覆蓋**（既有測試全在非 Strict Mode 下 render）。
     另：既有 it「寫入某場次的槽不影響其他場次與獨立槽」加一行 `readMatchSlot("m2")` 斷言（**名稱未改**），封「`readMatchSlot` 忽略 matchId 回傳 map 第一筆」。
   - Stage 2 的一次**自我修正**值得記錄：它曾為「`isStandaloneMatchId` 放寬成 `!matchId`」補一個 it，實測仍存活後才發現那是**等價 mutant**（JS 中 `string | null` 只有 `""` 與 `null` falsy，`"0"` 是 truthy），遂在 commit 前**移除該 it**——留著會是一條註解陳述為假的測試。最終測試數 433 而非 434。

   **leader 對 Stage 2 兩項升級的裁決（皆已核可，§7 MUST 照做，不得重新討論）**：

   1. **【soft navigation 會讓綁定 hook 卡死 —— §7 必處理】** read effect 的依賴陣列刻意留空（`[]`），假設「單一頁面生命週期內 `matchId` 不變」。該假設**目前無測試佐證**，且 ESLint 的 `react-hooks/exhaustive-deps` 對此發出**全 repo 唯一一處**警告。
      具體失效路徑：§7 失效畫面的「改用獨立計分板」若以 `<Link href="/scoreboard">` 或 `router.replace()` 導向，Next.js 做 **soft navigation**，`Scoreboard` 元件在同一位置被 reconcile、**不會 remount**；hook 收到新的 `matchId = null` 但 read effect 不重跑 → `bindingStatus` 永遠停在 `missing` → write effect 被 guard 擋住 → **使用者可以計分但完全不落盤，且失效畫面不會消失**。
      **已核可的處置**：§7 於 `Scoreboard` 掛 `key={matchId ?? "standalone"}` 強制 remount（或改用整頁導覽 `window.location.assign`）。這是最小改動，且**不必動 §3 已被 E2E 驗證過的 effect 結構**。
      ❌ **不採**「把 `matchId` 放進 read effect 依賴陣列」：那會牽動 `hasHydratedRef` 的語意（re-hydrate 時 state 不會回到初始值），屬結構性變更，違反 design Context「MUST 沿用這個結構」。
      §7 的 E2E test「失效畫面可切換為獨立計分板並恢復計分」正是這條路徑的驗收，**MUST 確認它真的通過而非被 reuse 的舊 DOM 蒙混**。

   2. **【合法綁定場次會先畫一幀「場次已失效」—— §7 必處理】** `bindingStatus` 的初始值在 `matchId !== null` 時保守設為 `"missing"`，而 `useEffect` 在 paint **之後**才跑（SSR 輸出亦然）。§7 若直接用 `bindingStatus === "missing"` 決定要不要渲染失效畫面，**每次進入正常場次都會閃一下錯誤訊息**。
      **已核可的處置**：§7 MUST 引入「hydrating／尚未判定」的呈現狀態（例如在 `hasHydratedRef` 尚未為真時不渲染 `MatchBindingNotice`），SHALL NOT 只靠 `bindingStatus === "missing"` 分支。
      Stage 2 **刻意沒有**把 `bindingStatus` 初值釘進測試，就是為了不擋住 §7 這個決定 —— 對應的 mutation「初始值恆為 `standalone`」目前仍存活，**這是有意保留的自由度，不是缺口**，§7 完成後應由 Final Code Review 複查是否該補測。

   **§3 已固定的契約（§4～§8 會依賴）**：
   - `useScoreboardStore(matchId?: string | null)` → `readonly [ScoreboardState, Dispatch<Action>, ScoreboardBindingStatus]`；`ScoreboardBindingStatus = "standalone" | "bound" | "missing"`，自 `hooks/useScoreboardStore.ts` 匯出。
   - `writeMatchSlot(state: ScoreboardState & { matchId: string })`（**單參數**）、`readMatchSlot(matchId)`、`clearMatchSlots(matchIds)`、`clearAllMatchSlots()`、`readMatchSlots()`。
   - `MATCH_SLOTS_KEY` 與 `STORAGE_KEY` 的單一來源為 `lib/scoreboard/storage-keys.ts`，但兩者在 `storage.ts`／`match-slots.ts` 皆有 re-export——**§6.4 由 matchmaker 側 import `MATCH_SLOTS_KEY` 時，MUST 自 `lib/scoreboard/match-slots.ts` 匯入**（`lib/matchmaker/` 不應直接依賴 `lib/scoreboard/storage-keys.ts` 這個內部葉節點）。
   - 空字串 `matchId` 已在 hook 與 `storage.ts` 兩層正規化為 `null`。**§7 讀 `searchParams` 時仍 MUST 在自己那層再正規化一次**（§2 Stage 2 的原始交辦，§3 只負責 storage／hook 層）。
   - `components/scoreboard/Scoreboard.tsx` **仍解構 2-tuple**（`const [state, dispatch] = useScoreboardStore();`）。這是刻意的——該檔屬 §7 範圍。**§7 MUST 把它改為 3-tuple 並接上 `matchId` prop。**

   **給 §5 的一項**：`writeMatchSlot` 對 `finished` 狀態的落盤現在有端到端測試護著（Stage 2 新增的第 ④ 個 it）。§5 的 `collectFinishedSubmissions` 可以放心假設「打完的場次會以 `status: "finished"` 留在槽裡」。

   **給 §6 與 Final Code Review 的一項觀察**：`clearScoreboard()` 至今**沒有任何生產端呼叫**（只有測試用），它是 §3 之前就存在的匯出，§3 只是依 tasks 3.2 為它加上分派。若 §6 的清槽走 `clearMatchSlots`／`clearAllMatchSlots` 而不用它，Final Code Review **MUST 重新評估** `clearScoreboard` 的 `matchId` 參數是否落入 dead-export 判準。

   **⚠️ 本輪無未落盤事項**：§3 的 Stage 1 與 Stage 2 判定全文、紅燈機械複驗結論、10 個 mutation 存活項的處置、兩項升級的 leader 裁決，皆已寫在本項內。

   **這一輪的坑與提醒（補充第 6、7、8 項，不重複）**：
   - **「零覆蓋盤點」比「隨手改壞幾處」有效得多**。連續三輪，Stage 2 找到的最嚴重缺口**全部**是「某個分支從未被任何測試執行」（§1 是 `readMatchSlots()` 的非物件分支、§2 是 `HYDRATE` action、§3 是 `clearScoreboard` 的綁定分支與 read effect 的 cleanup）。**後續群組的 Implementer 派工單 MUST 要求在 REFACTOR 步驟做一次逐分支機械盤點**，而不只是憑直覺挑幾處改壞——§3 的 Implementer 自述做了 8 次卻仍漏掉 5 個零覆蓋分支，正是因為只做了後者。
   - **常數的「值」本身要有人釘住**。所有測試都用匯出常數時，把 `"scoreboard:matches:v1"` 改成 `v2` 會全綠——而 storage key 是**持久化契約**，改動等同讓所有既有使用者的資料消失。`lib/matchmaker/round-storage.test.ts` 早有這個前例，§3 之前沒人沿用。
   - **等價 mutant 要辨識出來，不要為它補測**。Stage 2 自我修正的那一次示範了正確做法：補了測試仍存活 → 重新推理 → 確認語意等價 → **移除該測試**。為等價 mutant 補的測試會是一條「註解陳述為假」的測試，比沒有更糟。
   - **§3 的實際成本**：Implementer（sonnet）約 16 分鐘／88 tool call、Stage 1（sonnet）約 3 分鐘／17 tool call、Stage 2（opus）約 **23 分鐘／27 tool call**（35 組 mutation）。Stage 2 是最貴的一環，但四輪下來每次都找到 Implementer 漏掉的實質缺口，**不可省**。

   **下一步（依序，SHALL NOT 跳過）**：
   1. 派 **§4「計分板入口的純函式層」**（`lib/matchmaker/scoreboard-binding.ts`，tasks 4.1～4.7）。這是**新檔**、純函式、無 hook 無 UI，是本 change 中風險最低的一組。注意 §4.7 的單向相依驗收：該模組只相依 `lib/scoreboard/match-slots.ts` 與回合型別，**不被** `lib/scoreboard/` 反向 import（Decision 2）。
   2. §4 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §5 → §6 → §7 → §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer。**
   3. 全部群組完成後才做 Final Code Review（`opus`）。

10. **§4「計分板入口的純函式層」完成兩階段審查（2026-08-28，第四棒 leader）**——工作區乾淨、tasks.md **38／78** 勾選（§0 六 + §1 九 + §2 七 + §3 七 + §4 七 + §4 補記兩項不佔 checkbox）。前端單元測試由 §3 結束時的 55 檔／433 測試增為 **56 檔／438 測試全綠**，`pnpm -r exec tsc --noEmit` exit 0。

   **本輪 §4 共 10 個 commit**（`e657d19` → `3b3689e`），異動**僅 3 檔**：新增 `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`、新增 `nextjs-pickball/lib/matchmaker/scoreboard-binding.test.ts`、`tasks.md`。未動任何 M4／M5 既有檔。

   **紅燈機械複驗（leader 親自執行，續作者可直接採信）——三處皆為真紅燈**：
   - `e657d19^` 該模組**不存在**（`git show` 回 `fatal: path ... exists on disk, but not in 'e657d19^'`），4.1 必紅。
   - `9ca27cb^` 的模組內 `ensureMatchSlot` 計數為 0，4.3 必紅。
   - `bc366d8^` 的模組內 `mapTeamScores` 計數為 0，4.5 必紅。

   **§4 Stage 1（Spec Reviewer, sonnet）判定：初判 `NEEDS_CHANGES`，唯一不合規項為文件缺漏，leader 修正後結案為 `PASS`**：
   - 三個 Scenario 全數有對應測試、it 名稱與 test-plan 逐字相符；seed 的五項斷言齊全；「不覆蓋」的 `history` 未被漏測；隊伍對應的**中間值** `{us:11, them:7}` 有獨立斷言（不是只驗往返相等 —— 兩邊都顛倒時往返仍會相等，這正是 spec 警告的失效模式）。
   - 隊伍對應「只有一處定義」有機械證據；匯出清單無 §5 外洩；`as any`／`as unknown as` 零違規。
   - 不合規項：`da30638` 新增的 it 未記載於 tasks.md。**leader 已於 commit `248b98a` 補上**（動機、非 test-plan 條目、屬偵測力補強）。
   - **Stage 1 另抓到 leader 派工單的一處轉錄誤差**：派工單寫 §4 的 `Depends on: §1、§2`，tasks.md 實際為 `Depends on: §1`。不影響實作（§1～§3 皆已完成），但**續作者請注意：派工單的每一段引用都要從檔案複製，不要憑記憶重打**。

   **§4 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**，**獨立 mutation 第一輪 31 組／12 存活**（Implementer 自述 8 次／1 存活 —— **第五度證實自述不可採信**），修復後第二輪 35 組／**僅 3 存活**。
   - Stage 2 新增 commit `3b3689e`，**自行修復了三件實質問題**：
     ① **`ensureMatchSlot(matchId, seed)` 收斂為 `ensureMatchSlot(seed)`**（已核可）。證據是兩個 mutation 雙雙存活：`readMatchSlot(matchId)` 與 `writeMatchSlot(seed)` 用的是**不同**來源，不一致時會「讀甲場的槽、寫乙場的 seed」，是真正的靜默覆蓋。§3 對 `writeMatchSlot` 的收斂論證逐字適用，且此處更糟。行為不變、當時無生產端呼叫者，收斂零成本。
     ② **移除 `existing as ScoreboardState & { matchId: string }` 型別斷言**，改為 `{ ...existing, matchId: seed.matchId }`。原斷言會讓「槽內容 `matchId` 為 `null`（Decision 6 的 `.default(null)` 向後相容路徑正會產生此值）或屬於別場」的資料**靜默通過型別檢查**，下游 §5／§8 會把它當 `string` 用。
     ③ 移除 `createInitialState` overrides 內冗餘的 `matchId: match.id`（外層 spread 本就覆寫），使 `matchId` 只在一處決定。
   - **零覆蓋盤點揭露的重點**：`buildMatchSlotSeed` 的 `firstServer`、`servingTeam`、`serverNumber`、`isFirstServiceOfGame`、`winner`、`history` **六個欄位審前完全無人釘住**（改成任意值都全綠）。Stage 2 以整體斷言 `toEqual(createInitialState({...}))` 一次封住。**這是「零覆蓋盤點」第四度找到 Implementer 逐項 mutation 抓不到的東西。**
   - **另一個關鍵發現**：原測試資料讓 `round.format` 與 `match.format` **取相同值**，因此把 `mode: round.format` 誤改為 `match.format` 時**測試全綠**。Stage 2 已把 4.1 的 `match.format` 改為與 `round.format` 相異。**教訓：易混淆的同義欄位，測試資料 MUST 刻意取相異值**，否則取錯來源時測試不會紅。
   - **兩個 test-plan 之外的新 it**（verify 階段機械核對時需知悉）：
     ① 「尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed」（Implementer 補，封寫入分支零覆蓋與 `mode` 硬編碼）
     ② 「SSR（無 window）時 ensureMatchSlot 不寫入也不 throw，仍回傳 seed」（Stage 2 補，封 `readMatchSlot` 回 null + `writeMatchSlot` no-op 的**組合路徑**零覆蓋）
   - **最終 3 個存活 mutation 判為可接受殘留**：皆為「誤加一個目前不存在的 guard」型反向 mutation（依 `match.status` 早退、`match.teams` 長度檢查、空 `matchId` 檢查）。spec 未要求任何一項，`match.teams` 是長度恆為 2 的 tuple 型別且 §4 根本不讀它。要封住必須**新增生產行為**——**leader 裁決：不加**，維持 §4 只做 spec 要求的事。

   **leader 對 Stage 2 升級的橋接問題之裁決（已核可，§5 MUST 照做）**：

   **問題**：`RoundMatch.scores` 的實際形狀是 `{ teamA, teamB }`，而 §4 的 `RoundTeamScores` 是 `{ first, second }`。§5 回填時若直接寫 `{ first: m.scores.teamA, second: m.scores.teamB }`，**那就是 spec 明文禁止的第二處隊伍對應定義**，且是最危險的一種——寫反了比分仍是合法數字，任何驗證都攔不下來。

   **裁決：採 Stage 2 的方案 (b)，不採 (a)。**
   - ✅ **§5 MUST 把 `{teamA,teamB}` ↔ `{first,second}` 的橋接寫成 `lib/matchmaker/scoreboard-binding.ts` 內的具名匯出**（例如 `roundMatchScoresOf(match)` / `toRoundMatchScores(scores)`），使 `teamA ↔ first` 的對應在全 repo **只有一個定義處**。**SHALL NOT** 在 §5 的呼叫點就地展開成物件字面量。
   - ❌ **不採 (a)「把 `RoundTeamScores` 直接改成 `{teamA, teamB}`」**：那會動到 tasks 4.5 與 test-plan 明文寫死的 `{first: 11, second: 7}`，也會改到 Stage 1 已核可的錨點 it 斷言形狀。**apply 階段不應為了型別美觀而改寫已核可的驗收文字** —— 方案 (b) 同樣讓「唯一來源」成立，代價只是多一個具名函式。
   - **Final Code Review MUST 機械驗證**：全 repo 只有一處把 `teamA` 對應到 `first`／`us`。這是 Final Reviewer checklist「隊伍對應是否真的只有一份定義」的具體查法。

   **§4 已固定的契約（§5～§8 會 import）**：
   ```ts
   // nextjs-pickball/lib/matchmaker/scoreboard-binding.ts
   export function buildMatchSlotSeed(round: Round, match: RoundMatch): ScoreboardState & { matchId: string };
   export function ensureMatchSlot(seed: ScoreboardState & { matchId: string }): ScoreboardState & { matchId: string };  // ⚠️ 單參數
   export interface RoundTeamScores { first: number; second: number; }
   export interface ScoreboardTeamScores { us: number; them: number; }
   export function mapTeamScores(scores: RoundTeamScores, toward: "scoreboard"): ScoreboardTeamScores;
   export function mapTeamScores(scores: ScoreboardTeamScores, toward: "round"): RoundTeamScores;
   ```
   - **`ensureMatchSlot` 是單參數**（Stage 2 收斂）。**§8 的 UI 派工單若沿用舊的兩參數寫法 MUST 更正。**
   - `mapTeamScores` 是 overload，第二參數的字面值決定回傳型別；**沒有單一參數版本**。
   - §4 的三個匯出**目前皆無生產端呼叫者**（§8 的 UI 才會接上），這是**預期狀態、不是 dead export**，Final Review 不應據此判不通過。

   **給 §5 的其他提醒**：
   - **SSR 下 `ensureMatchSlot` 不會持久化**（`readMatchSlot` 回 null → `writeMatchSlot` no-op → 回傳 seed，不 throw）。**§8 的入口 MUST 在 client 事件處理器中呼叫**，否則導向後計分板會判定「場次已失效」。
   - 測試工廠 `makeRound()` 的 `matches` 恆為 `[]`、與傳入的 match 無關聯。**§5 若需要「回合含該場」的寫實資料，得自行組裝**（`collectFinishedSubmissions` 的「場次仍在回合中」條件正需要這種資料）。
   - `mapTeamScores` 對 §5 已足夠：六種顛倒／同值 mutation 全紅，偵測力充分。

   **⚠️ 本輪無未落盤事項**：§4 的 Stage 1 與 Stage 2 判定全文、紅燈機械複驗結論、12 個 mutation 存活項的處置、3 個可接受殘留的裁決、橋接問題的裁決，皆已寫在本項內。

   **這一輪的坑與提醒（補充第 6～9 項，不重複）**：
   - **「整體斷言」比「逐欄斷言」更能封住零覆蓋**。§4 原測試逐欄斷言了 5 個欄位，卻讓另外 6 個欄位完全裸奔；Stage 2 用一行 `toEqual(createInitialState({...}))` 就全部封住。**後續群組若有「以某個工廠函式為基底再覆寫少數欄位」的實作，MUST 有一個整體相等斷言**，否則工廠帶出的欄位全部無人看管。
   - **易混淆的同義欄位，測試資料 MUST 取相異值**。`round.format` vs `match.format`、`round.targetScore` vs `DEFAULT_TARGET_SCORE` 都是這種陷阱。取相同值時，「取錯來源」這個 mutation 永遠不會紅。
   - **型別斷言（`as`）會掩蓋真實不一致**，在有 `.default(null)` 向後相容欄位的專案裡尤其危險。能用 spread 重建就不要用 `as`。
   - **§4 的實際成本**：Implementer（sonnet）約 8 分鐘／60 tool call、Stage 1（sonnet）約 2.4 分鐘／11 tool call、Stage 2（opus）約 9 分鐘／19 tool call。§4 是全新檔案、無 hook 無 UI，是本 change 中最便宜的一組。

   **下一步（依序，SHALL NOT 跳過）**：
   1. 派 **§5「回填清單與目標分數鎖定判定」**（同一個 `lib/matchmaker/scoreboard-binding.ts`，tasks 5.1～5.11，**11 個 task，是本 change 最大的一組**）。派工單 MUST 帶入上方的橋接裁決、§4 的確切簽章、以及 §2 Stage 2 移交的「`SET_MODE` 在綁定模式的定位屬 UI 層決策」一項。
   2. §5 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §6 → §7 → §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer。**
   3. 全部群組完成後才做 Final Code Review（`opus`）。

11. **§5「回填清單與目標分數鎖定判定」完成兩階段審查（2026-08-28，第四棒 leader）**——工作區乾淨、tasks.md **47／78** 勾選（§0 六 + §1 九 + §2 七 + §3 七 + §4 七 + §5 十一）。前端單元測試由 §4 結束時的 56 檔／438 測試增為 **56 檔／453 測試全綠**，`pnpm -r exec tsc --noEmit` exit 0。HEAD `151eb87`。

    **⚠️ 本輪發生一次工具層停擺，處理方式記錄於此（續作者請沿用）**：§5 的第一位 Implementer 在 5.6 完成後失聯，**回報未回到 leader 手上**，留下未提交的 5.6 GREEN 達 7 小時。coordinator 介入後 leader 接手：
    - 先 `git diff` 盤點未提交內容 → 判定為合理的 5.6 GREEN。
    - **實跑驗證而非採信**：`git stash` 掉該修改後 it「槽對應的場次已不在回合中時略過且不拋錯」確實失敗，還原後 8 測試全綠 → 證實 5.5 是真紅燈、該 diff 是最小 GREEN。
    - 補上 commit `2993c88`，再派第二位 Implementer 續作 5.7～5.11。
    - **教訓一（流程）**：派出 subagent 後**不可結束回合**；脈絡將盡時應在**派工之前**乾淨停止並落盤。但單靠這條無法防「通知本身遺失」這個失效模式，因此 leader 另加了**獨立於 subagent 通知的進度監看**（輪詢 worktree `git log`，有新 commit 即發事件，長時間無進展主動示警）。**此法實測有效，續作者建議沿用。**
    - **教訓二（我自己造成的缺陷）**：原 §5 派工單的單檔測試範例誤寫成 `pnpm --filter ./nextjs-pickball test --run nextjs-pickball/lib/...`——**多了 `nextjs-pickball/` 前綴**，vitest 會回 `No test files found`。正確路徑**相對於 workspace**（`lib/matchmaker/...`）。**派工單的每一段引用都要從檔案複製，不要憑記憶重打**（Stage 1 另抓到我把 §4 的 `Depends on: §1` 誤寫為 `§1、§2`，同一類錯誤）。

    **§5 共 13 個 commit**（`7aa70dc` → `151eb87`），異動僅 3 檔：`lib/matchmaker/scoreboard-binding.ts`、`lib/matchmaker/scoreboard-binding.test.ts`、`tasks.md`。**`lib/matchmaker/round.ts` 一行未改**（Stage 1 機械確認）。

    **紅燈機械複驗（leader 親自執行，續作者可直接採信）——三處皆為真紅燈**：
    - 5.5：stash 掉 5.6 的修改後該 it 確實失敗（見上）。
    - 5.7：`3223d79^` 的實作檔匯出清單只到 `collectFinishedSubmissions`，`rawScore` 計數為 **0**（橋接函式不存在）。
    - 5.9：`c3fee9a^` 的實作檔 `lock`／`鎖定` 計數為 **0**（鎖定判定不存在）。

    **§5 Stage 1（Spec Reviewer, sonnet）判定：`PASS`**：八個 Scenario 全數有對應測試、it 名稱逐字相符（機械 grep）；`round.ts` 一行未改；匯出清單無多餘項；`as any`／`as unknown as` 零違規；既有 it 名稱 0 刪除。
    - **「回填與手動輸入的送出結果逐欄相同」的專項判定（本組最重要的一項）**：(a) 確實走「`collectFinishedSubmissions` → `toSubmitScoreInput` → `submitScore`」這條鏈，不是手工組輸入；(b) 比對方式為**先各自斷言 `completedAt`／`playedAt` 相異，再以 `stripCompletedAt`／`stripPlayedAt` 排除該欄後對整個 `round` 物件與整個 `historyEntry` 物件 `toEqual`**——是「排除完成時間後全欄比對」而非只挑幾欄，另多比了 `playerPatches` 與 `boundaryHits`；(c) 兩條路徑的 `now` 分別為 `T01:00` 與 `T02:00`，確為相異值。

    **§5 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**，**獨立 mutation 40 組，13 組有效存活**（Implementer 自述 10 次／**0 存活** —— **第六度證實自述不可採信**）。補 7 個 it 後 11 組轉紅，剩 1 組等價 mutation、1 組升級。
    - Stage 2 新增 commit `151eb87`，**生產程式碼一行未改**，只加測試與 tasks.md 紀錄。
    - **七個 test-plan 之外的新 it**（verify 階段機械核對時需知悉，皆為偵測力補強）：
      ① 「多個符合條件的槽一次全數回傳且維持走訪順序」——封「push 後 break」「回傳 slice(0,1)」「回傳前 sort 反序」三連存活（**既有 it 的預期結果只有 0 或 1 筆，完全無法分辨「一次全回」與「只回第一筆」**）
      ② 「待送出清單的 matchId 取自槽的鍵而非槽內容」——封「改用 `slot.matchId`」（槽鍵與 `slot.matchId` 在既有測試中恆等，分歧時無人發現）
      ③ 「槽為 0-0 卻已 finished 仍列入，slots 為空時回傳空清單」——封「誤加平手排除條件」＋補 `slots={}` 零覆蓋
      ④ 「場次為 scoring 尚未完成時仍列入待送出清單」——封「條件三收緊為 `!== "pending"`」
      ⑤ 「toSubmitScoreInput 的六個欄位分別取自 submission 與 context」——封「`matchId` 改取 `context.round.matches[0].id`」並直接釘住六個輸出欄位
      ⑥ 「鎖定判定掃描全部場次與全部槽而非只看第一筆」——封「只看第一筆」「第二條改 `=== "playing"`／`=== "finished"`」四項
      ⑦ 「槽已不在回合中但非 setup 時仍判定為鎖定」——封「鎖定判定誤加『槽須在回合中』」，並把 fail-closed 取捨明文釘住
    - **Stage 2 的兩項重要判斷（leader 認可）**：
      - **`toSubmitScoreInput` 的 `context` 不需要一致性檢查**，與 §4 的 `ensureMatchSlot` 雙參數問題**不同構**：`submission.matchId` 是 `SubmitScoreInput.matchId` 的**唯一**來源，`context` 完全不提供 matchId，沒有兩個來源可分歧。在純函式層再加檢查反而會製造第二個「決定 matchId 有效性」的地方。
      - **`isTargetScoreLocked` 刻意不檢查槽是否仍在回合中**（與 `collectFinishedSubmissions` 的條件②不對稱），這是 **fail-closed 取捨**：誤鎖只是改不了分制，誤放行會讓同輪各場地打不同分制。已用 it ⑦ 釘住。**§6／§8 若有人「順手補上一致性」會被測試抓到——請先回 spec 討論，不要直接改。**

    **leader 對 Stage 2 升級項（M36）的裁決 —— 已核可，下一棒的第一件事**：

    **問題**：`setTargetScore` 的拒絕條件是 `round.matches.some((m) => m.status !== "pending")`（`round.ts` 第 353 行），而 `isTargetScoreLocked` 的第一條是 `match.status === "completed"`。**差集精確等於 `status === "scoring"`**——該狀態下 `setTargetScore` 會拒絕但 `isTargetScoreLocked` 回報未鎖定，**正是 spec 明文「相反方向 SHALL NOT 出現」所禁止的方向**。mutation M36（把第一條改為 `!== "pending"`）**存活**，證明沒有任何測試守在這條界線上。

    **leader 已機械驗證的前提**：`round.ts` 只在第 109 行寫 `status: "pending"`、第 895 行寫 `status: "completed"`，**全前端生產程式碼無任何路徑寫入 `"scoring"`**（其餘出現處為 `round-types.ts:13` 的 enum 定義、`round.ts:196` 的**讀取**、`RoundControls.tsx:59` 的註解）。因此該方向目前**不可達**。

    **裁決：對齊為 `match.status !== "pending"`，並補一個 it「場次為 scoring 時目標分數鎖定」。** 理由：
    1. `isTargetScoreLocked` 是**純函式**，型別接受任何合法 `Round`，而 `RoundSchema` 明文允許 `scoring`。就函式契約而言，它對「型別允許的輸入」確實產生 spec 禁止的方向；「目前沒有寫入路徑」只讓該輸入暫時不可達，不等於函式本身方向一致。
    2. **§8 必須修改的 `components/matchmaker/RoundControls.test.tsx` 第 247 行已存在 `status: "scoring"` 的 fixture**，§8 一旦讓元件委派此判定，這個雷幾乎必然被踩到（UI 顯示未鎖定、但 `setTargetScore` 拒絕 → 使用者按了沒反應也沒說明）。
    3. 改動為一行、fail-closed、與 spec 的「若場次進入 `scoring`，該值 MUST 同時被納入第一條」逐字一致。
    **執行方式：MUST 走 TDD 三步**（先寫「場次為 scoring 時目標分數鎖定」的失敗測試並在 shell 看到紅燈，再改那一行）。**不得**順手改其他條件。此 it 不在 test-plan 中，MUST 在 tasks.md 誠實記載為 Stage 2 升級後的補強。

    **§5 已固定的契約（§6～§8 會 import）**：
    ```ts
    export interface FinishedSubmission { readonly matchId: string; readonly scores: RoundTeamScores; }
    export function collectFinishedSubmissions(round: Round, slots: MatchSlots): FinishedSubmission[];
    export interface SubmitScoreContext { readonly round: Round; readonly players: readonly Player[]; readonly now: string; }
    export function toSubmitScoreInput(submission: FinishedSubmission, context: SubmitScoreContext): SubmitScoreInput;
    export interface TargetScoreLockResult { readonly locked: boolean; readonly reason: string | null; }
    export function isTargetScoreLocked(round: Round, slots: MatchSlots): TargetScoreLockResult;
    ```
    - **`toSubmitScoreInput` 是全 repo 唯一把 `first` 對應到 `rawScoreA` 的地方**（leader 已機械驗證：其餘 `rawScoreA` 出現處皆為 `round.ts` 的參數定義，或手動輸入路徑把使用者填的字串原樣往下傳，不涉及 `first↔teamA` 語意）。**§8 SHALL NOT 在呼叫點就地展開。**
    - `TARGET_SCORE_LOCKED_REASON = "本輪已開始計分，目標分數不可更改。"` **未匯出**。**§8 應讀 `result.reason` 而非匯出該常數**（維持單一來源）。
    - **`collectFinishedSubmissions` 的輸出順序已被測試釘住為 `Object.entries(slots)` 的插入順序。** §6／§8 若要改成依場地編號排序會踩到該 it——那是預期的，改行為前請走 spec。
    - §5 的匯出目前**皆無生產端呼叫者**（§8 的 UI 才會接上），這是**預期狀態、不是 dead export**。

    **leader 對 Stage 1 另一項觀察的裁決**：Stage 1 指出 `TARGET_SCORE_LOCKED_REASON` 只陳述狀態、**未指出可採取的修正方式**，與 spec 引用的 `prd.md` §11 要求有落差。**觀察成立，但裁決為不改**：① 該字串與 spec 明文給出的範例逐字相同，spec 自身即權威；② test-plan 的 §8 E2E 錨點斷言「畫面含『本輪已開始計分，目標分數不可更改』」，改文案會直接打斷已核可的驗收錨點。**apply 階段不得為此改 spec 或改驗收文字**；若要補「請待本輪結束後再調整」應另開 change。

    **⚠️ 本輪無未落盤事項**：§5 的 Stage 1 與 Stage 2 判定全文、三處紅燈機械複驗、13 個 mutation 存活項的處置、M36 的裁決、文案的裁決，皆已寫在本項內。

    **這一輪的坑與提醒（補充第 6～10 項，不重複）**：
    - **「既有測試的預期結果太小，會讓整類 mutation 無法被分辨」**。§5 的三連存活（break／slice／sort）根源是既有 it 的期望清單長度只有 0 或 1——**回傳集合的函式 MUST 有一個「多筆同時符合」的測試**，否則「只回第一筆」與「全部回傳」在測試眼中完全相同。這是本輪最有價值的發現，後續群組凡有回傳陣列／集合的函式都適用。
    - **「兩個恆等的欄位」會讓來源錯誤無法被偵測**。槽的鍵與 `slot.matchId` 在既有測試中永遠相同，因此「改用 `slot.matchId`」全綠。與 §4 的 `round.format` vs `match.format` 是同一類陷阱：**易混淆的同源欄位，測試資料 MUST 刻意讓它們相異**。
    - **等價 mutation 要辨識出來，不要為它補測**（§4 已有先例，本輪 Stage 2 再次正確處理 `String(Number(x))`）。
    - **§5 的實際成本**：Implementer 甲（sonnet，5.1～5.6，中途失聯）、Implementer 乙（sonnet，5.7～5.11）約 12 分鐘、Stage 1（sonnet）約 2.3 分鐘／16 tool call、Stage 2（opus）約 **9 分鐘／23 tool call**（40 組 mutation）。

    **下一步（依序，SHALL NOT 跳過）**：
    1. **先做 M36 對齊**（見上方裁決）：TDD 補 it「場次為 scoring 時目標分數鎖定」→ 把 `isTargetScoreLocked` 第一條改為 `match.status !== "pending"`。可併入 §6 的派工單或單獨派一位 Implementer，但 **MUST 在 §8 動 `RoundControls` 之前完成**。
    2. 派 **§6「清除範圍」**（tasks 6.1～6.6）。⚠️ §6 會動 **M4 的既有檔**（`lib/matchmaker/storage.ts` 的 `RESET_KEYS`、`hooks/useRoundStore.ts` 的 `resetIncompleteMatches`）與**更新 M4 既有的一個 it**（`lib/matchmaker/storage.test.ts` 的「重置只移除列舉的 key，不影響 scoreboard 資料」→ 改名為「重置只移除列舉的四個 key，不影響獨立計分板資料」）。派工單 MUST 附上 `player-roster` delta 的 MODIFIED 全文與 design Decision 7，讓 Implementer 知道自己是在**改寫**既有行為而非追加。§6.4 的 `MATCH_SLOTS_KEY` **MUST 自 `lib/scoreboard/match-slots.ts` 匯入**（不要直接依賴 `lib/scoreboard/storage-keys.ts` 這個內部葉節點）。
    3. §6 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §7 → §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer。**
    4. 全部群組完成後才做 Final Code Review（`opus`）。

12. **M36 對齊與 §6「清除範圍」完成兩階段審查（2026-08-28，第五棒 leader）**——工作區乾淨、tasks.md **53／78** 勾選（§0 六 + §1 九 + §2 七 + §3 七 + §4 七 + §5 十一 + §6 六）。前端單元測試由 §5 結束時的 56 檔／453 測試增為 **56 檔／460 測試全綠**，`pnpm -r exec tsc --noEmit` exit 0。HEAD `1b8c7c1`。

    **M36 已結案**（第 11 項的裁決，本輪第一件事）。三個 commit：`0179249`（RED）／`3c4cdc0`（GREEN）／`fc5a452`（記錄）。
    - **紅燈機械複驗（leader 親自執行）**：`git show 0179249^:.../scoreboard-binding.ts` 顯示第一條當時仍為 `=== "completed"`，新 it「場次為 scoring 時目標分數鎖定」必失敗（實測輸出 `expected false to be true`）——**真紅燈**。
    - GREEN 只改一行（`anyMatchFinished` → `anyMatchStarted`，判定改為 `!== "pending"`）並改寫該函式 JSDoc（原註解「尚未有測試涵蓋 scoring 分支，故先不擴充」已不成立）。第二條、`TARGET_SCORE_LOCKED_REASON` 與其他函式一行未改。
    - Implementer 自測 4 組 mutation 全數轉紅。**§8 現在可以安全地讓 `RoundControls` 委派此判定**——該檔第 247 行的 `status: "scoring"` fixture 不再會踩到「UI 顯示未鎖定但 `setTargetScore` 拒絕」的雷。

    **§6 共 10 個 commit**（`a7247fa` → `1b8c7c1`），異動 6 個生產／測試檔 + `tasks.md`：`lib/matchmaker/scoreboard-binding.ts`／`.test.ts`、`lib/matchmaker/storage.ts`／`.test.ts`、`hooks/useRoundStore.ts`／`.test.tsx`。**`lib/matchmaker/round.ts` 一行未改**（Stage 1 機械確認，`git diff` 對該檔為空）；`components/**`、`app/**`、`tests/e2e/**` 全未觸及。

    **紅燈機械複驗（leader 親自執行，續作者可直接採信）——兩處皆為真紅燈**：
    - 6.1：`git show a7247fa^:.../scoreboard-binding.ts` 的 `clearDiscardedMatchSlots` 計數為 **0**（函式不存在），紅燈形式為 `TypeError: clearDiscardedMatchSlots is not a function`。
    - 6.3：`git show 7007fa0^:.../storage.ts` 的 `RESET_KEYS` 為三元素（無 `MATCH_SLOTS_KEY`），改名擴充後的 it 必失敗。
    - 6.5 標為 **regression guard**（寫下當下即綠，因 6.4 已讓整個分槽 key 被 `removeItem`）——標註誠實，Stage 2 獨立複驗 M20（移除 `MATCH_SLOTS_KEY`）確實轉紅。

    **§6 的實作形狀（§7／§8 會用到）**：
    ```ts
    export function clearDiscardedMatchSlots(previousRound: Round, nextRound: Round): void;
    ```
    - 以「重排前」與「重排後」兩份回合的 `matches[].id` 取差集算出被丟棄的場次，委派 `clearMatchSlots(ids)`。**刻意不依 `match.status` 二次判定**——那會製造第二個「決定清哪些槽」的定義處（spec SHALL NOT 條款），已由 Stage 2 新增的 it「被丟棄的場次不是 pending 時同樣清除其槽」釘住。
    - `hooks/useRoundStore.ts` 的 `resetIncompleteMatches()` 只負責接線：`result.ok` → `dispatch` → `clearDiscardedMatchSlots(previousRound, result.round)`。
    - `lib/matchmaker/storage.ts` 的 `RESET_KEYS` 現為**四元素**，第四個是 `MATCH_SLOTS_KEY`，**import 自 `lib/scoreboard/match-slots.ts`**（不是 `lib/scoreboard/storage-keys.ts` 這個內部葉節點）。matchmaker 側全域無第二份 `"scoreboard:matches:v1"` 字面值（Stage 1 grep 確認，測試檔也是 import）。

    **§6 Stage 1（Spec Reviewer, sonnet）判定：`PASS`**：三個驗收錨點 it 名稱逐字相符（機械 grep）；舊名稱「重置只移除列舉的 key，不影響 scoreboard 資料」全 repo 已不存在（§9.1 會再核一次）；四條 SHALL NOT 全數有測試把關；唯一新增匯出符號為 `clearDiscardedMatchSlots`，無 scope creep；`round.ts` 與 `ResetRosterDialog.tsx` 皆一行未改；6.6 skipped 的理由經自行 grep 複驗成立。

    **§6 Stage 2（Code-Quality Reviewer, opus）判定：`PASS`**，**獨立 mutation 35 組，10 組存活**（Implementer 自述 6 次／**0 存活** —— **第七度證實自述不可採信**）。補 3 個 it 後轉紅 3 組，其餘判為等價或超出本組範圍。
    - Stage 2 新增 commit `030068d`，**生產程式碼一行未改**。
    - **三個 test-plan 之外的新 it**（verify 階段機械核對時需知悉，皆為偵測力補強）：
      ① 「同時丟棄多場時每一場的槽都被清除」——封住「只處理第一筆」（`.slice(0,1)`）與「只清最後一筆」（`.slice(-1)`）兩組。**既有 it 只有一場被丟棄，完全無法分辨「全清」與「只清一筆」** —— 這是第 11 項那條教訓（回傳／處理集合的邏輯 MUST 有「多筆同時符合」的測試）在本輪的**再次命中**。
      ② 「被丟棄的場次不是 pending 時同樣清除其槽」——封住反向 mutation「在 `clearDiscardedMatchSlots` 內再依 status 判定一次」。
      ③ 「沒有場次被丟棄時不清除任何槽」——零筆丟棄路徑的邊界覆蓋。
    - **另修掉一條恆真斷言**（派工單點名的高風險盲點，實測命中）：原 `expect(nextRound.matches[0]).toEqual(m1)` 中 `nextRound = makeRound({ matches: [m1] })`，`nextRound.matches[0]` **就是 `m1` 本身**，斷言恆真、零偵測力。改為與呼叫前 `structuredClone(m1)` 比對後，「就地竄改保留場次的 status／scores」兩組 mutation 由存活轉紅。**Stage 2 動了既有 it 內的一條斷言（it 名稱未動），leader 認可**——留著零偵測力的斷言比改掉它更糟。
    - **邊界已實測（非推論）**：`previousRound.matches` 空陣列、場次 id 重複、`setItem` 拋 `QuotaExceededError`、`MATCH_SLOTS_KEY` 不存在時 `resetMatchmakerData()` —— 四項皆安全。`previousRound === nextRound` 時會呼叫 `clearMatchSlots([])`，有一次多餘的 `setItem`（key 原不存在時會被建成 `{}`），行為層無影響，已記入 tasks.md 為觀察。

    **leader 對 Stage 2 唯一升級項的裁決 —— 已核可並完成（commit `3acdfa8`、`1b8c7c1`）**：
    - **問題**：`useRoundStore.resetIncompleteMatches()` 原寫成 `if (result.ok && previousRound !== null)`。`previousRound !== null` 是**不可達分支**（`resetIncompleteMatchesPure` 在 `round === null` 時必回 `ok: false`），但它同時守住了 `dispatch` **與**清槽兩條語句——若日後純函式契約改變而出現「`ok: true` 但 `previousRound === null`」，成功的重排會連 `dispatch` 一起被靜默跳過（回合完全不更新且無任何錯誤回報）。這是**遮蔽真實錯誤**，不是無害的型別收斂。
    - **裁決**：把 null 判斷的作用範圍縮到**只包住清槽**，`dispatch` 只依賴 `result.ok`。屬**行為不變的 refactor**（該分支不可達），故不走新紅燈，改以「既有測試原樣全綠 + 兩組 mutation」證明把關仍在（刪清槽 → 紅、刪 dispatch → 紅，皆已實測）。
    - **不使用非空斷言 `!`** —— leader 機械確認本 repo 生產程式碼一處都沒有，改採「條件範圍縮小」的等價寫法。

    **§6 的實際成本**：Implementer（sonnet，6.1～6.6）約 12 分鐘／86 tool call、Stage 1（sonnet）約 2.3 分鐘／23 tool call、Stage 2（opus）約 **8 分鐘／24 tool call**（35 組 mutation）、refactor Implementer（sonnet）約 4 分鐘。

    **這一輪的坑與提醒（補充第 6～11 項，不重複）**：
    - **「恆真斷言」是新的一類偵測力缺口，且極難以目視發現**。`expect(nextRound.matches[0]).toEqual(m1)` 看起來很像在驗證「保留場次不變」，實際上兩邊是**同一個物件參考**。凡是「用同一批 fixture 物件組出輸入、又拿其中一個去比對輸出」的斷言都有此風險——**要比對「不被就地竄改」，MUST 與呼叫前的深拷貝（`structuredClone`）比對**。後續 §7／§8 的派工單已加入此檢查點。
    - **第 11 項的「多筆同時符合」教訓在本輪再次命中**（§5 是三連存活、§6 是兩連存活）。這已是連續兩組，**凡函式處理集合／陣列，測試資料 MUST 至少放兩筆同時符合的項目**——請直接寫進後續每一張派工單。
    - **「不可達分支的 guard 放錯位置」是靜默失效的來源**。守住多條語句的 guard，其不可達性是靠上游契約保證的；契約一改，被連坐跳過的是那些**不需要**該 guard 的語句。原則：**guard 的作用範圍 MUST 只包住真正需要它的那一條語句。**

    **下一步（依序，SHALL NOT 跳過）**：
    1. 派 **§7「計分板 UI 接線」**（tasks 7.1～7.7）。⚠️ 三個必處理的坑（§3 落盤）：(a) soft navigation 會讓綁定 hook 卡死，需在 `Scoreboard` 外層用 `key={matchId ?? "standalone"}` 強制 remount；(b) 合法場次會先閃一幀失效畫面，需有「尚未判定」的呈現狀態；(c) §7.4 的路由常數需先在 `lib/matchmaker/section-nav.ts` **新增一行** `export const MATCHMAKER_ROUTE = "/matchmaker"` 並讓既有的 `MATCHMAKER_SECTION_HREFS` 由它組成（行為零變更，第 5 項已核可）。
    2. §7 完成後跑 Stage 1（`sonnet`）→ Stage 2（`opus`），再依序 §8 → §9。**群組之間嚴格序列，禁止平行派 Implementer。**
    3. 全部群組完成後才做 Final Code Review（`opus`）。

13. **⛔ §7 開工前發現的阻塞：綁定模式的「場地標示」目前沒有任何資料來源（2026-08-28，第五棒 leader，尚未解決）**

    **狀態**：§7 **一個 task 都還沒派**，工作區乾淨、HEAD 為 `4ffdbc5`、tasks.md 53／78。M36 與 §6 皆已結案（見第 12 項）。**這不是實作缺陷，是計畫本身的洞**，依 execution-plan 的 Escalation「計畫本身錯誤 → 升級給人類」停在派工**之前**。

    **落差**：`scoreboard` delta 的「對戰場次綁定與失效處理」Requirement 第 224 行明文要求

    > **返回動線**：綁定模式的設定列 MUST 提供「返回對戰」入口導回對戰頁，並 MUST 顯示該場的**場地標示（形如「場地 3」）**，使多場地並行時使用者能確認自己正在計哪一場。

    且其 Scenario「綁定模式顯示場地標示與返回入口」的 GIVEN 是**只帶 `?match=` 一個參數**：

    > - **GIVEN** 以 `/scoreboard?match=<場地 3 的 matchId>` 開啟
    > - **驗收**：`tests/e2e/specs/scoreboard-binding.spec.ts`，test 名稱「綁定模式顯示場地標示且返回對戰可回到對戰頁」

    但**計分板拿不到場地編號**。leader 已機械確認三件事：
    - `lib/scoreboard/` 全目錄 `grep -i court` **零命中** —— `ScoreboardStateSchema`（`types.ts:21-39`）的欄位為 `mode`／`scores`／`servingTeam`／`serverNumber`／`isFirstServiceOfGame`／`history`／`status`／`winner`／`firstServer`／`targetScore`／`matchId`，**沒有場地編號**。
    - `buildMatchSlotSeed`（§4，`lib/matchmaker/scoreboard-binding.ts`）`grep courtNumber` **零命中** —— 它收得到 `match.courtNumber`（§0 對齊表已記載此欄位名），但沒有寫進 seed；即使寫了，zod 物件預設會**剝除**未知欄位，落盤時會被丟掉。
    - Decision 2 明文**禁止**計分板自行讀 `matchmaker:round:v1` 反查（「會讓 `scoreboard` capability 反向相依於 matchmaker 的回合模型」）。

    ⇒ 三條路全斷：**槽裡沒有、seed 不帶、不准反查**。§7.3／§7.4 的驗收錨點在現況下**無法滿足**。

    **leader 已排除的替代方案**：
    - ❌ **改由 URL 傳（`?match=<id>&court=3`）**：直接牴觸上述 Scenario 的 GIVEN（明文只帶 `?match=`），且會讓「場地標示」可被使用者竄改。
    - ❌ **計分板讀 `matchmaker:round:v1` 取場地編號**：Decision 2 的禁令雖然字面寫的是「來推導目標分數或場次是否存在」，但其理由（避免反向相依於回合 schema）對場地編號**完全同等適用**，屬明顯違反設計意圖。
    - ❌ **不顯示場地標示**：該句是 MUST，且它是 `prd.md` 13.4「多場地同時計分」的辨識手段；design Open Question 1 也把「場地標示」當成「不顯示球員姓名」的**緩解措施**，拿掉等於同時廢掉兩者。

    **leader 建議的解法（需人類核可後才可執行）**：把場地編號納入落盤狀態。

    具體範圍（已盤點，全部是**重新打開已結案的群組**）：
    1. `lib/scoreboard/types.ts`：`ScoreboardStateSchema` 新增 `courtNumber: z.number().int().positive().nullable().default(null)`，並把它加進 `MatchSettings`（它必須在 UNDO／RESET 後被保留，與 `matchId` 同理——Decision 6 的失效路徑對它同構）。→ **§2 的範圍**
    2. `lib/scoreboard/reducer.ts`：`createInitialState()` 與 `settingsOf()` 各加一欄。→ **§2 的範圍**
    3. `lib/matchmaker/scoreboard-binding.ts`：`buildMatchSlotSeed()` 由 `match.courtNumber` 帶入。→ **§4 的範圍**
    4. 對應的 RED 測試（`reducer.test.ts`／`storage.test.ts`／`scoreboard-binding.test.ts`），含「舊版資料缺 `courtNumber` 時補為 `null` 且不清除 key」的向後相容測試。

    **為何 leader 判斷此解法「與 delta spec 相容、不需要改 spec」（供人類覆核）**：
    - 「分數自動保存」Scenario 的措辭是「保存內容**含**分數、發球狀態、history、`mode`、`firstServer`、`targetScore` 與 `matchId`」——**「含」為非窮舉**，多一個欄位不使該句為假。
    - 同一 Requirement 的**向後相容策略**已明文**預先授權**新增欄位的做法：「往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值……SHALL NOT 因新增欄位而 bump storage key」。本解法逐字照辦。
    - 「賽前設定與階段鎖定」只說「`matchId` MUST 隨 `mode`、`firstServer`、`targetScore` 一併被視為『重建初始狀態時要原樣帶入』的欄位」，未排除其他欄位。

    **為何 leader 仍不自行裁決而升級（誠實說明）**：
    - 它動的是**持久化契約**（`ScoreboardStateSchema`），而該 Requirement 自己就用整段篇幅警告此處改壞的失效模式是**靜默的**（使用者重整後分數歸零）。這是本 change 風險最高的一處。
    - 它需要**重新打開 §2 與 §4 兩個已通過兩階段審查的群組**，而 execution-plan 對「已結案群組的再開啟」沒有任何規範（沒說要不要重跑該組的 Stage 1／Stage 2）。
    - 誤判的成本不對稱：若人類其實傾向「改 spec 拿掉場地標示」或「§7 先不做這一條、另開 change」，leader 逕行擴充 schema 會製造一個難以回收的既成事實。

    **需要人類決定的三個選項**：
    - **(A)** 核可上述解法（擴充 `ScoreboardStateSchema` 的 `courtNumber`）。若核可，請一併指示：**§2／§4 是否需要重跑 Stage 1／Stage 2**，或以「§7 的兩階段審查一併涵蓋這四項改動」處理。
    - **(B)** 改 delta spec：拿掉「場地標示」的 MUST 與其 Scenario（連同 test-plan 的對應列），§7 只做「返回對戰」入口。**代價**：`prd.md` 13.4 的多場地辨識手段消失，且 Open Question 1 的緩解措施失效。
    - **(C)** 其他做法（例如把場地標示改為顯示 `matchId` 尾碼之類的替代辨識），由人類指定。

    **未受影響、可直接採信的部分**：§0～§6 與 M36 全部結案，56 檔／460 測試全綠、`pnpm -r exec tsc --noEmit` exit 0、工作區乾淨。本阻塞**只影響 §7.3／§7.4（及其後續的 §7.5～§7.7 高度預算量測）**；§7.1／§7.2（失效畫面與 `searchParams` 接線）與 §8、§9 的其餘部分不受此決定影響，但依 execution-plan「群組之間嚴格序列」不得跳過 §7 先做 §8。

    **接續點**：人類就上述 (A)／(B)／(C) 給出裁決後，第六棒 leader 自「§7 計分板 UI 接線」開始，並依第 12 項列出的三個必處理坑（soft navigation 的 `key={matchId ?? "standalone"}`、失效畫面的「尚未判定」狀態、`MATCHMAKER_ROUTE` 具名匯出）執行。

14. **coordinator 對第 13 項的裁決：採 (A)，已核可（2026-08-28，第六棒 leader 落盤）**

    **裁決**：`ScoreboardStateSchema` 新增 `courtNumber`，以 `.nullable().default(null)` 定義，
    納入 `MatchSettings`、`createInitialState()`／`settingsOf()`，由 `buildMatchSlotSeed()` 自
    該場次的 `match.courtNumber`（§0.1 對齊結果表的實際欄位名）帶入。**不修改 delta spec**——
    「localStorage 持久化」Requirement 的向後相容策略已明文預先授權新增欄位的做法，
    「分數自動保存」Scenario 的「保存內容**含**…」為非窮舉表述，design Decision 2 的單向相依
    亦不受損（場地編號由對戰頁在導向前寫進 seed，計分板不反查 `matchmaker:round:v1`）。
    否決 (B)：刪掉場地標示的 MUST 會讓 `prd.md` 13.4 的多場地辨識手段消失。

    **審查範圍裁決**：**不重跑 §2／§4 整組**（重審 14 個已結案 task 的成本與風險面不對稱），
    改為對本 delta 做完整 TDD（真紅燈）＋ **scoped Stage 1／Stage 2**，範圍限定新欄位真正
    經過的四條路徑：schema `.default(null)` 補值、`createInitialState`／`settingsOf` 的保留、
    `buildMatchSlotSeed` 的帶入、storage 讀寫 round-trip。Stage 2 仍須獨立 mutation 並逐分支
    機械盤點這四條路徑。

    落盤為 tasks.md 的 **M37** 節（八個 task）。接續順序：M37 → §7 → §8 → §9 → Final Code Review。

15. **M37 完成兩階段審查（2026-08-28，第六棒 leader）**——tasks.md **61／86** 勾選（原 78 項＋M37 八項＋§7 三項＋§8 兩項），前端 **56 檔／466 測試全綠**、`pnpm -r exec tsc --noEmit` exit 0、工作區乾淨。

    **Stage 1（Spec Reviewer, sonnet）判定 `PASS`**：四個新增 it 名稱與 task 文字逐字相符；未 bump storage key；未觸碰 delta spec 與主 spec；`grep -rn "matchmaker:round:v1" lib/scoreboard/` 無命中（Decision 2 的單向相依成立）；既有 it 名稱與斷言均未被弱化（對既有測試檔的改動純為型別補欄 `courtNumber: null`）；M37.7 的 regression guard 標註經 `git show 19cd142^:...types.ts` 機械複驗**屬實**。

    **Stage 2（Code-Quality Reviewer, opus）判定 `PASS`（補測後）**：**未採信 Implementer 自述的「1 組／0 存活」，獨立重做 28 組，實測 4 組真缺口**（第八度實證自述不可採信）：
    - **M4／M5／M6**：`z.number().int().positive()` 的三個約束**完全零覆蓋**——放寬成 `z.any()` 全套 464 測試無一轉紅。補 it「courtNumber 不合法的分槽條目被逐筆丟棄，合法者保留」，以 `0`／`-1`／`2.5`／`"3"` 四種值逐一釘住，並同時涵蓋「缺 `courtNumber` 但也缺其他欄位」的逐筆降級（`droppedCount === 5`）。
    - **M13（紅得不對）**：既有 it 的 `makeRound()` 其 `matches` 為**空陣列**，`round.matches[0]` 讀到 `undefined` 才轉紅——這不是「分辨得出該場與第一場」，正是本專案反覆出現的「只取第一筆零覆蓋」。補 it「多場次時 seed 取該場自己的場地編號，而非回合的第一場」（兩場 `courtNumber` 為 1／4，雙向斷言）。
    - **M27**：`ensureMatchSlot` 回傳既有槽時抹掉 `courtNumber` 完全無人察覺——既有 it 的 fixture 兩邊 `courtNumber` 皆為 `null`，`expect(result).toEqual(existing)` 對該欄位**零偵測力**。fixture 改為 `courtNumber: 3` 並補逐欄斷言（it 名稱未動）。
    - 判定等價／不可達而不補測：`?? null` → `|| null`（差異只在 `0`，而 `positive()` 已排除）；overrides 與外層 spread 兩處同寫（外層必勝、不可觀測，且真正危險的**語句順序反轉**已轉紅）；`writeScoreboard` 獨立槽路徑剝除 `courtNumber`（該路徑上 `courtNumber` 恆為 `null`）。
    - commit：`7f4f1c1`（補測，未動生產程式碼）／`bd32cf1`（落盤結論）。

    **leader 對 Stage 2 升級項的裁決**：
    1. 「讓 `buildMatchSlotSeed` 一律走 `createInitialState` 的 overrides（連 `matchId` 一起），使『兩處寫』在結構上不可能」——**否決**。§4 的 Stage 2 已裁決過**相反方向**（移除 overrides 內冗餘的 `matchId`，理由是「兩處寫同一件事會分歧」），現在回頭改回去等於推翻一個已結案的審查結論，且該 mutation 本身不可觀測（無行為差異）。維持現狀，以既有註解為防護。
    2. 「`ScoreboardStateSchema.matchId` 的 `z.string()` 約束同樣未被釘住」——**認可為事實但不處理**。屬 §2／§4 舊帳，coordinator 已明令不重跑該兩組，且 `matchId` 的失效模式與 `courtNumber` 不同（`matchId` 只作為 map 的 key 使用，型別放寬不會造成靜默資料損壞）。記錄於此供日後參考。

16. **§9.5 的「唯一容許變動的既有測試」由三處修訂為六處（2026-08-30，第八棒 leader）——待 coordinator 追認**

    §9.5 原文寫「**這三處是本 change 唯一容許變動的既有測試**，其餘既有測試若轉紅一律視為迴歸」。
    §8 實作後實際為**六處**。增加的三處全部源自同一個原因：§8.6 的 MODIFIED Requirement 把目標分數的
    鎖定條件由「目前回合存在即鎖」放寬為「本輪已開始計分才鎖」，因此**凡是既有測試把「回合存在」
    當成鎖定前置條件者，在新規則下一律轉紅**——這正是 design Decision 7 早已預告的後果
    （「M5 既有的單元測試（`RoundControls.test.tsx`）會被本段的行為直接打紅——衝突會在實作時
    以測試失敗的形式爆出來」），只是 §9.5 撰寫當時只估到三處。

    增加的三處（明細與裁決摘要見 tasks.md §9.5 的表格）：
    - `RoundControls.test.tsx`「回合存在但尚無場次時目標分數仍鎖定」→ 改名並反轉斷言為未鎖定
    - `RoundControls.test.tsx`「目標分數鎖定時方向鍵不得呼叫 onSettingsChange」→ 補 `playing` 槽還原前置
    - `tests/e2e/specs/match-stage.spec.ts`「目標分數 radiogroup 支援方向鍵導覽與 roving tabindex」
      → 僅改尾端鎖定情境的建立手法（此 test 在 spec 中標註「既有，不要動」）

    **§8 Stage 1 Spec Reviewer 已逐項獨立裁決**（非採信 Implementer 自述）：(a) 三處皆為 MODIFIED
    規則的必然結果，不改就必然假紅；(b) 皆保留原意圖，其中「反轉斷言」那項經實測**不是恆真**
    ——實作若退回舊寫法該測試仍會轉紅，它現在守護的是「不得只憑回合存在與否判斷鎖定」這條
    SHALL NOT；(c) 未發現任何一項在掩蓋真實迴歸；(d) 被標註「不要動」的 e2e，其方向鍵導覽與
    roving tabindex 核心斷言（第 386～401 行）逐字未改，動的只是前置情境的建立手法。

    **處置與待辦**：leader 已把 §9.5 的文字更新為列舉全部六處並附各自理由與出處，使 §9.5 執行時
    不會把這三處誤判為迴歸。**但這是對驗收標準本身的修訂，leader 不自行認定為終局**——
    依 execution-plan 的 Escalation（「計畫本身錯誤 → 升級給人類」），此項 MUST 由 coordinator 追認。
    若 coordinator 不同意放寬，替代方案是把第 4～6 項回復原狀並改為在 §9.5 明列為「已知的預期失敗」，
    但那會讓 `pnpm test` 無法全綠，與 §9.5 的「前後端皆綠」直接衝突，因此不建議。

17. **coordinator 對第 16 項的裁決：核可六處，不回復三處（2026-08-30）**

    理由：① 新增的三處全部是 design Decision 7 早已預告的必然連帶，不是本輪臨時擴權；
    ② §8 Stage 1 對三處逐項做過獨立裁決而非採信 Implementer 自述，且明確驗證第 4 項的
    反轉斷言不是恆真（退回舊寫法仍會轉紅）；③ 第 6 項「不要動」的 e2e 已核對第 386～401 行
    核心斷言逐字未改，動的只是前置情境建立手法；④ 替代方案（回復三處、在 §9.5 列為已知
    預期失敗）會讓 `pnpm test` 無法全綠，直接違反 §9.5 本身要求，反而更差。
    **維持六處，續作者可直接依 tasks.md §9.5 現有表格執行，不需再等待。**

    另：本項確認時同步查核第八棒遺留的 Blocking #1（§8 Stage 1 找到的回填 e2e「其他場次不受影響」
    零覆蓋），已由該棒派出的 Implementer 於 leader 回報後續完成並提交 `6b816f9`，
    mutation 驗證（暫時改 `clearAllMatchSlots()` 觀察轉紅）通過，5 個 browser project 全綠，
    `git status` 乾淨。**續作者不需重做，直接對此 commit 跑 §8 Stage 2（Code-Quality Reviewer,
    opus）即可**。
