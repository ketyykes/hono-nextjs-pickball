"use client";

import { Badge } from "@/components/ui/badge";
import { twMarketHeaders, twMarketPrices } from "@/data/guide/twMarketPrices";
import { ComparisonTable } from "./shared/ComparisonTable";
import { Section } from "./shared/Section";
import { TipCard } from "./shared/TipCard";

export function TwMarketSection() {
	return (
		<Section
			id="tw-market"
			tag="台灣市場"
			title="台灣購買管道與 2024–2025 實際價格帶"
		>
			<p>
				台灣主要購買管道包含：<strong>momo 購物網</strong>（最齊全電商）、
				<strong>蝦皮購物</strong>（JNICE 有官方旗艦店）、
				<strong>Decathlon 迪卡儂</strong>（最方便的入手管道），以及 HEAD 台灣、MARC
				馬克等品牌官網直購。實體店面方面，捷利體育（JellySport）、匹克日俱樂部等專業場館也提供現場購買。
			</p>

			<ComparisonTable
				headers={twMarketHeaders}
				rows={twMarketPrices.map((row) => [
					<>
						{row.tier}
						{row.recommended && (
							<Badge className="ml-2 bg-lime-400 text-slate-900 hover:bg-lime-400">
								推薦
							</Badge>
						)}
					</>,
					row.recommended ? <strong>{row.priceRange}</strong> : row.priceRange,
					row.example,
				])}
			/>

			<TipCard label="省錢小撇步">
				Selkirk、JOOLA 等美國品牌在台灣沒有正式代理，透過 BuyAndShip 等代運從美國購入，價格通常比台灣本地購買
				<strong>便宜 40–60%</strong>。
			</TipCard>
		</Section>
	);
}
