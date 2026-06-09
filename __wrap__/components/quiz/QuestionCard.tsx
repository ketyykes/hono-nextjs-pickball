"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ShuffledQuestion } from "@/data/quiz/questions";

interface QuestionCardProps {
	question: ShuffledQuestion;
	questionNumber: number;
	total: number;
	phase: "answering" | "revealed";
	selectedOption: number | null;
	onSelect: (index: number) => void;
	onNext: () => void;
	isLastQuestion: boolean;
}

function getDisplayOptions(q: ShuffledQuestion): string[] {
	if (q.type === "true-false") return ["正確", "錯誤"];
	return q.options;
}

function getOptionStyle(
	index: number,
	correctIndex: number,
	selectedOption: number | null,
	phase: "answering" | "revealed",
): string {
	if (phase === "answering") {
		return "border-border bg-background hover:bg-muted hover:border-slate-400";
	}
	if (index === correctIndex) {
		return "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200";
	}
	if (index === selectedOption) {
		return "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200";
	}
	return "border-border bg-background opacity-50";
}

export function QuestionCard({
	question,
	questionNumber,
	total,
	phase,
	selectedOption,
	onSelect,
	onNext,
	isLastQuestion,
}: QuestionCardProps) {
	const options = getDisplayOptions(question);

	return (
		<div className="flex flex-col gap-6">
			<p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
				第 {questionNumber} 題，共 {total} 題
			</p>

			<h2 className="text-xl font-semibold leading-snug">{question.text}</h2>

			<div className="flex flex-col gap-3">
				{options.map((option, index) => (
					<button
						key={index}
						disabled={phase === "revealed"}
						onClick={() => onSelect(index)}
						className={cn(
							"w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
							getOptionStyle(index, question.shuffledCorrectIndex, selectedOption, phase),
						)}
					>
						{option}
					</button>
				))}
			</div>

			{phase === "revealed" && (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
					<span className="font-semibold">解說：</span>
					{question.explanation}
				</div>
			)}

			{phase === "revealed" && (
				<Button onClick={onNext} className="self-end">
					{isLastQuestion ? "看結果" : "下一題"}
				</Button>
			)}
		</div>
	);
}
