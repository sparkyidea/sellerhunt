import { Separator } from "@sparkyidea/ui/components/separator";
import { Icons } from "@sparkyidea/ui/icons";
import Image from "next/image";

import { Marquee } from "@/components/marquee";
import { formatCurrency } from "@/lib/helpers";
import { cn } from "@/lib/utils";

import { orderData } from "@/modules/features/order-data";

interface OrderMarqueeProps {
  className?: string;
  isHovered?: boolean;
}

export const OrderMarquee = ({ isHovered, className }: OrderMarqueeProps) => {
  return (
    <Marquee className={cn(className)} isAnimated={isHovered} offset={-18}>
      {orderData.map((order, idx) => {
        const formattedDate = new Date(order.date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        // Calculate subtotal
        const subtotal = order.orderItems.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );

        // Define tax (assuming a fixed tax rate of 8% for this example)
        const tax = subtotal * 0.08;

        // Calculate total
        const total = subtotal + order.shipping + tax;

        return (
          <figure
            className={cn(
              "relative w-72 transform-gpu cursor-pointer overflow-hidden rounded-xl border transition-all duration-300 ease-out"
            )}
            key={idx}
          >
            <div className="flex items-center bg-muted/50 p-4">
              <div className="flex flex-1 flex-col">
                <h3 className="font-medium text-base">Order {order.id}</h3>
                <span className="text-muted-foreground text-xs">
                  Date {formattedDate}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center justify-center rounded-sm border p-1">
                  <Icons.shipping className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-center rounded-sm border p-1">
                  <Icons.more className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="flex p-4 text-sm">
              <div className="grid w-full">
                <ul className="grid gap-1">
                  {order.orderItems.map((item, idx) => (
                    <li className="flex items-center justify-between" key={idx}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white">
                          <div className="relative h-5 w-5">
                            <Image
                              alt={item.name}
                              fill
                              sizes="24px"
                              src={item.image}
                              style={{
                                objectFit: "contain",
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-muted-foreground">
                          {item.name} x {item.quantity}
                        </span>
                      </div>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <Separator className="my-2" />
                <ul className="grid gap-1">
                  <li className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{formatCurrency(order.shipping)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatCurrency(tax)}</span>
                  </li>
                  <li className="flex items-center justify-between font-semibold">
                    <span className="text-muted-foreground">Total</span>
                    <span>{formatCurrency(total)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </figure>
        );
      })}
    </Marquee>
  );
};
