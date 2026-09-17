import { Button } from "@sparkyidea/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import type { MobileProfileData } from "../types";
import { DetailRow } from "./detail-row";

export function MobileProfileIdentifiersCard({
  profile,
  onReplace,
}: {
  profile: MobileProfileData;
  onReplace?: () => void;
}) {
  const entries = Object.entries(profile.identifiers ?? {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credentials</CardTitle>
        <CardDescription>
          Stored encrypted. Only device identifiers are shown; secrets are never
          returned.
        </CardDescription>
        {onReplace && (
          <CardAction>
            <Button onClick={onReplace} size="sm" variant="outline">
              Replace…
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {profile.credentialsReadable ? (
          <>
            {entries.map(([key, value]) => (
              <DetailRow key={key} label={key} mono value={value} />
            ))}
            {profile.app === "ebay" && (
              <DetailRow label="hmacKey" value="Stored — never shown" />
            )}
            {entries.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No displayable identifiers for this app.
              </p>
            )}
          </>
        ) : (
          <p className="text-destructive text-sm">
            Credentials could not be decrypted with this server's encryption
            key. Replace them to restore scanning for this profile.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
