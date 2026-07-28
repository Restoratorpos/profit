import { z } from "zod";

/**
 * The signed-in worker, as the backend's access token carries them.
 *
 * `gymId` is part of the identity rather than a lookup: FITZLY is multi-tenant
 * and every query filters by it. It is here for display and for guarding the
 * UI — the *authoritative* copy is the claim inside the token, which the server
 * reads. Nothing the browser puts in a request can change which gym it sees.
 */
export const authUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  role: z.enum(["owner", "admin", "manager", "trainer", "receptionist"]),
  gymId: z.string(),
  branchId: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * What /auth/login and /auth/refresh return in cookie mode.
 *
 * No `refreshToken`: it arrives as an httpOnly cookie the browser never sees.
 * Parsed rather than cast so a backend change that drops a field fails loudly
 * here instead of as `undefined` somewhere in the UI.
 */
export const sessionSchema = z.object({
  user: authUserSchema,
  accessToken: z.string().min(1),
});

export type Session = z.infer<typeof sessionSchema>;
