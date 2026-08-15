import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import {
  type BackendProcess,
  resolveBackendEntry,
  startBackend,
  waitForBackend,
  waitForHttp,
} from "./backend.js";
import { startLocalServer } from "./server.js";
import { startSetupServer } from "./setup.js";

/**
 * The desk terminal as a Windows application.
 *
 * It is a **client only**. The Hono backend stays a separate always-on process
 * (a Windows service) because the door terminals push every scan to it: bundled
 * in here, attendance would stop being recorded the moment somebody closed the
 * window or logged out for the night, and a gym door has to work when the desk PC
 * is asleep.
 *
 * So this process does two things — serve the built SPA on loopback and forward
 * `/api` to that backend — which together reproduce the same-origin arrangement
 * the auth design depends on. See `server.ts`.
 */

/** The port the server listens on unless the config names another. */
const DEFAULT_PORT = "7090";

/** Adapters that look like a LAN but reach nothing a door terminal is on. */
const VIRTUAL_ADAPTER = /vethernet|hyper-v|virtualbox|vmware|vpn|loopback/i;

/** Where `pnpm --filter web dev` listens — see its `--port` flag. */
const DEV_SERVER_URL = "http://localhost:3001";

/**
 * The desk PC's own address on the gym network.
 *
 * The terminal has to be told where to POST its scans, and it cannot be told
 * "localhost" — that would be the terminal itself. It also cannot be worked out
 * from an incoming request, which is why `DEVICE_CALLBACK_HOST` exists as a
 * hand-set variable in the server's env.
 *
 * Detecting it here is what makes the installer a single step: the app knows
 * which machine it is on, so the operator never has to find their own IP address
 * and type it into a config file.
 */
const detectLanAddress = (): string | null => {
  const candidates: { address: string; rank: number }[] = [];

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Not IPv6, not loopback, and not a link-local 169.254 handed out when
      // DHCP failed — that one routes nowhere.
      if (
        address.family !== "IPv4" ||
        address.internal ||
        address.address.startsWith("169.254.")
      ) {
        continue;
      }

      /*
       * Ranked, not first-come. A developer's machine carries WSL and Hyper-V
       * adapters on 172.x and VPN clients on their own ranges, and every one of
       * them looks exactly like a LAN address to `networkInterfaces()`. Handing
       * the terminal one of those configures it to push somewhere it cannot
       * reach — and the failure is invisible: the device still answers, so the
       * app still shows it connected, while every scan goes nowhere.
       *
       * A home or gym network is 192.168.x.x essentially always, so that wins;
       * 10.x is the plausible second; 172.16–31 is both a real private range and
       * where the virtual adapters live, so it is the last resort.
       */
      const virtual = VIRTUAL_ADAPTER.test(name);

      let rank = 3;

      if (address.address.startsWith("192.168.")) {
        rank = 0;
      } else if (address.address.startsWith("10.")) {
        rank = 1;
      } else {
        rank = 2;
      }

      candidates.push({ address: address.address, rank: virtual ? 9 : rank });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);

  return candidates[0]?.address ?? null;
};

/**
 * What this installation needs to know: the online database, and the secrets the
 * server signs with.
 *
 * Read from a file next to the installation rather than compiled in. That is
 * deliberate and it matters: an installer with the credentials baked into it
 * hands full access to a shared, multi-tenant database to anybody who is given a
 * copy of the .exe. In a file, the same binary ships to every gym and each one
 * holds only its own.
 */
interface DeskConfig {
  DB_HOST?: string;
  DB_NAME?: string;
  DB_PASSWORD?: string;
  DB_PORT?: string;
  DB_USER?: string;
  /**
   * Whose terminals this till stands next to. Set it and the server re-points
   * them at this machine's current address on every launch, so a moved address
   * heals itself rather than silently ending attendance.
   */
  DEVICE_GYM_ID?: string;
  DEVICE_SECRET?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  /**
   * `"false"` to stop the till starting with Windows. Anything else, or absent,
   * means it does — which is what a terminal wants: scans are only recorded while
   * this is running, so an app somebody has to remember to open is a day of
   * missing attendance waiting to happen.
   */
  LAUNCH_AT_LOGIN?: string;
  /** Only worth setting when something else on the machine already has 7090. */
  PORT?: string;
  REDIS_URL?: string;
}

const CONFIG_FILE = "config.json";

/**
 * A byte-order mark, which `JSON.parse` refuses.
 *
 * Notepad and PowerShell both write one when saving UTF-8, so a config edited on
 * the machine it runs on arrives with three bytes in front of the `{`. Stripping
 * it is the difference between "I edited the file and the till stopped working"
 * and it simply working.
 */
const BYTE_ORDER_MARK = /^﻿/;

