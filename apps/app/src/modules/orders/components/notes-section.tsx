import { Label } from "@sparkyidea/ui/components/label";
import type { OrderData } from "../types";

export function NotesSection({ order }: { order: OrderData }) {
  if (!(order.sellerNote || order.customerNote)) {
    return (
      <section className="flex flex-col gap-2">
        <Label>Note</Label>
        <p className="rounded-lg border bg-card p-3 text-muted-foreground text-sm">
          No notes from customer or seller
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {order.sellerNote && (
        <div className="flex flex-col gap-1">
          <Label>Seller note</Label>
          <p className="rounded-lg border p-1 text-sm">{order.sellerNote}</p>
        </div>
      )}
      {order.customerNote && (
        <div className="flex flex-col gap-2">
          <Label>Customer note</Label>
          <p className="rounded-lg border p-1 text-sm">{order.customerNote}</p>
        </div>
      )}
    </section>
  );
}
