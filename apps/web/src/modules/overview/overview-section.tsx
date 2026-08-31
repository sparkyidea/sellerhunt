import {
  HoverFeatureCard,
  HoverFeatureGrid,
} from "@/components/hover-feature-card";
import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";

import { cardContents } from "@/modules/features/feature-data";

export function OverviewSection() {
  return (
    <MaxWidthWrapper className="px-0 sm:px-8">
      <HoverFeatureGrid>
        {cardContents.map((cardContent) => (
          <HoverFeatureCard key={cardContent.title} {...cardContent} />
        ))}
      </HoverFeatureGrid>
    </MaxWidthWrapper>
  );
}
