"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { CopyIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DynamicLink } from "@/components/layout/dynamic-link";
import {
  getCarrierInfo,
  getTrackingUrl,
} from "@/modules/shipments/shipping-carrier";
import { formatDimensions, formatWeight } from "./format";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function ShippingDetails({
  carrier,
  method,
  tracking,
  weight,
  packageLength,
  packageWidth,
  packageHeight,
}: {
  carrier: string | null;
  method: string | null;
  tracking: string | null;
  weight: string | null;
  packageLength: string | null;
  packageWidth: string | null;
  packageHeight: string | null;
}) {
  const carrierInfo = carrier ? getCarrierInfo(carrier) : null;
  const trackingUrl = getTrackingUrl(carrier, tracking);
  const carrierLabel = carrierInfo?.label ?? "—";
  const carrierMethodLabel = method
    ? `${carrierLabel} ${method}`
    : carrierLabel;
  const weightLabel = formatWeight(weight);
  const dimensionsLabel = formatDimensions(
    packageLength,
    packageWidth,
    packageHeight
  );

  const copyTracking = () => {
    if (!tracking) {
      return;
    }
    navigator.clipboard.writeText(tracking);
    toast.success("Tracking number copied");
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-xs">Shipping Details</div>
      <dl className="flex flex-col gap-0.5">
        <DetailRow label="Carrier">
          <span>{carrierMethodLabel}</span>
        </DetailRow>
        {tracking && (
          <DetailRow label="Tracking">
            {trackingUrl ? (
              <DynamicLink
                className="truncate font-mono"
                href={trackingUrl}
                openInNewWindow
              >
                {tracking}
              </DynamicLink>
            ) : (
              <span className="truncate font-mono">{tracking}</span>
            )}
            <Button
              aria-label="Copy tracking number"
              onClick={copyTracking}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <CopyIcon />
            </Button>
          </DetailRow>
        )}
        {weightLabel && (
          <DetailRow label="Weight">
            <span>{weightLabel}</span>
          </DetailRow>
        )}
        {dimensionsLabel && (
          <DetailRow label="Size">
            <span>{dimensionsLabel}</span>
          </DetailRow>
        )}
      </dl>
    </div>
  );
}
