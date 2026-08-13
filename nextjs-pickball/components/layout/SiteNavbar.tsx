"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { getNavHeightPx } from "@/lib/navHeight";
import { cn } from "@/lib/utils";

interface NavLink {
	href: string;
	label: string;
}

const NAV_LINKS: readonly NavLink[] = [
	{ href: "/", label: "首頁" },
	{ href: "/tour", label: "完整體驗" },
	{ href: "/scoreboard", label: "計分板" },
	{ href: "/quiz", label: "測驗" },
] as const;

// 全域 navbar：fixed top，捲離首頁 Hero 後切換為白底；
// 在首頁以外的路由（/tour、/scoreboard、/quiz）一律白底樣式。
export function SiteNavbar() {
	const pathname = usePathname();
	const isHome = pathname === "/";
	// 高度的單一事實來源是 --site-nav-h，不在此硬寫數值。
	const pastHero = useScrolledPast(() => window.innerHeight - getNavHeightPx());
	const solid = !isHome || pastHero;

	return (
		<header
			className={cn(
				// [.sb-focus_&]:hidden：/scoreboard 專注模式（useFocusMode 在 html 掛
				// sb-focus class）時整條隱藏；純 CSS 回應，不引入 scoreboard 狀態依賴。
				"fixed top-0 right-0 left-0 z-[110] h-14 border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-300 [.sb-focus_&]:hidden",
				solid
					? "border-border bg-background/85 shadow-sm backdrop-blur-md"
					: "border-white/5 bg-slate-900/20 backdrop-blur-sm",
			)}
		>
			{/* 窄螢幕：收合 logo 文字並縮小間距，讓 4 個連結維持單行。
			    不做漢堡選單——只有 4 個連結，藏起來等於替每次導航多加一次點擊。 */}
			<div className="mx-auto flex h-full max-w-[1200px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
				<Link
					href="/"
					transitionTypes={["nav-back"]}
					className={cn(
						"font-outfit shrink-0 text-sm font-extrabold tracking-[2px] whitespace-nowrap uppercase",
						solid ? "text-slate-900" : "text-white",
					)}
				>
					🏓<span className="hidden sm:inline"> 匹克球指南</span>
				</Link>
				<nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
					{NAV_LINKS.map((link) => {
						const active = pathname === link.href;
						return (
							<Link
								key={link.href}
								href={link.href}
								transitionTypes={[link.href === "/" ? "nav-back" : "nav-forward"]}
								className={cn(
									"rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
									solid
										? "text-muted-foreground hover:text-slate-900"
										: "text-white/70 hover:text-white",
									active && (solid ? "text-slate-900" : "text-white"),
								)}
							>
								{link.label}
							</Link>
						);
					})}
				</nav>
			</div>
		</header>
	);
}
