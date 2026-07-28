import { z } from "zod";

/** Reading the attendance list, and answering the door decisions. */

const instant = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "Not a valid date"
  );

export const attendanceQuerySchema = z.object({
  from: instant,
  page: z.coerce.number().int().min(1).default(1),
  // The screen offers 25 / 50 / 100; the cap is what protects the query, not
  // the buttons, so it is enforced here rather than trusted from the client.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(120).optional(),
  to: instant,
});

export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;

/**
 * The terminals screen wants the last 50; the attendance banner polls every few
 * seconds and only ever reads the newest one, so it asks for one.
 */
export const recentEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export type RecentEventsQueryInput = z.infer<typeof recentEventsQuerySchema>;

export const decidePendingSchema = z.object({
  /** True lets them in anyway; false refuses the entry. */
  isAccepted: z.boolean(),
});

export type DecidePendingInput = z.infer<typeof decidePendingSchema>;

export const manualVisitSchema = z.object({
  memberId: z.string().trim().min(1).max(20),
});

export type ManualVisitInput = z.infer<typeof manualVisitSchema>;
