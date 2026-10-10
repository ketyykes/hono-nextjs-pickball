import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 俯視圖：廚房（non-volley zone）緊貼球網兩側，以半透明填色標示；
// 中線只畫在廚房以外的發球區。
export function KitchenZoneIcon({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<rect
				x="3"
				y="9"
				width="18"
				height="6"
				fill="currentColor"
				fillOpacity={0.35}
				stroke="none"
			/>
			<rect x="3" y="3" width="18" height="18" />
			<path d="M12 3V9" />
			<path d="M12 15V21" />
			<path d="M3 12H21" strokeWidth="2.25" />
		</IconSvg>
	);
}
