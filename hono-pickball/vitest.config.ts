import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// 後端單元測試在真正的 workerd runtime 中執行（非 node / happy-dom）。
// main 與 bindings 由 wrangler.jsonc 帶入，不在此重複宣告，避免兩處設定漂移。
//
// 注意：本版（0.16.13）沒有 defineWorkersConfig，也沒有 ./config subpath；
// 現行 API 是從套件根匯入的 cloudflareTest() Vite plugin。照抄舊版官方範例會 import 失敗。
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["test/**/*.test.ts"],
    // 刻意不開 globals（與前端不同）：後端測試檔一律顯式 import，避免 workerd 全域污染。
  },
});
