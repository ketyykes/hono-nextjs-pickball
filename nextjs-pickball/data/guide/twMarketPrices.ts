export interface MarketPriceRow {
	tier: string;
	/** 價位星級：1 = 最平價、10 = 頂級，依台灣市場行情相對定位 */
	priceStars: number;
	example: string;
	recommended?: boolean;
}

export const twMarketHeaders = ["等級", "價位", "代表產品"] as const;

export const twMarketPrices: readonly MarketPriceRow[] = [
	{
		tier: "木拍 / 最入門",
		priceStars: 1,
		example: "INFMARC 木拍",
	},
	{
		tier: "入門（玻纖/複合）",
		priceStars: 3,
		example: "HEAD Kickstarter、INFMARC MARC001",
		recommended: true,
	},
	{
		tier: "中階（碳纖維）",
		priceStars: 5,
		example: "HEAD Radical PRO、JOOLA 入門款",
	},
	{
		tier: "進階 / 選手級",
		priceStars: 7,
		example: "HEAD Gravity Tour、adidas Adipower PRO",
	},
	{
		tier: "精品 / 頂級",
		priceStars: 10,
		example: "MON CARBONE 設計師款",
	},
	{
		tier: "入門雙拍套組",
		priceStars: 4,
		example: "HEICK 入門組、HEAD Pack Spark",
		recommended: true,
	},
] as const;
