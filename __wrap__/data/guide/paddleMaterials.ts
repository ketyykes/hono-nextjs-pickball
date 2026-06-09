export interface PaddleMaterialRow {
	material: string;
	weight: string;
	feel: string;
	price: string;
	suitable: string;
	recommended?: boolean;
}

export const paddleMaterialsHeaders = [
	"材質",
	"重量",
	"手感",
	"價格帶",
	"適合",
] as const;

export const paddleMaterials: readonly PaddleMaterialRow[] = [
	{
		material: "木質",
		weight: "270–400g",
		feel: "粗糙、震動大",
		price: "NT$320–800",
		suitable: "體驗用",
	},
	{
		material: "玻璃纖維",
		weight: "200–250g",
		feel: "柔韌彈力、減震佳",
		price: "NT$1,500–3,000",
		suitable: "入門首選",
		recommended: true,
	},
	{
		material: "碳纖維",
		weight: "200–240g",
		feel: "剛性清晰、甜區大",
		price: "NT$3,000+",
		suitable: "中高階",
	},
] as const;
