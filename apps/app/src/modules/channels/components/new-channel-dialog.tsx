"use client";

import type { marketplace } from "@dashseller/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sparkyidea/ui/components/dialog";
import { Onboarding } from "@sparkyidea/ui/components/onboarding";
import { Icons } from "@sparkyidea/ui/icons";
import { useEffect, useState } from "react";
import { useNewChannel } from "@/modules/channels/hooks/use-new-channel";
import { MarketplacesGallery } from "@/modules/marketplaces/data/marketplaces-gallery";
import { ConnectMarketplaceForm } from "./connect-marketplace-form";

type Marketplace = typeof marketplace.$inferSelect;

export const NewChannelDialog = () => {
  const { isOpen, onClose } = useNewChannel();
  const [selected, setSelected] = useState<Marketplace | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
    }
  }, [isOpen]);

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="sm:max-w-150">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Icons.store className="h-5 w-5" />
            Connect Marketplace
          </DialogTitle>
          <DialogDescription>
            {selected
              ? `Connect your ${selected.name} account to DashSeller.`
              : "Choose a marketplace to connect. You can connect multiple marketplaces to manage them all in one place."}
          </DialogDescription>
        </DialogHeader>
        <Onboarding
          className="border-0 bg-transparent p-0 shadow-none"
          totalSteps={2}
          value={selected ? 2 : 1}
        >
          <Onboarding.Step step={1}>
            <div className="grid gap-4">
              <MarketplacesGallery onSelect={setSelected} />
            </div>
          </Onboarding.Step>
          <Onboarding.Step step={2}>
            <div className="pr-4">
              {selected && (
                <ConnectMarketplaceForm
                  marketplace={selected}
                  onBack={() => setSelected(null)}
                />
              )}
            </div>
          </Onboarding.Step>
          <Onboarding.StepIndicator className="mt-4" />
        </Onboarding>
      </DialogContent>
    </Dialog>
  );
};