/**
 * The config, and why it could not be read.
 *
 * The reason is carried rather than swallowed: an unreadable config leaves the
 * server with no credentials, which it reports as seven missing variables — a
 * message that sends whoever is reading it looking in entirely the wrong place.
 */
/**
 * Settings baked in at build time from `apps/backend/.env.local`.
 *
 * What makes an install a single step: a till that has never been configured
 * still knows which database to reach. Anything in the machine's own config file
 * wins over these, so one build can still be pointed somewhere else per site.
 *
 * Absent when the build was made without an environment file, which is when the
 * setup form appears instead.
 */
const readBakedDefaults = (): DeskConfig => {
  try {
    const raw = readFileSync(
      join(app.getAppPath(), "dist", "defaults.json"),
      "utf8"
    );

    return JSON.parse(raw) as DeskConfig;
  } catch {
    return {};
  }
};

const readConfig = (): { config: DeskConfig; problem: string | null } => {
  const configPath = join(app.getPath("userData"), CONFIG_FILE);
  const baked = readBakedDefaults();

  if (!existsSync(configPath)) {
    return Object.keys(baked).length > 0
      ? { config: baked, problem: null }
      : { config: {}, problem: `No config file at ${configPath}` };
  }

  try {
    const raw = readFileSync(configPath, "utf8").replace(BYTE_ORDER_MARK, "");

    // The machine's own file wins, key by key: a site that overrides only the
    // database keeps the baked secrets rather than having to restate them.
    return {
      config: { ...baked, ...(JSON.parse(raw) as DeskConfig) },
      problem: null,
    };
  } catch (cause) {
    return {
      config: {},
      problem: `${configPath} could not be read: ${(cause as Error).message}`,
    };
  }
};

/**
 * The built SPA. Packaged it lives in `resources/web`; from the repo it is
 * `apps/web/dist`, so `pnpm dev` in the desktop workspace shows real screens
 * without packaging anything first.
 */
const resolveWebRoot = (): string => {
  const packaged = join(process.resourcesPath, "web");

  return app.isPackaged
    ? packaged
    : join(app.getAppPath(), "..", "web", "dist");
};

/**
 * Starts the till with Windows, unless the config says not to.
 *
 * Re-asserted on every launch rather than set once at install: the entry lives in
 * the user's `Run` key, where cleanup tools, a new Windows profile, or a
 * reinstall all quietly drop it. Checking costs nothing and the failure it
 * prevents is silent — an app nobody opened is a day with no attendance.
 *
 * Packaged builds only. In development `process.execPath` is Electron's own
 * binary, so this would register "start electron with no arguments" at every
 * login, which opens a default window that is not this app.
 */
const applyLaunchAtLogin = (config: DeskConfig): void => {
  if (!app.isPackaged) {
    return;
  }

  /*
   * Never from the portable build. It unpacks itself into a fresh
   * `%TEMP%\<random>` on **every** run, so registering `process.execPath` writes
   * a path that will not exist at the next boot — and worse, it overwrites a
   * good entry left by the installed copy. Windows then silently launches
   * nothing, which on a till means a day with no attendance and no clue why.
   *
   * A terminal that starts with Windows is a terminal that was installed.
   */
  if (process.execPath.startsWith(tmpdir())) {
    return;
  }

  const wanted = config.LAUNCH_AT_LOGIN !== "false";
  const current = app.getLoginItemSettings().openAtLogin;

  if (wanted !== current) {
    app.setLoginItemSettings({ openAtLogin: wanted, path: process.execPath });
  }
};

const createWindow = (origin: string): BrowserWindow => {
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    height: 900,
    show: false,
    title: "GYM",
    webPreferences: {
      // Nothing here needs Node in the page, and the SPA is the same bundle the
      // browser runs. Leaving these off keeps the renderer a plain web context.
      contextIsolation: true,
      nodeIntegration: false,
    },
    width: 1440,
  });

  // Shown once painted rather than immediately: a white flash on a dark UI reads
  // as a broken launch on a terminal that starts with Windows.
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  /*
   * Anything not on the loopback origin opens in the real browser instead of
   * replacing the till: a misplaced external link should never leave the operator
   * in a window with no address bar and no way back.
   */
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.loadURL(origin);

  return window;
};

/**
 * One instance only. Two windows on one till would be two carts against one
 * cashbox, and the second would silently fight the first for the same session.
 */
