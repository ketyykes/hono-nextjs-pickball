import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
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

if (!existsSync(devVarsPath)) {
  fail(`找不到 ${devVarsPath}，請先由 .dev.vars.example 複製並填入測試帳密`);
}
// 不用 loadEnvFile：它不會覆寫 shell 已 export 的值，會 seed 到錯的帳號；
// 也避免把 BETTER_AUTH_SECRET 等注入 process.env 後被 wrangler 子行程繼承
const devVars = parseEnv(readFileSync(devVarsPath, "utf8"));

for (const name of requiredVars) {
  if (!devVars[name]) {
    fail(`缺少環境變數 ${name}，請在 .dev.vars 補上`);
  }
}

const sql = await buildTestAccountSeedSql({
  email: devVars.TEST_ACCOUNT_EMAIL as string,
  password: devVars.TEST_ACCOUNT_PASSWORD as string,
  name: devVars.TEST_ACCOUNT_NAME as string,
  now: new Date(),
});

mkdirSync(tmpDir, { recursive: true });
writeFileSync(sqlPath, sql, { mode: 0o600 });

try {
  // 暫存檔含密碼雜湊，無論成敗都必須刪除，因此放在 finally
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--env", "local", "--file", sqlPath],
    { cwd: projectRoot, stdio: "inherit" },
  );
} catch (error) {
  console.error("[seed-test-account] wrangler 執行失敗", error);
  process.exitCode = 1;
} finally {
  rmSync(sqlPath, { force: true });
}
