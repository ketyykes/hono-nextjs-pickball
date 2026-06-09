import { Separator } from "@/components/ui/separator";
import { BrandsSection } from "@/components/guide/BrandsSection";
import { Conclusion } from "@/components/guide/Conclusion";
import { CourtSection } from "@/components/guide/CourtSection";
import { FoulsSection } from "@/components/guide/FoulsSection";
import { Hero } from "@/components/guide/Hero";
import { KitchenSection } from "@/components/guide/KitchenSection";
import { MaterialsSection } from "@/components/guide/MaterialsSection";
import { PartDivider } from "@/components/guide/PartDivider";
import { ScoringSection } from "@/components/guide/ScoringSection";
import { ServeSection } from "@/components/guide/ServeSection";
import { SpecsSection } from "@/components/guide/SpecsSection";
import { StarterSection } from "@/components/guide/StarterSection";
import { TocBar } from "@/components/guide/TocBar";
import { TwMarketSection } from "@/components/guide/TwMarketSection";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero />
      <TocBar />

      <PartDivider num="01" title="比賽規則完整說明" />

      <div className="mx-auto max-w-[860px] px-8">
        <CourtSection />
        <Separator />
        <ServeSection />
        <Separator />
        <ScoringSection />
        <Separator />
        <FoulsSection />
        <Separator />
        <KitchenSection />
      </div>

      <PartDivider num="02" title="球拍選購指南與市場分析" />

      <div className="mx-auto max-w-[860px] px-8">
        <MaterialsSection />
        <Separator />
        <SpecsSection />
        <Separator />
        <BrandsSection />
        <Separator />
        <TwMarketSection />
        <Separator />
        <StarterSection />
      </div>

      <Conclusion />

      <footer className="border-t border-border px-8 py-8 text-center text-xs text-muted-foreground">
        本指南僅供參考，價格與規則可能隨時間變動。建議以 USA Pickleball
        官方規則書與各品牌官網為準。
      </footer>
    </div>
  );
}
