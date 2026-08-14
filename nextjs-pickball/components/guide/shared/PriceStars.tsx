"use client";

import { cn } from "@/lib/utils";

interface PriceStarsProps {
	/** 價位星級，1（最平價）～ 10（頂級）；超出範圍會收斂至邊界 */
	stars: number;
	className?: string;
}

const MIN_STARS = 1;
const MAX_STARS = 10;

// 以 1~10 顆星取代實際金額，星數語意由 aria-label 提供給輔助科技。
//
// ⚠️ 呼叫端若要用 className 覆蓋字級（如 `text-lg`），必須一併帶上 `leading-none`：
// twMerge 把所有 text-{size} 與 leading-* 歸為同一衝突群組並套用「後者覆蓋前者」
// （刻意設計，因 Tailwind 的 text-{size} 本身即可連帶設定 line-height），而 className
// 會被 cn() append 在最後，因此傳入任何 text-* 都會把下方的 leading-none 一併吃掉，
// 星列改用瀏覽器預設行高而非緊排。目前三個呼叫端皆未傳 className，尚未觸發。
export function PriceStars({ stars, className }: PriceStarsProps) {
	const rounded = Number.isFinite(stars) ? Math.round(stars) : MIN_STARS;
	const clamped = Math.min(MAX_STARS, Math.max(MIN_STARS, rounded));

	return (
		<span
			role="img"
			aria-label={`價位 ${clamped}／10 顆星`}
			className={cn(
				"inline-flex items-center whitespace-nowrap text-[0.8rem] leading-none tracking-[1px]",
				className,
			)}
		>
			{Array.from({ length: MAX_STARS }, (_, index) => {
				const isFilled = index < clamped;
				return (
					<span
						key={index}
						aria-hidden="true"
						data-star={isFilled ? "filled" : "empty"}
						className={isFilled ? "text-amber-400" : "text-foreground/20"}
					>
						★
					</span>
				);
			})}
		</span>
	);
}
