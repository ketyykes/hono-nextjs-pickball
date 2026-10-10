import { IconSvg } from "./IconSvg";
import type { IconProps } from "./types";

// 長方圓角拍面加短粗握把才是匹克球拍（圓形拍面會被誤讀為搜尋圖示）；
// 實心球壓在拍面右上緣，與球拍同色（皆為 currentColor）。
export function LogoMark({ className }: IconProps) {
	return (
		<IconSvg className={className}>
			<g transform="rotate(-25 10.5 11)">
				<rect x="7" y="2.5" width="7" height="12" rx="3" />
				<rect x="9.25" y="14.5" width="2.5" height="5" rx="1" />
			</g>
			<circle cx="15.5" cy="7" r="3.5" fill="currentColor" stroke="none" />
		</IconSvg>
	);
}
