import type { Metadata } from "next";
import { Scoreboard } from "@/components/scoreboard/Scoreboard";

export const metadata: Metadata = {
	title: "計分板 | 匹克球指南",
	description: "支援單打與雙打的匹克球 Traditional 計分器",
};

export default function ScoreboardPage() {
	return <Scoreboard />;
}
