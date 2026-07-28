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

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
