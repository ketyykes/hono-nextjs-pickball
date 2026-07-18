"use client";

import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function ServeSection() {
	return (
		<Section
			id="serve"
			tag="發球規則"
			title="發球必須「由下往上」，而且只有一次機會"
		>
			<p>
				匹克球的發球必須以
				<strong>下手方式（underhand）</strong>進行，且只有一次發球機會——沒有「第二發」。標準凌空發球有三項限制：手臂揮動必須呈向上弧線、擊球點必須低於腰部、擊球瞬間球拍頭必須低於手腕最高處。
			</p>
			<p>
				發球時至少一隻腳須在底線後方，雙腳不得觸碰底線或踏出邊線及中線的延長線外。發球必須打向
				<strong>斜對角的對方發球區</strong>，且不可落在廚房內或觸碰廚房線。
			</p>

			<TipCard label="新手友善選項">
				<strong>落地發球（Drop Serve）</strong>自 2025
				年起已成為永久合法選項。你只需將球自然釋放讓球落地彈跳一次後再擊球，上述三項揮拍限制全部免除，大幅降低初學者的發球門檻。
			</TipCard>

			<p>
				<strong>雙打發球輪轉</strong>是許多新手最困惑的部分：每場比賽開始時，先發球的隊伍只有一人可以發球（視為第二發球員），比分從
				0-0-2 開始唱報。此後每次拿回發球權，隊伍兩位球員都有機會依序發球。第一位從右側開始，得分後雙方互換左右位置。
			</p>
			<p>
				<strong>單打</strong>則單純得多：自己的分數是偶數從右側發球，奇數從左側發球。
			</p>
		</Section>
	);
}
