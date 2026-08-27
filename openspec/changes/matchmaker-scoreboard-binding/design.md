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
