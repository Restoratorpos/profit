import { z } from "zod";

/**
 * The tenant's own settings — what the gym is called and when its doors are
 * open. Deliberately small: this is the settings screen, not an admin console.
 */

/** "HH:MM" 24-hour, the value the time pickers hold. Mirrors `schemas/worker.ts`. */
const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time like 09:00");

/**
 * Every field optional, and `null` is a real value rather than a missing one: a
 * gym that has stopped publishing its hours clears them, which is different
 * from a form that only submitted the name.
 */
export const updateGymSchema = z.object({
  closeTime: clockTime.nullish(),
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  openTime: clockTime.nullish(),
});

export type UpdateGymInput = z.infer<typeof updateGymSchema>;
