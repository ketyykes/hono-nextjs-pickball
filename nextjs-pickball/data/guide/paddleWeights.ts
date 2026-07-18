export interface PaddleWeightRow {
	tier: string;
	range: string;
	feature: string;
	target: string;
	recommended?: boolean;
}

export const paddleWeightsHeaders = [
	"重量分級",
	"範圍",
	"特性",
	"適合對象",
] as const;

export const paddleWeights: readonly PaddleWeightRow[] = [
	{
		tier: "輕量",
		range: "< 207g",
		feature: "靈活快速、控球佳，力量不足",
		target: "關節問題者",
	},
	{
		tier: "中量",
		range: "207–238g",
		feature: "力量與控球兼顧",
		target: "新手首選",
		recommended: true,
	},
	{
		tier: "重量",
		range: "> 238g",
		feature: "力量強大、操控較慢",
		target: "力量型選手",
	},
] as const;
