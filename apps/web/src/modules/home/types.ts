import type { ReactNode } from "react";

export interface DotContentType {
  background: (props: { isHovered: boolean }) => ReactNode;
  className: string;
  cta: string;
  description: string;
  highlights: ReactNode;
  href: string;
  title: string;
}

export interface CardContentType {
  description: string;
  icon: ReactNode;
  title: string;
}

export interface LogosType {
  href: string;
  iconColor: ReactNode;
  iconMono: ReactNode;
  title: string;
}
