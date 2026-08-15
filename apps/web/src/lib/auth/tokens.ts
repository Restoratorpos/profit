/**
 * The access token lives here — a module variable, never localStorage, never a
 * readable cookie.
 *
 * The split is deliberate and is the whole reason /auth/login has a "cookie"
 * mode: the refresh token is httpOnly, so page scripts cannot read it, and the
 * access token is readable but lasts minutes. An XSS therefore buys an attacker
 * a short-lived token rather than a month-long one, and closing the tab ends the
 * in-memory half outright.
 *
 * The cost is that a page reload loses it, which is why the app bootstraps by
 * calling /auth/refresh — the cookie survives, so the session does.
 */

let accessToken: string | null = null;

/**
 * Bumped every time the token is replaced.
 *
 * It answers a question a 401 cannot: was this request made with the token we
 * are holding *now*, or with one that has since been renewed? A request that
 * left before a renewal is stale by construction, and replaying it costs one
 * round trip — whereas refreshing again because of it spends a second refresh
 * token for no reason, and every spent token is a chance to lose a session.
 */
let generation = 0;

/** Notified when the token is cleared out from under the app (a failed refresh). */
type Listener = () => void;
const listeners = new Set<Listener>();

export const getAccessToken = (): string | null => accessToken;

export const tokenGeneration = (): number => generation;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
  generation += 1;

  if (token === null) {
    for (const listener of listeners) {
      listener();
    }
  }
};

export const onAccessTokenCleared = (listener: Listener): (() => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};
