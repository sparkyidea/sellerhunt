import { Button } from "@sparkyidea/ui/components/button";
import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimatedGroup } from "@/components/animated-group";
import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";
import { H2, P, Span } from "@/components/layout/typography";
import { TextEffect } from "@/components/text-effect";
import { Showcases } from "@/modules/hero/showcases";

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: "blur(12px)",
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        type: "spring" as const,
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
};

export function HeroSection() {
  return (
    <section className="relative">
      <div aria-hidden className="absolute inset-0 bottom-50 -z-20">
        <Image
          alt="background"
          className="dark:hidden"
          fill
          priority
          src="/home/blue-bg-light.png"
        />
        <Image
          alt="background"
          className="hidden dark:block"
          fill
          priority
          src="/home/blue-bg-dark.png"
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 bottom-50 -z-10 bg-linear-to-b from-35% from-transparent to-background"
      />
      <MaxWidthWrapper className="relative pt-24 text-center md:pt-36">
        <AnimatedGroup variants={transitionVariants}>
          <Link
            className="group mx-auto flex w-fit items-center gap-4 rounded-full border bg-muted p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 hover:bg-background dark:border-t-white/5 dark:shadow-zinc-950 dark:hover:border-t-border"
            href={"#link" as Route}
          >
            <Span className="text-foreground" variant="small">
              Introducing Support for AI Models
            </Span>
            <span className="block h-4 w-0.5 border-l bg-white dark:border-background dark:bg-zinc-700" />

            <div className="size-6 overflow-hidden rounded-full bg-background duration-500 group-hover:bg-muted">
              <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                <span className="flex size-6">
                  <ArrowRight className="m-auto size-3" />
                </span>
                <span className="flex size-6">
                  <ArrowRight className="m-auto size-3" />
                </span>
              </div>
            </div>
          </Link>
        </AnimatedGroup>

        <TextEffect preset="fade-in-blur" speedSegment={0.3}>
          <H2 className="mt-4 text-balance font-semibold lg:mt-6">
            Dashseller simplifies selling across multiple marketplaces
          </H2>
        </TextEffect>
        <TextEffect
          className="mx-auto mt-8 max-w-2xl"
          delay={0.5}
          per="line"
          preset="fade-in-blur"
          speedSegment={0.3}
        >
          <P className="text-balance" variant="lead">
            List once and sell everywhere with our all-in-one e-commerce
            platform. Effortlessly manage and scale your business across
            multiple marketplaces.
          </P>
        </TextEffect>

        <AnimatedGroup
          className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row"
          variants={{
            container: {
              visible: {
                transition: {
                  staggerChildren: 0.05,
                  delayChildren: 0.75,
                },
              },
            },
            ...transitionVariants,
          }}
        >
          <div className="rounded-[calc(var(--radius-xl)+0.125rem)] border bg-foreground/10 p-0.5">
            <Link href={"#link" as Route}>
              <Button className="rounded-xl px-5" size="lg">
                <Span className="text-nowrap">Start Building</Span>
              </Button>
            </Link>
          </div>
          <Link href={"#link" as Route}>
            <Button
              className="h-10.5 rounded-xl px-5"
              size="lg"
              variant="ghost"
            >
              <Span className="text-nowrap">Request a demo</Span>
            </Button>
          </Link>
        </AnimatedGroup>
      </MaxWidthWrapper>

      <AnimatedGroup
        variants={{
          container: {
            visible: {
              transition: {
                staggerChildren: 0.05,
                delayChildren: 0.75,
              },
            },
          },
          ...transitionVariants,
        }}
      >
        <Showcases />
      </AnimatedGroup>
    </section>
  );
}
