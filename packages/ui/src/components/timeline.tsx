import { cn } from "@sparkyidea/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

const timelineVariants = cva("grid", {
  variants: {
    positions: {
      left: "[&>li]:grid-cols-[0_min-content_1fr]",
      right: "[&>li]:grid-cols-[1fr_min-content]",
      center: "[&>li]:grid-cols-[1fr_min-content_1fr]",
    },
  },
  defaultVariants: {
    positions: "left",
  },
});

interface TimelineProps
  extends HTMLAttributes<HTMLUListElement>,
    VariantProps<typeof timelineVariants> {}

const Timeline = forwardRef<HTMLUListElement, TimelineProps>(
  ({ children, className, positions, ...props }, ref) => {
    return (
      <ul
        className={cn(timelineVariants({ positions }), className)}
        ref={ref}
        {...props}
      >
        {children}
      </ul>
    );
  }
);

Timeline.displayName = "Timeline";

const timelineItemVariants = cva("grid items-center gap-x-2", {
  variants: {
    status: {
      done: "text-primary",
      default: "text-muted-foreground",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

interface TimelineItemProps
  extends HTMLAttributes<HTMLLIElement>,
    VariantProps<typeof timelineItemVariants> {}

const TimelineItem = forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, status, ...props }, ref) => (
    <li
      className={cn(timelineItemVariants({ status }), className)}
      ref={ref}
      {...props}
    />
  )
);

TimelineItem.displayName = "TimelineItem";

const timelineDotVariants = cva(
  "col-start-2 col-end-3 row-start-1 row-end-1 flex items-center justify-center rounded-full border border-current",
  {
    variants: {
      status: {
        default: "size-4 [&>*]:hidden",
        current:
          "size-4 [&>*:not(.lucide-circle)]:hidden [&>.lucide-circle]:fill-current [&>.lucide-circle]:text-current",
        done: "size-4 bg-primary [&>*:not(.lucide-check)]:hidden [&>.lucide-check]:text-background",
        error:
          "size-4 border-destructive bg-destructive [&>*:not(.lucide-x)]:hidden [&>.lucide-x]:text-background",
        custom:
          "border-none [&>*:not(:nth-child(4))]:hidden [&>*:nth-child(4)]:block",
      },
    },
    defaultVariants: {
      status: "default",
    },
  }
);

type TimelineDotProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof timelineDotVariants> &
  (
    | {
        status?: "custom";
        children: ReactNode;
      }
    | {
        status?: Exclude<
          VariantProps<typeof timelineDotVariants>["status"],
          "custom"
        >;
        children?: never;
      }
  );

const TimelineDot = forwardRef<HTMLDivElement, TimelineDotProps>(
  ({ className, status, children, ...props }, ref) => (
    <div
      className={cn("timeline-dot", timelineDotVariants({ status }), className)}
      ref={ref}
      role="status"
      {...props}
    >
      <CircleIcon className="size-2.5" />
      <CheckIcon className="size-3" />
      <XIcon className="size-3" />
      {children}
    </div>
  )
);

TimelineDot.displayName = "TimelineDot";

const timelineTagVariants = cva("row-start-1 row-end-1 flex items-center", {
  variants: {
    side: {
      left: "col-start-1 col-end-2 justify-end whitespace-nowrap",
      right: "col-start-3 col-end-4 justify-start",
    },
  },
  defaultVariants: {
    side: "left",
  },
});

interface TimelineTagProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof timelineTagVariants> {}

const TimelineTag = forwardRef<HTMLDivElement, TimelineTagProps>(
  ({ className, side, children, ...props }, ref) => (
    <div
      className={cn(timelineTagVariants({ side }), className)}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
);

TimelineTag.displayName = "TimelineTag";

const timelineContentVariants = cva(
  "row-start-2 row-end-2 pb-8 text-card-foreground",
  {
    variants: {
      side: {
        right: "col-start-3 col-end-4 mr-auto text-left",
        left: "col-start-1 col-end-2 ml-auto text-right",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface TimelineContentProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof timelineContentVariants> {}

const TimelineContent = forwardRef<HTMLDivElement, TimelineContentProps>(
  ({ className, side, ...props }, ref) => (
    <div
      className={cn(timelineContentVariants({ side }), className)}
      ref={ref}
      {...props}
    />
  )
);

TimelineContent.displayName = "TimelineContent";

const timelineHeadingVariants = cva(
  "row-start-1 row-end-1 line-clamp-1 max-w-full truncate",
  {
    variants: {
      side: {
        right: "col-start-3 col-end-4 mr-auto text-left",
        left: "col-start-1 col-end-2 ml-auto text-right",
      },
      variant: {
        primary: "font-medium text-base text-primary",
        secondary: "font-light text-muted-foreground text-sm",
      },
    },
    defaultVariants: {
      side: "right",
      variant: "primary",
    },
  }
);

interface TimelineHeadingProps
  extends HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof timelineHeadingVariants> {}

const TimelineHeading = forwardRef<HTMLHeadingElement, TimelineHeadingProps>(
  ({ className, side, variant, ...props }, ref) => {
    const Heading = variant === "secondary" ? "h3" : "h2";
    return (
      <Heading
        className={cn(timelineHeadingVariants({ side, variant }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

TimelineHeading.displayName = "TimelineHeading";

interface TimelineLineProps extends HTMLAttributes<HTMLHRElement> {
  done?: boolean;
}

const TimelineLine = forwardRef<HTMLHRElement, TimelineLineProps>(
  ({ className, done = false, ...props }, ref) => {
    return (
      <hr
        aria-orientation="vertical"
        className={cn(
          "col-start-2 col-end-3 row-start-2 row-end-2 mx-auto flex h-full min-h-16 w-0.5 justify-center rounded-full",
          done ? "bg-primary" : "bg-muted",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

TimelineLine.displayName = "TimelineLine";

export {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
  TimelineLine,
  TimelineTag,
};
