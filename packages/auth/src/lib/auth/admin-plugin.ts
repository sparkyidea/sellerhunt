import { createAuthPlugin } from "@better-auth-ui/core"
import {
  type AdminPluginOptions,
  adminPlugin as coreAdminPlugin
} from "@better-auth-ui/core/plugins/admin"

import { StopImpersonating } from "@dashseller/auth/components/auth/admin/stop-impersonating"

export const adminPlugin = createAuthPlugin(
  coreAdminPlugin.id,
  (options: AdminPluginOptions = {}) => ({
    ...coreAdminPlugin(options),
    userMenuItems: [StopImpersonating]
  })
)
