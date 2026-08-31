import Globe from "@/components/globe";

export const ShippingGlobe = ({
  isHovered,
  className,
}: {
  isHovered?: boolean;
  className?: string;
}) => {
  return (
    <div className={className}>
      <Globe isAnimated={isHovered} />
    </div>
  );
};
