"use client";

import type { marketplace } from "@dashseller/db/schema";
import { env } from "@dashseller/env/app";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";

type Marketplace = typeof marketplace.$inferSelect;

interface ConnectMarketplaceFormProps {
  marketplace: Marketplace;
  onBack: () => void;
}

export function ConnectMarketplaceForm({
  marketplace,
  onBack,
}: ConnectMarketplaceFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <ConnectHeader marketplace={marketplace} />
      {marketplace.id === "shopify" ? (
        <ShopifyForm onBack={onBack} />
      ) : (
        <DirectConnect marketplace={marketplace} onBack={onBack} />
      )}
    </div>
  );
}

function ConnectHeader({ marketplace }: { marketplace: Marketplace }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <MarketplaceIcon className="h-12 w-12" marketplaceId={marketplace.id} />
      <h3 className="font-medium text-lg">Connect {marketplace.name}</h3>
    </div>
  );
}

function FormButtons({
  onBack,
  isSubmitting,
}: {
  isSubmitting?: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button
        className="flex-1"
        onClick={onBack}
        type="button"
        variant="outline"
      >
        Back
      </Button>
      <Button className="flex-1" disabled={isSubmitting} type="submit">
        Connect
      </Button>
    </div>
  );
}

const SHOPIFY_HOST_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const URL_PROTOCOL_RE = /^https?:\/\//;
const TRAILING_SLASH_RE = /\/+$/;

const shopifyFormSchema = z.object({
  shop: z
    .string()
    .min(1, "Shop URL is required")
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(URL_PROTOCOL_RE, "")
        .replace(TRAILING_SLASH_RE, "")
    )
    .refine((s) => SHOPIFY_HOST_RE.test(s), {
      message: "Enter a valid Shopify store URL (e.g. mystore.myshopify.com)",
    }),
});

type ShopifyFormValues = z.infer<typeof shopifyFormSchema>;

function ShopifyForm({ onBack }: { onBack: () => void }) {
  const form = useForm<ShopifyFormValues>({
    resolver: zodResolver(shopifyFormSchema),
    defaultValues: { shop: "" },
    mode: "onTouched",
  });

  const onSubmit = (values: ShopifyFormValues) => {
    window.location.href = `${env.NEXT_PUBLIC_API_URL}/oauth/shopify/authorize?shop=${encodeURIComponent(values.shop)}`;
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="shop"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shop URL</FormLabel>
              <FormControl>
                <Input placeholder="mystore.myshopify.com" {...field} />
              </FormControl>
              <FormDescription>
                The .myshopify.com domain of the store you want to connect.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormButtons
          isSubmitting={form.formState.isSubmitting}
          onBack={onBack}
        />
      </form>
    </Form>
  );
}

function DirectConnect({
  marketplace,
  onBack,
}: {
  marketplace: Marketplace;
  onBack: () => void;
}) {
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = `${env.NEXT_PUBLIC_API_URL}/oauth/${marketplace.id}/authorize`;
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <p className="text-center text-muted-foreground text-sm">
        You'll be redirected to {marketplace.name} to sign in and authorize
        access.
      </p>
      <FormButtons onBack={onBack} />
    </form>
  );
}
