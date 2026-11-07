import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// 後端單元測試在真正的 workerd runtime 中執行（非 node / happy-dom）。
// main 與 bindings 由 wrangler.jsonc 帶入，不在此重複宣告，避免兩處設定漂移。
//
// 注意：本版（0.16.13）沒有 defineWorkersConfig，也沒有 ./config subpath；
// 現行 API 是從套件根匯入的 cloudflareTest() Vite plugin。照抄舊版官方範例會 import 失敗。
//
// D1：top-level 宣告的是正式 D1，測試一律改用 env.local 的本機 D1，故 environment 指向 "local"。
// migration 由 Node 端讀取後注入為 TEST_MIGRATIONS，再由 setupFiles 在 workerd 端套用。
// storage 以測試檔為隔離單位（本版已無 isolatedStorage），同檔 it 共用資料。
const migrations = await readD1Migrations(
  path.join(import.meta.dirname, "drizzle"),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc", environment: "local" },
      // 固定 binding 值一律由此注入測試專用假值，測試結果不依賴開發者本機的 .dev.vars。
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          ENVIRONMENT: "development",
          BETTER_AUTH_SECRET: "test-only-secret-not-for-production-0000",
          BETTER_AUTH_URL: "http://localhost:3005",
          // 固定為空字串：pool 會讀開發者本機的 .dev.vars，若有人在本機設了真 Google 值，
          // auth 啟用與 signInMethods 的斷言就會隨機器而異。
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
    // 刻意不開 globals（與前端不同）：後端測試檔一律顯式 import，避免 workerd 全域污染。
  },
});
