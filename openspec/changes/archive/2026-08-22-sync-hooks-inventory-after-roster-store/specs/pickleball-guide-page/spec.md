## MODIFIED Requirements

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供三支 scroll / observer React hooks：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`，分別位於 `nextjs-pickball/hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。`useScrolledPast` SHALL 接受 `threshold: number | (() => number)`：為 `number` 時以該值為固定門檻，為 function 時於每次 scroll 事件呼叫以取得當前門檻（供動態讀取 `window.innerHeight - navHeight` 等情境）。

本 capability 只擁有上述三支；`nextjs-pickball/hooks/` 下其餘 hook 歸屬其他 capability（`useQuiz` → quiz；`useRosterStore` → player-roster；`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode` → scoreboard；`useEnterAnimationProgress`、`useReducedMotion` → tour-experience）。

此歸屬清單為 `nextjs-pickball/hooks/` 跨 capability 分工的**單一來源**。其他 capability 於該目錄新增 hook 時，其 change SHALL 一併更新此清單 —— 否則本 capability 的規格會單邊失真。此規則已失效兩次：`4c5b724` 新增 `useFocusMode` 時只更新了 `scoreboard` 規格；change `add-player-roster`（實作 commit `d00fea6`、歸檔 commit `0974918`）新增 `useRosterStore` 時只更新了 `player-roster` 規格，且該 change 的 proposal 還明文宣告「對 `pickleball-guide-page` 無影響」—— 新增 hook 前 SHALL 直接核對本清單，SHALL NOT 以「本 capability 與 pickleball-guide-page 無關」推論無影響。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`nextjs-pickball/hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrolledPast(500)`
- **WHEN** `window.scrollY` 設為 600 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應在 scrollY 超過固定 threshold 時回傳 true」

#### Scenario: useScrolledPast 以 function threshold 動態判定
- **GIVEN** 測試環境呼叫 `useScrolledPast(() => window.innerHeight - 56)`，並將 `window.innerHeight` 設為 800（門檻 = 744）
- **WHEN** `window.scrollY` 設為 800 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應以 function threshold 動態判定是否已捲過門檻」
