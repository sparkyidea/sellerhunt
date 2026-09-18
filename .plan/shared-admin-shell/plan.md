# Shared admin shell

Move admin routes under `(app)` without changing URLs. Keep the nested server
role gate and admin dialogs, and share the header, sidebar and panel root.
Retain dashboard context through settings; reset panels across areas or lost
admin access. Preserve settings return URLs and update topology documentation.

Validate route access, dashboard context, return URLs, types and lint. Exercise
panel retention in a browser if an authenticated local session is available.

Implemented the shared shell and nested admin gate, area-aware settings links,
panel reset/access handling, regression coverage and topology documentation.
Monorepo type checks and repository lint pass. Browser confirmed signed-out
admin access shows 404; full settings/preview verification needs an admin session.
