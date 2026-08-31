import { AlertTriangleIcon } from "lucide-react";

export function ErrorView({ message }: { message?: string }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-y-4">
      <AlertTriangleIcon className="size-6 text-destructive" />
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </div>
  );
}
