"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@sparkyidea/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sparkyidea/ui/components/dialog";
import { Icons } from "@sparkyidea/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon, PlusIcon, ShoppingCartIcon, TagIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useContextSearch } from "@/hooks/use-context-search";
import { useTRPC } from "@/lib/utils/trpc/client";

const DEBOUNCE_MS = 300;

interface PageEntry {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  url: string;
}

const PAGES: PageEntry[] = [
  { title: "Products", url: "/products", icon: Icons.product },
  { title: "Listings", url: "/listings", icon: Icons.listing },
  { title: "Orders", url: "/orders", icon: Icons.order },
  { title: "Marketplaces", url: "/marketplaces", icon: Icons.marketplace },
];

const QUICK_ACTIONS: PageEntry[] = [
  { title: "Create Product", url: "/products/new", icon: PlusIcon },
  { title: "Create Listing", url: "/listings/new", icon: PlusIcon },
];

const RESULT_ROUTES: Record<string, string> = {
  listing: "/listings",
  order: "/orders",
  product: "/products",
};

const RESULT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  listing: TagIcon,
  order: ShoppingCartIcon,
  product: PackageIcon,
};

export function ContextSearchCommand() {
  const { isOpen, onClose, onOpen } = useContextSearch();
  const router = useRouter();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query.trim()),
      DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [query]);

  // Server search via React Query
  const { data: searchResults = [], isLoading } = useQuery(
    trpc.contextSearch.query.queryOptions(
      { query: debouncedQuery, limit: 5 },
      { enabled: debouncedQuery.length > 0 }
    )
  );

  // Local matching — show all when query is empty
  const matchingActions = useMemo(() => {
    if (!query.trim()) {
      return QUICK_ACTIONS;
    }
    const lower = query.toLowerCase();
    return QUICK_ACTIONS.filter((a) =>
      a.title.toLowerCase().includes(lower)
    ).slice(0, 3);
  }, [query]);

  const matchingPages = useMemo(() => {
    if (!query.trim()) {
      return PAGES;
    }
    const lower = query.toLowerCase();
    return PAGES.filter((p) => p.title.toLowerCase().includes(lower)).slice(
      0,
      5
    );
  }, [query]);

  const navigate = useCallback(
    (url: string) => {
      router.push(url as Route);
      onClose();
      setQuery("");
    },
    [router, onClose]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setQuery("");
      }
    },
    [onClose]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent
        className="top-2 w-[calc(100%-1rem)] max-w-160 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-160"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search products, listings, and orders
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={setQuery}
            placeholder="Search products, listings, orders..."
            value={query}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Searching..." : "No results found."}
            </CommandEmpty>
            {matchingActions.length > 0 && (
              <CommandGroup heading="Quick Actions">
                {matchingActions.map((action) => (
                  <CommandItem
                    key={action.url}
                    onSelect={() => navigate(action.url)}
                  >
                    <action.icon className="mr-2 size-4" />
                    {action.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {matchingPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Pages">
                  {matchingPages.map((page) => (
                    <CommandItem
                      key={page.url}
                      onSelect={() => navigate(page.url)}
                    >
                      <page.icon className="mr-2 size-4" />
                      {page.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {searchResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Search Results">
                  {searchResults.map((result) => {
                    const Icon = RESULT_ICONS[result.type];
                    const route = RESULT_ROUTES[result.type];
                    return (
                      <CommandItem
                        key={`${result.type}-${result.id}`}
                        onSelect={() => navigate(`${route}/${result.id}`)}
                        value={`${result.type}-${result.id}`}
                      >
                        <Icon className="mr-2 size-4" />
                        <div className="flex flex-col">
                          <span>{result.title}</span>
                          {result.subtitle && (
                            <span className="text-muted-foreground text-xs">
                              {result.type} &middot; {result.subtitle}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
