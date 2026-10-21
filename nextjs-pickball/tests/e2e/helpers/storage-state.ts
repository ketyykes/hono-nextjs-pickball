import { join } from "node:path";

// 以檔案位置推導，避免依賴執行時的 cwd（Playwright 以 CJS 載入 TS，故用 __dirname）。
// global-setup 寫入、spec 讀取，共用此常數避免兩邊路徑漂移。
export const storageStatePath = join(__dirname, "..", ".auth", "test-account.json");

export const AUTH_SKIP_REASON =
	"需要 hono-pickball/.dev.vars 的 TEST_ACCOUNT_* 與 ENVIRONMENT=development";
