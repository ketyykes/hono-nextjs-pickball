# Test Plan — matchmaker-scoreboard-binding

> **本檔是 RED 階段的承諾書，只寫「要寫哪些測試、斷言什麼、為何先寫」，不寫實作邏輯。**
>
> - 測試名稱即 delta spec 的「驗收」錨點，**必須逐字一致**，否則 verify 無法機械核對。
> - `Tier` 欄：`unit` 為 Vitest（happy-dom）、`e2e` 為 Playwright（五個 browser project）。本段無 `integration` 層。
> - 「Why first」標為 **regression guard（既有）** 者，是各 MODIFIED Requirement 中
>   **本段未改變其行為**的既有 Scenario（`scoreboard` 兩條、`match-stage` 與 `player-roster` 各一條）：
>   測試已存在於 `main`，本段不重寫、只確保仍為綠。
>   依 root `CLAUDE.md`「紅燈要是真的」，這些項目 SHALL NOT 被包裝成 TDD 紅燈。
> - 三個 MODIFIED Requirement 中**行為確實改變**的既有測試共**三個 it**（`RoundControls.test.tsx` 兩個
>   ——一個改名改斷言、一個新增；`lib/matchmaker/storage.test.ts` 一個改名擴充）：它們在 `main` 上是綠的，
>   改成新斷言後會**真紅**，屬正當 TDD 紅燈，不是偽造。
> - 標為 **regression guard（新增）** 者是本段新寫、但寫下當下即綠的測試（既有實作已滿足）。
>   本段預期**不應出現**這種情況；若實際發生，MUST 在 tasks.md 誠實標註，並改以 mutation 驗證
>   （改壞看紅、還原看綠）證明測試有偵測力，SHALL NOT 用改斷言的方式偽造紅燈。

## scoreboard

### Requirement: localStorage 持久化

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| write 後 read 可取回相同 state | 分數自動保存 | `matchId: null` 的 state 寫入後再讀出，逐欄相同且含 `matchId` | regression guard（既有）— 本段擴充保存欄位，既有斷言須連同 `matchId` 一併成立 | unit |
| localStorage 持久化：reload 後分數保留 | 頁面重整回復 | 獨立 `/scoreboard` 計分後 reload，分數與目標分數不變 | regression guard（既有）— 證明既有獨立用法零行為變更 | e2e |
| 舊版資料缺 targetScore 時補為 11 且不清除 key | 舊版資料缺少 targetScore 時補預設值 | 缺欄位的舊資料讀出後 `targetScore === 11`，key 未被移除 | regression guard（既有） | unit |
| 舊版資料缺 matchId 時補為 null 且不清除 key | 舊版資料缺少 matchId 時補為 null | 缺 `matchId` 的舊資料 → 讀出 `matchId === null`、key 未被移除、分數與 history 完整 | **golden path**：升版不得讓進行中的比賽歸零，是本段對既有使用者唯一的破壞風險 | unit |
| 資料為非 JSON 時 read 回 null 並清 key，且 warn | 損壞資料 fallback | 非 JSON 內容 → 回 `null`、key 被移除、`console.warn` 被呼叫 | regression guard（既有） | unit |
| 資料 schema 不合法時 read 回 null 並清 key，且 warn | 損壞資料 fallback | schema 不合法 → 回 `null`、key 被移除、`console.warn` 被呼叫 | regression guard（既有） | unit |
| 寫入某場次的槽不影響其他場次與獨立槽 | 多場地各自存槽互不覆蓋 | 先寫 `m1`（8-5）與 `m2`，再更新 `m2` → `m1` 的分數／history／`targetScore` 不變，`scoreboard:current:v1` 未被寫入 | **golden path**：多場地互不覆蓋是本段存在的理由（`prd.md` 13.4） | unit |
| 單筆損壞只丟該筆並回報 droppedCount，其餘場次保留 | 分槽逐筆降級 | `{ m1: 損壞, m2: 合法 }` → 回傳只含 `m2`、`droppedCount === 1`、`console.warn` 被呼叫 | **edge case**：連坐清空是最貴的失效模式，且它是靜默的 | unit |
| 整份非 JSON 時清除分槽 key 且不動獨立槽 | 整份分槽資料非 JSON 時清除整個 key | 分槽 key 內容為 `"{{{"` → 該 key 被移除、回傳空集合、`scoreboard:current:v1` 仍在 | **edge case**：兩個 key 的清除範圍必須互不牽連 | unit |
| 批次清除只移除指定場次且忽略不存在的 id | 批次清除指定場次的槽 | `{m1,m2,m3}` 以 `["m1","m3","nope"]` 清除 → 只剩 `m2`，不拋錯 | **edge case**：回合重設會傳入含已消失 id 的清單 | unit |

