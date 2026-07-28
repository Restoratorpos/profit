import "server-only";
import { keys } from "../keys";
import { normalizePhone } from "./phone";

export type WorkerRole =
  | "owner"
  | "admin"
  | "manager"
  | "trainer"
  | "receptionist";

export interface AuthUser {
  /** Null for gym-level staff, who are not tied to one location. */
  branchId: string | null;
  /** The tenant. Every query the app makes must filter by it. */
  gymId: string;
  id: string;
  name: string;
  phone: string;
  role: WorkerRole;
}

/**
 * Checks credentials against apps/backend (POST {AUTH_BACKEND_URL}/auth/verify),
 * which owns the users table and the bcrypt hashes.
 *
 * Returns null only for genuinely bad credentials. Anything else throws: a
 * backend that is down or misconfigured must not be indistinguishable from a
 * wrong password, or an outage reads to every user as "my password stopped
 * working" and there is nothing in the logs to say otherwise.
 */
export const verifyCredentials = async (
  phone: string,
  password: string
): Promise<AuthUser | null> => {
  const backendUrl = keys().AUTH_BACKEND_URL;

  if (!backendUrl) {
    throw new Error(
      "AUTH_BACKEND_URL is not set — cannot verify credentials against the backend."
    );
  }

  const response = await fetch(new URL("/auth/verify", backendUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The backend normalizes too; sending digits keeps the contract explicit.
    body: JSON.stringify({ phone: normalizePhone(phone), password }),
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Credential check failed: backend returned ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as AuthUser;
};
