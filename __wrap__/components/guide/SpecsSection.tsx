"use client";

import { Badge } from "@/components/ui/badge";
import {
	paddleWeights,
	paddleWeightsHeaders,
} from "@/data/guide/paddleWeights";
import { ComparisonTable } from "./shared/ComparisonTable";
import { Section } from "./shared/Section";

export function SpecsSection() {
	return (
		<Section
			id="specs"
			tag="重量・握把・拍面"
			title="中等重量、寬拍面、適當握把是新手的黃金組合"
		>
			<ComparisonTable
				headers={paddleWeightsHeaders}
				rows={paddleWeights.map((row) => [
					<>
						{row.tier}
						{row.recommended && (
							<Badge className="ml-2 bg-lime-400 text-slate-900 hover:bg-lime-400">
								推薦
							</Badge>
						)}
					</>,
					row.recommended ? <strong>{row.range}</strong> : row.range,
					row.recommended ? <strong>{row.feature}</strong> : row.feature,
					row.recommended ? <strong>{row.target}</strong> : row.target,
				])}
			/>

			<p>
				<strong>握把尺寸</strong>的選擇常被忽略。測量方法：張開慣用手，從掌心中間橫紋量到無名指指尖，這個長度就是理想握把周長。常見尺寸為 4&quot;（小手）、4.25&quot;（多數成人適用）、4.5&quot;（大手）。拿不定時選較小的——你可以用纏繞把皮加粗，但要縮小幾乎不可能。
			</p>
			<p>
				<strong>拍面形狀</strong>方面，新手應優先選擇
				<strong>寬體拍（Standard）</strong>，寬度約 8
				英吋以上，甜區最大、容錯率最高。加長拍雖然觸及範圍更大，但甜區較小，建議等技術穩定後再考慮。
			</p>
		</Section>
	);
}
