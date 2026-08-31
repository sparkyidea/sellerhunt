import type { OrderAddress } from "../../../../types";

export interface ShopifyMailingAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  company: string | null;
  countryCode: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
}

const EMPTY_ADDRESS: OrderAddress = {
  address1: null,
  address2: null,
  city: null,
  company: null,
  countryCode: null,
  email: null,
  name: null,
  phone: null,
  state: null,
  zipCode: null,
};

function joinName(
  firstName: string | null,
  lastName: string | null
): string | null {
  const parts = [firstName, lastName].filter(
    (p): p is string => !!p && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Map a Shopify `MailingAddress` to a normalized {@link OrderAddress}.
 *
 * Shopify's protected-customer-data scope gates most PII fields (firstName,
 * lastName, address1, address2, phone, zip) — when not approved, those come
 * back null and the address ends up half-populated (city + country survive).
 * We tolerate that gracefully; the trigger can still upsert.
 *
 * `email` is on the order, not the address — caller threads it in.
 */
export function buildOrderAddress(
  address: ShopifyMailingAddress | null | undefined,
  email: string | null
): OrderAddress {
  if (!address) {
    return { ...EMPTY_ADDRESS, email };
  }
  return {
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    company: address.company,
    countryCode: address.countryCode,
    email,
    name: joinName(address.firstName, address.lastName),
    phone: address.phone,
    state: address.provinceCode ?? address.province,
    zipCode: address.zip,
  };
}
