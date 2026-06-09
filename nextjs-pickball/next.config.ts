import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 啟用 React 19 <ViewTransition> 與 Next.js App Router 的整合，
    // 讓 router.push / <Link transitionTypes> 在路由切換時觸發 view transition。
    viewTransition: true,
  },
};

export default nextConfig;
