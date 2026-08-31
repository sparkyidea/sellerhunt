import { PhoneProperty } from "@sparkyidea/dataview/properties";
import { Label } from "@sparkyidea/ui/components/label";
import { AddressBlock } from "@/components/ui/address-block";
import type { OrderData } from "../types";

export function CustomerSection({ order }: { order: OrderData }) {
  const email = order.shippingEmail ?? order.billingEmail;
  const phone = order.shippingPhone ?? order.billingPhone;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-1">
        <Label>Customer</Label>
        <span className="text-sm">
          {order.billingName ?? order.shippingName ?? "—"}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Contact information</Label>
        <div className="flex flex-col gap-0.5 text-sm">
          {email && (
            <a
              className="break-all text-primary hover:underline"
              href={`mailto:${email}`}
            >
              {email}
            </a>
          )}
          {phone && <PhoneProperty value={phone} />}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Shipping address</Label>
        <AddressBlock
          address1={order.shippingAddress1}
          address2={order.shippingAddress2}
          city={order.shippingCity}
          name={order.shippingName}
          phone={phone}
          state={order.shippingState}
          zipCode={order.shippingZipCode}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Billing address</Label>
        <AddressBlock
          address1={order.billingAddress1}
          address2={order.billingAddress2}
          city={order.billingCity}
          name={order.billingName}
          phone={order.billingPhone}
          state={order.billingState}
          zipCode={order.billingZipCode}
        />
      </div>
    </section>
  );
}
