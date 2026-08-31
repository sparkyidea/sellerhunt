import {
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";

export function IssuePageHeaderSkeleton() {
  return (
    <PanelGroup>
      <PanelHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="@lg/panel:block hidden size-4 rounded-sm" />
          <Skeleton className="@lg/panel:block hidden size-3 rounded-sm" />
          <Skeleton className="h-7 w-56 max-w-full" />
        </div>
        <PanelTags>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </PanelTags>
      </PanelHeader>
    </PanelGroup>
  );
}

export function IssuePreviewHeaderSkeleton() {
  return (
    <>
      <PanelToolbar>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>
            <Skeleton className="h-7 w-2/3" />
          </PanelTitle>
          <PanelTags>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </PanelTags>
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

export function IssuePanelContentSkeleton() {
  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-12 grid-cols-1 gap-6">
          <div className="@3xl:col-span-8 flex min-w-0 flex-col gap-4">
            <Skeleton className="h-48 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
          <div className="@3xl:col-span-4 flex min-w-0 flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-md" />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}

export function IssueDetailViewSkeleton() {
  return (
    <>
      <IssuePageHeaderSkeleton />
      <IssuePanelContentSkeleton />
    </>
  );
}

export function IssuePreviewViewSkeleton() {
  return (
    <>
      <IssuePreviewHeaderSkeleton />
      <IssuePanelContentSkeleton />
    </>
  );
}
