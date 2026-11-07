# Overview: round-timer-clear

## Scope

回合存在時，對戰頁計時控制項的「不計時」按了沒有任何反應。本 change 讓它真的把本輪計時取消（含已開始的倒數），並在下一輪不再沿用。

**Size**: small — 只影響 1 個 capability（round-lifecycle），產品碼四檔（核心一個函式簽章、兩個 store 的參數型別、一個元件 handler），無新依賴、無架構變更。
**Frontend involved**: yes — 計時控制項的「不計時」在回合存在且未鎖定時可用。
**DB schema touched**: no — 後端零變更，`timer: null` 本就合法。
**Data migration**: no。
**Cross-component flow**: yes（輕度）— 元件 → store → 核心純函式 →（雲端）`PUT /api/matchmaker/round`，皆為既有路徑。

---

## What Changes

- `setTimerDuration` 接受 `null`：成功時 `timer` 清為 `null`，鎖定條件不變。
- 倒數已開始仍可取消。
- `RoundControls` 回合存在時「不計時」（點擊／方向鍵）委派 `setTimerDuration(null)`。
- 相依：排在 `round-settings-follow-round` 之後 apply。

前後對照：

```
round.timer = { durationMinutes: 10, startedAt: "..." }   所有場次 pending
使用者點「不計時」

=== Before ===
RoundControls: round !== null 且值為 null -> return（無反應）

=== After ===
RoundControls -> store.setTimerDuration(null) -> core setTimerDuration(round, null)
  -> { ok: true, round: { ...round, timer: null } }
  -> 倒數、開始計時按鈕消失；雲端 PUT 帶 timer: null
```

## Task Groups

| § | 內容 | 性質 |
|---|---|---|
| 1 | 對齊與基線（含確認 `round-settings-follow-round` 已合併） | 不寫產品碼 |
| 2 | 核心 `setTimerDuration` 接受 `null`＋兩個 store 型別與接線測試 | TDD（4 it，1 個 regression guard） |
| 3 | `RoundControls` 委派取消計時＋E2E | TDD（2 it、2 E2E） |
| 4 | 文件與指令驗收 | 設定層＋驗收（指令） |

## Risks

- 相依順序（下一輪仍為不計時需設定列跟隨回合）。
- RED 傳 `null` 為型別錯誤，RED／GREEN 須同張派工單完成。
- 時間到提示音對 `timer` 變 `null` 的收尾以讀碼確認（§1.3）。
