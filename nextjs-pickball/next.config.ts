import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// monorepo workspace root（hono-nextjs-pickball/）。
// pnpm 把 dependencies hoist 到此處的 .pnpm store；nextjs-pickball/node_modules
// 內的 next 等套件其實是 symlink 指到上面。Turbopack 與 outputFileTracingRoot
// 都必須以此為界，否則跨 symlink 解析會被阻擋。
// Next.js 16 規定 turbopack.root 與 outputFileTracingRoot 兩者若同時設定必須相等；
// OpenNext（@opennextjs/cloudflare）解析 standalone output 時也依賴
// outputFileTracingRoot 指向 workspace root 才能正確處理 monorepo 路徑。
const workspaceRoot = path.resolve(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  experimental: {
    // 啟用 React 19 <ViewTransition> 與 Next.js App Router 的整合，
    // 讓 router.push / <Link transitionTypes> 在路由切換時觸發 view transition。
    viewTransition: true,
  },
};

export default nextConfig;

// 讓 `next dev` 期間能以 getCloudflareContext() 存取 wrangler.jsonc 宣告的
// bindings（例如 HONO_API service binding，搭配另一個終端機的 wrangler dev）。
initOpenNextCloudflareForDev();
