import { useEffect, useState, type RefObject } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";

interface Options {
	// 動畫從 0 跑到 1 的秒數，預設 1.5s
	duration?: number;
	// 進入 viewport 的觸發比例（IntersectionObserver threshold），預設 0.5
	amount?: number;
	// 是否只觸發一次，預設 true（一次性進場動畫）
	once?: boolean;
	// IntersectionObserver root；當 stage 在內部 scroll container（如 /tour 的 main）時必須提供
	root?: RefObject<Element | null>;
}

// 元素進入 viewport（或自訂 root）時，啟動一次性的 0→1 motion 動畫；可作為 stage 進場動畫的進度來源。
// 自行管理 IntersectionObserver 而不用 motion useInView，是因 useInView 對「root 是內部 scroll container
// 且初始 target 不在 viewport」的場景觸發不可靠（stage 6 始終回 false）。
export function useEnterAnimationProgress(
	target: RefObject<Element | null>,
	options: Options = {},
): MotionValue<number> {
	const { duration = 1.5, amount = 0.5, once = true, root } = options;
	const progress = useMotionValue(0);
	const [isInView, setIsInView] = useState(false);

	useEffect(() => {
		const targetEl = target.current;
		if (!targetEl) return;
		const rootEl = root?.current ?? null;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio >= amount) {
						setIsInView(true);
						if (once) observer.disconnect();
					} else if (!once) {
						setIsInView(false);
					}
				}
			},
			{ root: rootEl, threshold: amount },
		);
		observer.observe(targetEl);
		return () => observer.disconnect();
	}, [target, root, amount, once]);

	useEffect(() => {
		if (!isInView) return;
		const controls = animate(progress, 1, { duration, ease: "easeOut" });
		return () => controls.stop();
	}, [isInView, progress, duration]);

	return progress;
}
