import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 在 monorepo 中明確指定 Turbopack workspace root 為上一層
  // （hono-nextjs-pickball/），讓 pnpm hoist 到 root .pnpm store 的 symlink
  // 可被 Turbopack 解析；否則 Next.js 16 會誤判 root 為本目錄並阻擋向外解析。
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
  },
  experimental: {
    // 啟用 React 19 <ViewTransition> 與 Next.js App Router 的整合，
    // 讓 router.push / <Link transitionTypes> 在路由切換時觸發 view transition。
    viewTransition: true,
  },
};

export default nextConfig;
