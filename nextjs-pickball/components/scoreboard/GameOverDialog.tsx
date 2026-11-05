// components/scoreboard/GameOverDialog.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MATCHMAKER_ROUTE } from "@/lib/matchmaker/section-nav";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";

interface GameOverDialogProps {
	state: ScoreboardState;
	onPlayAgain: () => void;
	matchId?: string | null;
}

// 比賽結束時自動開啟。
// 獨立模式（matchId 為 null）提供「再來一局」與「關閉」；
// 綁定對戰場次時不提供「再來一局」——RESET 會把分槽改回 setup 並清空分數，對戰頁就無法回填比分，
// 改提供連到對戰頁的「返回對戰」（只導航）與「關閉」。
// 綁定與否用頁面傳入的 matchId prop 判斷，與設定列同一來源。
// 「關閉」用 dismissed 本地狀態暫時隱藏 dialog（仍保留 finished status 讓使用者檢視終局分數）。
// status 變動時用 React 認可的「previous render」pattern in-render reset dismissed，無需 useEffect。
export function GameOverDialog({ state, onPlayAgain, matchId = null }: GameOverDialogProps) {
	const [dismissed, setDismissed] = useState(false);
	const [prevStatus, setPrevStatus] = useState(state.status);

	// React docs: storing information from previous renders
	// https://react.dev/reference/react/useState#storing-information-from-previous-renders
	if (prevStatus !== state.status) {
		setPrevStatus(state.status);
		setDismissed(false);
	}

	const isBound = matchId !== null;
	const open = state.status === "finished" && !dismissed;
	const winnerLabel = state.winner === "us" ? "我方獲勝" : "對方獲勝";

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) setDismissed(true);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center justify-center gap-2 sm:justify-start">
						<Trophy className="size-5" />
						{winnerLabel}
					</DialogTitle>
					<DialogDescription>
						{state.scores.us} – {state.scores.them}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setDismissed(true)}>
						關閉
					</Button>
					{isBound ? (
						<Button asChild>
							<Link href={MATCHMAKER_ROUTE}>返回對戰</Link>
						</Button>
					) : (
						<Button onClick={onPlayAgain}>再來一局</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
