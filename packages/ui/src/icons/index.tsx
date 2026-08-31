import type { LucideIcon, LucideProps } from "lucide-react";
import { brandIcons } from "./brand-icons";
import { customizeIcons } from "./customize-icons";
import { uiIcons } from "./ui-icons";

export type IconType =
  | LucideIcon
  | (({ ...props }: LucideProps) => React.JSX.Element);

export const Icons = {
  ...uiIcons,
  ...brandIcons,
  ...customizeIcons,
};
