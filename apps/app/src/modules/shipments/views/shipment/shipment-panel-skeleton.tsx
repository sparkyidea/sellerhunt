import {
  PanelAction,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Separator } from "@sparkyidea/ui/components/separator";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";

export function ShipmentPageHeaderSkeleton() {
  return (
    <PanelGroup>
      <PanelHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="@lg/panel:block hidden size-4 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden size-3 rounded-sm" />
          <Skeleton className="h-7 w-48 max-w-full" />
        </div>
        <PanelTags>
          <Skeleton className="h-5 w-20 rounded-full" />
        </PanelTags>
      </PanelHeader>
      <PanelAction>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </PanelAction>
    </PanelGroup>
  );
}

export function ShipmentPreviewHeaderSkeleton() {
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
            <Skeleton className="h-5 w-20 rounded-full" />
          </PanelTags>
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

export function ShipmentPanelContentSkeleton() {
  return (
    <PanelContent>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-10" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="flex items-center justify-between" key={i}>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-14" />
        <ol className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <li className="flex gap-3" key={i}>
              <Skeleton className="size-4.5 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PanelContent>
  );
}

export function ShipmentDetailViewSkeleton() {
  return (
    <>
      <ShipmentPageHeaderSkeleton />
      <ShipmentPanelContentSkeleton />
    </>
  );
}

export function ShipmentPreviewViewSkeleton() {
  return (
    <>
      <ShipmentPreviewHeaderSkeleton />
      <ShipmentPanelContentSkeleton />
    </>
  );
}
