import {
  AuthProvider as AuthProviderPrimitive,
  type AuthProviderProps
} from "@better-auth-ui/react"
import type { AuthPlugin } from "@dashseller/auth/lib/auth/auth-plugin"
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  PropsWithChildren,
  ReactNode
} from "react"

import { ErrorToaster } from "./error-toaster"

declare module "@better-auth-ui/core" {
  /**
   * LOCAL PATCH (not from the registry). Widens `useAuth().plugins` to the
   * shadcn-typed `AuthPlugin`. It lives here rather than next to the
   * `AuthPlugin` type in `lib/auth/auth-plugin.ts` because a `declare module`
   * only takes effect when its file is in the consumer's TS program — apps
   * import `@dashseller/auth` as raw source, nothing imports `auth-plugin.ts`,
   * so an augmentation there is a silent no-op and `useAuth().plugins` falls
   * back to the un-widened base type (a 258-error `app#build`). `<AuthProvider>`
   * is required to render any auth view, so this module is always reached.
   */
  interface AuthPluginRegister {
    shadcn: AuthPlugin
  }

  interface AuthConfig {
    /**
     * React component used to render internal navigation links.
     * Typically TanStack Router's `Link` or Next.js's `Link`.
     */
    Link: ComponentType<
      PropsWithChildren<
        { className?: string; href: string; to?: string } & Pick<
          ComponentPropsWithoutRef<"a">,
          "aria-disabled" | "tabIndex" | "onClick"
        >
      >
    >
  }

  /** Widen `AdditionalField.label` to `ReactNode` in the shadcn package. */
  interface AdditionalFieldRegister {
    label: ReactNode
  }
}

/**
 * Provides an authentication context by rendering an auth provider with the sonner toast handler injected, forwarding remaining configuration and rendering `children` inside it.
 *
 * @param children - React nodes to render inside the authentication provider
 * @returns A React element that renders an authentication provider configured with the provided props and toast handler
 */
export function AuthProvider({ children, ...config }: AuthProviderProps) {
  return (
    <AuthProviderPrimitive {...config}>
      {children}

      <ErrorToaster />
    </AuthProviderPrimitive>
  )
}
