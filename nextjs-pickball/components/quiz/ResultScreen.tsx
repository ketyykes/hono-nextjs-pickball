"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ResultScreenProps {
	correctCount: number;
	total: number;
	onRestart: () => void;
}

function getEncouragement(correct: number, total: number): string {
	const ratio = correct / total;
	if (ratio >= 0.8) return "太強了！你已經是規則達人了 🏆";
	if (ratio >= 0.5) return "不錯！再練習幾次就能完全掌握規則 💪";
	return "繼續加油，回去再讀一次指南吧！📖";
}

export function ResultScreen({ correctCount, total, onRestart }: ResultScreenProps) {
	const encouragement = getEncouragement(correctCount, total);

	return (
		<div className="flex flex-col items-center gap-8 py-8 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="text-6xl font-bold tabular-nums">
					{correctCount}
					<span className="text-3xl font-normal text-muted-foreground"> / {total}</span>
				</p>
				<p className="text-muted-foreground">答對題數</p>
			</div>

			<p className="text-lg font-medium">{encouragement}</p>

			<div className="flex w-full max-w-xs flex-col gap-3">
				<Button onClick={onRestart} size="lg" className="w-full">
					再試一次
				</Button>
				<Button variant="outline" size="lg" className="w-full" asChild>
					<Link href="/">回到指南</Link>
				</Button>
			</div>
		</div>
	);
}
