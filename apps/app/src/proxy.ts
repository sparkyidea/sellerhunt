import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth");

  // Unauthenticated users on protected routes -> redirect to sign-in
  if (!(sessionCookie || isAuthRoute)) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    if (pathname !== "/") {
      signInUrl.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(signInUrl);
  }

  // Authenticated users on auth pages -> redirect to home
  // Exclude callback (OAuth flow) and sign-out (needs to render to call signOut)
  if (
    sessionCookie &&
    isAuthRoute &&
    pathname !== "/auth/callback" &&
    pathname !== "/auth/sign-out"
  ) {
    return NextResponse.redirect(new URL("/products", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
