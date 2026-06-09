## MODIFIED Requirements

### Requirement: TocBar 固定置頂位置

**原行為**：`TocBar` 使用 `top-0`，固定在 viewport 最頂部。

**更新後**（完整內容）：

`TocBar` 使用 `top-14`，固定在 SiteNavbar（高度 h-14 = 56px）下方，不與 Navbar 重疊。

#### Scenario: TocBar 位置（有 SiteNavbar 時）

- **WHEN** 使用者瀏覽首頁（`/`）
- **THEN** TocBar 顯示在 viewport top + 56px 的位置，SiteNavbar 佔據最上方 56px
