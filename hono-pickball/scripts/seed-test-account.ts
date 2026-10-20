import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account.ts";

// 以腳本位置推導 hono-pickball/，避免依賴執行時的 cwd
const projectRoot = join(import.meta.dirname, "..");
const devVarsPath = join(projectRoot, ".dev.vars");
const tmpDir = join(projectRoot, ".wrangler", "tmp");
const sqlPath = join(tmpDir, "seed-test-account.sql");

const requiredVars = [
  "TEST_ACCOUNT_EMAIL",
  "TEST_ACCOUNT_PASSWORD",
  "TEST_ACCOUNT_NAME",
] as const;

function fail(message: string): never {
  console.error(`[seed-test-account] ${message}`);
  process.exit(1);
}

// loadEnvFile 在檔案不存在時會拋錯，轉成明確訊息比堆疊更容易排查
if (!existsSync(devVarsPath)) {
  fail(`找不到 ${devVarsPath}，請先由 .dev.vars.example 複製並填入測試帳密`);
}
process.loadEnvFile(devVarsPath);

for (const name of requiredVars) {
  if (!process.env[name]) {
    fail(`缺少環境變數 ${name}，請在 .dev.vars 補上`);
  }
}

const sql = await buildTestAccountSeedSql({
  email: process.env.TEST_ACCOUNT_EMAIL as string,
  password: process.env.TEST_ACCOUNT_PASSWORD as string,
  name: process.env.TEST_ACCOUNT_NAME as string,
  now: new Date(),
});

mkdirSync(tmpDir, { recursive: true });
writeFileSync(sqlPath, sql);

try {
  // 暫存檔含密碼雜湊，無論成敗都必須刪除，因此放在 finally
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--env", "local", "--file", sqlPath],
    { cwd: projectRoot, stdio: "inherit" },
  );
} catch {
  process.exitCode = 1;
} finally {
  rmSync(sqlPath, { force: true });
}
