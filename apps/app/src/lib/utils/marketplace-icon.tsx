import { Icons } from "@sparkyidea/ui/icons";
import { StoreIcon } from "lucide-react";

const MARKETPLACE_ICONS: Record<
  string,
  (props: { className?: string }) => React.JSX.Element
> = {
  amazon: Icons.amazon.color,
  ebay: Icons.ebay.color,
  etsy: Icons.etsy.color,
  mercari: Icons.mercari.color,
  shopify: Icons.shopify.color,
  walmart: Icons.walmart.color,
};

export function MarketplaceIcon({
  marketplaceId,
  className,
  ...props
}: {
  marketplaceId: string | null | undefined;
  className?: string;
}) {
  if (!marketplaceId) {
    return <StoreIcon className={className} {...props} />;
  }
  const Icon = MARKETPLACE_ICONS[marketplaceId];
  if (!Icon) {
    return <StoreIcon className={className} {...props} />;
  }
  return <Icon className={className} {...props} />;
}
