"use client";

import { useQuiz } from "@/hooks/useQuiz";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { ResultScreen } from "@/components/quiz/ResultScreen";

export function QuizShell() {
	const {
		questions,
		currentIndex,
		phase,
		selectedOption,
		answers,
		selectOption,
		nextQuestion,
		restart,
	} = useQuiz();

	const total = questions.length;
	const correctCount = answers.filter(Boolean).length;

	if (phase === "finished") {
		return (
			<ResultScreen
				correctCount={correctCount}
				total={total}
				onRestart={restart}
			/>
		);
	}

	const currentQuestion = questions[currentIndex];
	const isLastQuestion = currentIndex === total - 1;
	const progressPercent =
		((currentIndex + (phase === "revealed" ? 1 : 0)) / total) * 100;

	return (
		<div className="flex flex-col gap-4">
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			<QuestionCard
				question={currentQuestion}
				questionNumber={currentIndex + 1}
				total={total}
				phase={phase}
				selectedOption={selectedOption}
				onSelect={selectOption}
				onNext={nextQuestion}
				isLastQuestion={isLastQuestion}
			/>
		</div>
	);
}
