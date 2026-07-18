import { useEffect, useState } from "react";

// 偵測 window 捲動是否超過 threshold，回傳 boolean 供 sticky 元素切換陰影。
export function useScrollShadow(threshold = 100): boolean {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => {
			setScrolled(window.scrollY > threshold);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [threshold]);

	return scrolled;
}
