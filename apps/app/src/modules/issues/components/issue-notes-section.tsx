import { Label } from "@sparkyidea/ui/components/label";
import type { IssueData } from "../types";

export function IssueNotesSection({ issue }: { issue: IssueData }) {
  if (!(issue.sellerNote || issue.customerNote)) {
    return (
      <section className="flex flex-col gap-2">
        <Label>Notes</Label>
        <p className="rounded-lg border bg-card p-3 text-muted-foreground text-sm">
          No notes from customer or seller
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {issue.customerNote && (
        <div className="flex flex-col gap-1">
          <Label>Customer note</Label>
          <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">
            {issue.customerNote}
          </p>
        </div>
      )}
      {issue.sellerNote && (
        <div className="flex flex-col gap-1">
          <Label>Seller note</Label>
          <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">
            {issue.sellerNote}
          </p>
        </div>
      )}
    </section>
  );
}
