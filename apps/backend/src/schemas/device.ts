import { z } from "zod";
import { DEVICE_DIRECTIONS } from "../db/schema.js";

/** Terminal setup and enrollment. */

const host = z
  .string()
  .trim()
  .min(1, "Address is required")
  .max(45, "Too long for the column");

export const createDeviceSchema = z.object({
  direction: z.enum(DEVICE_DIRECTIONS).default("both"),
  ipAddress: host,
  isActive: z.boolean().default(true),
  location: z.string().trim().max(100).nullish(),
  name: z.string().trim().min(1, "Name is required").max(100),
  /** The terminal's own admin password; stored encrypted, never returned. */
  password: z.string().min(1, "Password is required").max(128),
  port: z.coerce.number().int().min(1).max(65_535).default(80),
  username: z.string().trim().min(1, "Username is required").max(64),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

/**
 * Everything optional, and a missing `password` means "keep the stored one" —
 * the edit form never receives the current password, so it cannot send it back.
 */
export const updateDeviceSchema = createDeviceSchema.partial();

export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const PERSON_TYPES = ["worker", "member"] as const;

/**
 * Enrolling somebody on a terminal. The photo is base64 because it arrives
 * through a Server Action rather than a multipart form; it goes straight to the
 * device's own face library and is never stored here.
 */
export const enrollSchema = z.object({
  /** Base64 JPEG/PNG, with or without a data: prefix. */
  photo: z.string().min(1).optional(),
  personId: z.string().trim().min(1).max(20),
  personType: z.enum(PERSON_TYPES),
});

export type EnrollInput = z.infer<typeof enrollSchema>;

/**
 * Enrolling somebody from their own record rather than from a terminal.
 *
 * The photo is optional, and its absence is a real choice rather than an empty
 * form: it registers the person on every terminal — name and `employeeNo`, so a
 * scan resolves to them — leaving the face to be captured at the device itself.
 * That is the better photo, taken by the same camera that will match it, and it
 * is the only way to enrol somebody whose picture nobody has.
 */
export const setFaceSchema = z.object({
  photo: z.string().min(1).optional(),
});

export type SetFaceInput = z.infer<typeof setFaceSchema>;

/** Pulling events the device buffered while nothing was listening. */
export const syncEventsSchema = z.object({
  /** How far back to look. A day covers a server that was down overnight. */
  hours: z.coerce.number().int().min(1).max(720).default(24),
});

export type SyncEventsInput = z.infer<typeof syncEventsSchema>;
