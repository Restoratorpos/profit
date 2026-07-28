import { z } from "zod";
import { normalizePhone } from "../lib/phone.js";

/** Accepts any human formatting, hands downstream code bare digits. */
export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine(
    (digits) => digits.length >= 9 && digits.length <= 15,
    "Enter a valid phone number"
  );

export const credentialsSchema = z.object({
  phone: phoneSchema,
  // bcrypt silently truncates past 72 bytes, so reject rather than mislead.
  password: z.string().min(4).max(72),
});

/**
 * Registration onboards a tenant. `gymName` is optional because the sign-up form
 * only collects a person; the service derives one from `name` when it is absent.
 */
export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(120),
  gymName: z.string().trim().min(2).max(200).optional(),
});

/**
 * How the caller wants its refresh token handled.
 *
 * `token` is the default so every existing client keeps working untouched: the
 * pair comes back in the response body and the caller stores it. `cookie` is
 * what a browser asks for — the refresh token is set as an httpOnly cookie and
 * omitted from the body, so page scripts can never read it.
 */
export const sessionModeSchema = z.enum(["token", "cookie"]).default("token");

export const loginSchema = credentialsSchema.extend({
  mode: sessionModeSchema,
});

/**
 * The wire shape for registration. `RegisterInput` stays the *service's* input
 * and knows nothing about `mode`, which is a transport concern the route
 * strips off before calling it.
 */
export const registerRequestSchema = registerSchema.extend({
  mode: sessionModeSchema,
});

/**
 * Optional because a browser sends the token as a cookie rather than in the
 * body. The route requires one or the other and 400s when neither is present.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type SessionMode = z.infer<typeof sessionModeSchema>;

export type Credentials = z.infer<typeof credentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
