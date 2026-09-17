import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { parseProfileId } from "@/modules/mobile-profiles/constants";
import { MobileProfileDetailView } from "@/modules/mobile-profiles/views/mobile-profile/mobile-profile-panel";
import { MobileProfileDetailViewSkeleton } from "@/modules/mobile-profiles/views/mobile-profile/mobile-profile-panel-skeleton";

export default async function AdminMobileProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const id = parseProfileId(profileId);
  await prefetch(trpc.mobileProfile.get.queryOptions({ id }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load mobile profile" />}
          >
            <Suspense fallback={<MobileProfileDetailViewSkeleton />}>
              <MobileProfileDetailView id={id} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
