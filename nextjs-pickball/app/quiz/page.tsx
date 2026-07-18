import type { Metadata } from "next";

import { QuizClient } from "./QuizClient";

export const metadata: Metadata = {
	title: "規則隨堂測驗 | 匹克球指南",
	description: "從 25 道題庫中隨機抽 10 題，測驗你對匹克球規則的掌握程度",
};

export default function QuizPage() {
	return (
		<div className="min-h-screen bg-background pt-14">
			<div className="mx-auto max-w-[640px] px-6 py-12">
				<div className="mb-8">
					<h1 className="font-outfit text-3xl font-bold tracking-tight">
						規則隨堂測驗
					</h1>
					<p className="mt-2 text-muted-foreground">
						隨機抽取 10 題，測驗你對匹克球規則的掌握程度
					</p>
				</div>
				<QuizClient />
			</div>
		</div>
	);
}
