import { type ChildProcess, fork } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The API server, running inside the desk application.
 *
 * It lives here rather than on a cloud host for one reason: the Face ID terminal
 * is on the gym's own network, and the traffic goes **both ways**. Scans are
 * pushed to this server, and this server calls the terminal's ISAPI to enrol a
 * face, photograph somebody, or configure the device. That second direction
 * cannot cross NAT — a server on the internet has no route to `192.168.x.x` —
 * so the thing that talks to the terminal has to sit on the same network as it.
 *
 * The database stays online and is dialled out to, which needs no such route.
 *
 * The cost, stated plainly: **scans are only recorded while this app is running**.
 * The terminal buffers events it could not deliver, and the backend's `AcsEvent`
 * pull path recovers them on the next start, so a closed till loses nothing
 * permanently — but nothing is recorded live with the app shut.
 */

/**
 * Run as a child process rather than inside Electron's own Node.
 *
 * `fork` gives the server its own V8 heap and its own crash: a bad query or an
 * unhandled rejection in the API takes the API down and is restarted, instead of
 * taking the window down with it mid-sale. It also keeps the server's module
 * graph — Hono, Drizzle, mysql2 — out of the process drawing the interface.
 */
export interface BackendProcess {
  child: ChildProcess;
  stop: () => void;
}

/**
 * Where the bundled server sits.
 *
 * The same single file either way — `esbuild` output, every dependency inlined,
 * so there is no `node_modules` tree to ship out of pnpm's symlinked store. It
 * lives *outside* the asar archive when packaged, because this is executed as a
 * process rather than read as a file.
 */
export const resolveBackendEntry = (
  resourcesPath: string,
  appPath: string,
  isPackaged: boolean
): string =>
  isPackaged
    ? join(resourcesPath, "backend", "index.js")
    : join(appPath, "dist", "backend", "index.js");

/**
 * Starts the API and keeps it up.
 *
 * `env` carries the database credentials and the callback host. They are passed
 * in rather than read here because where they come from is the caller's
 * business — a config file beside the installation, not this module.
 */
export const startBackend = (
  entry: string,
  env: Record<string, string>,
  logPath: string
): BackendProcess => {
  if (!existsSync(entry)) {
    throw new Error(`Backend not found at ${entry}`);
  }

  let stopped = false;

  /*
   * The server's own output, kept on disk.
   *
   * Without it a server that cannot start — a port already taken, a password
   * changed, a database that has moved — fails completely silently: the window
   * opens, nothing loads, and there is nothing anywhere to say why. This file is
   * the first thing to read when a till "just stops working".
   */
  const log = createWriteStream(logPath, { flags: "a" });

  const spawn = (): ChildProcess => {
    const child = fork(entry, [], {
      env: {
        ...process.env,
        ...env,
        /*
         * Without this the fork re-launches the application. `fork` spawns
         * `process.execPath`, which in a packaged build is GYM.exe rather than
         * node — Electron only behaves as a plain Node runtime when this is set,
         * and otherwise starts a second copy of the app that the single-instance
         * lock then kills, leaving no server and no error.
         */
        ELECTRON_RUN_AS_NODE: "1",
      },
      // The server logs with pino to stdout; piping it keeps that out of the
      // window's console and lets the parent write it to a file.
      silent: true,
    });

    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });

    /*
     * Restarted unless we asked it to stop. The API dying at 3pm on a Saturday
     * must not mean the till is dead until somebody notices.
     */
    child.on("exit", (code) => {
      log.write(`\n[desk] backend exited (${code}), restarting in 2s\n`);

      if (!stopped) {
        setTimeout(() => {
          current = spawn();
        }, 2000);
      }
    });

    return child;
  };

  let current = spawn();

  return {
    get child() {
      return current;
    },
    stop: () => {
      stopped = true;
      current.kill();
    },
  };
};

/**
 * Waits for the API to answer, so the window never loads against a server that
 * is still opening its database pool.
 *
 * `/health` is the dependency-free liveness probe — deliberately not
 * `/health/ready`, which also wants MySQL and Redis. The app should open and
 * show its own error if the database is unreachable, rather than refusing to
 * start at all.
 */
export const waitForHttp = async (
  url: string,
  timeoutMs: number
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return true;
      }
    } catch {
      // Not up yet. The loop is the wait.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
};

export const waitForBackend = (
  origin: string,
  timeoutMs = 30_000
): Promise<boolean> => waitForHttp(`${origin}/health`, timeoutMs);
