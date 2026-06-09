// components/scoreboard/GameOverDialog.tsx
"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ScoreboardState } from "@/lib/scoreboard/types";

interface GameOverDialogProps {
	state: ScoreboardState;
	onPlayAgain: () => void;
}

// 比賽結束時自動開啟；提供「再來一局」與「關閉」。
// 「關閉」用 dismissed 本地狀態暫時隱藏 dialog（仍保留 finished status 讓使用者檢視終局分數）。
// status 變動時用 React 認可的「previous render」pattern in-render reset dismissed，無需 useEffect。
export function GameOverDialog({ state, onPlayAgain }: GameOverDialogProps) {
	const [dismissed, setDismissed] = useState(false);
	const [prevStatus, setPrevStatus] = useState(state.status);

	// React docs: storing information from previous renders
	// https://react.dev/reference/react/useState#storing-information-from-previous-renders
	if (prevStatus !== state.status) {
		setPrevStatus(state.status);
		setDismissed(false);
	}

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
					<DialogTitle>🏆 {winnerLabel}</DialogTitle>
					<DialogDescription>
						{state.scores.us} – {state.scores.them}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setDismissed(true)}>
						關閉
					</Button>
					<Button onClick={onPlayAgain}>再來一局</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