### Requirement: 賽前設定與階段鎖定

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false | setup 階段可切換比賽形式 | `SET_MODE` 後 `mode` 更新、`serverNumber === 1`、`isFirstServiceOfGame === false`、`targetScore` 與 `matchId` 不變 | regression guard（既有）— 新增 `matchId` 不得影響既有轉換 | unit |
| setup 階段可切換 firstServer | setup 階段可切換先發球方 | `SET_FIRST_SERVER` 後 `firstServer` 更新，`mode`／`targetScore`／`matchId` 不變 | regression guard（既有） | unit |
| setup 階段可切換 targetScore 且保留 mode 與 firstServer | setup 階段可切換目標分數 | `matchId === null` 時 `SET_TARGET_SCORE` 生效，分數維持 0-0 | regression guard（既有）— 綁定鎖定 SHALL NOT 誤傷獨立模式 | unit |
| 綁定場次時 setup 階段 ignore SET_TARGET_SCORE | 綁定對戰場次時 setup 階段仍不得變更目標分數 | `matchId: "m1"`、`targetScore: 15`、`status: "setup"` 下 dispatch `SET_TARGET_SCORE(11)` → state 全等於變更前 | **golden path**：目標分數為每輪設定，是 `prd.md` 6.3.1 的核心約束 | unit |
| 綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉 | 綁定模式的目標分數以唯讀文字呈現 | 綁定 URL 下畫面有「本輪 15 分制」文字、無 `role="radiogroup"` 的目標分數群組、無「比賽形式」combobox | **golden path**：Decision 8 的可觀察結果；純呈現層以 e2e 驗收 | e2e |
| 下拉選單展開時不被 navbar 遮擋 | 下拉選單不得被 navbar 遮擋 | 面板上緣座標 ≥ navbar 下緣 | regression guard（既有） | e2e |
| playing 階段 ignore SET_MODE | 比賽進行中鎖定設定 | `status: "playing"` 下 dispatch 後 state 不變 | regression guard（既有） | unit |
| playing 階段 ignore SET_FIRST_SERVER | 比賽進行中鎖定設定 | 同上 | regression guard（既有） | unit |
| playing 階段 ignore SET_TARGET_SCORE | 比賽進行中鎖定設定 | 同上 | regression guard（既有） | unit |
| finished 階段 ignore SET_MODE | 比賽結束後仍鎖定設定 | `status: "finished"` 下 dispatch 後 state 不變 | regression guard（既有） | unit |
| finished 階段 ignore SET_FIRST_SERVER | 比賽結束後仍鎖定設定 | 同上 | regression guard（既有） | unit |
| finished 階段 ignore SET_TARGET_SCORE | 比賽結束後仍鎖定設定 | 同上 | regression guard（既有） | unit |
| UNDO 後保留 targetScore，不退回預設 11 | UNDO 保留目標分數 | `targetScore: 21` 且 `history.length > 0` 時 UNDO → 仍為 21、`status` 不誤判 `finished` | regression guard（既有） | unit |
| UNDO 與 RESET 後保留 matchId，不退回 null | UNDO 與 RESET 保留 matchId | `matchId: "m1"` 下先 UNDO 再 RESET，兩次結果的 `matchId` 皆為 `"m1"` | **edge case**：與既有「UNDO 退回 11」同構的靜默失效洞，會同時脫離綁定並污染獨立槽（design Decision 6） | unit |
| RESET 保留 mode、firstServer 與 targetScore，清空分數與 history、status 回 setup | 重置需二次確認且解除鎖定 | RESET 後三項設定不變、分數與 history 清空、`status === "setup"` | regression guard（既有） | unit |
| 重置含二次確認；確認後 mode toggle 解鎖（enabled） | 重置需二次確認且解除鎖定 | AlertDialog 標題為「確定要重置比賽？」，確認後控制項 enabled | regression guard（既有） | e2e |
| 目標分數 radiogroup 支援方向鍵導覽與 roving tabindex | 目標分數群組支援方向鍵導覽與 roving tabindex | 方向鍵循環選取、僅選中項 `tabIndex=0` | regression guard（既有）— 僅適用未綁定模式 | e2e |
| 比賽中方向鍵不得變更目標分數 | 比賽中方向鍵不得變更目標分數 | `status: "playing"` 下方向鍵不改變選取（同上 e2e 的後段） | regression guard（既有） | e2e |
| 比賽開始後三個賽前設定控制項皆為 disabled | 目標分數控制項於比賽中為 disabled | 三個控制項皆帶原生 `disabled` | regression guard（既有） | e2e |

