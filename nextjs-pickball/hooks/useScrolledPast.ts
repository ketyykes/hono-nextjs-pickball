import { useEffect, useState } from "react";

// 偵測 window 捲動是否超過 threshold，回傳 boolean。threshold 可為固定 number
// 或 getter function（供動態讀取 window.innerHeight - navHeight 等情境）。
export function useScrolledPast(threshold: number | (() => number)): boolean {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => {
			const current =
				typeof threshold === "function" ? threshold() : threshold;
			setScrolled(window.scrollY > current);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [threshold]);

	return scrolled;
}
