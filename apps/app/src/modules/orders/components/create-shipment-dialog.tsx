"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparkyidea/ui/components/dialog";
import { Input } from "@sparkyidea/ui/components/input";
import { Label } from "@sparkyidea/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkyidea/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PackageCheckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { useCreateShipment } from "@/modules/shipments/hooks/use-create-shipment";
import type { OrderData } from "../types";

const CARRIERS = [
  { value: "UPS", label: "UPS" },
  { value: "USPS", label: "USPS" },
  { value: "FedEx", label: "FedEx" },
  { value: "DHL", label: "DHL" },
  { value: "Other", label: "Other" },
];

const TRACKING_PREFIXES: Record<string, string> = {
  "1Z": "UPS",
  "94": "USPS",
  "92": "USPS",
  "93": "USPS",
  "7": "FedEx",
  "96": "FedEx",
};

const WHITESPACE_RE = /\s/;

const TRACKING_PATTERNS: Record<string, RegExp> = {
  UPS: /^1Z[A-Z0-9]{16}$/i,
  USPS: /^(94|92|93|94)\d{18,22}$|^\d{20,22}$/,
  FedEx: /^\d{12,15}$|^\d{20,22}$/,
  DHL: /^\d{10,11}$|^[A-Z]{3}\d{7,}$/i,
};

function detectCarrier(tracking: string): string | null {
  const trimmed = tracking.trim().toUpperCase();
  for (const [prefix, carrier] of Object.entries(TRACKING_PREFIXES)) {
    if (trimmed.startsWith(prefix)) {
      return carrier;
    }
  }
  return null;
}

function validateTracking(tracking: string, carrier: string): string | null {
  const trimmed = tracking.trim();

  if (trimmed.length < 6) {
    return "Tracking number is too short";
  }

  if (WHITESPACE_RE.test(trimmed)) {
    return "Tracking number should not contain spaces";
  }

  const pattern = TRACKING_PATTERNS[carrier];
  if (pattern && !pattern.test(trimmed)) {
    return `Tracking number doesn't match expected ${carrier} format`;
  }

  return null;
}

interface CreateShipmentDialogProps {
  order: OrderData;
}

export function CreateShipmentDialog({ order }: CreateShipmentDialogProps) {
  const { isOpen, onClose } = useCreateShipment();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [carrierAutoFilled, setCarrierAutoFilled] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");

  const warehouses = useQuery(trpc.warehouse.list.queryOptions());

  // Auto-select the only available warehouse when the list resolves
  // and the user hasn't picked one yet — common case for sellers
  // with a single ship-from location.
  useEffect(() => {
    if (warehouses.data && warehouses.data.length === 1 && !warehouseId) {
      const only = warehouses.data[0];
      if (only) {
        setWarehouseId(only.id);
      }
    }
  }, [warehouses.data, warehouseId]);

  const reset = useCallback(() => {
    setTracking("");
    setCarrier("");
    setCarrierAutoFilled(false);
    setTrackingError(null);
    setWarehouseId("");
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    reset();
  }, [onClose, reset]);

  useEffect(() => {
    if (!tracking) {
      if (carrierAutoFilled) {
        setCarrier("");
        setCarrierAutoFilled(false);
      }
      return;
    }

    if (carrierAutoFilled || !carrier) {
      const detected = detectCarrier(tracking);
      if (detected) {
        setCarrier(detected);
        setCarrierAutoFilled(true);
      } else if (carrierAutoFilled) {
        setCarrier("");
        setCarrierAutoFilled(false);
      }
    }
  }, [tracking, carrier, carrierAutoFilled]);

  const { mutate, isPending } = useMutation(
    trpc.shipment.create.mutationOptions({
      onSuccess: () => {
        toast.success("Shipment created. Syncing to marketplace...");
        queryClient.invalidateQueries({
          queryKey: trpc.order.getOne.queryKey({ id: order.id }),
        });
        handleClose();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!(tracking.trim() && carrier && warehouseId)) {
      toast.error("Please fill in tracking, carrier, and warehouse");
      return;
    }

    const error = validateTracking(tracking, carrier);
    if (error) {
      setTrackingError(error);
      return;
    }

    setTrackingError(null);

    const lines = order.orderLines.map((line) => ({
      orderLineId: line.id,
      quantity: line.quantity ?? 1,
    }));

    // Pass the order's shipping fields through as ship-to. The
    // server geocodes these to populate shipToLatitude/Longitude;
    // null fields are tolerated (geocode returns null and the
    // shipment is still created with null coords).
    mutate({
      orderId: order.id,
      warehouseId,
      tracking: tracking.trim(),
      carrier,
      lines,
      shipToName: order.shippingName,
      shipToCompany: order.shippingCompany,
      shipToEmail: order.shippingEmail,
      shipToPhone: order.shippingPhone,
      shipToAddress1: order.shippingAddress1,
      shipToAddress2: order.shippingAddress2,
      shipToCity: order.shippingCity,
      shipToState: order.shippingState,
      shipToZipcode: order.shippingZipCode,
      shipToCountry: order.shippingCountry,
    });
  };

  return (
    <Dialog onOpenChange={(open) => !open && handleClose()} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheckIcon className="size-4" />
            Create Shipment
          </DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouse">Ship from</Label>
            <Select
              disabled={warehouses.isLoading}
              onValueChange={(v) => setWarehouseId(v ?? "")}
              value={warehouseId}
            >
              <SelectTrigger className="w-full" id="warehouse">
                <SelectValue
                  placeholder={
                    warehouses.isLoading
                      ? "Loading warehouses..."
                      : "Select warehouse"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {warehouses.data?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {[w.address1, w.city, w.state].filter(Boolean).join(", ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {warehouses.data?.length === 0 && (
              <p className="text-destructive text-xs">
                No warehouses configured. Add one before creating shipments.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tracking">Tracking</Label>
            <Input
              aria-invalid={!!trackingError}
              autoFocus
              id="tracking"
              onChange={(e) => {
                setTracking(e.target.value);
                setTrackingError(null);
              }}
              placeholder="e.g. 1Z999AA10123456784"
              value={tracking}
            />
            {trackingError && (
              <p className="text-destructive text-xs">{trackingError}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="carrier">Carrier</Label>
            <Select onValueChange={(v) => setCarrier(v ?? "")} value={carrier}>
              <SelectTrigger className="w-full" id="carrier">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              disabled={
                isPending || !tracking.trim() || !carrier || !warehouseId
              }
              type="submit"
            >
              {isPending && <Loader2Icon className="animate-spin" />}
              Mark as Fulfilled
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
