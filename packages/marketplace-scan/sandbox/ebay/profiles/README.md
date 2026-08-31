# eBay device personas

Single source of truth for the eBay device personas that feed the
`mobile_profile` pool. Each persona is the long-lived, ops-managed auth
material for one captured iOS device: the HMAC signing key plus device
identifiers.

## ⚠️ These are secrets — never commit them

The real `w-NNNNN.json` files contain live signing keys (`hmacKey`). They are
git-ignored via the root `.gitignore` (`**/sandbox/**/profiles/*.json`). Only
`*.example.json` and this README are tracked. Treat this directory like a
`.env`.

## File shape

Each file is exactly an `EbayHmacCredentials` object (no `type`
discriminator — it's defaulted downstream). See `w-00000.example.json`.

Capture procedure (per persona):

1. Hook the iOS app's `CCHmac` call to extract `hmacKey` (hex).
2. Pull `clientId`, `device4pp`, `idfa`, `idfv`, `deviceId`, `guid` from a
   single live curl capture (mitmproxy or similar).
3. Save as `w-NNNNN.json` in this directory.

## Who reads this directory

Both consumers glob `*.json` here (skipping `*.example.json`), using the
**filename stem as the persona label**:

- **Sandbox** — `../_auth.ts` picks one persona for ad-hoc script runs.
  Default is the first file; override with `EBAY_PROFILE=w-00003` (or
  `EBAY_PROFILE=random` to rotate).
- **Seed** — `packages/db/src/seed/mobile-profile.ts` loads *every* file into
  the `mobile_profile` pool, encrypting each and upserting on `(app, label)`.
  Re-running is idempotent and resets pool state.

## Adding a persona

1. Capture a device (above).
2. Drop it in as `w-NNNNN.json`.
3. `bun run packages/db/src/seed/mobile-profile.ts` to load it into the pool.