### Requirement: 對戰場次綁定與失效處理

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 帶 matchId 時 hydrate 自對應槽且只寫回該槽 | 綁定模式讀寫對應場次的槽 | 預置 `m1`（15 分制、8-5）→ 以 `matchId="m1"` mount → state 為該進度、綁定狀態 `bound`；計一分後只有 `m1` 條目變動，`scoreboard:current:v1` 未被寫入 | **golden path**：綁定模式的讀寫分派是本段的核心行為 | unit |
| 未帶 matchId 時沿用獨立槽且不觸碰分槽 key | 未帶 matchId 時維持獨立計分板 | 不帶 `matchId` mount → state 來自 `scoreboard:current:v1`、綁定狀態 `standalone`、分槽 key 未被讀寫 | **golden path**：既有獨立用法必須零行為變更 | unit |
| matchId 無對應槽時回報 missing 且不建立新條目 | 場次已失效時回報 missing 且不寫入任何槽 | 以不存在的 `matchId` mount → 綁定狀態 `missing`、分槽 key 無新增條目、獨立槽未被寫入 | **edge case**：`prd.md` §11 的失效情境；靜默退回獨立槽會讓分數計在無人接收的地方 | unit |
| 場次失效時顯示繁中說明與兩個出口且不顯示技術錯誤碼 | 失效時顯示繁體中文說明與兩個出口 | `/scoreboard?match=gone` → 畫面含說明文字與「回到對戰頁」「改用獨立計分板」兩顆按鈕，且不含 `Error`／堆疊字樣 | **edge case**：`prd.md` §11 要求繁中訊息且不得只顯示技術錯誤碼 | e2e |
| 失效畫面可切換為獨立計分板並恢復計分 | 選擇改用獨立計分板 | 按「改用獨立計分板」→ URL 無 `match` 參數、可正常得分、寫入 `scoreboard:current:v1` | **edge case**：出口必須真的能走通，否則等於死路 | e2e |
| 綁定模式顯示場地標示且返回對戰可回到對戰頁 | 綁定模式顯示場地標示與返回入口 | 設定列含「場地 3」文字與「返回對戰」按鈕；按下後 URL 為對戰頁 | **golden path**：返回動線是 6.3.1 的明文要求 | e2e |
| 綁定模式多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見 | 綁定模式下多 viewport 仍零捲動 | 四個 viewport 下 `scrollHeight <= clientHeight + 1`，兩顆「贏這球+」與 Undo／重置按鈕 boundingBox 完整落在 viewport 內 | **regression guard（新增）**：設定列組成改變，既有零捲動保護不自動覆蓋綁定 URL（design Decision 8） | e2e |

## match-stage

### Requirement: 場地區塊的計分板入口

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手 | 進入計分板時建立 seed 並帶入該輪目標分數 | 15 分制雙打的回合 + 未開打場次 → seed 的 `targetScore === 15`、`mode === "doubles"`、`matchId` 為該場 id、分數 0-0、`status === "setup"` | **golden path**：seed 是 design Decision 2 不變式的建立端 | unit |
| 已有進度的場次再次進入時保留既有進度不覆蓋 | 已有進度時再次進入不覆蓋 | 槽已有 8-5／`playing` → 再次呼叫 `ensureMatchSlot` 後分數、history、`targetScore` 完全不變 | **edge case**：覆蓋會靜默清空進度，違反「可離開再續」（`prd.md` 13.4） | unit |
| 第一隊對應 us、第二隊對應 them，來回轉換不顛倒 | 隊伍對應為第一隊 us、第二隊 them | `{first: 11, second: 7}` → `{us: 11, them: 7}` → 轉回後仍為 `{first: 11, second: 7}` | **edge case**：顛倒後比分仍是合法數字，任何驗證都攔不下來 | unit |
| 已完成場次不顯示進入計分板入口 | 已完成場次不提供計分板入口 | 已完成的場地區塊內找不到「進入計分板」入口 | **edge case**：`prd.md` 6.5 已完成場次不得再次送出 | e2e |
| 手動輸入比分的路徑仍可獨立完成一場 | 手動輸入路徑不受影響 | 不經計分板直接填兩隊比分送出 → 該場完成、評分更新、歷史新增一筆 | **golden path**：手動輸入是不得移除的 fallback（`prd.md` 6.3、13.4） | e2e |

