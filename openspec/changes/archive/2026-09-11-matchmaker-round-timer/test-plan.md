# Test Plan: matchmaker-round-timer

> **RED-phase 承諾書**。本檔只寫「要先寫哪些測試、斷言什麼、為什麼先寫」，
> **不寫實作邏輯**。apply 階段每次要決定「下一個 RED 寫什麼」時就回來讀這裡。
>
> Tier 對照本 change 的分層（design Decision 5、6）：
> - `unit`：`lib/matchmaker/` 的純函式模組（`round-types.ts`／`round-settings.ts`／
>   `round.ts`／`round-timer.ts`），Vitest + happy-dom，毫秒級、決定性
> - `integration`：`components/matchmaker/`（`RoundControls.tsx`／`RoundTimerBanner.tsx`）
>   與 `hooks/useRoundTimer.ts`，Vitest + `@testing-library/react`（`useRoundTimer.test.ts`
>   使用 `vi.useFakeTimers()` 驅動每秒 tick），測 wiring 與計時副作用
> - `e2e`：Playwright，測真實計時、快轉時鐘、Web Audio 委派與跨頁重新整理後續跑
>
> **it／test 名稱必須與 delta spec 的「驗收」錨點逐字一致**，否則 `/opsx:verify` 無法機械核對。
>
> 例外層（`lib/matchmaker/round-timer-sound.ts`）**沒有單元測試列**，其驗收落在
> `RoundTimerBanner.test.tsx`（驗證音效函式被呼叫，以 `vi.fn()` 注入替換）與 e2e
> （驗證真實頁面確實觸發 `AudioContext`）——這是刻意的分層結果，不是漏寫（見 design
> Decision 6）。
>
> 標為「regression guard」的列，寫入當下即綠（既有程式碼結構或既有測試本來就正確），
> 不是偽造紅燈；tasks.md 對這些列會逐項誠實標註。

## round-lifecycle

### Requirement: 回合資料模型

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 合法回合通過驗證，roundNumber 非正整數時失敗 | 合法回合通過驗證 | 既有測試，本 change 未修改 `RoundSchema` 對這幾個欄位的驗證邏輯，僅確認新增 `timer` 欄位後仍通過 | regression guard：既有測試，加入 `timer` 欄位後必須仍綠 | unit |
| 場次狀態僅接受 pending、scoring、completed | 場次狀態僅接受三個列舉值 | 既有測試，未受本 change 影響 | regression guard | unit |
| completed 場次缺少比分、勝方或完成時間時驗證失敗 | 完成場次必須帶齊比分、勝方與完成時間 | 既有測試，未受本 change 影響 | regression guard | unit |
| 回合資料缺少 timer 欄位時以 null 通過驗證，向後相容既有資料 | 舊資料缺少 timer 欄位時以 null 通過驗證 | 一份不含 `timer` 欄位的合法回合物件 → `RoundSchema.safeParse` 的 `success` 為 `true` 且 `data.timer` 為 `null` | golden path：這是本 change 對既有 `matchmaker:round:v1` 資料的向後相容承諾，缺了它舊資料會在下次重新整理時被判為損壞而整份清除 | unit |

