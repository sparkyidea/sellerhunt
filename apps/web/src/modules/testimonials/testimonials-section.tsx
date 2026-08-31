import Image from "next/image";
import { MaxWidthWrapper } from "@/components/layout/max-width-wrapper";
import { Marquee } from "@/components/marquee";

import { testimonialData } from "./testimonial-data";

interface Testimonial {
  image: string;
  job: string;
  name: string;
  review: string;
}

const TestimonialCard = ({ image, name, job, review }: Testimonial) => {
  return (
    <div className="mb-4 break-inside-avoid">
      <div className="relative rounded-xl border bg-muted/25">
        <div className="flex flex-col px-4 py-5 sm:p-6">
          <div className="relative mb-4 flex items-center gap-3">
            <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base">
              <Image
                alt={name}
                className="h-full w-full rounded-full border"
                height={100}
                src={image}
                width={100}
              />
            </span>
            <div>
              <p className="font-semibold text-foreground text-sm">{name}</p>
              <p className="text-muted-foreground text-sm">{job}</p>
            </div>
          </div>
          <q className="text-muted-foreground">{review}</q>
        </div>
      </div>
    </div>
  );
};

export function TestimonialsSection() {
  const testimonials = testimonialData;

  // Divide testimonials into three groups
  const splitTestimonials = (data: Testimonial[], parts: number) => {
    const result: Testimonial[][] = [];
    for (let i = parts; i > 0; i--) {
      result.push(data.splice(0, Math.ceil(data.length / i)));
    }
    return result;
  };

  const [column1, column2, column3] = splitTestimonials([...testimonials], 3);

  return (
    <section className="py-8 md:py-20">
      <MaxWidthWrapper className="container flex flex-col">
        <h2 className="mx-auto max-w-5xl text-center font-medium text-3xl text-foreground tracking-tight md:text-5xl md:leading-tight">
          What our customers are saying
        </h2>
        <p className="mx-auto my-4 max-w-4xl text-center font-normal text-muted-foreground text-sm md:text-base">
          Don&apos;t just take our word for it. Here&apos;s what our users have
          to say about their experience with our AI-powered platform.
        </p>
        <div className="relative mt-8 flex h-[500px] w-full items-center justify-center overflow-hidden bg-background md:mt-20">
          <div className="flex w-full">
            <Marquee
              className="w-full [--duration:20s] md:w-1/2 lg:w-1/3"
              vertical
            >
              {column1.map((testimonial) => (
                <TestimonialCard key={testimonial.name} {...testimonial} />
              ))}
            </Marquee>
            <Marquee
              className="hidden [--duration:25s] md:block md:w-1/2 lg:w-1/3"
              vertical
            >
              {column2.map((testimonial) => (
                <TestimonialCard key={testimonial.name} {...testimonial} />
              ))}
            </Marquee>
            <Marquee
              className="hidden [--duration:30s] lg:block lg:w-1/3"
              vertical
            >
              {column3.map((testimonial) => (
                <TestimonialCard key={testimonial.name} {...testimonial} />
              ))}
            </Marquee>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white dark:from-background" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white dark:from-background" />
        </div>
      </MaxWidthWrapper>
    </section>
  );
}
