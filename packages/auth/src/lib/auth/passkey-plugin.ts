import { createAuthPlugin } from "@better-auth-ui/core"
import {
  passkeyPlugin as corePasskeyPlugin,
  type PasskeyPluginOptions
} from "@better-auth-ui/core/plugins/passkey"

import { PasskeyButton } from "@dashseller/auth/components/auth/passkey/passkey-button"
import { Passkeys } from "@dashseller/auth/components/auth/passkey/passkeys"

export const passkeyPlugin = createAuthPlugin(
  corePasskeyPlugin.id,
  (options: PasskeyPluginOptions = {}) => ({
    ...corePasskeyPlugin(options),
    authButtons: [PasskeyButton],
    securityCards: [Passkeys]
  })
)
