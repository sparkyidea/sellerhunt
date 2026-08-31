import {
  PanelAction,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";

export function ListingVariantPageHeaderSkeleton() {
  return (
    <PanelGroup>
      <PanelHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="@lg/panel:block hidden size-4 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden size-3 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden h-4 w-24 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden size-3 rounded-sm" />
          <Skeleton className="h-7 w-48 max-w-full" />
        </div>
        <PanelTags>
          <Skeleton className="h-5 w-24 rounded-full" />
        </PanelTags>
      </PanelHeader>
      <PanelAction>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </PanelAction>
    </PanelGroup>
  );
}

export function ListingVariantPanelContentSkeleton() {
  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
          <div className="@3xl:col-span-5 flex min-w-0 flex-col gap-6">
            <Skeleton className="h-64 w-full rounded-md" />
            <Skeleton className="h-48 w-full rounded-md" />
          </div>
          <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-6">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}

export function ListingVariantPreviewHeaderSkeleton() {
  return (
    <>
      <PanelToolbar>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <PanelAction>
          <Skeleton className="size-7 rounded-md" />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>
            <Skeleton className="h-7 w-2/3" />
          </PanelTitle>
          <PanelTags>
            <Skeleton className="h-5 w-24 rounded-full" />
          </PanelTags>
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

export function ListingVariantDetailViewSkeleton() {
  return (
    <>
      <ListingVariantPageHeaderSkeleton />
      <ListingVariantPanelContentSkeleton />
    </>
  );
}

export function ListingVariantPreviewViewSkeleton() {
  return (
    <>
      <ListingVariantPreviewHeaderSkeleton />
      <ListingVariantPanelContentSkeleton />
    </>
  );
}
