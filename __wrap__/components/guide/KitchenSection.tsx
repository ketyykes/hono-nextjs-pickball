"use client";

import { kitchenMyths } from "@/data/guide/kitchenMyths";
import { MythRow } from "./shared/MythRow";
import { Section } from "./shared/Section";

export function KitchenSection() {
	return (
		<Section
			id="kitchen"
			tag="廚房規則"
			title="廚房不是「不能進去」，而是「不能在裡面截擊」"
		>
			<p>
				<strong>廚房（Kitchen）</strong>正式名稱為非截擊區（Non-Volley Zone,
				NVZ），指球網兩側各 7 英尺深、橫跨全場 20 英尺寬的矩形區域。最重要的一句話：
				<strong>
					你隨時都可以進入廚房，但站在廚房裡（包括踩到廚房線）時，絕對不能截擊。
				</strong>
			</p>
			<p>
				<strong>動量規則（Momentum Rule）</strong>是最容易被忽略的陷阱：如果你在廚房線外截擊，但動量使你向前踏入廚房區域，仍然算犯規。更嚴格的是，動量犯規沒有時間限制——即使對手已經回球、分數已經判定，甚至比賽已結束，只要你因截擊產生的動量而進入廚房，都會被追溯為犯規。
			</p>

			<div className="my-8 grid gap-4">
				{kitchenMyths.map((pair) => (
					<MythRow key={pair.myth} myth={pair.myth} fact={pair.fact} />
				))}
			</div>

			<p>
				如果你因任何原因進入了廚房，必須
				<strong>雙腳完全踏出廚房並觸地在廚房外</strong>，才能進行下一次截擊。
			</p>
		</Section>
	);
}
