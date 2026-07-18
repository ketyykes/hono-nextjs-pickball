"use client";

import dynamic from "next/dynamic";

// Client Component wrapper：
// ssr: false 僅允許在 Client Component 中使用。
// 將 dynamic import 移至此處，讓 page.tsx（Server Component）匯入即可。
const QuizShell = dynamic(
	() => import("@/components/quiz/QuizShell").then((m) => m.QuizShell),
	{
		ssr: false,
		loading: () => (
			<div className="animate-pulse h-64 rounded-lg bg-muted" />
		),
	},
);

export function QuizClient() {
	return <QuizShell />;
}