if (app.requestSingleInstanceLock()) {
  let mainWindow: BrowserWindow | null = null;
  let backend: BackendProcess | null = null;

  app.on("second-instance", () => {
    mainWindow?.focus();
  });

  app.whenReady().then(async () => {
    /*
     * In development the window is pointed straight at Vite, so a saved file is
     * on screen immediately — the whole reason `pnpm dev` is worth running.
     *
     * Nothing is served or proxied here in that mode, and **no backend is
     * started**: `turbo dev` already runs one on 7090, and a second would lose
     * the port and crash-loop behind the window. Vite proxies `/api` to it, so
     * the same-origin arrangement the auth design needs is preserved either way.
     *
     * The wait is generous because `turbo dev` starts all three workspaces at
     * once and Vite is usually not listening yet when this runs.
     */
    if (!app.isPackaged) {
      const devUrl = process.env.GYM_DEV_URL ?? DEV_SERVER_URL;

      if (await waitForHttp(devUrl, 60_000)) {
        mainWindow = createWindow(devUrl);
        return;
      }

      // Vite never came up. Fall through and run the packaged arrangement from
      // the repo, which at least opens something rather than nothing.
    }

    const root = resolveWebRoot();

    if (!existsSync(join(root, "index.html"))) {
      dialog.showErrorBox(
        "GYM",
        `The app bundle is missing at:\n${root}\n\nRun "pnpm --filter web build" first.`
      );
      app.quit();
      return;
    }

    /*
     * The server comes up first. It is the same Hono app the repo runs in
     * development, started as a child process on this machine — see backend.ts
     * for why it lives here rather than on the internet.
     */
    const lan = detectLanAddress();
    let { config, problem } = readConfig();

    /*
     * Nothing configured yet — ask, rather than failing with a dialog naming a
     * file the operator is then expected to create by hand. This is the first
     * thing a fresh install does, and the only time it appears.
     */
    if (!config.DB_HOST) {
      const setup = await startSetupServer();

      /*
       * Kept, not closed. Closing it would leave the app with no windows for as
       * long as the server takes to start, and `window-all-closed` quits — so
       * the till would shut itself down the moment setup succeeded. The same
       * window is handed the real app below once there is something to show.
       */
      mainWindow = createWindow(setup.origin);

      config = { ...config, ...(await setup.saved) };
      problem = null;

      writeFileSync(
        join(app.getPath("userData"), CONFIG_FILE),
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8"
      );

      setup.server.close();
    }

    applyLaunchAtLogin(config);
    /*
     * Configurable, defaulting to the port the repo uses. A fixed one is a trap:
     * anything else already listening — a development server on the machine that
     * builds releases — silently takes it, and the app then proxies to a stranger
     * while its own server crash-loops behind the window.
     */
    const port = config.PORT ?? DEFAULT_PORT;
    const logPath = join(app.getPath("userData"), "backend.log");

    backend = startBackend(
      resolveBackendEntry(
        process.resourcesPath,
        app.getAppPath(),
        app.isPackaged
      ),
      {
        ...config,
        // Bound on every interface, not just loopback: the terminal has to reach
        // it from elsewhere on the gym network.
        HOST: "0.0.0.0",
        /*
         * Also what takes `pino-pretty` out of the logger. It is a transport,
         * which pino resolves by module name at runtime and runs in a worker
         * thread — neither survives being bundled into a single file, and the
         * server would die on startup looking for it. In production pino writes
         * plain JSON to stdout, which is what a log file wants anyway.
         */
        NODE_ENV: "production",
        PORT: port,
        // Where the terminal is told to push its scans. Detected, so nobody has
        // to look up this machine's address by hand.
        ...(lan ? { DEVICE_CALLBACK_HOST: lan } : {}),
      } as Record<string, string>,
      logPath
    );

    const apiTarget = `http://127.0.0.1:${port}`;

    /*
     * Said out loud rather than left to a blank screen. A server that never comes
     * up means wrong credentials, a moved database, or a port already taken —
     * none of which the operator can guess from a window that simply will not log
     * in, and all of which the log names on its first line.
     */
    if (!(await waitForBackend(apiTarget))) {
      dialog.showErrorBox(
        "GYM",
        [
          `The server did not start on port ${port}.`,
          problem ? `\n${problem}` : "",
          `\nWhat it said is in:\n${logPath}`,
        ].join("")
      );
      backend.stop();
      app.quit();
      return;
    }

    const { origin } = await startLocalServer(root, apiTarget);

    // Re-uses the setup window when there was one, so the operator sees the app
    // replace the form rather than a window vanish and another appear.
    if (mainWindow) {
      mainWindow.loadURL(origin);
    } else {
      mainWindow = createWindow(origin);
    }

    // macOS convention, harmless on Windows: re-open rather than stay running
    // with no window when the dock icon is clicked.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(origin);
      }
    });
  });

  // Closing the till closes the app on every platform, including macOS: this is
  // a terminal, not a document editor with a menu bar to return to.
  app.on("window-all-closed", () => {
    app.quit();
  });

  // The server is a child process: without this it outlives the window and holds
  // port 7090, so the next launch finds it taken and starts nothing.
  app.on("before-quit", () => {
    backend?.stop();
  });
} else {
  app.quit();
}
