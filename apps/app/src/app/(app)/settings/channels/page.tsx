"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";
import { ChannelsCard } from "@/modules/channels/components/channels-card";

function OAuthCallbackHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "ebay") {
      toast.success("eBay channel connected successfully!", {
        description: "Your eBay account has been linked to DashSeller.",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }

    if (error) {
      const errorMessages: Record<string, string> = {
        unauthorized: "You must be logged in to connect a channel",
        oauth_failed: "Failed to connect channel. Please try again.",
        csrf_error: "Security validation failed. Please try again.",
        missing_parameters: "Invalid OAuth response",
        marketplace_not_found: "marketplace not configured",
        user_info_failed: "Failed to fetch account information",
        channel_already_linked:
          "This channel is already linked to another account",
      };

      toast.error("Connection Failed", {
        description: errorMessages[error] || "An unknown error occurred",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  return null;
}

export default function ChannelsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Suspense>
        <OAuthCallbackHandler />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-2xl tracking-tight">Channels</h3>
        <p className="text-muted-foreground text-sm">
          Manage your marketplace channels and connections
        </p>
      </div>

      <ChannelsCard />
    </div>
  );
}
