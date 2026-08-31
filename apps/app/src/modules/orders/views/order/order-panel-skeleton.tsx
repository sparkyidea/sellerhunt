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

export function OrderPageHeaderSkeleton() {
  return (
    <PanelGroup>
      <PanelHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="@lg/panel:block hidden size-4 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden size-3 rounded-sm" />
          <Skeleton className="h-7 w-48 max-w-full" />
        </div>
        <PanelTags>
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </PanelTags>
      </PanelHeader>
      <PanelAction>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </PanelAction>
    </PanelGroup>
  );
}

export function OrderPreviewHeaderSkeleton() {
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
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </PanelTags>
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

export function OrderPanelContentSkeleton() {
  return (
    <PanelContent>
      <Skeleton className="h-4 w-64" />
      <div className="@container">
        <div className="grid @3xl:grid-cols-12 grid-cols-1 gap-6">
          <div className="@3xl:col-span-9 flex min-w-0 flex-col gap-4">
            <Skeleton className="h-64 w-full rounded-md" />
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-48 w-full rounded-md" />
          </div>
          <div className="@3xl:col-span-3 flex min-w-0 flex-col gap-4">
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="h-56 w-full rounded-md" />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}

export function OrderDetailViewSkeleton() {
  return (
    <>
      <OrderPageHeaderSkeleton />
      <OrderPanelContentSkeleton />
    </>
  );
}

export function OrderPreviewViewSkeleton() {
  return (
    <>
      <OrderPreviewHeaderSkeleton />
      <OrderPanelContentSkeleton />
    </>
  );
}
