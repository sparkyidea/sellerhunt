import { DynamicLink } from "@/components/layout/dynamic-link";

export function AddressBlock({
  name,
  address1,
  address2,
  city,
  state,
  zipCode,
  phone,
}: {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
}) {
  if (!(name || address1)) {
    return null;
  }

  const cityStateZip = [[city, state].filter(Boolean).join(", "), zipCode]
    .filter(Boolean)
    .join(" ");
  const mapQuery = [address1, address2, city, state, zipCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 text-sm">
        {name && <span>{name}</span>}
        {address1 && <span>{address1}</span>}
        {address2 && <span>{address2}</span>}
        {cityStateZip && <span>{cityStateZip}</span>}
        {phone && <span>{phone}</span>}
      </div>
      {mapQuery && (
        <DynamicLink
          className="self-start text-blue-600 text-sm hover:underline dark:text-blue-400"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
          openInNewWindow
        >
          View map
        </DynamicLink>
      )}
    </div>
  );
}
