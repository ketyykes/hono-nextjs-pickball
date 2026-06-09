"use client";

import { brands } from "@/data/guide/brands";
import { BrandCard } from "./shared/BrandCard";
import { Section } from "./shared/Section";

export function BrandsSection() {
	return (
		<Section id="brands" tag="品牌介紹" title="全球知名品牌各有所長">
			<div className="my-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{brands.map((brand) => (
					<BrandCard key={brand.name} brand={brand} />
				))}
			</div>
		</Section>
	);
}
