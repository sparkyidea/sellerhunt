"use client";

import { DotCard, DotGrid } from "@/components/dot-grid";
import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";
import { H4, P } from "@/components/layout/typography";

import { dotContents } from "@/modules/features/feature-data";

export function FeaturesSection() {
  return (
    <section className="flex flex-col gap-12 py-8 md:gap-40 md:py-20">
      <MaxWidthWrapper>
        <H4 className="text-center">Supercharge your business</H4>
        <P className="mx-auto my-4 max-w-4xl text-balance text-center font-normal text-muted-foreground text-sm md:text-base">
          From AI automation to advanced analytics, our platform provides
          everything you need to streamline operations and boost growth.
        </P>
        <div className="mt-8">
          <DotGrid className="grid-cols-8">
            {dotContents.map((dotContent, idx) => (
              <DotCard key={idx} {...dotContent} />
            ))}
          </DotGrid>
        </div>
      </MaxWidthWrapper>
    </section>
  );
}
