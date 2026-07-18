export interface TocItem {
	id: string;
	label: string;
}

export const tocItems: readonly TocItem[] = [
	{ id: "court", label: "場地" },
	{ id: "serve", label: "發球" },
	{ id: "scoring", label: "計分" },
	{ id: "fouls", label: "犯規" },
	{ id: "kitchen", label: "廚房" },
	{ id: "materials", label: "材質" },
	{ id: "specs", label: "規格" },
	{ id: "brands", label: "品牌" },
	{ id: "tw-market", label: "台灣市場" },
	{ id: "starter", label: "入門套組" },
] as const;
