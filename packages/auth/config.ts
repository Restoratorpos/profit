import type { NextAuthConfig, Session } from "next-auth";
import "./types";

/**
 * Auth.js's own endpoints (csrf, callback, session) plus registration. These are
 * always reachable, signed in or not: requiring a session to reach the callback
 * that grants you one is a deadlock, and requiring one to register is worse.
 */
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/register"];

/**
 * Next's generated metadata images. These are routes, not files, so the
 * extension exclusion in the proxy matcher does not cover them and they would
 * otherwise 307 to /sign-in — leaving the sign-in page itself without a favicon
 * and every link preview without a card.
 */
const PUBLIC_ASSET_PATHS = ["/icon", "/apple-icon", "/opengraph-image"];

/** Pages that exist to get you a session, and are pointless once you have one. */
const AUTH_PAGES = ["/sign-in", "/sign-up"];

const startsWithAny = (
  pathname: string,
  prefixes: readonly string[]
): boolean =>
  prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

/**
 * Where to send a signed-in user who lands on /sign-in.
 *
 * `callbackUrl` is attacker-controllable — it is just a query param — so it is
 * only honoured when it resolves to this same origin. Anything else (another
 * host, or an auth page, which would bounce forever) falls back to "/".
 */
const resolveCallbackUrl = (raw: string | null, base: URL): URL => {
  const home = new URL("/", base);

  if (!raw) {
    return home;
  }

  try {
    const target = new URL(raw, base);

    if (target.origin !== base.origin) {
      return home;
    }

    if (startsWithAny(target.pathname, AUTH_PAGES)) {
      return home;
    }

    return target;
  } catch {
    return home;
  }
};

/**
 * Edge-safe half of the Auth.js config: no providers, because the credentials
 * provider reaches for server-only code that cannot run in middleware. The
 * middleware only needs to verify an already-issued JWT, which this covers.
 * `index.ts` extends this with the actual provider.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.phone = user.phone;
        token.role = user.role;
        token.gymId = user.gymId;
        token.branchId = user.branchId;
      }

      return token;
    },
    session({ session, token }) {
      // JWT's index signature types these as unknown; the jwt() callback above
      // is the only thing that writes them, and it writes what User declares.
      session.user.id = token.id as string;
      session.user.phone = token.phone as string;
      session.user.role = token.role as Session["user"]["role"];
      session.user.gymId = token.gymId as string;
      session.user.branchId = token.branchId as string | null;

      return session;
    },
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isSignedIn = Boolean(auth?.user);

      if (
        startsWithAny(nextUrl.pathname, PUBLIC_API_PREFIXES) ||
        startsWithAny(nextUrl.pathname, PUBLIC_ASSET_PATHS)
      ) {
        return true;
      }

      if (startsWithAny(nextUrl.pathname, AUTH_PAGES)) {
        // Returning a Response short-circuits the middleware. Without this a
        // signed-in user can sit on /sign-in and sign in again on top of a
        // live session.
        return isSignedIn
          ? Response.redirect(
              resolveCallbackUrl(
                nextUrl.searchParams.get("callbackUrl"),
                nextUrl
              )
            )
          : true;
      }

      // Everything else: false makes Auth.js redirect to /sign-in and attach a
      // callbackUrl pointing back here.
      return isSignedIn;
    },
  },
} satisfies NextAuthConfig;
