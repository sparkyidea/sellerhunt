import { CtaSection } from "@/modules/cta/cta-section";
import { FeaturesSection } from "@/modules/features/features-section";
import { HeroSection } from "@/modules/hero/hero-section";
import { MarketplacesSection } from "@/modules/marketplaces/marketplaces-section";
import { OverviewSection } from "@/modules/overview/overview-section";
import { TestimonialsSection } from "@/modules/testimonials/testimonials-section";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <MarketplacesSection />
      <FeaturesSection />
      <OverviewSection />
      <TestimonialsSection />
      <CtaSection />
    </main>
  );
}
