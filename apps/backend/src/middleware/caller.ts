import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/index.js";
import { authenticateBearer } from "./auth.js";
import { authenticateService } from "./service.js";

/**
 * Accepts either kind of caller and leaves the context identical either way.
 *
 * This existed for the length of the Next.js → Vite migration: `apps/app`
 * reached this API server-to-server with SERVICE_TOKEN while `apps/web` talked
 * to it from a browser with a per-user bearer token, and both had to work at
 * once or the migration became a flag day.
 *
 * A bearer token wins when one is present, and a *bad* bearer token is rejected
 * rather than falling through to the service check — otherwise a browser with
 * an expired session could be silently upgraded to service-level trust by
 * whatever proxy happened to add the shared header.
 *
 * ## `apps/app` was deleted on 2026-07-29 and nothing uses the service door
 *
 * Every route here is only as strong as the weaker of its two doors, and the
 * weaker one now has nobody behind it: `requireService` takes a shared secret
 * plus a **client-supplied `x-gym-id`**, which was only ever safe because a
 * trusted first-party server decided the gym. Anyone holding SERVICE_TOKEN can
 * now name any tenant.
 *
 * Closing it: drop `authenticateService` below so this becomes `requireAuth`,
 * delete `middleware/service.ts`, remove SERVICE_TOKEN from `env.ts` and both
 * `.env.local` files, and update `__tests__/caller-auth.test.ts`.
 */
export const requireCaller = createMiddleware<AppEnv>(async (c, next) => {
  const user = authenticateBearer(c.req.header("authorization"));

  if (user) {
    c.set("user", user);
    // From the signed claim. `x-gym-id` is not read on this path — see
    // middleware/auth.ts.
    c.set("gymId", user.gymId);
    c.set("workerId", user.id);

    await next();
    return;
  }

  const service = authenticateService(c.req.header.bind(c.req));

  c.set("gymId", service.gymId);
  c.set("workerId", service.workerId);

  await next();
});
