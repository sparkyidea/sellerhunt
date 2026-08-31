import type { Route } from "next";
import Link from "next/link";

import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";
import { H6 } from "@/components/layout/typography";
import { marketplaces } from "@/modules/marketplaces/marketplace-data";

export function MarketplacesSection() {
  return (
    <section className="py-8 md:py-20">
      <MaxWidthWrapper className="container flex flex-col gap-10">
        <H6 className="text-center uppercase">Supported marketplaces</H6>

        <div className="grid grid-cols-2 place-items-center gap-4 sm:grid-cols-3 md:grid-cols-4">
          {marketplaces.map((marketplace) => (
            <Link
              aria-label={marketplace.title}
              className="group relative flex h-[60px] w-full items-center justify-center"
              href={marketplace.href as Route}
              key={marketplace.title}
              target="_blank"
            >
              <div className="absolute inset-0 flex items-center justify-center text-foreground transition-opacity duration-300 group-hover:opacity-0">
                {marketplace.iconMono}
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {marketplace.iconColor}
              </div>
            </Link>
          ))}
        </div>
      </MaxWidthWrapper>
    </section>
  );
}
