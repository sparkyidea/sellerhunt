/** The `mobile_profile.app` values that have a credential schema. */
export type CredentialApp = "ebay" | "shop";

export function isCredentialApp(app: string): app is CredentialApp {
  return app === "ebay" || app === "shop";
}
