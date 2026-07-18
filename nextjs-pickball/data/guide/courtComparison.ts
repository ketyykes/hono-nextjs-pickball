export interface ComparisonRow {
	label: string;
	values: string[];
}

export const courtComparisonHeaders = [
	"比較項目",
	"匹克球",
	"網球（雙打）",
	"羽球（雙打）",
] as const;

export const courtComparisonRows: readonly ComparisonRow[] = [
	{ label: "場地長度", values: ["13.41 m", "23.77 m", "13.41 m"] },
	{ label: "場地寬度", values: ["6.10 m", "10.97 m", "6.10 m"] },
	{ label: "網高（中央）", values: ["86 cm", "91 cm", "152 cm"] },
	{ label: "場地面積", values: ["81.75 m²", "260.87 m²", "81.75 m²"] },
] as const;
