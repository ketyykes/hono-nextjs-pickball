import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 價位星級的單顆五角星：實心填色、無描邊。
export function StarIcon({ className }: IconProps) {
	return (
		<IconSvg className={className} variant="solid">
			<path d="M12 2.5L14.9 8.6L21.5 9.4L16.6 14L17.9 20.6L12 17.3L6.1 20.6L7.4 14L2.5 9.4L9.1 8.6Z" />
		</IconSvg>
	);
}
