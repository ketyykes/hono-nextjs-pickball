import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./types";

// 八個符號共用的 svg 根：線稿風格（線寬 1.5、圓頭圓角）、對輔助科技隱藏。
// 顏色一律取 currentColor，由呼叫端以文字色決定。
export function IconSvg({
	className,
	children,
}: IconProps & { children: ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={cn(className)}
		>
			{children}
		</svg>
	);
}
