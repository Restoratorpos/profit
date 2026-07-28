import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/index.js";
import { authenticateBearer } from "./auth.js";
import { authenticateService } from "./service.js";

/**
 * Accepts either kind of caller and leaves the context identical either way.
 *
 * This exists for the length of the Next.js → Vite migration and no longer.
 * `apps/app` still reaches this API server-to-server with SERVICE_TOKEN, while
 * `apps/web` talks to it from a browser with a per-user bearer token. Both have
 * to work at once or the migration becomes a flag day.
 *
 * A bearer token wins when one is present, and a *bad* bearer token is rejected
 * rather than falling through to the service check — otherwise a browser with
 * an expired session could be silently upgraded to service-level trust by
 * whatever proxy happened to add the shared header.
 *
 * Phase 5 deletes this: the routes go back to a single middleware
 * (`requireAuth`), `requireService` is removed, and SERVICE_TOKEN comes out of
 * both environments. Until then, every route reachable from the browser is only
 * as strong as the weaker of the two doors — which is why the service door has
 * to close as soon as apps/app stops using it.
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
