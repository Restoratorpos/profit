/**
 * Only ever follow a same-origin path.
 *
 * This is the port of `safeDestination` from packages/auth. The value arrives in
 * the URL, so anyone can hand a user a link with `?redirect=https://evil.com`
 * and have the app send them there immediately *after* a successful sign-in —
 * the moment they are least likely to check the address bar.
 *
 * Anything that is not a plain absolute path falls back to the dashboard:
 *
 * - `//evil.com` is protocol-relative and leaves the origin, despite starting
 *   with a slash.
 * - `/\evil.com` is treated as protocol-relative by some browsers, which
 *   normalise the backslash to a forward slash.
 * - `https://…`, `javascript:…` and friends never start with `/` at all.
 */
export const safeDestination = (value: string | undefined): string => {
  if (!value?.startsWith("/")) {
    return "/";
  }

  const second = value[1];

  return second === "/" || second === "\\" ? "/" : value;
};