### Requirement: 計分中場次的標示與返回後呈現

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 計分中的場次顯示計分中標示與當前比分 | 計分中的場次標示為計分中並顯示當前比分 | 槽為 `playing`／8-5 → 場地區塊含文字「計分中」與 8-5，入口文案為「繼續計分」 | **golden path**：多場地並行時的狀態辨識；文字而非只靠顏色（`prd.md` 12.5） | e2e |
| 未完成的計分進度可離開後再進入接續 | 未結束的進度可離開後再進入接續 | 計到 8-5 → 返回 → 再進入 → 顯示 8-5 且 `targetScore` 為該輪值 | **golden path**：`prd.md` 13.4 的四項驗收之一 | e2e |
| 多場地同時計分時各場進度互不覆蓋 | 多場地同時計分互不覆蓋 | 場地 1 計到 5-2、場地 2 計到 3-1，兩者各自保留；再進入場地 1 仍為 5-2 | **golden path**：`prd.md` 13.4 的四項驗收之一，也是本段的存在理由 | e2e |

### Requirement: 目標分數選擇器

> 本 Requirement 由 M5 建立，本段修訂其鎖定條件（「目前回合存在即鎖」→「本輪已開始計分才鎖」）。
> 下表前兩列是 M5 **既有**測試檔 `components/matchmaker/RoundControls.test.tsx` 的更新，
> 不是新檔；第三、四列不動（名稱與斷言皆維持 M5 原樣）。

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 本輪已開始計分時目標分數選擇器 disabled 並顯示鎖定原因 | 本輪已開始計分時鎖定 | 回合目標分數為 15 且該輪已開始計分（任一槽 `status !== "setup"` 或任一場次已完成）→ 三顆選項皆 `disabled`、`aria-checked="true"` 者為 15、畫面顯示鎖定判定回傳的繁中原因 | **golden path**：M5 既有 it「目前回合存在時目標分數選擇器 disabled 並顯示已鎖定說明」的改名與改斷言；前置由「回合存在」換成「已開始計分」，M5 現行實作在新前置下仍鎖，須改實作才綠 | unit |
| 回合存在但尚未開始計分時目標分數選擇器 enabled 且變更委派 setTargetScore | 回合存在但尚未開始計分時仍可更改 | 回合存在、所有場次 `pending`、無任何槽離開 `setup` → 三顆選項 enabled、選取 21 後 `setTargetScore` 被以 `21` 呼叫一次、不顯示鎖定說明 | **golden path**：本次放寬的唯一可觀察差異，也是 M5 現行實作**必紅**的一項（M5 有回合就鎖） | unit |
| 目標分數選項為 11／15／21 且預設選中 11 | 選項為 11／15／21 且預設 11 | 尚無目前回合時顯示三個選項，`aria-checked="true"` 者為 11 | regression guard（既有）— 鎖定條件改變 SHALL NOT 影響無回合時的預設呈現 | unit |
| 目標分數 radiogroup 支援方向鍵導覽與 roving tabindex | 方向鍵導覽與 roving tabindex | 尚無目前回合時方向鍵移動即選取，僅選中項 `tabIndex=0` | regression guard（既有）— 鍵盤模式不因鎖定條件改變而變 | e2e |

## player-roster

### Requirement: 重置名單與二次確認

> 本 Requirement 由 M1 建立、M4 擴為三個 key，本段擴為四個 key。三列皆為既有測試，
> 只有第一列的名稱與斷言改變。

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 重置只移除列舉的四個 key，不影響獨立計分板資料 | 重置只清除列舉範圍內的 key | 預置 `matchmaker:roster:v1`／`matchmaker:round:v1`／`matchmaker:history:v1`／`scoreboard:matches:v1`／`scoreboard:current:v1` → `resetMatchmakerData()` → 前四者被移除、`scoreboard:current:v1` 仍在 | **golden path**：M4 既有 it「重置只移除列舉的 key，不影響 scoreboard 資料」的改名與擴充；第四個 key 尚未在清單中，寫下即紅 | unit |
| 確認重置後名單清空且持久化資料被移除 | 確認重置後名單清空 | 確認後名單為空且 `matchmaker:roster:v1` 已移除 | regression guard（既有）— 清除範圍擴大 SHALL NOT 改變確認動線 | e2e |
| 取消重置後名單維持不變 | 取消重置不動任何資料 | 取消後名單內容與重置前完全相同 | regression guard（既有）— 取消時**四個** key 皆不得被觸碰 | e2e |

## round-lifecycle

