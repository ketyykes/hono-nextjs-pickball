import type { Metadata } from "next";
import { TourShell } from "@/components/tour/TourShell";
import { CourtSizeStage } from "@/components/tour/stages/CourtSizeStage";
import { PlayerGrowthStage } from "@/components/tour/stages/PlayerGrowthStage";
import { TwoBounceStage } from "@/components/tour/stages/TwoBounceStage";
import { KitchenViolationStage } from "@/components/tour/stages/KitchenViolationStage";
import { MaterialsSpectrumStage } from "@/components/tour/stages/MaterialsSpectrumStage";
import { ClosingStage } from "@/components/tour/stages/ClosingStage";

export const metadata: Metadata = {
	title: "匹克球新手完全入門 · 互動體驗 | 匹克球指南",
	description: "用捲動的方式快速看完匹克球規則與器材重點，6 個互動場景帶你 5 分鐘上手",
};

export default function TourPage() {
	return (
		<TourShell>
			<CourtSizeStage />
			<PlayerGrowthStage />
			<TwoBounceStage />
			<KitchenViolationStage />
			<MaterialsSpectrumStage />
			<ClosingStage />
		</TourShell>
	);
}
