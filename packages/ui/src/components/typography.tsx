import { cn } from "@sparkyidea/ui/lib/utils";
import type { ComponentProps } from "react";

export function H1({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "scroll-m-20 font-extrabold text-4xl tracking-tight lg:text-5xl",
        className
      )}
      {...props}
    />
  );
}

export function H2({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "mt-12 scroll-m-20 pb-2 font-semibold text-3xl tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  );
}

export function H3({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "mt-12 scroll-m-20 font-semibold text-2xl tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  );
}

export function H4({ className, ...props }: ComponentProps<"h4">) {
  return (
    <h4
      className={cn(
        "mt-12 scroll-m-20 font-semibold text-xl tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  );
}

export function H5({ className, ...props }: ComponentProps<"h5">) {
  return (
    <h5
      className={cn(
        "mt-12 scroll-m-20 font-semibold text-lg tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  );
}

export function H6({ className, ...props }: ComponentProps<"h6">) {
  return (
    <h6
      className={cn(
        "mt-12 scroll-m-20 font-semibold text-base tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  );
}

export function P({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("not-first:mt-6 leading-7", className)} {...props} />;
}

export function Lead({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground text-xl", className)} {...props} />
  );
}

export function Large({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("font-semibold text-lg", className)} {...props} />;
}

export function Small({ className, ...props }: ComponentProps<"small">) {
  return <small className={cn("text-xs leading-none", className)} {...props} />;
}

export function Muted({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export function A({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "font-medium text-primary underline underline-offset-4",
        className
      )}
      {...props}
    />
  );
}

export function Quote({ className, ...props }: ComponentProps<"blockquote">) {
  return (
    <blockquote
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    />
  );
}

export function List({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("mt-6 ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  );
}

export function OrderedList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={cn("mt-6 ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  );
}

export function InlineCode({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
        className
      )}
      {...props}
    />
  );
}

export function MultilineCode({ className, ...props }: ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "mt-6 mb-6 overflow-y-auto rounded bg-muted p-4 text-sm",
        className
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      className={cn("my-6 w-full overflow-y-auto", className)}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("border px-4 py-2 text-left font-bold", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("border px-4 py-2 text-left", className)} {...props} />
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-semibold text-xs",
        className
      )}
      {...props}
    />
  );
}

export function Hr({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("my-10", className)} {...props} />;
}

export function Mark({ className, ...props }: ComponentProps<"mark">) {
  return <mark className={cn("bg-yellow-300", className)} {...props} />;
}
