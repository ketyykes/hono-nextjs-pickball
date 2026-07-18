import { getServeSide } from "@/lib/scoreboard/rules";
import type { ServerNumber } from "@/lib/scoreboard/types";

interface ServeIndicatorProps {
	servingTeamScore: number;
	serverNumber: ServerNumber;
	showServerNumber: boolean; // 雙打才顯示
}

// 顯示 ● 與「Server #N · 左/右場」文字；展示用元件
export function ServeIndicator({
	servingTeamScore,
	serverNumber,
	showServerNumber,
}: ServeIndicatorProps) {
	const side = getServeSide(servingTeamScore);
	const sideLabel = side === "right" ? "右場" : "左場";
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<span className="inline-block h-2 w-2 rounded-full bg-lime-400" aria-hidden />
			<span>
				{showServerNumber ? `Server #${serverNumber} · ` : ""}
				{sideLabel}
			</span>
		</div>
	);
}
