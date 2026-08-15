# apps/desktop — the till as a Windows application

One `.exe`. It contains the interface **and** the API server, and runs both on the
desk PC. The database stays online and is dialled out to.

## Why the server is in here

The Face ID terminal talks to the API in **both** directions:

| | |
| --- | --- |
| terminal → server | every scan is POSTed to `/attendance/hik/<key>` |
| server → terminal | enrol a face, photograph somebody, configure the device |

The second one is what decides the architecture. It is an HTTP call to
`192.168.x.x`, and **a server on the internet has no route to that address** —
Contabo cannot reach a camera behind the gym's router. So the thing that talks to
the terminal has to sit on the same network as it, which is the desk PC.

Dialling *out* to MySQL needs no such route, which is why the database can stay
online while the server does not.

**The cost, stated plainly: scans are only recorded while this app is running.**
The terminal buffers events it could not deliver and the backend's `AcsEvent` pull
path recovers them on the next start, so a till switched off overnight loses
nothing permanently — but nothing is recorded live with the app shut. Set it to
launch with Windows.

## Build it

```bash
pnpm --filter web build        # the interface
pnpm --filter desktop package  # -> apps/desktop/release/
```

| File | What it is |
| --- | --- |
| `GYM Setup 0.1.0.exe` | Installer, per-machine, with shortcuts |
| `GYM 0.1.0.exe` | Portable — runs with no install |

`release/` is gitignored: two ~80 MB binaries per build are not history.

`pnpm build` also bundles the server — esbuild, every dependency inlined, one
3.3 MB file. That is what lets it ship at all: pnpm's `node_modules` is a tree of
symlinks into a store, and there is no copying it into an installer.

## Configure it — `%APPDATA%\GYM\config.json`

> **The credentials are compiled in, and the installer is therefore a secret.**
> `pnpm build` runs `scripts/make-defaults.mjs`, which copies the database
> password, both JWT secrets and `DEVICE_SECRET` out of `apps/backend/.env.local`
> into `dist/defaults.json` and ships it inside the app. An `.asar` is trivially
> unpacked, so anybody holding the `.exe` can read all of them — and that
> database is shared by every gym, while those JWT secrets sign every tenant's
> tokens. Hand these builds to your own tills and nobody else. Never put one
> behind a download link.
>
> Build without `apps/backend/.env.local` in place and nothing is baked in; the
> app asks on first run instead. That is the build to make if it has to travel.

Three sources, each beating the one below it:

| | |
| --- | --- |
| `%APPDATA%\GYM\config.json` | Per-machine, merged **key by key** over the baked values — override only the database and the baked secrets still apply. |
| `dist/defaults.json` | Baked at build time, as above. |
| The setup form | Shown only when there is neither of the above. |

```json
{
  "DB_HOST": "…", "DB_PORT": "3306",
  "DB_USER": "…", "DB_PASSWORD": "…", "DB_NAME": "gyms",
  "JWT_ACCESS_SECRET": "…", "JWT_REFRESH_SECRET": "…",
  "DEVICE_SECRET": "…", "DEVICE_GYM_ID": "…",
  "REDIS_URL": "redis://…",
  "PORT": "7090"
}
```

`DEVICE_GYM_ID` is which gym this till stands in — its terminals are re-pointed
at this machine on every launch.

`PORT` is only worth setting when something else on the machine already has 7090
— a development server on the machine that builds releases, for instance.

Two things are worked out rather than configured:

- **`DEVICE_CALLBACK_HOST`** — the LAN address the terminal pushes scans to, read
  off this machine's own network interfaces. Nobody has to look up their own IP.
- **The window's origin** — a loopback port chosen by the OS.

## When it does not start

`%APPDATA%\GYM\backend.log`. The server's own output, including the reason it
refused to boot. A window that opens but cannot log in almost always means wrong
credentials, a moved database, or a port already taken, and that file names which.

The app also says so in a dialog rather than leaving a dead window.

## How the interface reaches the API

`apps/web/src/lib/api/client.ts` calls `/api` **same-origin**, so the refresh
cookie stays first-party. This process therefore serves the built bundle on a
loopback port and forwards `/api/*` to the server, stripping the prefix — exactly
what Vite's proxy does in development. `file://` plus cross-network calls would
make that cookie third-party, needing `SameSite=None`, needing HTTPS the front
desk does not have.

The backend is unchanged and unaware any of this exists.

## Still to do

- **Launch with Windows**, so the door records whenever the PC is on.
- **An icon** — 256×256 `icon.ico` in `build/`; it ships with Electron's default.
- **Code signing** — unsigned, so SmartScreen warns on first run.
- Receipt printing and offline mode were deliberately left out.
