# Replace the hooks library and preserve sidebar state between app and admin

## Problem

The sidebar resets to expanded when navigating between the app view and the admin dashboard, losing the user's expanded or collapsed preference. Restoring a saved preference should also avoid briefly rendering the default expanded sidebar first.

The requested work includes replacing the existing hooks library with Alibaba's hooks library. The todo tentatively identifies the packages as `usehooks-ts` and `ahooks`; these names have not been confirmed. No specific defect in the existing library is established by the todo.

## Expected outcome

- The source and replacement hooks packages are confirmed, and the agreed replacement scope is completed.
- Expanded and collapsed sidebar states are preserved when switching between app and admin views.
- Reloading restores the saved state for the agreed persistence lifetime.
- The initial render reflects the saved preference without an expanded-state flash.
- Both saved states behave consistently across reloads and app/admin navigation.

## Details to clarify

- Are `usehooks-ts` and `ahooks` the intended source and replacement packages?
- Does replacement cover every existing use of the old library, or a narrower scope?
- Should the preference survive closing and reopening the browser, or last only for the current session?
- Should app and admin always share one preference, and should that preference be specific to the signed-in user?

Define the required persistence behavior without choosing a storage mechanism or hook implementation in this issue.
