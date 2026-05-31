import type { Metadata } from "next";
import { ViewTransition } from "react";
import { Noto_Sans_TC, Bebas_Neue, Outfit } from "next/font/google";
import { SiteNavbar } from "@/components/layout/SiteNavbar";
import "./globals.css";

// 主文本字型：繁體中文（需啟用 latin subset 作為 fallback）
const notoSansTc = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-noto-sans-tc",
  display: "swap",
});

// 標題用展示字型
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-neue",
  display: "swap",
});

// UI 標籤字型
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800", "900"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "匹克球新手完全入門：規則與球拍選購一次搞懂",
  description: "規則與球拍選購一次搞懂的匹克球新手完整指南",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-Hant"
      className={`${notoSansTc.variable} ${bebasNeue.variable} ${outfit.variable} antialiased`}
    >
      <body>
        <SiteNavbar />
        {/*
          以 React 19 <ViewTransition> 包住路由內容；
          enter / exit 依 transition type 對應到 globals.css 的 nav-forward / nav-back 動畫。
          其他 transition（例如初次載入、無 type 的瀏覽器返回）一律 default: "none"，避免不必要的閃動。
        */}
        <ViewTransition
          enter={{
            "nav-forward": "nav-forward",
            "nav-back": "nav-back",
            default: "none",
          }}
          exit={{
            "nav-forward": "nav-forward",
            "nav-back": "nav-back",
            default: "none",
          }}
          default="none"
        >
          {children}
        </ViewTransition>
      </body>
    </html>
  );
}
