// matchmaker 區段導覽（對戰／參賽者）的分頁清單與 active 判定——純函式，
// 不 import React 或 next/navigation，純函式才能在 lib/ 這一層做單元測試
// （design Decision 2）；「兩頁共用一份判定」本身是 app/matchmaker/layout.tsx
// 只掛一份導覽所保證的，非本模組職責。

/** matchmaker 區段導覽的單一分頁 */
export interface MatchmakerSectionTab {
	readonly label: string;
	readonly href: string;
	readonly active: boolean;
}

const MATCHMAKER_SECTION_HREFS = ["/matchmaker", "/matchmaker/players"] as const;

const MATCHMAKER_SECTION_LABELS: Record<
	(typeof MATCHMAKER_SECTION_HREFS)[number],
	string
> = {
	"/matchmaker": "對戰",
	"/matchmaker/players": "參賽者",
};

// 精確比對（===）是刻意的：目前 app/matchmaker/ 下沒有巢狀路由，非本區段的
// 路徑（例如子路由未來若存在）一律回傳全部非 active，不做前綴比對。
export function matchmakerSectionTabs(
	pathname: string,
): MatchmakerSectionTab[] {
	return MATCHMAKER_SECTION_HREFS.map((href) => ({
		label: MATCHMAKER_SECTION_LABELS[href],
		href,
		active: pathname === href,
	}));
}
