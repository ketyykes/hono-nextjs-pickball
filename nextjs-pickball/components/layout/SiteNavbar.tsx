"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScrolledPast } from "@/hooks/useScrolledPast";
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
	const pastHero = useScrolledPast(() => window.innerHeight - 56);
	const solid = !isHome || pastHero;

	return (
		<header
			className={cn(
				"fixed top-0 right-0 left-0 z-[110] h-14 border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-300",
				solid
					? "border-border bg-background/85 shadow-sm backdrop-blur-md"
					: "border-white/5 bg-slate-900/20 backdrop-blur-sm",
			)}
		>
			<div className="mx-auto flex h-full max-w-[1200px] items-center gap-6 px-6">
				<Link
					href="/"
					transitionTypes={["nav-back"]}
					className={cn(
						"font-outfit text-sm font-extrabold tracking-[2px] uppercase",
						solid ? "text-slate-900" : "text-white",
					)}
				>
					🏓 匹克球指南
				</Link>
				<nav className="ml-auto flex items-center gap-1">
					{NAV_LINKS.map((link) => {
						const active = pathname === link.href;
						return (
							<Link
								key={link.href}
								href={link.href}
								transitionTypes={[link.href === "/" ? "nav-back" : "nav-forward"]}
								className={cn(
									"rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
