import { Button } from "@sparkyidea/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { appLabel, profileNumber } from "../constants";
import type { MobileProfileData } from "../types";
import { DetailRow, formatDate } from "./detail-row";

export function MobileProfileInfoCard({
  profile,
  onAssign,
}: {
  profile: MobileProfileData;
  onAssign?: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        {onAssign && (
          <CardAction>
            <Button onClick={onAssign} size="sm" variant="outline">
              {profile.assignedWorker ? "Reassign worker…" : "Assign worker…"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailRow label="Number" mono value={profileNumber(profile.id)} />
        <DetailRow
          label="Worker"
          mono={profile.assignedWorker !== null}
          value={
            profile.assignedWorker ??
            "Unassigned — the next box without a profile claims it"
          }
        />
        <DetailRow label="App" value={appLabel(profile.app)} />
        <DetailRow label="Created" value={formatDate(profile.createdAt)} />
        <DetailRow label="Updated" value={formatDate(profile.updatedAt)} />
      </CardContent>
    </Card>
  );
}
