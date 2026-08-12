"use client";

import { tocItems } from "@/data/guide/tocItems";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { getNavHeightPx } from "@/lib/navHeight";
import { cn } from "@/lib/utils";

const tocIds = tocItems.map((item) => item.id);

// 對應原型 .toc-bar：fixed overlay、橫向 scroll、依是否捲離 Hero 切換雙視覺狀態。
export function TocBar() {
	// 與 SiteNavbar 共用 --site-nav-h，避免高度數值散落各處。
	const pastHero = useScrolledPast(() => window.innerHeight - getNavHeightPx());
	const activeId = useScrollSpy(tocIds);

	return (
		<nav
			className={cn(
				"fixed top-14 right-0 left-0 z-[100] transition-[background-color,box-shadow,backdrop-filter] duration-300",
				pastHero
					? "bg-background/90 shadow-sm backdrop-blur-md"
					: "bg-slate-900/30 backdrop-blur-sm",
			)}
		>
			<div className="mx-auto flex max-w-[1200px] items-center gap-2 overflow-x-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<span
					className={cn(
						"mr-2 border-r-2 py-4 pr-3 font-outfit text-[0.7rem] font-extrabold tracking-[2px] whitespace-nowrap transition-colors duration-300",
						pastHero
							? "border-border text-slate-900"
							: "border-white/20 text-white",
					)}
				>
					目錄
				</span>
				{tocItems.map((item) => {
					const isActive = activeId === item.id;
					return (
						<a
							key={item.id}
							href={`#${item.id}`}
							className={cn(
								"border-b-2 border-transparent px-4 py-4 text-[0.82rem] font-medium whitespace-nowrap transition-colors duration-300",
								pastHero
									? "text-muted-foreground hover:border-b-lime-400 hover:text-slate-900"
									: "text-white/70 hover:border-b-lime-400 hover:text-white",
								isActive &&
									(pastHero
										? "border-b-lime-400 text-slate-900"
										: "border-b-lime-400 text-white"),
							)}
						>
							{item.label}
						</a>
					);
				})}
			</div>
		</nav>
	);
}
