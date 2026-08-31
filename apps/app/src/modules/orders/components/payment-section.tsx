import { SelectProperty } from "@sparkyidea/dataview/properties";
import type { SelectConfig } from "@sparkyidea/dataview/types";
import { Button } from "@sparkyidea/ui/components/button";
import { Separator } from "@sparkyidea/ui/components/separator";
import { TriangleAlert } from "lucide-react";
import type { OrderData } from "../types";

type PaymentState =
  | "canceled"
  | "paid"
  | "partially_refunded"
  | "pending"
  | "refunded";

const PAYMENT_STATE_OPTIONS: SelectConfig["options"] = [
  { value: "paid", name: "Paid", color: "green" },
  { value: "pending", name: "Payment pending", color: "yellow" },
  { value: "refunded", name: "Refunded", color: "gray" },
  { value: "partially_refunded", name: "Partially refunded", color: "yellow" },
  { value: "canceled", name: "Paid", color: "gray" },
];

function getPaymentState(order: OrderData): PaymentState {
  if (order.status === "canceled") {
    return "canceled";
  }
  if (order.status === "refunded") {
    return "refunded";
  }
  if (
    order.refund != null &&
    order.refund > 0 &&
    order.refund < (order.total ?? 0)
  ) {
    return "partially_refunded";
  }
  if (order.paidAt) {
    return "paid";
  }
  return "pending";
}

function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return "";
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getAmountClassName(bold?: boolean, negative?: boolean) {
  if (bold) {
    return "font-semibold";
  }
  if (negative) {
    return "text-muted-foreground";
  }
  return undefined;
}

function PaymentRow({
  amount,
  bold,
  detail,
  label,
  negative,
}: {
  amount: string;
  bold?: boolean;
  detail?: string;
  label: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <div className="flex items-baseline gap-2">
        <span className={bold ? "font-semibold" : undefined}>{label}</span>
        {detail && (
          <span className="text-muted-foreground text-xs">{detail}</span>
        )}
      </div>
      <span className={getAmountClassName(bold, negative)}>
        {negative ? `-${amount}` : amount}
      </span>
    </div>
  );
}

function SummarySection({
  order,
  paymentState,
}: {
  order: OrderData;
  paymentState: PaymentState;
}) {
  const isRefunded = paymentState === "refunded" || paymentState === "canceled";

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <PaymentRow
        amount={isRefunded ? "$0.00" : formatCents(order.subtotal)}
        label="Subtotal"
      />
      {!isRefunded && order.shippingCost != null && order.shippingCost > 0 && (
        <PaymentRow amount={formatCents(order.shippingCost)} label="Shipping" />
      )}
      {!isRefunded && order.discount != null && order.discount > 0 && (
        <PaymentRow
          amount={formatCents(order.discount)}
          label="Discount"
          negative
        />
      )}
      {!isRefunded && order.tax != null && order.tax > 0 && (
        <PaymentRow amount={formatCents(order.tax)} label="Tax" />
      )}
      <PaymentRow
        amount={isRefunded ? "$0.00" : formatCents(order.total)}
        bold
        label="Total"
      />
    </div>
  );
}

function PaymentActions({ paymentState }: { paymentState: PaymentState }) {
  if (paymentState === "refunded" || paymentState === "canceled") {
    return null;
  }

  const showMarkAsPaid = paymentState === "pending";

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline">
        Send invoice
      </Button>
      {showMarkAsPaid && <Button size="sm">Mark as paid</Button>}
    </div>
  );
}

export function PaymentSection({ order }: { order: OrderData }) {
  const paymentState = getPaymentState(order);
  const paidAmount =
    paymentState === "pending" || paymentState === "canceled" ? 0 : order.total;
  const netPayment = (order.total ?? 0) - (order.refund ?? 0);
  const hasRefund =
    paymentState === "refunded" || paymentState === "partially_refunded";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-base leading-snug">Payment</h3>
        <SelectProperty
          config={{ options: PAYMENT_STATE_OPTIONS }}
          value={paymentState}
        />
      </div>
      <div className="rounded-lg border">
        {(paymentState === "refunded" || paymentState === "canceled") && (
          <>
            <div className="px-4 py-3">
              <PaymentRow
                amount={formatCents(order.total)}
                detail={formatDate(order.orderedAt)}
                label="Original order"
              />
            </div>
            <Separator />
          </>
        )}

        <SummarySection order={order} paymentState={paymentState} />

        <Separator />

        <div className="flex flex-col gap-1.5 px-4 py-3">
          <PaymentRow amount={formatCents(paidAmount)} label="Paid" />
          {paymentState === "pending" && (
            <PaymentRow amount={formatCents(order.total)} label="Balance" />
          )}
          {hasRefund && (
            <>
              <PaymentRow
                amount={formatCents(order.refund)}
                label="Refunded"
                negative
              />
              <PaymentRow
                amount={formatCents(netPayment)}
                bold
                label="Net payment"
              />
            </>
          )}
        </div>
      </div>

      {paymentState === "pending" && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm dark:bg-yellow-950/30">
          <TriangleAlert className="size-4 shrink-0 text-yellow-600" />
          <span className="text-yellow-800 dark:text-yellow-200">
            {formatCents(order.total)} of the balance is currently unauthorized
          </span>
        </div>
      )}

      <PaymentActions paymentState={paymentState} />
    </section>
  );
}
