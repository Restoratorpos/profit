import "server-only";

export { auth, handlers, signIn, signOut } from "./index";

import { auth } from "./index";

/**
 * Convenience mirror of Clerk's `currentUser()` so pages can ask for the user
 * without unwrapping the session themselves.
 */
export const currentUser = async () => {
  const session = await auth();

  return session?.user ?? null;
};
