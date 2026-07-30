import { createServer, type Server } from "node:http";

/**
 * First run: ask for what this till needs, rather than making somebody write
 * JSON into `%APPDATA%` by hand.
 *
 * Served over the same loopback trick the main window uses, and the form posts
 * back to it. That avoids a preload script and IPC for what is a single form —
 * the page is generated here, is not part of the SPA, and never leaves the
 * machine.
 *
 * This form is the fallback, not the usual path. A build made with
 * `apps/backend/.env.local` in place bakes those credentials in (see
 * `scripts/make-defaults.mjs`) and never gets here — which is what makes an
 * install a single step, and what makes the resulting `.exe` a secret worth
 * keeping. Built without that file, nothing is baked in and this is what the
 * operator sees: the same binary can then go anywhere, holding only what was
 * typed into it on the machine it runs on.
 */

export interface SetupResult {
  DB_HOST: string;
  DB_NAME: string;
  DB_PASSWORD: string;
  DB_PORT: string;
  DB_USER: string;
  DEVICE_GYM_ID: string;
  DEVICE_SECRET: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  REDIS_URL: string;
}

const FIELDS: {
  hint?: string;
  label: string;
  name: keyof SetupResult;
  /** Prefilled, and the two fields that may be left as they are. */
  preset?: string;
}[] = [
  { label: "Database host", name: "DB_HOST", hint: "e.g. 161.97.137.120" },
  { label: "Database port", name: "DB_PORT", preset: "3306" },
  { label: "Database user", name: "DB_USER" },
  { label: "Database password", name: "DB_PASSWORD" },
  { label: "Database name", name: "DB_NAME", hint: "gyms" },
  {
    hint: "Which gym this till stands in — its terminals are re-pointed here on every launch",
    label: "Gym ID",
    name: "DEVICE_GYM_ID",
  },
  {
    hint: "Encrypts terminal passwords at rest. Must match the other tills.",
    label: "Device secret",
    name: "DEVICE_SECRET",
  },
  { label: "JWT access secret", name: "JWT_ACCESS_SECRET" },
  { label: "JWT refresh secret", name: "JWT_REFRESH_SECRET" },
  {
    hint: "Optional — the till runs without it, with weaker session revocation",
    label: "Redis URL",
    name: "REDIS_URL",
    preset: "redis://localhost:6379",
  },
];

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>GYM — setup</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:32px; background:#0a0a0a; color:#fafafa;
         font:14px/1.5 system-ui, sans-serif }
  h1 { font-size:20px; margin:0 0 4px }
  p.lead { margin:0 0 24px; color:#a1a1aa }
  label { display:block; margin-bottom:14px }
  span.l { display:block; margin-bottom:4px; font-weight:500 }
  span.h { display:block; margin-top:3px; font-size:12px; color:#71717a }
  input { width:100%; box-sizing:border-box; padding:9px 11px; border-radius:8px;
          border:1px solid #27272a; background:#18181b; color:#fafafa; font-size:14px }
  input:focus { outline:2px solid #22c55e; outline-offset:1px; border-color:transparent }
  button { margin-top:8px; padding:11px 20px; border:0; border-radius:8px;
           background:#22c55e; color:#052e16; font-size:15px; font-weight:600; cursor:pointer }
  button:disabled { opacity:.6; cursor:default }
  .err { margin-top:12px; color:#f87171 }
</style>
<h1>Set up this till</h1>
<p class="lead">Entered once, kept on this machine only.</p>
<form id="f">FIELDS
  <button type="submit">Save and start</button>
  <div class="err" id="e"></div>
</form>
<script>
  const form = document.getElementById("f");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    document.getElementById("e").textContent = "";
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      document.body.innerHTML = "<h1>Starting…</h1>";
    } catch (cause) {
      document.getElementById("e").textContent = String(cause.message || cause);
      button.disabled = false;
    }
  });
</script>`;

const renderFields = (): string =>
  FIELDS.map((field) => {
    // A field with a sensible default is not one the operator has to think about.
    const required = field.preset ? "" : "required";
    const hint = field.hint ? `<span class="h">${field.hint}</span>` : "";

    return `<label><span class="l">${field.label}</span>
    <input name="${field.name}" ${required} value="${field.preset ?? ""}">
    ${hint}</label>`;
  }).join("\n");

/**
 * Serves the form and resolves once it has been submitted.
 *
 * The caller writes the config and carries on booting — no restart, because
 * nothing has been read yet at the point this runs.
 */
export const startSetupServer = (): Promise<{
  origin: string;
  saved: Promise<SetupResult>;
  server: Server;
}> => {
  let resolveSaved: (value: SetupResult) => void = () => {
    // Replaced below; a no-op keeps the type honest before the promise is made.
  };

  const saved = new Promise<SetupResult>((resolve) => {
    resolveSaved = resolve;
  });

  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/save") {
      let body = "";

      request.on("data", (chunk) => {
        body += chunk;
      });

      request.on("end", () => {
        try {
          const parsed = JSON.parse(body) as SetupResult;

          response.writeHead(200).end("ok");
          resolveSaved(parsed);
        } catch {
          response.writeHead(400).end("Could not read that form");
        }
      });

      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(PAGE.replace("FIELDS", renderFields()));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Setup server did not report a port"));
        return;
      }

      resolve({ origin: `http://127.0.0.1:${address.port}`, saved, server });
    });
  });
};
