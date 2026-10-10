"use client";

import Link from "next/link";
import { BicepsFlexed, BookOpen, Trophy, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResultScreenProps {
	correctCount: number;
	total: number;
	onRestart: () => void;
}

function getEncouragement(correct: number, total: number): { text: string; Icon: LucideIcon } {
	const ratio = correct / total;
	if (ratio >= 0.8) return { text: "太強了！你已經是規則達人了", Icon: Trophy };
	if (ratio >= 0.5) return { text: "不錯！再練習幾次就能完全掌握規則", Icon: BicepsFlexed };
	return { text: "繼續加油，回去再讀一次指南吧！", Icon: BookOpen };
}

export function ResultScreen({ correctCount, total, onRestart }: ResultScreenProps) {
	const { text: encouragementText, Icon: EncouragementIcon } = getEncouragement(correctCount, total);

	return (
		<div className="flex flex-col items-center gap-8 py-8 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="text-6xl font-bold tabular-nums">
					{correctCount}
					<span className="text-3xl font-normal text-muted-foreground"> / {total}</span>
				</p>
				<p className="text-muted-foreground">答對題數</p>
			</div>

			<p className="inline-flex items-center gap-2 text-lg font-medium">
				{encouragementText}
				<EncouragementIcon className="size-5" />
			</p>

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
