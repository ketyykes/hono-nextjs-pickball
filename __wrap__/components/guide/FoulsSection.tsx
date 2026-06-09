"use client";

import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function FoulsSection() {
	return (
		<Section
			id="fouls"
			tag="犯規與違規"
			title="雙彈跳規則和廚房犯規是最容易踩的兩個坑"
		>
			<p>
				匹克球有一條極為關鍵且獨特的規則：
				<strong>雙彈跳規則（Two-Bounce Rule）</strong>。發球後，接球方必須讓球落地彈跳一次才能回擊；接球方回球後，發球方也必須讓球落地彈跳一次才能回擊。換句話說，
				<strong>比賽的前兩拍回球都必須是落地球</strong>，從第三拍開始才可以選擇截擊或打落地球。
			</p>

			<TipCard label="完整犯規清單" variant="warn">
				<p>
					<strong>發球類：</strong>發球出界、短球落入廚房、觸網未過、腳步犯規、揮拍方式不合規定、未唱報比分
					<br />
					<strong>回球類：</strong>違反雙彈跳規則、回球出界或掛網、在廚房內截擊、截擊後動量帶入廚房
					<br />
					<strong>其他：</strong>觸碰球網、球擊中身體、球在己方彈跳兩次、干擾對手、額外球掉落
				</p>
			</TipCard>

			<p>
				犯規後果：發球方犯規則失去發球權（雙打中換下一位發球員，或換邊）；接球方犯規則發球方得一分。
			</p>
		</Section>
	);
}
