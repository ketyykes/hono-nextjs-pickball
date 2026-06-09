export interface BrandCardData {
	name: string;
	origin: string;
	description: string;
	price: string;
}

export const brands: readonly BrandCardData[] = [
	{
		name: "Selkirk",
		origin: "🇺🇸 美國・愛達荷州",
		description:
			"匹克球界領導品牌，以控球和觸球手感著稱。獨家 InfiniGrit 拍面技術提供出色旋轉能力。",
		price: "US$45–333",
	},
	{
		name: "JOOLA",
		origin: "🇩🇪 德國（原桌球品牌）",
		description:
			"贊助世界排名第一的 Ben Johns。碳纖維摩擦表面被認為旋轉性能最強之一。",
		price: "US$50–280",
	},
	{
		name: "HEAD",
		origin: "🇦🇹 奧地利（台灣有正式代理）",
		description:
			"全球知名網球品牌跨足匹克球，台灣最容易買到且選擇最多的國際品牌。",
		price: "NT$1,700–7,200",
	},
	{
		name: "Onix",
		origin: "🇺🇸 美國・加州",
		description:
			"最老牌的匹克球品牌之一，經典 Z5 Graphite 是全球最暢銷的入門到中階球拍。",
		price: "US$70–90",
	},
	{
		name: "JNICE 久奈司",
		origin: "🇹🇼 台灣本土品牌",
		description:
			"知名羽球品牌跨足匹克球，提供 Play / Game / Tour / Pro 四個等級的完整產品線。",
		price: "NT$1,500–5,000+",
	},
	{
		name: "MARC 馬克匹克球",
		origin: "🇹🇼 台灣在地品牌",
		description:
			"產品涵蓋木拍到碳纖維拍，也提供球網、場地標線等配件，以及教學和賽事服務。",
		price: "NT$320–4,200",
	},
] as const;
