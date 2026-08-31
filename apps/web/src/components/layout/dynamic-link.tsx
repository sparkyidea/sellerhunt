import type { Route } from "next";
import Link from "next/link";
import type React from "react";

interface DynamicLinkProps
  extends Omit<React.ComponentPropsWithRef<"a">, "href"> {
  children: React.ReactNode;
  className?: string;
  href?: string;
  openInNewWindow?: boolean;
  rel?: string;
  target?: string;
}

export const DynamicLink: React.FC<DynamicLinkProps> = ({
  href,
  children,
  className,
  target,
  rel,
  openInNewWindow,
  ...props
}) => {
  if (!href) {
    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  }

  const isExternal = href.startsWith("http://") || href.startsWith("https://");

  if (isExternal) {
    return (
      <a
        className={className}
        href={href}
        rel={rel || (openInNewWindow ? "noopener noreferrer" : undefined)}
        target={target || (openInNewWindow ? "_blank" : undefined)}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      className={className}
      href={href as Route}
      rel={openInNewWindow ? "noopener noreferrer" : undefined}
      target={openInNewWindow ? "_blank" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
};
