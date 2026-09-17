"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { relativeToNow } from "../bearer";
import type { MobileProfileData } from "../types";
import { DetailRow, formatDate, formatYesNo } from "./detail-row";

export function MobileProfileBearerCard({
  profile,
}: {
  profile: MobileProfileData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Token cache</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailRow
          label="Cached bearer"
          value={formatYesNo(profile.hasCachedBearer)}
        />
        <DetailRow
          label="Bearer expires"
          value={
            profile.accessTokenExpiresAt ? (
              <>
                {relativeToNow(profile.accessTokenExpiresAt)}
                <span className="ml-2 text-muted-foreground">
                  {formatDate(profile.accessTokenExpiresAt)}
                </span>
              </>
            ) : (
              "—"
            )
          }
        />
        <DetailRow
          label="Refresh token"
          value={formatYesNo(profile.hasRefreshToken)}
        />
        <DetailRow
          label="Refresh expires"
          value={
            profile.refreshTokenExpiresAt
              ? relativeToNow(profile.refreshTokenExpiresAt)
              : "—"
          }
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Token values are never returned by the API. The scan worker owns this
          cache: it re-mints on expiry and drops the bearer itself on a 401 from
          a data endpoint. To start over, delete the profile and upload the
          capture again.
        </p>
      </CardContent>
    </Card>
  );
}
