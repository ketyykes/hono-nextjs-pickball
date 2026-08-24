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
