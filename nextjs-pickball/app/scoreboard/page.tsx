import type { Metadata } from "next";
import { Scoreboard } from "@/components/scoreboard/Scoreboard";

export const metadata: Metadata = {
	title: "計分板 | 匹克球指南",
	description: "支援單打與雙打的匹克球 Traditional 計分器",
};

interface ScoreboardPageProps {
	// Next.js 16：searchParams 為 Promise，MUST await 後取值（design Decision 3 §0.5
	// 已實測 node_modules/next/dist/docs 的 page.md）。同名 query string 重複出現時
	// 值為 string[]，此頁只取單一 matchId，因此收斂為單一 string | null。
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ScoreboardPage({ searchParams }: ScoreboardPageProps) {
	const params = await searchParams;
	const rawMatch = params.match;
	const matchId = Array.isArray(rawMatch) ? (rawMatch[0] ?? null) : (rawMatch ?? null);

	return (
		// key 綁 matchId：「改用獨立計分板」出口若走 soft navigation（同頁 URL 只是
		// 拿掉 query），Scoreboard 元件不會因此重新 mount，useScoreboardStore 的
		// read effect（依賴陣列為 []）不會重跑，會卡在原本的綁定狀態（見 §7 必處理坑）。
		<Scoreboard key={matchId ?? "standalone"} matchId={matchId} />
	);
}
