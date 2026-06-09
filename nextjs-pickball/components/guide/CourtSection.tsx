"use client";

import {
	courtComparisonHeaders,
	courtComparisonRows,
} from "@/data/guide/courtComparison";
import { ComparisonTable } from "./shared/ComparisonTable";
import { Section } from "./shared/Section";
import { CourtDiagram } from "./CourtDiagram";

export function CourtSection() {
	return (
		<Section
			id="court"
			tag="場地與球網"
			title="場地只有網球場的四分之一，卻跟羽球場一模一樣"
		>
			<p>
				匹克球的標準場地尺寸為
				<strong>長 44 英尺（13.41 公尺）× 寬 20 英尺（6.10 公尺）</strong>，面積
				880 平方英尺，恰好與羽球雙打場地完全相同。單打與雙打都使用同一塊場地。一個標準網球場可以劃出四塊匹克球場地，這也是它能迅速在社區、學校普及的關鍵之一。
			</p>
			<p>
				場地的核心標線包括：<strong>底線</strong>位於場地兩端；
				<strong>邊線</strong>為場地兩側；
				<strong>中線</strong>從非截擊區線延伸到底線，將每一側分為左右兩個發球區（各 10×15 英尺）；而最關鍵的
				<strong>非截擊區線（Kitchen Line）</strong>則在距球網 7
				英尺（2.13 公尺）處，劃出了匹克球最具特色的「廚房」區域。所有標線寬度為 2
				英吋，壓線球通常算界內（發球觸碰廚房線除外）。
			</p>
			<p>
				球網兩側邊線處高度為{" "}
				<strong>36 英吋（91.44 公分）</strong>，中心最低點為{" "}
				<strong>34 英吋（86.36 公分）</strong>，比網球網略矮。
			</p>

			<CourtDiagram />

			<ComparisonTable
				headers={courtComparisonHeaders}
				rows={courtComparisonRows.map((row) => [row.label, ...row.values])}
			/>
		</Section>
	);
}
