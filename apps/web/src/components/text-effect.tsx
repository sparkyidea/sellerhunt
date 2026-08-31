"use client";
import type {
  TargetAndTransition,
  Transition,
  Variant,
  Variants,
} from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import React from "react";
import { cn } from "@/lib/utils";

export type PresetType = "blur" | "fade-in-blur" | "scale" | "fade" | "slide";

export type PerType = "word" | "char" | "line";

export interface TextEffectProps {
  children: React.ReactNode;
  className?: string;
  containerTransition?: Transition;
  delay?: number;
  onAnimationComplete?: () => void;
  onAnimationStart?: () => void;
  per?: PerType;
  preset?: PresetType;
  segmentTransition?: Transition;
  segmentWrapperClassName?: string;
  speedReveal?: number;
  speedSegment?: number;
  style?: React.CSSProperties;
  trigger?: boolean;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
}

const defaultStaggerTimes: Record<PerType, number> = {
  char: 0.03,
  word: 0.05,
  line: 0.1,
};

const defaultContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
  exit: {
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
};

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
  },
  exit: { opacity: 0 },
};

const presetVariants: Record<
  PresetType,
  { container: Variants; item: Variants }
> = {
  blur: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, filter: "blur(12px)" },
      visible: { opacity: 1, filter: "blur(0px)" },
      exit: { opacity: 0, filter: "blur(12px)" },
    },
  },
  "fade-in-blur": {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, y: 20, filter: "blur(12px)" },
      visible: { opacity: 1, y: 0, filter: "blur(0px)" },
      exit: { opacity: 0, y: 20, filter: "blur(12px)" },
    },
  },
  scale: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, scale: 0 },
      visible: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0 },
    },
  },
  fade: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    },
  },
  slide: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 20 },
    },
  },
};

const renderSegment = (
  segment: string,
  variants: Variants,
  per: "line" | "word" | "char"
) => {
  switch (per) {
    case "line":
      return (
        <motion.span className="block" variants={variants}>
          {segment}
        </motion.span>
      );
    case "word":
      return (
        <motion.span
          aria-hidden="true"
          className="inline-block whitespace-pre"
          variants={variants}
        >
          {segment}
        </motion.span>
      );
    case "char":
      return (
        <motion.span className="inline-block whitespace-pre">
          {segment.split("").map((char, charIndex) => (
            <motion.span
              aria-hidden="true"
              className="inline-block whitespace-pre"
              key={`char-${charIndex}`}
              variants={variants}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      );
    default: {
      const unreachablePer: never = per;
      return unreachablePer;
    }
  }
};

const AnimationComponent: React.FC<{
  segment: string;
  variants: Variants;
  per: "line" | "word" | "char";
  segmentWrapperClassName?: string;
}> = React.memo(({ segment, variants, per, segmentWrapperClassName }) => {
  const content = renderSegment(segment, variants, per);

  if (!segmentWrapperClassName) {
    return content;
  }

  const defaultWrapperClassName = per === "line" ? "block" : "inline-block";

  return (
    <span className={cn(defaultWrapperClassName, segmentWrapperClassName)}>
      {content}
    </span>
  );
});

AnimationComponent.displayName = "AnimationComponent";

const extractTextFromChildren = (children: React.ReactNode): string => {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return children.toString();
  }
  if (React.isValidElement(children)) {
    const childProps = children.props as { children?: React.ReactNode };
    return extractTextFromChildren(childProps.children);
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join("");
  }
  return "";
};

const WHITESPACE_SPLIT_REGEX = /(\s+)/;

const splitText = (text: string, per: PerType) => {
  if (per === "line") {
    return text.split("\n");
  }
  return text.split(WHITESPACE_SPLIT_REGEX);
};

const hasTransition = (
  variant?: Variant
): variant is TargetAndTransition & { transition?: Transition } => {
  if (!variant) {
    return false;
  }
  return typeof variant === "object" && "transition" in variant;
};

const createVariantsWithTransition = (
  baseVariants: Variants,
  transition?: Transition & { exit?: Transition }
): Variants => {
  if (!transition) {
    return baseVariants;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exit: _, ...mainTransition } = transition;

  return {
    ...baseVariants,
    visible: {
      ...baseVariants.visible,
      transition: {
        ...(hasTransition(baseVariants.visible)
          ? baseVariants.visible.transition
          : {}),
        ...mainTransition,
      },
    },
    exit: {
      ...baseVariants.exit,
      transition: {
        ...(hasTransition(baseVariants.exit)
          ? baseVariants.exit.transition
          : {}),
        ...mainTransition,
        staggerDirection: -1,
      },
    },
  };
};

export function TextEffect({
  children,
  per = "word",
  variants,
  className,
  preset = "fade",
  delay = 0,
  speedReveal = 1,
  speedSegment = 1,
  trigger = true,
  onAnimationComplete,
  onAnimationStart,
  segmentWrapperClassName,
  containerTransition,
  segmentTransition,
  style,
}: TextEffectProps) {
  const textContent = extractTextFromChildren(children);
  const segments = splitText(textContent, per);

  const baseVariants = preset
    ? presetVariants[preset]
    : { container: defaultContainerVariants, item: defaultItemVariants };

  const stagger = defaultStaggerTimes[per] / speedReveal;

  const baseDuration = 0.3 / speedSegment;

  const customStagger = hasTransition(variants?.container?.visible ?? {})
    ? (variants?.container?.visible as TargetAndTransition).transition
        ?.staggerChildren
    : undefined;

  const customDelay = hasTransition(variants?.container?.visible ?? {})
    ? (variants?.container?.visible as TargetAndTransition).transition
        ?.delayChildren
    : undefined;

  const computedVariants = {
    container: createVariantsWithTransition(
      variants?.container || baseVariants.container,
      {
        staggerChildren: customStagger ?? stagger,
        delayChildren: customDelay ?? delay,
        ...containerTransition,
        exit: {
          staggerChildren: customStagger ?? stagger,
          staggerDirection: -1,
        },
      }
    ),
    item: createVariantsWithTransition(variants?.item || baseVariants.item, {
      duration: baseDuration,
      ...segmentTransition,
    }),
  };

  const cloneChildrenWithAnimation = (
    children: React.ReactNode
  ): React.ReactNode => {
    if (React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>;
      const newProps = {
        className: cn(childProps.className as string, className),
        style: {
          ...(childProps.style as React.CSSProperties),
          ...style,
          ...(per === "line" ? { overflow: "visible" } : {}),
        },
      };

      return React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        newProps,
        <AnimatePresence mode="popLayout">
          {trigger && (
            <motion.span
              animate="visible"
              exit="exit"
              initial="hidden"
              onAnimationComplete={onAnimationComplete}
              onAnimationStart={onAnimationStart}
              variants={computedVariants.container}
            >
              {per === "line" ? null : (
                <span className="sr-only">{textContent}</span>
              )}
              {segments.map((segment, index) => (
                <AnimationComponent
                  key={`${per}-${index}-${segment}`}
                  per={per}
                  segment={segment}
                  segmentWrapperClassName={segmentWrapperClassName}
                  variants={computedVariants.item}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      );
    }
    return children;
  };

  return cloneChildrenWithAnimation(children);
}
