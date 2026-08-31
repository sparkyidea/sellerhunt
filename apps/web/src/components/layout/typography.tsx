import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

const TextVariant = cva("ellipses max-w-prose truncate", {
  variants: {
    variant: {
      default: "text-base",
      lead: "text-muted-foreground text-xl",
      large: "font-semibold text-lg",
      small: "font-medium text-sm leading-none",
      muted: "text-muted-foreground text-sm",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

/**
 * @className text-8xl font-extrabold tracking-tight
 */
const H1 = ({ children, className }: TypographyProps) => {
  return (
    <h1 className={cn("font-extrabold text-8xl tracking-tight", className)}>
      {children}
    </h1>
  );
};

/**
 * @className text-6xl font-extrabold tracking-tight
 */
const H2 = ({ children, className }: TypographyProps) => {
  return (
    <h2 className={cn("font-extrabold text-6xl tracking-tight", className)}>
      {children}
    </h2>
  );
};

/**
 * @className text-4xl font-extrabold tracking-tight
 */
const H3 = ({ children, className }: TypographyProps) => {
  return (
    <h3 className={cn("font-extrabold text-4xl tracking-tight", className)}>
      {children}
    </h3>
  );
};

/**
 * @className text-3xl font-semibold tracking-tight
 */
const H4 = ({ children, className }: TypographyProps) => {
  return (
    <h4 className={cn("font-semibold text-3xl tracking-tight", className)}>
      {children}
    </h4>
  );
};

/**
 * @className text-2xl font-semibold tracking-tight
 */
const H5 = ({ children, className }: TypographyProps) => {
  return (
    <h5 className={cn("font-semibold text-2xl tracking-tight", className)}>
      {children}
    </h5>
  );
};

/**
 * @className text-xl font-semibold tracking-tight
 */
const H6 = ({ children, className }: TypographyProps) => {
  return (
    <h6 className={cn("font-semibold text-xl tracking-tight", className)}>
      {children}
    </h6>
  );
};

/**
 * @className Variants:
 * - default: "max-w-prose ellipses truncate text-base"
 * - lead: "max-w-prose ellipses truncate text-muted-foreground text-xl"
 * - large: "max-w-prose ellipses truncate text-lg font-semibold"
 * - small: "max-w-prose ellipses truncate text-sm leading-none font-medium"
 * - muted: "max-w-prose ellipses truncate text-muted-foreground text-sm"
 */
const P = ({
  children,
  className,
  variant,
}: TypographyProps & VariantProps<typeof TextVariant>) => {
  return <p className={cn(TextVariant({ variant }), className)}>{children}</p>;
};

/**
 * @className Variants:
 * - default: "max-w-prose ellipses truncate text-base"
 * - lead: "max-w-prose ellipses truncate text-muted-foreground text-xl"
 * - large: "max-w-prose ellipses truncate text-lg font-semibold"
 * - small: "max-w-prose ellipses truncate text-sm leading-none font-medium"
 * - muted: "max-w-prose ellipses truncate text-muted-foreground text-sm"
 */
const Span = ({
  children,
  className,
  variant,
}: TypographyProps & VariantProps<typeof TextVariant>) => {
  return (
    <span className={cn(TextVariant({ variant }), className)}>{children}</span>
  );
};

/**
 * @className mt-6 border-l-2 pl-6 italic
 */
const Blockquote = ({ children, className }: TypographyProps) => {
  return (
    <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)}>
      {children}
    </blockquote>
  );
};

/**
 * @className my-6 ml-6 list-disc [&>li]:mt-2
 */
const Ul = ({ children, className }: TypographyProps) => {
  return (
    <ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)}>
      {children}
    </ul>
  );
};

/**
 * @className bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold
 */
const Code = ({ children, className }: TypographyProps) => {
  return (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
        className
      )}
    >
      {children}
    </code>
  );
};

export { Blockquote, Code, H1, H2, H3, H4, H5, H6, P, Span, TextVariant, Ul };
