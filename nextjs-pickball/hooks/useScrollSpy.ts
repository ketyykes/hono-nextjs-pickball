import { useEffect, useState } from "react";

interface ScrollSpyOptions {
	rootMargin?: string;
	threshold?: number | number[];
}

// 觀察一組 section id，回傳目前可視中最後一個 active 的 id。
// 用於 sticky TOC 的 active link 切換。
export function useScrollSpy(
	ids: string[],
	options: ScrollSpyOptions = {},
): string | null {
	const { rootMargin = "-80px 0px -60% 0px", threshold = 0.2 } = options;
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (ids.length === 0) return;

		const elements = ids
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);

		if (elements.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				}
			},
			{ rootMargin, threshold },
		);

		for (const el of elements) observer.observe(el);

		return () => observer.disconnect();
	}, [ids, rootMargin, threshold]);

	return activeId;
}
