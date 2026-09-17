"use client";

import {
  creatableEntries,
  parseBulkEntries,
} from "@dashseller/trpc/lib/bulk-credentials";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparkyidea/ui/components/dialog";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMemo, useState } from "react";
import { describeParseFailure } from "../bulk-messages";
import { useBulkWrite } from "../hooks/use-bulk-write";
import { useMobileProfileDialog } from "../hooks/use-mobile-profile-dialog";
import { BulkCredentialsField } from "./bulk-credentials-field";
import { BulkStagePass, stagedCounts } from "./bulk-stage-pass";
import { BulkWritePass } from "./bulk-write-pass";

/**
 * The one way profiles are created: one pane takes pasted JSON or dropped
 * capture files, each entry carrying its own `app` and `credentials`, and
 * every entry is staged before anything is written. There is no
 * single-profile form — captures arrive in batches. Nothing here names or
 * assigns: the database numbers each row, and a box is attached from the
 * profile afterwards.
 *
 * Replacing the credentials of a profile that already exists is a different
 * act with different consequences; it keeps its own dialog
 * (`ReplaceCredentialsDialog`).
 */
export function MobileProfileDialog() {
  const isOpen = useMobileProfileDialog((s) => s.isOpen);
  const onClose = useMobileProfileDialog((s) => s.onClose);
  const [text, setText] = useState("");
  const write = useBulkWrite();

  const parse = useMemo(() => parseBulkEntries(text), [text]);
  const entries = parse.ok ? parse.entries : [];
  const creatable = useMemo(() => creatableEntries(entries), [entries]);
  const counts = stagedCounts(entries);

  function handleOpenChange(next: boolean) {
    if (next || write.phase === "writing") {
      return;
    }
    setText("");
    write.reset();
    onClose();
  }

  const parseHint =
    !parse.ok && text.trim().length > 0 ? describeParseFailure(parse) : null;

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <div className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>
              <BulkTitle created={write.created} phase={write.phase} />
            </DialogTitle>
            <DialogDescription>
              <BulkDescription phase={write.phase} />
            </DialogDescription>
          </DialogHeader>

          {write.phase === "stage" ? (
            <>
              <BulkCredentialsField onChange={setText} value={text} />
              {parseHint && (
                <p className="text-destructive text-sm">{parseHint}</p>
              )}
              {entries.length > 0 && <BulkStagePass entries={entries} />}
            </>
          ) : (
            <BulkWritePass
              creatable={creatable}
              outcomes={write.outcomes}
              phase={write.phase}
            />
          )}
        </div>

        <DialogFooter>
          {write.phase === "stage" && (
            <>
              <span className="mr-auto text-muted-foreground text-sm">
                {stageNote(entries.length, creatable.length, counts.blocked)}
              </span>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                disabled={creatable.length === 0}
                onClick={() => write.start(creatable)}
                type="button"
              >
                {creatable.length === 0
                  ? "Create profiles"
                  : `Create ${creatable.length} ${creatable.length === 1 ? "profile" : "profiles"}`}
              </Button>
            </>
          )}

          {write.phase === "writing" && (
            <>
              <span className="mr-auto text-muted-foreground text-sm">
                Closing now leaves the remaining entries unwritten.
              </span>
              <Button onClick={write.stop} type="button" variant="outline">
                Stop after this batch
              </Button>
              <Button disabled type="button">
                <Spinner />
                Creating…
              </Button>
            </>
          )}

          {write.phase === "result" && (
            <>
              <span className="mr-auto text-muted-foreground text-sm">
                Created profiles are already in the list behind this dialog.
              </span>
              <Button onClick={() => handleOpenChange(false)} type="button">
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkTitle({
  created,
  phase,
}: {
  created: number;
  phase: ReturnType<typeof useBulkWrite>["phase"];
}) {
  if (phase === "stage") {
    return <>New mobile profiles</>;
  }
  if (phase === "writing") {
    return <>Creating profiles</>;
  }
  return (
    <>
      {created} {created === 1 ? "profile" : "profiles"} created
    </>
  );
}

function BulkDescription({
  phase,
}: {
  phase: ReturnType<typeof useBulkWrite>["phase"];
}) {
  if (phase === "stage") {
    return (
      <>
        Paste or drop the credentials JSON from the captures. Each entry carries
        its own app; the profile gets a number on creation, and the next box
        without a profile claims it.
      </>
    );
  }
  if (phase === "writing") {
    return <>Entries land in small batches, each batch all or nothing.</>;
  }
  return (
    <>
      Every entry landed. Find each profile by its number in the list behind
      this dialog.
    </>
  );
}

/** `5 of 8 entries will be created. 3 blocked entries are skipped.` */
function stageNote(total: number, creatable: number, blocked: number): string {
  if (total === 0) {
    return "0 entries";
  }
  const skipped =
    blocked === 0
      ? ""
      : `. ${blocked} blocked ${blocked === 1 ? "entry is" : "entries are"} skipped`;
  return `${creatable} of ${total} entries will be created${skipped}`;
}
