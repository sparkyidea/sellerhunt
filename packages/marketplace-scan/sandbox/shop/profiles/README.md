# shop.app device personas

Single source of truth for the shop.app device personas that feed the
`mobile_profile` pool. Each persona is the device-identity headers for one
captured iOS device.

## Not secrets — but still git-ignored

Unlike eBay's HMAC key, **none of a shop persona's fields are secrets** —
they're device-identity headers (`x-device-id`, `x-device-id-hw`,
`x-device-name`). The real server-recognized secret is the refresh token
shop.app issues on the first `SignInAsGuest`, which the pool stores on
`mobile_profile.refresh_token` — never here.

The `*.json` files are git-ignored anyway (`**/sandbox/**/profiles/*.json`):
the *combination* of fields uniquely identifies a captured device, and we'd
rather not leak the inventory. Only `*.example.json` and this README are
tracked.

## File shape

Each file is exactly a `ShopCredentials` / `ShopRefreshTokenCredentials`
object. See `w-00000.example.json`.

Capture procedure (per persona):

1. Grab a single live curl from the iOS Shop app (mitmproxy) hitting
   `server.shop.app/graphql`.
2. Pull `x-device-id` → `deviceId`, `x-device-id-hw` → `deviceIdHw`,
   `x-device-name` → `deviceName` from the headers. No HMAC capture needed —
   shop.app's mint is unsigned.
3. Save as `w-NNNNN.json` in this directory.

## Who reads this directory

Both consumers glob `*.json` here (skipping `*.example.json`), using the
**filename stem as the persona label**:

- **Sandbox** — `../_auth.ts` picks one persona for ad-hoc script runs.
  Default is the first file; override with `SHOP_PROFILE=w-00001` (or
  `SHOP_PROFILE=random` to rotate).
- **Seed** — `packages/db/src/seed/mobile-profile.ts` loads *every* file into
  the `mobile_profile` pool (app=`shop`), encrypting each and upserting on
  `(app, label)`. Re-running is idempotent and resets pool state.

## Adding a persona

1. Capture a device (above).
2. Drop it in as `w-NNNNN.json`.
3. `bun run packages/db/src/seed/mobile-profile.ts` to load it into the pool.
