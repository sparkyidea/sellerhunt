import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { IssueDetailView } from "@/modules/issues/views/issue/issue-panel";
import { IssueDetailViewSkeleton } from "@/modules/issues/views/issue/issue-panel-skeleton";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;
  await prefetch(trpc.issue.getOne.queryOptions({ id: issueId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load issue" />}
          >
            <Suspense fallback={<IssueDetailViewSkeleton />}>
              <IssueDetailView id={issueId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
