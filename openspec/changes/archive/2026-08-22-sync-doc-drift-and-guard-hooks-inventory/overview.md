# Overview — sync-doc-drift-and-guard-hooks-inventory

## Scope

把上一個 change 的 verify 留下的三項 SUGGESTION 一次收掉：為 hooks 歸屬清單加自動守衛、
改正 `openspec/config.yaml` 搬空後留下的 11 處死指標、補正前端 README 的目錄樹。

**規模：medium** —— 影響 2 個 capability（`pickleball-guide-page`、`dev-workflow`）、
tasks 11 條，落在 medium 的 2-3 capabilities / 9-20 tasks 區間。

條件式區塊判定：

- **前端需求：否** —— 無任何 UI、互動或版面變更，新增的是一支測試檔
- **資料庫結構：否** —— 專案無資料庫，D1 binding 目前未啟用
- **資料遷移：否** —— 無資料
- **跨元件流程：否** —— 無非同步、無排程、無多服務協作

## What Changes

- 新增守衛測試 `nextjs-pickball/hooks/hooksInventory.test.ts`（2 個 case，雙向比對）
- `pickleball-guide-page` hooks Requirement：補守衛義務 + 2 條驗收 Scenario
- `dev-workflow` 2 條 Requirement：改正 `openspec/config.yaml` 的角色描述
- 同步 4 份入口／規範文件 + 5 份歷史文件頁首註記
- 補正 `nextjs-pickball/README.md` 的 `components/` 結構

```
=== Before ===
hooks 歸屬清單 ── 只有散文規則守著 ──▶ 已失效 2 次（漏 useFocusMode、useRosterStore）
config.yaml    ── 已搬空，只剩 schema + context
                  ▲ 11 處文件仍指向它要 TDD 規則（死指標）
README（前端）  ── components/ 只列 2 個子目錄，實際 7 個

=== After ===
hooks 歸屬清單 ◀── hooksInventory.test.ts 雙向守衛 ──▶ 漏更新即紅燈
config.yaml    ── 角色正名為「workflow schema + 輸出語言」
                  ▲ 11 處指標改指 root CLAUDE.md（TDD 規則實際所在）
README（前端）  ── components/ 7 個子目錄全列
```

## Architecture

規範內容的來源與指標流向。箭頭表示「A 指向 B 取得該內容」。

```
                    ┌──────────────────────────┐
  非 Claude agent ─▶│ AGENTS.md（root / 各 ws）│  只放指標，不放內文
                    └───────────┬──────────────┘
                                │ TDD 規則（改指標的那條線）
             Before ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─▶ openspec/config.yaml  ✗ 已搬空
             After  ───────────▶│
                                ▼
                    ┌──────────────────────────┐
                    │ CLAUDE.md（root）        │ TDD 三步、紅燈規則、單檔指令形式
                    └───────────┬──────────────┘
                                │ workspace 適用範圍與例外層
                                ▼
                    ┌──────────────────────────┐
                    │ nextjs-pickball/CLAUDE.md│
                    └──────────────────────────┘

                    ┌──────────────────────────┐
                    │ openspec/config.yaml     │ schema: 選定 workflow 變體
                    │                          │ context: artifact 輸出語言
                    └──────────────────────────┘

  守衛測試的比對方向（新增）：
    nextjs-pickball/hooks/*.ts ──┐
                                 ├─▶ hooksInventory.test.ts ─▶ 兩邊集合須相等
    specs/pickleball-guide-page ─┘        （目錄→清單、清單→目錄）
```
