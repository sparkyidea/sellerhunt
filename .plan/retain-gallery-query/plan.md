# Retain gallery query through settings

Provide generic query synchronization context in dataview. PanelRoute captures
the owning pathname in retained content and automatically pauses every nested
dataview while that route is inactive; no table-specific pathname checks. Preserve the validated query through the
first return commit until nuqs effects have synchronized, and block writes while
paused. Do not add separate preset selection state or change server rendering.

Browser regression harness (temporary route, removed after verification):
- Started with filter=itemSold.gte.1000, search=shoes, descending sold sort, limit=50.
- Opened settings, switched to security, attempted a paused filter write, returned.
- A layout-effect commit transcript contained only the original query throughout.
- Navigated to All and browser Back: query cleared and restored normally.

Automatic ownership follow-up:
- Removed table-level syncWithUrl props and route checks.
- Added QuerySyncProvider and captured PanelRoute ownership.
- Three boundary tests cover app/admin retention, outgoing/incoming isolation,
  and independent settings state; all pass, along with 27 dataview tests.
- Monorepo types and repository lint pass.
- Real browser: URL-initialized preset → settings → appearance → close retained
  selection. Changing the preset resumed nuqs URL writes; Back/Forward restored
  the newer URL filter correctly.
