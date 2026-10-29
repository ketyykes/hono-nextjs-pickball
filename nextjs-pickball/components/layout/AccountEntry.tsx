"use client";

import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { NAV_ITEM_BASE, navItemTone } from "@/components/layout/navItemStyles";
import { useSession } from "@/hooks/useSession";
import { signOut } from "@/lib/auth/session-client";
import { cn } from "@/lib/utils";

interface AccountEntryProps {
	/** 與 SiteNavbar 相同：navbar 是否為白底樣式。 */
	solid: boolean;
}

// 版面 class 三種狀態共用同一份：佔位元素與登入／登出入口寬度必須一致，
// 日後只改其中一個分支就會悄悄產生寬度差。
// 入口圖示化、名稱放 aria-label／title，只佔一格圖示加內距的寬度；
// 窄螢幕能顯示，靠 NAV_ITEM_BASE 與 navbar 容器間距讓出空間，這裡不可再用斷點隱藏。
function entryLayoutClass(solid: boolean): string {
	return cn(
		"inline-flex shrink-0 items-center",
		NAV_ITEM_BASE,
		navItemTone(solid),
	);
}

export function AccountEntry({ solid }: AccountEntryProps) {
	const session = useSession();
	const className = entryLayoutClass(solid);

	// 是否啟用要等 /api/session 回應才知道；<nav> 靠 ml-auto 貼右，入口從無到有會把
	// 導航連結整個推左。載入中與未啟用都渲染同寬的隱形佔位，回應前後連結位置才不變。
	if (session.status === "loading" || !session.authEnabled) {
		return (
			<span
				aria-hidden="true"
				data-account-entry={session.status === "loading" ? "loading" : "disabled"}
				className={cn(className, "invisible")}
			>
				<span className="size-4" />
			</span>
		);
	}

	if (session.user === null) {
		return (
			<Link
				href="/login"
				transitionTypes={["nav-forward"]}
				aria-label="登入"
				className={className}
			>
				<LogIn className="size-4" aria-hidden="true" />
			</Link>
		);
	}

	async function handleSignOut() {
		await signOut();
		await session.refresh();
	}

	return (
		<button
			type="button"
			aria-label="登出"
			title={`已登入：${session.user.name}`}
			className={className}
			onClick={handleSignOut}
		>
			<LogOut className="size-4" aria-hidden="true" />
		</button>
	);
}
