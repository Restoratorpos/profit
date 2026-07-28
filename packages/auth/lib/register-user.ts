import "server-only";
import { keys } from "../keys";
import { normalizePhone } from "./phone";

export type RegisterResult = { ok: true } | { ok: false; error: string };

/**
 * Creates the account in apps/backend (POST {AUTH_BACKEND_URL}/auth/register).
 *
 * The backend also returns a token, which is deliberately ignored: the web app
 * runs on Auth.js sessions, so the caller signs in normally afterwards rather
 * than holding two competing notions of "logged in".
 */
export const registerUser = async (
  phone: string,
  password: string,
  name: string
): Promise<RegisterResult> => {
  const backendUrl = keys().AUTH_BACKEND_URL;

  if (!backendUrl) {
    throw new Error(
      "AUTH_BACKEND_URL is not set — cannot register against the backend."
    );
  }

  const response = await fetch(
    new URL("/auth/register", backendUrl).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizePhone(phone), password, name }),
      cache: "no-store",
    }
  );

  if (response.ok) {
    return { ok: true };
  }

  // 409 is the only failure a user can act on; everything else is ours, not theirs.
  if (response.status === 409) {
    return {
      ok: false,
      error: "An account with this phone number already exists.",
    };
  }

  if (response.status === 400) {
    return { ok: false, error: "Check your details and try again." };
  }

  throw new Error(
    `Registration failed: backend returned ${response.status} ${response.statusText}`
  );
};
