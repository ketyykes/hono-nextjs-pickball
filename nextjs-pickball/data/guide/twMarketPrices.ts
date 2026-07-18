export interface MarketPriceRow {
	tier: string;
	priceRange: string;
	example: string;
	recommended?: boolean;
}

export const twMarketHeaders = ["等級", "價格區間", "代表產品"] as const;

export const twMarketPrices: readonly MarketPriceRow[] = [
	{
		tier: "木拍 / 最入門",
		priceRange: "NT$320–800",
		example: "INFMARC 木拍",
	},
	{
		tier: "入門（玻纖/複合）",
		priceRange: "NT$1,500–3,000",
		example: "HEAD Kickstarter、INFMARC MARC001",
		recommended: true,
	},
	{
		tier: "中階（碳纖維）",
		priceRange: "NT$3,000–5,000",
		example: "HEAD Radical PRO、JOOLA 入門款",
	},
	{
		tier: "進階 / 選手級",
		priceRange: "NT$5,000–8,000+",
		example: "HEAD Gravity Tour、adidas Adipower PRO",
	},
	{
		tier: "精品 / 頂級",
		priceRange: "NT$8,000–15,000+",
		example: "MON CARBONE 設計師款",
	},
	{
		tier: "入門雙拍套組",
		priceRange: "NT$1,500–5,000",
		example: "HEICK 入門組、HEAD Pack Spark",
		recommended: true,
	},
] as const;
