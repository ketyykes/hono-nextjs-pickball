// 導航連結 active 判定的純函式；不依賴 React 或 next/navigation，方便在 lib 層單元測試。
//
// 首頁特判：首頁不是其他路由的父區段，只能在 pathname 恰為 "/" 時 active。
// 以 href + "/" 作為子路由前綴：同時涵蓋尾斜線（/quiz/）與多層子路由，
// 又能擋下前綴相似的路徑（/matchmakerx 對 /matchmaker、/tournament 對 /tour）。
export function isNavLinkActive(href: string, pathname: string): boolean {
	if (href === "/") {
		return pathname === "/";
	}
	return pathname === href || pathname.startsWith(href + "/");
}
