"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { Send } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@sparkyidea/ui/components/empty"
import { organizationPlugin } from "@dashseller/auth/lib/auth/organization-plugin"

/**
 * Empty state for `UserInvitations`.
 */
export function UserInvitationsEmpty() {
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin)

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Send />
        </EmptyMedia>
        <EmptyTitle>{organizationLocalization.noInvitations}</EmptyTitle>
        <EmptyDescription>
          {organizationLocalization.userInvitationsEmptyDescription}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
