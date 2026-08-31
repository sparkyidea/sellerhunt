import { Button } from "@sparkyidea/ui/components/button";
import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";

export function CtaSection() {
  return (
    <section className="py-40 md:py-60">
      <MaxWidthWrapper className="px-0 sm:px-8">
        <div className="relative mx-auto bg-linear-to-br from-secondary to-background shadow-xl sm:rounded-2xl">
          <div
            className="absolute inset-0 bg-repeat opacity-10 sm:rounded-2xl"
            style={{
              backgroundImage: 'url("/home/noise.webp")',
              backgroundSize: "30%",
            }}
          />
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-background/70 sm:rounded-2xl" />
          <div className="relative px-6 py-20 sm:px-10 lg:px-18">
            <h2 className="text-balance text-center font-semibold text-3xl text-secondary-foreground tracking-[-0.015em] md:text-5xl">
              Ready to boost your e&#8209;commerce sales?
            </h2>
            <p className="mx-auto mt-4 max-w-120 text-center text-secondary-foreground">
              Get instant access to DashSeller&apos;s powerful analytics and
              optimization tools for your online store.
            </p>
            <div className="mt-6 text-center">
              <Button>Start Free Trial</Button>
            </div>
          </div>
        </div>
      </MaxWidthWrapper>
    </section>
  );
}
