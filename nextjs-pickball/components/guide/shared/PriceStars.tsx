"use client";

import { Star } from "lucide-react";
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
// 列高由每顆星的 svg（size-[1em]）決定，呼叫端以 className 覆蓋字級時星列會等比縮放。
export function PriceStars({ stars, className }: PriceStarsProps) {
	const rounded = Number.isFinite(stars) ? Math.round(stars) : MIN_STARS;
	const clamped = Math.min(MAX_STARS, Math.max(MIN_STARS, rounded));

	return (
		<span
			role="img"
			aria-label={`價位 ${clamped}／10 顆星`}
			className={cn(
				"inline-flex items-center whitespace-nowrap gap-px text-[0.8rem] leading-none",
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
						className={cn(
							"inline-flex",
							isFilled ? "text-amber-400" : "text-foreground/20",
						)}
					>
						<Star className="size-[1em] fill-current" strokeWidth={0} />
					</span>
				);
			})}
		</span>
	);
}
