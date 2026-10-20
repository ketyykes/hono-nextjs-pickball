import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// 只補測試專用的 TEST_MIGRATIONS；DB 已由 worker-configuration.d.ts 宣告，不可重複。
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
