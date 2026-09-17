# Fix background flashes and content discontinuity during panel transitions

## Problem

The main panel can briefly expose a black background when it unmounts. When a preview is opened as the main panel, the transition does not feel like the same panel expanding: content appears late in a separate panel instead of remaining visible throughout the animation.

These transitions interrupt visual continuity during navigation and make the panel interface feel unstable.

## Expected outcome

- Closing or navigating away from the main panel does not expose a black background flash.
- Opening a preview as the main panel visibly expands that preview into the main panel.
- Content stays visible throughout the expansion, without disappearing and reappearing in a separate panel.
- Navigation, panel unmounting, and preview expansion behave consistently.

## Details to clarify

- Which routes and exact navigation actions reproduce each problem?
This is not route issue but component issue
- Does this happen in both app and admin views, or only in a particular view?
This happends to all view as long as there is no main panel
- Is there a recording or reference interaction that captures the intended expansion behavior?
'/Users/jingchen/Desktop/Screenshot 2026-09-17 at 3.17.37 PM.png'

Describe and verify the user-visible behavior before deciding on implementation. No panel architecture or animation solution is prescribed by this issue.
