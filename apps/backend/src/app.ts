import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { config } from "./config/index.js";
import { notFound, onError } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { routes } from "./routes/index.js";
import type { AppEnv } from "./types/index.js";

/**
 * The app is built separately from the server that runs it (src/index.ts), so
 * tests can drive it with app.request() without binding a port.
 */
export const app = new Hono<AppEnv>();

app.use("*", secureHeaders());
app.use("*", requestContext);
app.use(
  "*",
  cors({
    origin: config.cors.origins,
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/", routes);

app.notFound(notFound);
app.onError(onError);
