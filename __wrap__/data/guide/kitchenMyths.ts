export interface MythFactPair {
	myth: string;
	fact: string;
}

export const kitchenMyths: readonly MythFactPair[] = [
	{
		myth: "完全不能踏入廚房",
		fact: "隨時都能進入，只是不能在裡面截擊",
	},
	{
		myth: "球必須先彈在廚房才能進去",
		fact: "任何時候都能進入，與球是否彈跳無關",
	},
	{
		myth: "球拍不能伸入廚房上空",
		fact: "球拍可以伸入上空截擊，只要腳不觸碰廚房",
	},
	{
		myth: "截擊後對手已回球，動量就不算",
		fact: "動量犯規不受後續狀態影響，會被追溯",
	},
] as const;
