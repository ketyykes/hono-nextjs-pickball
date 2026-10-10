import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 迷思：兩條交叉線組成的叉。
export function MythMarkIcon({ className }: IconProps) {
	return (
		<IconSvg className={className} strokeWidth={3}>
			<path d="M6 6L18 18M18 6L6 18" />
		</IconSvg>
	);
}
