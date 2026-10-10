import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 半場俯視圖：外框、中線與發球線，加上一道對角虛線箭頭。
export function ServeDiagonalIcon({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<rect x="3" y="3" width="18" height="18" />
			<path d="M12 3V21" />
			<path d="M3 8H21" />
			<path d="M6.5 17.5L8.3 15.7" />
			<path d="M10 14L11.8 12.2" />
			<path d="M13.5 10.5L15.3 8.7" />
			<path d="M15.5 12.5L17.5 6.5L11.5 8.5" />
		</IconSvg>
	);
}
