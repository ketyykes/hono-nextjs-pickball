import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 側視圖：球落地彈起兩次，兩個落點以實心圓標出。
export function DoubleBounceIcon({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<path d="M2 20H22" />
			<path d="M3 4Q5 18 8 18" />
			<circle cx="8" cy="18" r="1.75" fill="currentColor" stroke="none" />
			<path d="M8 18Q11.5 6 15 18" />
			<circle cx="15" cy="18" r="1.75" fill="currentColor" stroke="none" />
			<path d="M15 18Q17.5 11 20 14" />
		</IconSvg>
	);
}
