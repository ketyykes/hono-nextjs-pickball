import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 手機由直轉橫：左上直式手機、右下橫式手機，中間一道弧形箭頭。
export function RotateToLandscapeIcon({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<rect x="2.75" y="3.75" width="7" height="11" rx="1.5" />
			<rect x="12.75" y="14.75" width="9" height="6" rx="1.5" />
			<path d="M13 6.5Q19 5 19.5 11" />
			<path d="M17.5 9.5L19.5 11.5L21.5 9.5" />
		</IconSvg>
	);
}
