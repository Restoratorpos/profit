import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize, sep } from "node:path";

/**
 * The loopback origin the window is pointed at.
 *
 * This exists because of one requirement in `apps/web/src/lib/api/client.ts`: the
 * SPA calls `/api` **same-origin**, so the refresh token's cookie stays
 * first-party. Loading the built files over `file://` and calling the backend
 * across the network would make that cookie third-party, which is the one thing
 * the auth design refuses — it would need `SameSite=None`, which needs HTTPS the
 * front desk does not have.
 *
 * So the main process plays exactly the role Vite's dev proxy plays: it serves
 * the bundle and forwards `/api/*` to the Hono backend, stripping the prefix the
 * same way. The backend is then unchanged, and unaware this exists.
 */

/** The prefix that marks an API call, stripped before forwarding. */
const API_PREFIX = /^\/api/;

/** Everything the browser can be handed, by extension. */
const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * The file a request maps to, or null when it escapes the bundle.
 *
 * `normalize` then a prefix check, rather than trusting the URL: a request for
 * `/../../.env.local` is a path traversal, and this server is answering on a
 * machine that holds the gym's database credentials.
 */
const resolveFile = (root: string, pathname: string): string | null => {
  const candidate = normalize(join(root, decodeURIComponent(pathname)));

  if (!(candidate === root || candidate.startsWith(root + sep))) {
    return null;
  }

  return existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : null;
};

/** Pipes one request through to the backend, headers and body intact. */
const forwardToApi = (
  apiOrigin: URL,
  incoming: IncomingMessage,
  response: ServerResponse
): void => {
  // `/api/plans` -> `/plans`, matching the rewrite in vite.config.ts. The backend
  // mounts its routes at the root and must keep doing so: `/members` is an API
  // route there and a page here, and only the prefix tells them apart.
  const path = (incoming.url ?? "/").replace(API_PREFIX, "") || "/";

  const upstream = httpRequest(
    {
      headers: { ...incoming.headers, host: apiOrigin.host },
      hostname: apiOrigin.hostname,
      method: incoming.method,
      path,
      port: apiOrigin.port,
      protocol: apiOrigin.protocol,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers
      );
      upstreamResponse.pipe(response);
    }
  );

  /*
   * The backend being down is the ordinary failure here — it is a Windows service
   * that can be stopped or still starting — so it answers as a gateway error the
   * SPA can show, rather than an unhandled 'error' event taking the whole main
   * process down with it.
   */
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json" });
    }

    response.end(
      JSON.stringify({
        error: { code: "backend_unreachable", message: "Backend unreachable" },
      })
    );
  });

  incoming.pipe(upstream);
};

/**
 * Serves the built SPA and proxies its API calls.
 *
 * Bound to 127.0.0.1 on an OS-assigned port: nothing outside this machine can
 * reach it, and nothing can collide with a port somebody else wanted.
 */
export const startLocalServer = (
  root: string,
  apiTarget: string
): Promise<{ origin: string; server: Server }> => {
  const apiOrigin = new URL(apiTarget);
  const indexFile = join(root, "index.html");

  const server = createServer((incoming, response) => {
    const pathname = new URL(incoming.url ?? "/", "http://127.0.0.1").pathname;

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      forwardToApi(apiOrigin, incoming, response);
      return;
    }

    // A real file, or index.html: the router owns every other path, so a reload
    // on /members must return the app rather than a 404.
    const file = resolveFile(root, pathname) ?? indexFile;

    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type":
        CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    });

    createReadStream(file).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Local server did not report a port"));
        return;
      }

      resolve({ origin: `http://127.0.0.1:${address.port}`, server });
    });
  });
};
