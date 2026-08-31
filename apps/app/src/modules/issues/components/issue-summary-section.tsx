import { Label } from "@sparkyidea/ui/components/label";
import type { IssueData } from "../types";

function formatCents(cents: number | null | undefined): string | null {
  if (cents == null) {
    return null;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

export function IssueSummarySection({ issue }: { issue: IssueData }) {
  const refundAmount = formatCents(issue.refundAmount);
  const opened = formatDate(issue.openedAt);
  const resolved = formatDate(issue.resolvedAt);

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-1">
        <Label>Reason</Label>
        <p className="whitespace-pre-wrap text-sm">{issue.reason ?? "—"}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Row label="Reason code" value={issue.reasonCode} />
        <Row label="Reference" value={issue.reference} />
        <Row label="Refund amount" value={refundAmount} />
        <Row label="Opened" value={opened} />
        <Row label="Resolved" value={resolved} />
      </div>
    </section>
  );
}
