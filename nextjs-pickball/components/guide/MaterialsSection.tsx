"use client";

import { Badge } from "@/components/ui/badge";
import {
	paddleMaterials,
	paddleMaterialsHeaders,
} from "@/data/guide/paddleMaterials";
import { ComparisonTable } from "./shared/ComparisonTable";
import { Section } from "./shared/Section";

export function MaterialsSection() {
	return (
		<Section
			id="materials"
			tag="拍面與芯材"
			title="三大拍面材質決定你的打球手感"
		>
			<ComparisonTable
				headers={paddleMaterialsHeaders}
				rows={paddleMaterials.map((row) => [
					row.material,
					row.weight,
					row.feel,
					row.price,
					<>
						{row.suitable}
						{row.recommended && (
							<Badge className="ml-2 bg-lime-400 text-slate-900 hover:bg-lime-400">
								推薦
							</Badge>
						)}
					</>,
				])}
			/>

			<p>
				球拍內芯同樣重要。
				<strong>聚丙烯蜂巢芯</strong>是目前最主流的芯材，柔軟安靜、甜區大、容錯率高，最適合新手。Nomex 芯較硬力量大但噪音也大；2024–2025 年崛起的
				<strong>泡棉芯</strong>提供極致控球手感，屬進階玩家的新選擇。
			</p>
		</Section>
	);
}
