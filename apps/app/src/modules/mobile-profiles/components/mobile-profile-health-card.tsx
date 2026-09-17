import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { STATUS_LABELS } from "../constants";
import type { MobileProfileData } from "../types";
import { DetailRow, formatDate } from "./detail-row";
import { MobileProfileStatusForm } from "./mobile-profile-status-form";

export function MobileProfileHealthCard({
  profile,
}: {
  profile: MobileProfileData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailRow label="Status" value={STATUS_LABELS[profile.status]} />
        <DetailRow label="Consecutive failures" value={profile.failureCount} />
        <DetailRow
          label="Cooldown until"
          value={formatDate(profile.cooldownUntil)}
        />
        <DetailRow
          label="Failure reason"
          value={profile.failureReason ?? "—"}
        />
        <DetailRow label="Failed at" value={formatDate(profile.failedAt)} />
        <DetailRow label="Last used" value={formatDate(profile.lastUsedAt)} />
        <DetailRow
          label="Last success"
          value={formatDate(profile.lastSuccessAt)}
        />
        {/* Keyed on status so the select resets after a save or external change. */}
        <MobileProfileStatusForm key={profile.status} profile={profile} />
      </CardContent>
    </Card>
  );
}
