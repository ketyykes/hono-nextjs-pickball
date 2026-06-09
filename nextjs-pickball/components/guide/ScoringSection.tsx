"use client";

import { HighlightBox } from "./shared/HighlightBox";
import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function ScoringSection() {
	return (
		<Section
			id="scoring"
			tag="計分方式"
			title="「只有發球方能得分」是匹克球最核心的計分邏輯"
		>
			<p>
				匹克球採用
				<strong>邊際計分制（Side-Out Scoring）</strong>：只有發球方能得分。接球方即使贏得該回合，也只是拿回發球權而已，不會得到任何分數。
			</p>

			<HighlightBox title="比分唱報方式">
				<p>
					<strong>雙打</strong>使用三個數字：「發球隊分數—接球隊分數—發球員編號（1
					或 2）」
					<br />
					例如「3-5-2」＝ 發球隊 3 分、接球隊 5 分、目前第二號發球員
				</p>
				<p>
					<strong>單打</strong>只需兩個數字：「發球者分數—接球者分數」
				</p>
				<p>比賽必須在發球前唱報比分，未唱報即發球屬於犯規。</p>
			</HighlightBox>

			<p>
				標準比賽打到 <strong>11 分</strong>，且必須
				<strong>領先對手 2 分</strong>才能獲勝。錦標賽可能設定為 15 或 21 分，但同樣須領先 2 分。沒有固定分數上限——雙方打到 10-10 時比賽持續到某一方領先 2 分為止。
			</p>

			<TipCard label="2025 新增規則">
				新增了
				<strong>拉力計分法（Rally Scoring）</strong>作為選擇性規則，每回合勝方皆可得分，但決勝分仍須由發球方取得。此制度目前僅限部分錦標賽使用。
			</TipCard>
		</Section>
	);
}
