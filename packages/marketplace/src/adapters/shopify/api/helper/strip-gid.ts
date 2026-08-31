/**
 * Shopify exposes resource IDs as GIDs (`gid://shopify/Product/123`). We store
 * just the trailing segment (`123`, or `gc` for taxonomy) on our side so the
 * value matches what merchants see in the admin URL and so that consumers
 * aren't carrying around the namespace.
 *
 * Round-trip: when we hand a stored ID back to Shopify (e.g. as a GraphQL
 * `ID!` argument), wrap it with {@link toGid}.
 */

const GID_RE = /^gid:\/\//;

export function stripGid(gid: string): string {
  if (!gid) {
    return gid;
  }
  const slash = gid.lastIndexOf("/");
  return slash === -1 ? gid : gid.slice(slash + 1);
}

export function toGid(type: string, id: string): string {
  if (GID_RE.test(id)) {
    return id;
  }
  return `gid://shopify/${type}/${id}`;
}
