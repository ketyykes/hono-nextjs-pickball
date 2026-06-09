export interface PlayerGrowthDatum {
	readonly year: number;
	readonly players: number;
}

// 台灣匹克球玩家數量年度成長（公開新聞估計值，作為 stage 2 折線圖示意用）。
// 數據刻意採整數，便於補間與顯示。
export const playerGrowth: readonly PlayerGrowthDatum[] = [
	{ year: 2020, players: 5_000 },
	{ year: 2021, players: 12_000 },
	{ year: 2022, players: 35_000 },
	{ year: 2023, players: 70_000 },
	{ year: 2024, players: 110_000 },
	{ year: 2025, players: 140_000 },
] as const;
