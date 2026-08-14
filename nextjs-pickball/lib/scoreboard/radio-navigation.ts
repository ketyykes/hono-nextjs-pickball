// WAI-ARIA APG radio group pattern 的方向鍵索引計算——「移動即選取」，
// 尾端／開頭循環，Home／End 跳到頭尾。純函式不碰 DOM，方便 TDD；
// 呼叫端（ScoreboardSetup.tsx）負責 focus 管理與實際選取副作用。

/** 依按鍵計算 radio group 的下一個索引；非導覽鍵回傳 null */
export function nextRadioIndex(
	currentIndex: number,
	total: number,
	key: string,
): number | null {
	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return (currentIndex + 1) % total;
		case "ArrowLeft":
		case "ArrowUp":
			return (currentIndex - 1 + total) % total;
		case "Home":
			return 0;
		case "End":
			return total - 1;
		default:
			return null;
	}
}
