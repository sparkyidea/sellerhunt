import { Icons } from "@sparkyidea/ui/icons";
import Image from "next/image";
import { Span } from "@/components/layout/typography";
import {
  LoopTabs,
  LoopTabsContent,
  LoopTabsList,
  LoopTabsTrigger,
} from "@/components/loop-tabs";

export const Showcases = () => {
  return (
    <LoopTabs
      className="relative mt-8 overflow-hidden px-2 sm:mt-12 md:mt-20"
      defaultValue="dashboard"
    >
      <LoopTabsList className="relative z-20 mx-auto w-fit">
        <LoopTabsTrigger value="dashboard">
          <Icons.dashboard className="size-4.5" />
          <Span className="font-medium">Dashboard</Span>
        </LoopTabsTrigger>
        <LoopTabsTrigger value="products">
          <Icons.product className="size-4.5" />
          <Span className="font-medium">Products</Span>
        </LoopTabsTrigger>
        <LoopTabsTrigger value="stocks">
          <Icons.stock className="size-4.5" />
          <Span className="font-medium">Stocks</Span>
        </LoopTabsTrigger>
      </LoopTabsList>
      <div
        aria-hidden
        className="absolute inset-0 z-10 bg-linear-to-b from-80% from-transparent to-background"
      />

      <div className="relative inset-shadow-2xs mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-background shadow-lg shadow-zinc-950/15 ring-1 ring-background dark:inset-shadow-white/20">
        <LoopTabsContent value="dashboard">
          <Image
            alt="app screen"
            className="relative hidden aspect-15/8 rounded-2xl bg-background dark:block"
            height="1440"
            src="/home/showcases/dashboard-dark.png"
            width="2700"
          />
          <Image
            alt="app screen"
            className="relative z-2 aspect-15/8 rounded-2xl border border-border/25 dark:hidden"
            height="1440"
            src="/home/showcases/dashboard-light.png"
            width="2700"
          />
        </LoopTabsContent>
        <LoopTabsContent value="products">
          <Image
            alt="app screen"
            className="relative hidden aspect-15/8 rounded-2xl bg-background dark:block"
            height="1440"
            src="/home/showcases/products-dark.png"
            width="2700"
          />
          <Image
            alt="app screen"
            className="relative z-2 aspect-15/8 rounded-2xl border border-border/25 dark:hidden"
            height="1440"
            src="/home/showcases/products-light.png"
            width="2700"
          />
        </LoopTabsContent>
        <LoopTabsContent value="stocks">
          <Image
            alt="app screen"
            className="relative hidden aspect-15/8 rounded-2xl bg-background dark:block"
            height="1440"
            src="/home/showcases/stocks-dark.png"
            width="2700"
          />
          <Image
            alt="app screen"
            className="relative z-2 aspect-15/8 rounded-2xl border border-border/25 dark:hidden"
            height="1440"
            src="/home/showcases/stocks-light.png"
            width="2700"
          />
        </LoopTabsContent>
      </div>
    </LoopTabs>
  );
};
