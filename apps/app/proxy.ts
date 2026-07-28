import { authMiddleware } from "@repo/auth/proxy";
import type { NextProxy } from "next/server";

// The `authorized` callback in @repo/auth/config decides what is public;
// unauthenticated requests to everything else are redirected to /sign-in.
export default authMiddleware as unknown as NextProxy;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
