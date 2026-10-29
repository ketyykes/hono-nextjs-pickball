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
// < sm 隱藏：320px 實測入口會把視口撐出 10px，窄螢幕改由 /login 登入登出。
// 圖示化、名稱放 aria-label／title 不佔寬度。
function entryLayoutClass(solid: boolean): string {
	return cn(
		"hidden shrink-0 items-center sm:inline-flex",
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