### Requirement: 計分板結果的自動回填共用送出 pipeline

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 回填與手動輸入的送出結果逐欄相同 | 回填與手動輸入產生逐欄相同的結果 | 同一回合同一場、比分 11-7，兩條路徑各跑一次 → 回合物件與歷史紀錄逐欄相同（比分、勝方、賽前分數、賽後分數、對戰方式、雙打組成標示），僅完成時間可相異 | **golden path**：`prd.md` 6.3 明訂兩種完成方式產生相同後續結果 | unit |
| 只有 finished 的槽才進入待送出清單 | 只回填已判定勝負且尚未完成的場次 | `m1: finished`／`m2: playing`／`m3: 無槽` → 清單只含 `m1` | **golden path**：回填的觸發條件 | unit |
| 已完成的場次不重複送出且連續呼叫為冪等 | 已完成場次不重複送出 | `m1` 槽為 `finished` 且回合中已完成 → 清單為空；連續呼叫兩次皆為空 | **edge case**：重複送出會使評分雙倍變動、歷史出現重複筆（`prd.md` 6.5） | unit |
| 槽對應的場次已不在回合中時略過且不拋錯 | 槽對應的場次已不在回合中時略過 | 槽有 `gone` 的 `finished` 條目、回合不含 `gone` → 清單不含 `gone`，不拋錯 | **edge case**：`prd.md` §11 的「場次已被刪除」情境 | unit |
| 由計分板判定勝負後返回，比分自動回填且該場轉為已完成 | 回填後清除該場次的計分板槽 | 回填成功後 `scoreboard:matches:v1` 內該條目被移除，其他場次不受影響 | **golden path**：清槽是冪等的主要機制（design Decision 5） | e2e |
| 由計分板判定勝負後返回，比分自動回填且該場轉為已完成 | E2E 由計分板完成一場並回填 | 11 分制下連得 11 分 → 返回 → 場地 1 顯示 11-0、勝方為第一隊、已完成樣式、不再提供入口 | **golden path**：`prd.md` 13.4「進入計分自動回填」的整條路徑 | e2e |

### Requirement: 開始計分後鎖定本輪目標分數

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 無任何場次完成且無計分板槽時目標分數未鎖定 | 尚未開始計分時可更改目標分數 | 回合全未完成、槽集合為空 → 判定回傳未鎖定 | **golden path**：鎖定判定的否定側，避免誤鎖 | unit |
| 任一場次的計分板槽非 setup 時目標分數鎖定 | 有場次的計分板已開打時鎖定 | 任一槽 `status === "playing"` → 判定回傳已鎖定 | **golden path**：`prd.md` 6.3.1 的明文約束 | unit |
| 槽存在但仍為 setup 時不視為已開始計分 | 槽存在但一球未打時不鎖定 | 槽存在但 `status === "setup"`、0-0、無場次完成 → 未鎖定 | **edge case**：誤觸一次入口就永久鎖死該輪分制，且無解除手段 | unit |
| 已有場次完成時目標分數鎖定，不論比分來源 | 手動輸入完成一場後亦鎖定 | 無任何槽但已有一場手動完成 → 已鎖定 | **edge case**：鎖定條件不得只看計分板，否則純手動流程可中途改分制 | unit |
| 本輪開始計分後目標分數控制項停用並說明原因 | 鎖定時 UI 停用並說明原因 | 控制項帶原生 `disabled`，畫面含「本輪已開始計分，目標分數不可更改」 | **edge case**：沉默的 disabled 會被讀成故障（`prd.md` §11） | e2e |

### Requirement: 重設本輪或刪除場次時清除對應計分板進度

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 重設本輪只清除未完成場次的槽且不動獨立槽 | 重設本輪清除未完成場次的計分板槽 | `m1` 已完成、`m2` 未完成有槽 → 重設後 `m2` 條目被移除、`m1` 的比分／評分／歷史不變、`scoreboard:current:v1` 未被觸碰 | **golden path**：不變式的維持端（design Decision 2）；`prd.md` 6.2 要求保留已完成場次 | unit |
| 重設本輪後回到舊計分板連結顯示失效說明 | 回到已失效場次的計分板時顯示說明 | 重設本輪後開啟舊的 `?match=` 連結 → 顯示失效說明與兩個出口，不含技術錯誤碼 | **edge case**：`prd.md` §11 的指名情境，跨分頁重設是最容易發生的實況 | e2e |
| 重置名單清除全部場次槽但保留獨立槽 | 重置名單清除全部計分板槽 | 重置名單後分槽 key 的全部條目被清除，`scoreboard:current:v1` 未被觸碰 | **edge case**：`prd.md` 第 10 節的清除範圍必須精確，多清會毀掉無關的個人比賽 | unit |
