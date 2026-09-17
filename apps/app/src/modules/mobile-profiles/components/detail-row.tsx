import type { ReactNode } from "react";

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={
          mono ? "break-all text-right font-mono text-xs" : "text-right"
        }
      >
        {value}
      </span>
    </div>
  );
}

export const formatDate = (value: Date | null | undefined): string =>
  value ? new Date(value).toLocaleString() : "—";

export const formatYesNo = (value: boolean): string => (value ? "Yes" : "No");