### Requirement: 回合計時器

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 計時長度僅接受 10、15、20 分鐘 | 計時長度僅接受 10、15、20 分鐘 | `durationMinutes` 為 `10`／`15`／`20` → 驗證通過；為 `5`／`30`／`0` → 驗證失敗 | golden path：schema 值域是本 capability 的地基，其餘函式都假設這個值域已被鎖住 | unit |
| 每輪設定預設計時為不計時 | 每輪設定預設為不計時 | `createRoundSettings()` 的 `timerDurationMinutes` 為 `null` | golden path：對照既有的「預設為單打與 1 個場地」，本項是計時器自己的預設值錨點 | unit |
| 產生本輪時依設定決定計時長度，未指定時 timer 為 null | 產生本輪時依設定決定計時長度 | `timerDurationMinutes: 15` → `round.timer` 為 `{ durationMinutes: 15, startedAt: null }`；未指定或 `null` → `round.timer` 為 `null` | golden path：`createRound` 是本 change 在 `round.ts` 唯一需要主動加程式碼才能通過的地方（design Decision 4） | unit |
| 所有場次皆為 pending 時可改計時設定並重置為未開始，已有場次離開 pending 時拒絕 | 尚未開始計分時可更改計時設定，已開始後拒絕 | 全 `pending` → `setTimerDuration(round, 20)` 回傳 `{ ok: true, round: { timer: { durationMinutes: 20, startedAt: null } } }`；即使原本已開始計時（`startedAt` 非 `null`）變更後仍重置為 `null`；任一場次為 `scoring`／`completed` → 回傳 `{ ok: false }`，原回合不變 | golden path＋edge case：驗證鎖定條件與「變更長度必重置 startedAt」兩件事（design Decision 3） | unit |
| 已設定計時長度且尚未開始時，開始計時寫入 startedAt | 開始計時寫入 startedAt | `timer: { durationMinutes: 10, startedAt: null }` → `startTimer(round, "2026-09-03T01:00:00.000Z")` 回傳的 `timer.startedAt` 為該注入時間，`durationMinutes` 不變 | golden path：`startTimer` 是本 change 第二個新純函式的核心行為 | unit |
| 未設定計時長度或計時已開始時拒絕再次開始並回傳可判讀訊息 | 未設定計時或計時已開始時拒絕再次開始 | `timer` 為 `null` → 拒絕；`timer.startedAt` 已有值 → 拒絕；兩者皆不拋例外、原回合不變 | edge case：防止重複開始把 `startedAt` 覆寫成更晚的時間，悄悄縮短使用者已經倒數過的時間 | unit |
| 剩餘秒數依經過時間遞減，超過設定長度後夾在 0 不為負數 | 剩餘秒數依經過時間遞減且不為負 | `durationMinutes: 10`、`startedAt` 為某時刻 → 開始後 30 秒回傳 `570`；開始後 11 分鐘回傳 `0` | golden path：`remainingSeconds` 是倒數顯示與到期判定共同依賴的核心算式 | unit |
| 剩餘秒數格式化為兩位數的 mm:ss | 剩餘秒數格式化為兩位數的 mm:ss | `596` → `"09:56"`；`0` → `"00:00"` | golden path：倒數顯示唯一依賴的格式化函式，位數不補零會讓個位數分鐘的顯示跳動（`9:56` vs `09:56`） | unit |
| remainingSeconds 與 isExpired 皆為純函式，不修改輸入的 timer | remainingSeconds 與 isExpired 為純函式，不修改輸入 | 以 `structuredClone` 留底 → 呼叫後 `timer` 深層比對與呼叫前相同 | regression guard：`lib/matchmaker/` 全段的一貫約束（沿用 M2／M9 已有同型測試），防止之後有人為了效能而寫出就地修改 | unit |
| 每秒更新剩餘秒數，超過設定長度後 expired 回傳 true | useRoundTimer 每秒更新剩餘秒數並在到期時回報 expired | `vi.useFakeTimers()` 前進 30 秒 → `remainingSeconds` 遞減、`expired` 為 `false`；前進超過 10 分鐘 → `expired` 為 `true` | golden path：本 capability 唯一呼叫 `setInterval`／`new Date()` 的位置是否正確驅動純函式並反映到 React state | integration |
| 重排未完成場次不重置計時 | 重排未完成場次不重置計時 | `timer: { durationMinutes: 15, startedAt: <某時刻> }` 且有 `pending` 場次 → 重排後 `timer` 與重排前完全相同 | regression guard：`resetIncompleteMatches` 的既有物件展開實作已自然滿足此規則（design Decision 4），此測試把它釘住避免日後改寫 | unit |
| 重新掛載後仍保留已開始計時的 timer，startedAt 不被重置 | 開始計時後重新掛載仍保留已開始的計時進度 | 呼叫 `startTimer` 後 `round.timer.startedAt` 有值並持久化 → 重新掛載 `useRoundStore` → 還原的 `timer` 與寫入前完全相同 | golden path：「重整後續跑」是本 change 對使用者的持久化承諾，缺了它重新整理頁面會讓計時悄悄歸零重來 | integration |
| 產生新一輪時即使沿用相同計時長度，timer 仍重新起算且 startedAt 為 null | 產生新一輪時一律產生全新的 timer | 上一輪 `timer: { durationMinutes: 10, startedAt: <某時刻> }`，以相同 `timerDurationMinutes: 10` 產生新一輪 → 新回合 `timer` 為 `{ durationMinutes: 10, startedAt: null }` | edge case：最容易被誤實作成「沿用上一輪 timer 物件」的地方——兩輪長度相同時尤其容易看起來「反正一樣就不用重建」，但那會讓新一輪一開始就顯示成已在倒數 | unit |

