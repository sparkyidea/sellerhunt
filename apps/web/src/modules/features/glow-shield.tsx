import { ShieldUser } from "lucide-react";
import { GlowIcon } from "@/components/glow-icon";

interface GlowBotProps {
  className?: string;
  isHovered?: boolean;
}

export const GlowShield = ({ isHovered, className }: GlowBotProps) => {
  return (
    <GlowIcon
      className={className}
      defaultX={0.55}
      defaultY={0.55}
      icon={ShieldUser}
      isHovered={isHovered}
      size={240}
    />
  );
};
