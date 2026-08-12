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
