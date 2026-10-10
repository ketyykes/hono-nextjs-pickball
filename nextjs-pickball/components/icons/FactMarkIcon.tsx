import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 正確規則：單一折線組成的勾。
export function FactMarkIcon({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<path d="M5 12.5L10 17.5L19 7" />
		</IconSvg>
	);
}
