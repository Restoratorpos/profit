import {
  AFTER_FIRST_UNLOCK,
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from "expo-secure-store";

/**
 * Where this app's half of the session lives.
 *
 * The desk app keeps the access token in a module variable and the refresh token
 * in an httpOnly cookie, so page scripts can never read the long-lived half.
 * **Neither of those applies here.** There is no document to inject script into,
 * and a native fetch has no reliable cookie jar across both platforms — so the
 * app asks `/auth/login` for `mode: "token"`, which returns the pair in the body,
 * and stores the refresh token in the platform keystore instead.
 *
 * `expo-secure-store` is the Android Keystore and the iOS Keychain. That is a
 * genuinely different guarantee from `localStorage` on the web: the value is
 * encrypted at rest and scoped to this app's signature, so another app on the
 * phone cannot read it even after a device compromise short of root.
 *
 * The access token stays in memory only, exactly as on the desk — it lasts
 * minutes, and not persisting it means backgrounding the app never leaves a live
 * bearer token on disk.
 */

const REFRESH_KEY = "profit.refreshToken";

let accessToken: string | null = null;

/**
 * Bumped every time the token is replaced.
 *
 * It answers a question a 401 cannot: was this request made with the token we
 * hold *now*, or with one that has since been renewed? A request that left
 * before a renewal is stale by construction, and replaying it costs one round
 * trip — whereas refreshing again spends a refresh token for no reason, and
 * every spent token is a chance to lose the session.
 */
let generation = 0;

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

/** Notified when the token is cleared out from under the app. */
export const onAccessTokenCleared = (listener: Listener): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/**
 * Reads are wrapped because the keystore can genuinely fail — a restored
 * backup on a new device leaves entries that cannot be decrypted. A failure to
 * read is the same outcome as having nothing: sign in again.
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
};

export const setRefreshToken = async (token: string | null): Promise<void> => {
  try {
    if (token === null) {
      await deleteItemAsync(REFRESH_KEY);

      return;
    }

    await setItemAsync(REFRESH_KEY, token, {
      /*
       * Readable whenever the device has been unlocked once since boot, rather
       * than only while unlocked. A background refetch on a locked phone would
       * otherwise fail to read the token and sign the manager out.
       */
      keychainAccessible: AFTER_FIRST_UNLOCK,
    });
  } catch {
    // Nothing useful to do: the session simply will not survive a restart.
  }
};
