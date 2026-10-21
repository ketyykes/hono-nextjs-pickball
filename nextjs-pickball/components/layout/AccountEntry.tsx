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

// < sm 隱藏：320px 實測入口會把視口撐出 10px，窄螢幕改由 /login 登入登出。
// 圖示化、名稱放 aria-label／title 不佔寬度。
export function AccountEntry({ solid }: AccountEntryProps) {
	const session = useSession();

	// 載入中與未啟用都不渲染：正式站不會多出任何元素或寬度。
	if (session.status === "loading" || !session.authEnabled) {
		return null;
	}

	const className = cn(
		"hidden shrink-0 items-center sm:inline-flex",
		NAV_ITEM_BASE,
		navItemTone(solid),
	);

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
