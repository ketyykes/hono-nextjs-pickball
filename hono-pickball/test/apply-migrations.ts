import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// 套用 repo 內 drizzle/ 的 migration，而非手寫 CREATE TABLE，
// 否則測試驗證的 schema 會與 migration 脫鉤。
// applyD1Migrations 只套用未套用者，每個測試檔前各跑一次是安全的。
if (!env.DB) {
  throw new Error("env.DB 不存在：vitest.config.ts 的 wrangler.environment 未帶入 DB binding");
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
