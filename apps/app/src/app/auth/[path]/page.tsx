import { viewPaths } from "@better-auth-ui/core";
import { twoFactorPlugin } from "@better-auth-ui/core/plugins/two-factor";
import { Auth } from "@dashseller/auth/components/auth/auth";
import { notFound } from "next/navigation";

// The two-factor plugin contributes an extra `/auth/two-factor` challenge
// segment; merge it into the allowed set so that view resolves instead of
// 404ing. The email-otp merge is gone on purpose: with `signIn: false` the
// plugin mounts no view at `/auth/email-otp`, so that segment must 404.
const allowedAuthPaths = Object.values({
  ...viewPaths.auth,
  ...twoFactorPlugin().viewPaths?.auth,
});

export default async function AuthPage({
  params,
}: {
  params: Promise<{
    path: string;
  }>;
}) {
  const { path } = await params;

  if (!allowedAuthPaths.includes(path)) {
    notFound();
  }

  return (
    <div className="my-auto flex justify-center p-4 md:p-6">
      <Auth path={path} />
    </div>
  );
}
