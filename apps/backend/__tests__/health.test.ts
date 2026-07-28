import { expect, test } from "vitest";
import { app } from "../src/app.js";

test("liveness responds without touching the database", async () => {
  const response = await app.request("/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("unknown routes return the standard error shape", async () => {
  const response = await app.request("/nope");

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    error: { code: "not_found" },
  });
});

test("login rejects a malformed phone number", async () => {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "123", password: "1111" }),
  });

  expect(response.status).toBe(400);
});
