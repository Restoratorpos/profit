import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isProduction } from "../config/index.js";
import { verifyRefreshToken } from "./jwt.js";

/**
 * Carries the refresh token for browser clients.
 *
 * The access token deliberately does *not* live in a cookie — it stays in a
 * JavaScript variable in the tab. That split is the point: script on the page
 * can use the access token but cannot read or exfiltrate the long-lived one,
 * so an XSS gets minutes of access rather than a month of it.
 *
 * API and mobile clients are unaffected; they keep receiving both tokens in the
 * response body and manage storage themselves.
 */
export const REFRESH_COOKIE = "profit_refresh";

/**
 * `Path=/` rather than `/auth`, which would be tighter.
 *
 * In development the browser talks to Vite on :3001 and the proxy rewrites
 * `/api/auth/*` to `/auth/*`, so the path the browser sees and the path this
 * server sees are different. A cookie scoped to `/auth` would be set by a
 * response to `/api/auth/login` and then never sent back. Since the cookie is
 * httpOnly and SameSite=Lax either way, the cost of the wider path is only that
 * it rides along on requests that ignore it.
 */
const COOKIE_PATH = "/";

/**
 * Browsers refuse to keep a cookie longer than this (400 days, per RFC 6265bis)
 * and Hono throws rather than emit one. Clamping is the honest response: the
 * cookie simply lapses earlier than the token inside it, and the user signs in
 * again — which is the correct outcome for a token that long-lived anyway.
 */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

const baseOptions = () =>
  ({
    httpOnly: true,
    // Lax, not None: the SPA is served from the same origin as the API (directly
    // in production, via the Vite proxy in development), so it never needs a
    // cross-site cookie — and Lax is what blocks CSRF against /auth/refresh.
    sameSite: "Lax",
    // Cannot be unconditional: the front desk runs on plain http over the LAN,
    // and a Secure cookie there is silently dropped.
    secure: isProduction,
    path: COOKIE_PATH,
  }) as const;

export const setRefreshCookie = (c: Context, refreshToken: string): void => {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload) {
    // We just signed it, so this is unreachable short of a bug — and setting a
    // cookie with no expiry we can justify is worse than setting none.
    return;
  }

  setCookie(c, REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    // The cookie should lapse when the token it carries does — or at the
    // browser's ceiling, whichever comes first.
    maxAge: Math.min(
      MAX_COOKIE_AGE_SECONDS,
      Math.max(1, Math.ceil((payload.expiresAt.getTime() - Date.now()) / 1000))
    ),
  });
};

export const readRefreshCookie = (c: Context): string | undefined =>
  getCookie(c, REFRESH_COOKIE);

export const clearRefreshCookie = (c: Context): void => {
  deleteCookie(c, REFRESH_COOKIE, baseOptions());
};
