import { defineConfig } from "vitest/config";

// 刻意用 node 環境且不開 globals：模組邊界測試要證明核心模組不依賴瀏覽器全域。
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
