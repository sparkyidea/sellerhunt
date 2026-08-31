import type { IconType } from "@sparkyidea/ui/icons";
import { Icons } from "@sparkyidea/ui/icons";
import { Package } from "lucide-react";

interface CarrierInfo {
  icon: IconType;
  label: string;
  trackingUrl: (tracking: string) => string;
}

const carriers: Record<string, CarrierInfo> = {
  usps: {
    label: "USPS",
    icon: Icons.usps,
    trackingUrl: (tracking) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`,
  },
  ups: {
    label: "UPS",
    icon: Icons.ups,
    trackingUrl: (tracking) => `https://www.ups.com/track?tracknum=${tracking}`,
  },
  fedex: {
    label: "FedEx",
    icon: Icons.fedex,
    trackingUrl: (tracking) =>
      `https://www.fedex.com/fedextrack/?trknbr=${tracking}`,
  },
  dhl: {
    label: "DHL",
    icon: Icons.dhl,
    trackingUrl: (tracking) =>
      `https://www.dhl.com/us-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${tracking}`,
  },
};

export function getCarrierInfo(carrier: string | null): CarrierInfo {
  if (!carrier) {
    return { label: "Unknown", icon: Package, trackingUrl: () => "" };
  }
  const key = carrier.toLowerCase();
  return (
    carriers[key] ?? {
      label: carrier.charAt(0).toUpperCase() + carrier.slice(1),
      icon: Package,
      trackingUrl: () => "",
    }
  );
}

export function getTrackingUrl(
  carrier: string | null,
  tracking: string | null
): string | null {
  if (!(carrier && tracking)) {
    return null;
  }
  const info = getCarrierInfo(carrier);
  const url = info.trackingUrl(tracking);
  return url || null;
}