## match-stage

### Requirement: 本輪設定控制項的預設值與範圍

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 預設為單打與 1 個場地且取用分配引擎匯出的常數 | 預設為單打與 1 個場地 | 既有測試，未受本 change 影響 | regression guard | unit |
| 場地數加減夾在 1～8 並回報是否已達邊界 | 場地數加減夾在合法範圍內 | 既有測試，未受本 change 影響 | regression guard | unit |
| 場地數為 1 時減號 disabled、為 8 時加號 disabled | 邊界時加減按鈕為 disabled | 既有測試，新增計時控制項後 `RoundControlsProps` 需補上必填的 `setTimerDuration`／`startTimer`，本測試斷言不變、僅需更新 test fixture 使其仍綠 | regression guard | integration |
| 對戰方式只提供單打與雙打且無性別限定模式選項 | 對戰方式只有單打與雙打 | 既有測試，未受本 change 影響（同上，僅 fixture 需補必填 props） | regression guard | integration |
| 計時選項為不計時／10／15／20 分鐘且預設選中不計時 | 計時選項為不計時／10／15／20 分鐘且預設不計時 | 尚無目前回合時渲染 `RoundControls` → 計時 `radiogroup` 顯示四個選項，`aria-checked="true"` 者為「不計時」 | golden path：計時控制項是否正確掛上、預設值是否正確，是本組所有後續測試的地基 | integration |
| 本輪已開始計分時計時控制項 disabled 並顯示鎖定原因 | 本輪已開始計分時計時設定鎖定 | `round.timer.durationMinutes = 10`，任一場次 `completed` → 四顆選項皆 `disabled`，畫面顯示 `ROUND_TIMER_LOCKED_REASON` | golden path：鎖定重用 `isTargetScoreLocked` 是否正確接線的關鍵驗證（design Decision 2） | integration |

