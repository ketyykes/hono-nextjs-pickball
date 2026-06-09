"use client";

import { useState } from "react";
import { QUESTION_BANK } from "@/data/quiz/questions";
import type { ShuffledQuestion, MultipleChoiceQuestion } from "@/data/quiz/questions";

const QUIZ_SIZE = 10;

function shuffleArray<T>(arr: T[]): T[] {
	const result = [...arr];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/**
 * 從題庫抽 QUIZ_SIZE 題並洗牌：
 * - multiple-choice：選項 Fisher-Yates 洗牌，shuffledCorrectIndex 同步更新。
 * - true-false：選項固定為 ["正確", "錯誤"]，shuffledCorrectIndex = correct ? 0 : 1。
 */
function buildShuffledQuestions(): ShuffledQuestion[] {
	const picked = shuffleArray([...QUESTION_BANK]).slice(0, QUIZ_SIZE);
	return picked.map((q) => {
		if (q.type === "true-false") {
			return { ...q, shuffledCorrectIndex: q.correct ? 0 : 1 };
		}
		const mc = q as MultipleChoiceQuestion;
		const indices = shuffleArray([...mc.options.keys()]);
		const shuffledOptions = indices.map((i) => mc.options[i]);
		const shuffledCorrectIndex = indices.indexOf(mc.correctIndex);
		const { correctIndex: _correctIndex, ...rest } = mc;
		return { ...rest, options: shuffledOptions, shuffledCorrectIndex };
	});
}

type QuizPhase = "answering" | "revealed" | "finished";

interface QuizState {
	questions: ShuffledQuestion[];
	currentIndex: number;
	phase: QuizPhase;
	selectedOption: number | null;
	answers: boolean[];
}

function createInitialState(): QuizState {
	return {
		questions: buildShuffledQuestions(),
		currentIndex: 0,
		phase: "answering",
		selectedOption: null,
		answers: [],
	};
}

export interface UseQuizReturn {
	questions: ShuffledQuestion[];
	currentIndex: number;
	phase: QuizPhase;
	selectedOption: number | null;
	answers: boolean[];
	selectOption: (index: number) => void;
	nextQuestion: () => void;
	restart: () => void;
}

export function useQuiz(): UseQuizReturn {
	const [state, setState] = useState<QuizState>(createInitialState);

	function selectOption(index: number) {
		// guard 必須讀 updater 內最新的 s.phase，避免同一 render 的 closure 連呼時漏擋。
		setState((s) => {
			if (s.phase !== "answering") return s;
			const isCorrect = index === s.questions[s.currentIndex].shuffledCorrectIndex;
			return {
				...s,
				phase: "revealed",
				selectedOption: index,
				answers: [...s.answers, isCorrect],
			};
		});
	}

	function nextQuestion() {
		// guard 與 isLast 一起搬進 updater，確保決策依據是最新的 s 而非 closure 快照。
		setState((s) => {
			if (s.phase !== "revealed") return s;
			const isLast = s.currentIndex === s.questions.length - 1;
			return {
				...s,
				currentIndex: isLast ? s.currentIndex : s.currentIndex + 1,
				phase: isLast ? "finished" : "answering",
				selectedOption: null,
			};
		});
	}

	function restart() {
		setState(createInitialState);
	}

	return {
		questions: state.questions,
		currentIndex: state.currentIndex,
		phase: state.phase,
		selectedOption: state.selectedOption,
		answers: state.answers,
		selectOption,
		nextQuestion,
		restart,
	};
}
