"use client";

import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function StarterSection() {
	return (
		<Section
			id="starter"
			tag="入門套組"
			title="新手入門套組確實划算，但要挑對內容物"
		>
			<p>
				入門套組通常包含 2 支球拍、2–4 顆球和 1
				個收納袋，整組購買比單買各項目約
				<strong>省下 20–30%</strong>，是剛接觸匹克球最推薦的購入方式。
			</p>

			<TipCard label="選購要點" variant="warn">
				優先選擇 <strong>USAPA 認證</strong>球拍（未來可參加正式比賽）、球拍重量應在{" "}
				<strong>7.3–8.4 oz</strong>、確認球的類型符合場地（室內球孔洞較小，室外球孔洞較大以抗風）、避免純木質套組。
			</TipCard>
		</Section>
	);
}
