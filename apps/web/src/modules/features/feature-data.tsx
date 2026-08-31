import { Icons } from "@sparkyidea/ui/icons";
import { AnalyticsGraphs } from "@/modules/features/analytics-graphs";
import { GlowShield } from "@/modules/features/glow-shield";
import { HiddenPrice } from "@/modules/features/hidden-price";
import { OrderMarquee } from "@/modules/features/orders-marquee";
import { ShippingGlobe } from "@/modules/features/shipping-globe";
import { SourcingRadar } from "@/modules/features/sourcing-radar";
import type { CardContentType, DotContentType } from "@/modules/home/types";

export const dotContents: DotContentType[] = [
  {
    title: "AI + Automation",
    description:
      "Integrating automation with latest AI models to optimize ecommerce operations for greater efficiency.",
    highlights: (
      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <Icons.listing className="h-4 w-4" />
          <span>Listing generator</span>
        </li>
        <li className="flex items-center gap-2">
          <Icons.ai className="h-4 w-4" />
          <span>AI customer support</span>
        </li>
        <li className="flex items-center gap-2">
          <Icons.return className="h-4 w-4" />
          <span>Automated cases and returns</span>
        </li>
      </ul>
    ),
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <GlowShield
        className="absolute h-full w-full pt-24 md:pt-0 md:pl-80"
        isHovered={isHovered}
      />
    ),
    className: "col-span-8 md:col-span-8 lg:col-span-5 md:h-[400px] h-[450px]",
  },
  {
    title: "Order",
    description:
      "Centralize orders from all sales channels with fraud detection and bulk processing capabilities.",
    highlights: "",
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <OrderMarquee
        className="absolute top-36 [--duration:24s]"
        isHovered={isHovered}
      />
    ),
    className: "col-span-8 md:col-span-4 lg:col-span-3 md:h-[400px] h-[450px]",
  },
  {
    title: "Shipping",
    description:
      "Access discounted rates from global carriers and automate order fulfillment for faster, cost-effective shipping.",
    highlights: "",
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <ShippingGlobe
        className="absolute top-28 h-full w-full origin-top"
        isHovered={isHovered}
      />
    ),
    className: "col-span-8 md:col-span-4 lg:col-span-4 md:h-[400px] h-[450px]",
  },
  {
    title: "Analytics",
    description:
      "Get real-time insights across all channels to make data-driven decisions.",
    highlights: "",
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <AnalyticsGraphs
        className="absolute top-32 h-full w-full"
        isHovered={isHovered}
      />
    ),
    className: "col-span-8 md:col-span-4 lg:col-span-4 md:h-[400px] h-[450px]",
  },
  {
    title: "Repricer",
    description:
      "Dynamically adjust prices based on competitor, supply, and demand trends.",
    highlights: "",
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <HiddenPrice className="absolute top-36 w-full" isHovered={isHovered} />
    ),
    className: "col-span-8 md:col-span-4 lg:col-span-3 md:h-[400px] h-[450px]",
  },
  {
    title: "Sourcing",
    description:
      "Access to the lastest marketplace insights and robust market intelligence data to scale your business faster and more efficiently.",
    highlights: (
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <Icons.check className="inline h-4 w-4" /> Precise unit cost
          estimation
        </li>
        <li>
          <Icons.check className="inline h-4 w-4" /> Connect with top suppliers
        </li>
        <li>
          <Icons.check className="inline h-4 w-4" /> Calculate cost, price,
          profit
        </li>
      </ul>
    ),
    cta: "Coming soon",
    href: "",
    background: ({ isHovered }: { isHovered: boolean }) => (
      <SourcingRadar
        className="absolute top-20 md:top-0 md:left-44"
        isHovered={isHovered}
      />
    ),
    className: "col-span-8 md:col-span-8 lg:col-span-5 md:h-[400px] h-[450px]",
  },
];

export const cardContents: CardContentType[] = [
  {
    title: "Open Source",
    description:
      "Self-hostable, transparent code for ultimate control and flexibility.",
    icon: <Icons.code />,
  },
  {
    title: "Data Privacy",
    description:
      "Your data stays yours. Robust security measures to protect your information.",
    icon: <Icons.privacy />,
  },
  {
    title: "Multi-store Connection",
    description:
      "Seamlessly integrate and manage multiple e-commerce platforms.",
    icon: <Icons.connect />,
  },
  {
    title: "API Access",
    description:
      "Powerful RESTful endpoints and webhooks for seamless integration and automation.",
    icon: <Icons.api />,
  },
  {
    title: "Ease of use",
    description: "Intuitive interface designed for simplicity and efficiency.",
    icon: <Icons.slash />,
  },
  {
    title: "Pricing like no other",
    description:
      "Transparent, competitive pricing with no hidden fees or long-term commitments.",
    icon: <Icons.money />,
  },
  {
    title: "24/7 Customer Support",
    description:
      "Round-the-clock assistance from our dedicated support team and AI agents.",
    icon: <Icons.help />,
  },
  {
    title: "Money back guarantee",
    description:
      "Try risk-free with our satisfaction guarantee. Your success is our priority.",
    icon: <Icons.refund />,
  },
];
