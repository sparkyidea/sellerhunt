import { Badge } from "@sparkyidea/ui/components/badge";
import { PanelTags } from "@sparkyidea/ui/components/panel";
import { appLabel, STATUS_LABELS } from "../constants";
import type { MobileProfileData } from "../types";

export function MobileProfileTags({ profile }: { profile: MobileProfileData }) {
  const coolingDown =
    profile.cooldownUntil !== null &&
    new Date(profile.cooldownUntil).getTime() > Date.now();

  return (
    <PanelTags>
      <Badge variant="secondary">{appLabel(profile.app)}</Badge>
      <Badge
        variant={profile.status === "dead" ? "destructive" : "green-subtle"}
      >
        {STATUS_LABELS[profile.status]}
      </Badge>
      {coolingDown && <Badge variant="yellow-subtle">Cooling down</Badge>}
      {profile.assignedWorker === null && (
        <Badge variant="outline">Unassigned</Badge>
      )}
    </PanelTags>
  );
}
