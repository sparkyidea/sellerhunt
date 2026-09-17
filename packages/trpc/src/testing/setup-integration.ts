import { TEST_DATABASE_URL } from "@dashseller/db/testing";

// `@dashseller/db` builds its singleton from `DATABASE_URL` at import time.
// Force the service DB so a shell that sourced apps/api/.env can never make
// the router suite write into a real database.
process.env.DATABASE_URL = TEST_DATABASE_URL;
