// SiteNavbar 連結與 AccountEntry 共用：入口必須和連結同寬度階梯、同配色，
// 抽成單一來源避免日後只改其中一邊而悄悄分歧。
export const NAV_ITEM_BASE =
	"rounded-md px-1.5 py-2 text-sm font-medium whitespace-nowrap transition-colors max-[375px]:px-1 sm:px-3";

export function navItemTone(solid: boolean): string {
	if (solid) {
		return "text-muted-foreground hover:text-slate-900";
	}
	return "text-white/70 hover:text-white";
}
