import type {
  AuthPluginComponents,
  AuthPlugin as AuthPluginPrimitive
} from "@better-auth-ui/react"

// LOCAL PATCH (deviates from the registry): the `AuthPluginRegister`
// augmentation that widens `useAuth().plugins` to this `AuthPlugin` was moved
// out of this file into `../../components/auth/auth-provider`. Nothing imports
// this module for its runtime value, so a `declare module` here never enters an
// app's TS program and the widening silently no-ops. Re-adding it here on a
// re-scaffold is the bug, not the fix — keep it in the provider.

/** Props the shadcn `<Auth>` router spreads onto plugin-contributed auth views. */
export type AuthViewProps = {
  className?: string
  socialLayout?: "auto" | "horizontal" | "vertical" | "grid"
  socialPosition?: "top" | "bottom"
}

/** Props the shadcn `<Settings>` router spreads onto plugin-contributed settings views. */
export type SettingsViewProps = {
  className?: string
}

/** Shadcn plugin type. Plugin authors import this from `@/lib/auth/auth-plugin`. */
export type AuthPlugin = AuthPluginPrimitive<
  AuthPluginComponents,
  AuthViewProps,
  SettingsViewProps
>
