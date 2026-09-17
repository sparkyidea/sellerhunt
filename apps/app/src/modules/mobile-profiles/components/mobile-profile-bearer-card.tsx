"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { useState } from "react";
import {
  BEARER_STATE_BADGE,
  BEARER_STATE_LABELS,
  relativeToNow,
} from "../bearer";
import type { MobileProfileData } from "../types";
import { DetailRow, formatDate, formatYesNo } from "./detail-row";
import { EvictBearerDialog } from "./evict-bearer-dialog";

export function MobileProfileBearerCard({
  profile,
}: {
  profile: MobileProfileData;
}) {
  const [evictOpen, setEvictOpen] = useState(false);
  const state = profile.bearerState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token cache</CardTitle>
        <CardAction>
          <Badge variant={BEARER_STATE_BADGE[state]}>
            {BEARER_STATE_LABELS[state]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        <DetailRow label="Revision" value={profile.revision} />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Token values are never returned by the API. Every write here bumps the
          revision; a scan holding the old one stops and reloads.
        </p>
        <div className="flex gap-2">
          <Button
            disabled={!profile.hasCachedBearer}
            onClick={() => setEvictOpen(true)}
            size="sm"
            variant="outline"
          >
            Evict bearer…
          </Button>
        </div>
      </CardContent>
      <EvictBearerDialog
        onOpenChange={setEvictOpen}
        open={evictOpen}
        profile={profile}
      />
    </Card>
  );
}
