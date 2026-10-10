import type { ReactNode } from "react";
import type { IconProps } from "./types";

interface IconSvgProps extends IconProps {
	children: ReactNode;
	/** 線稿線寬，預設 1.5；用在小尺寸粗體標籤旁時可加粗 */
	strokeWidth?: number;
	/** outline：無填色、currentColor 描邊；solid：currentColor 填色、無描邊 */
	variant?: "outline" | "solid";
}

// 八個符號共用的 svg 根：預設為線稿風格（線寬 1.5、圓頭圓角）、對輔助科技隱藏。
// 顏色一律取 currentColor，由呼叫端以文字色決定。
export function IconSvg({
	className,
	children,
	strokeWidth = 1.5,
	variant = "outline",
}: IconSvgProps) {
	const isSolid = variant === "solid";
	return (
		<svg
			viewBox="0 0 24 24"
			fill={isSolid ? "currentColor" : "none"}
			stroke={isSolid ? "none" : "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={className}
		>
			{children}
		</svg>
	);
}