### Requirement: 計時器顯示與時間到提示

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 已設定計時長度且尚未開始時顯示可點擊的開始計時按鈕 | 已設定計時長度且尚未開始時顯示開始計時按鈕 | `timer: { durationMinutes: 10, startedAt: null }` → 畫面存在「開始計時」按鈕且無 `disabled` | golden path：按鈕的顯示條件是後續兩條測試的前提 | integration |
| 不計時或計時已開始時不顯示開始計時按鈕 | 不計時或已開始時不顯示開始計時按鈕 | `timer` 為 `null`，或 `timer.startedAt` 有值 → 兩種情況下「開始計時」按鈕皆不存在（非 `disabled`，是不渲染） | edge case：容易誤實作成恆渲染＋條件式 `disabled`，spec 明確要求不渲染而非停用 | integration |
| 點擊開始計時會呼叫注入的 startTimer 一次 | 點擊開始計時委派 startTimer | 點擊「開始計時」→ 注入的 `startTimer` 恰被呼叫一次 | golden path：wiring 是否接對，用假函式在毫秒內驗完 | integration |
| 倒數期間顯示 mm:ss 格式的剩餘時間且每秒遞減 | 倒數期間顯示剩餘時間且每秒遞減 | `timer` 已開始、`durationMinutes: 10` → 初始顯示 `10:00`；以 `vi.useFakeTimers()` 前進 30 秒 → 顯示遞減（非 `10:00`） | golden path：`useRoundTimer` 與 `RoundTimerBanner` 的接線是否正確驅動畫面更新 | integration |
| 時間到時顯示帶 role alert 的時間到大字與繁體中文提示文案 | 時間到顯示大字時間到與繁體中文提示 | 前進至經過的時間達到 `durationMinutes` → 出現 `role="alert"` 區塊，內含「時間到」與 `ROUND_TIMER_EXPIRED_MESSAGE` 文字 | golden path：`prd.md` 明列的提示文案是否正確顯示 | integration |
| 時間到時播放提示音，同一次到期不因重新渲染而重複播放 | 時間到播放提示音且同一次到期只播放一次 | 注入可計數的假音效函式 → 到期瞬間恰呼叫 1 次；之後因其他 props 變動觸發重新渲染 → 呼叫次數仍為 1 | edge case：最容易寫成「每次 render 都播放一次」的地方，需要一個明確的「已播放」guard | integration |
| 計時到期不自動結束任何場次，仍可手動送出比分 | 計時到期不自動結束任何場次 | 已產生一輪 10 分鐘計時的回合並開始計時，快轉至到期後 → 所有場次 `status` 與到期前相同，且仍可手動送出比分並成功完成 | regression guard＋golden path：這是與 M15（平局）之間唯一但關鍵的邊界，`round-timer.ts` 的函式簽章已在型別層排除這個可能性（design Decision 5），本測試在系統層再次確認 | e2e |
| 開始計時後快轉至到期會顯示時間到並觸發一次提示音 | 開始計時後快轉至到期會顯示時間到並觸發一次提示音 | 點擊「開始計時」，以 `page.clock` 快轉至到期 → 畫面出現「時間到」；`addInitScript` stub 的 `AudioContext` 建構次數恰為 1 | golden path：例外層（`round-timer-sound.ts`）與真實計時 tick 唯一能自動驗證的一條，證明「真的會響」而非只是單元測試裡的假函式被呼叫 | e2e |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 應在 scrollY 超過 threshold 時回傳 true | useScrollShadow 在 scrollY 超過 threshold 時回傳 true | 既有測試，未受本 change 影響 | regression guard | unit |
| 應回傳目前可視 section 的 id | useScrollSpy 回傳目前可視 section 的 id | 既有測試，未受本 change 影響 | regression guard | unit |
| 應在 scrollY 超過固定 threshold 時回傳 true | useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true | 既有測試，未受本 change 影響 | regression guard | unit |
| 應以 function threshold 動態判定是否已捲過門檻 | useScrolledPast 以 function threshold 動態判定 | 既有測試，未受本 change 影響 | regression guard | unit |
| hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | hooks 目錄的每支 hook 都在歸屬清單內 | 新增 `hooks/useRoundTimer.ts` 但尚未更新歸屬清單時 → 此既有測試轉紅（`useRoundTimer` 不在清單內）；更新清單加入 `useRoundTimer` → round-lifecycle 後轉綠 | golden path：本 change 新增 hook 是否確實同步了歸屬清單，這條既有守衛測試就是唯一的機械檢查點 | unit |
| 歸屬清單提及的每個 hook 名稱都有對應檔案 | 歸屬清單提及的 hook 都有對應檔案 | 既有測試，`useRoundTimer` 加入清單時檔案已存在，維持綠燈 | regression guard | unit |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names use imperative form（繁體中文句子，與 spec 驗收錨點逐字相同）
