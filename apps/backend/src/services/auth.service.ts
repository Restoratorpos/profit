import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  branches,
  gyms,
  ID_LENGTH,
  WORKER_ROLES,
  type Worker,
  workers,
} from "../db/schema.js";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../lib/errors.js";
import {
  signAccessToken,
  signTokenPair,
  type TokenPair,
  verifyRefreshToken,
} from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  denyRefreshToken,
  isRefreshTokenDenied,
  recordRotation,
  successorOf,
} from "../lib/token-denylist.js";
import type { RegisterInput } from "../schemas/auth.js";
import type { AuthUser, UserRole } from "../types/index.js";

type Session = TokenPair & { user: AuthUser };

/** Tenancy ids are varchar(20); nanoid(21) would not fit. */
const newId = (): string => nanoid(ID_LENGTH);

const ACTIVE = "active";

/**
 * Unrecognised roles fall back to the least-privileged one rather than failing
 * the login. A malformed `role` is a data error, and the safe reading of an
 * unknown privilege string is "no privileges", not "whatever it says".
 */
const LEAST_PRIVILEGED_ROLE: UserRole = "receptionist";

const toRole = (role: string | null): UserRole =>
  (WORKER_ROLES as readonly string[]).includes(role ?? "")
    ? (role as UserRole)
    : LEAST_PRIVILEGED_ROLE;

/** Strips the hash before a worker ever leaves this module. */
const toAuthUser = (worker: Worker): AuthUser => ({
  id: worker.workerId,
  phone: worker.phone ?? "",
  name: worker.fullname ?? "",
  role: toRole(worker.role),
  // gymId is non-null in practice; a worker without one cannot be scoped to a
  // tenant, and findActiveWorkerByPhone refuses to authenticate such a row.
  gymId: worker.gymId ?? "",
  branchId: worker.branchId ?? null,
});

/**
 * Phone is the login identifier, but SQL does not enforce it as unique — it is
 * only indexed per gym. Two active workers sharing a number across tenants
 * would make "who is signing in?" ambiguous, so this reads two rows and refuses
 * to guess when it finds them. register() prevents the situation arising.
 */
export const findActiveWorkerByPhone = async (
  phone: string
): Promise<Worker | null> => {
  const matches = await db
    .select()
    .from(workers)
    .where(eq(workers.phone, phone))
    .limit(2);

  const active = matches.filter(
    (worker) => worker.status === ACTIVE && Boolean(worker.gymId)
  );

  if (active.length !== 1) {
    return null;
  }

  return active[0] ?? null;
};

export const findWorkerById = async (id: string): Promise<Worker | null> => {
  const [worker] = await db
    .select()
    .from(workers)
    .where(eq(workers.workerId, id))
    .limit(1);

  return worker ?? null;
};

/**
 * Returns the worker on correct credentials, null on anything else. Callers get
 * no way to tell "no such phone" from "wrong password" — including by timing,
 * which is why the no-worker branch still pays for a hash.
 */
export const verifyCredentials = async (
  phone: string,
  password: string
): Promise<AuthUser | null> => {
  const worker = await findActiveWorkerByPhone(phone);

  if (!worker?.passwordHash) {
    await hashPassword(password);
    return null;
  }

  const matches = await verifyPassword(password, worker.passwordHash);

  return matches ? toAuthUser(worker) : null;
};

/**
 * Registration onboards a whole tenant, not just a person: a gym with no branch
 * and no owner is unusable, so all three rows are created together or not at
 * all. The first worker is the `owner`.
 */
export const register = async ({
  phone,
  password,
  name,
  gymName,
}: RegisterInput): Promise<Session> => {
  const [existing] = await db
    .select({ workerId: workers.workerId })
    .from(workers)
    .where(eq(workers.phone, phone))
    .limit(1);

  if (existing) {
    throw new ConflictError("An account with this phone number already exists");
  }

  const now = new Date();
  const gymId = newId();
  const branchId = newId();
  const workerId = newId();
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(gyms).values({
      gymId,
      gym: gymName ?? `${name}'s Gym`,
      ownerName: name,
      phone,
      planTier: "free",
      isActive: true,
      createdAt: now,
    });

    await tx.insert(branches).values({
      branchId,
      gymId,
      branch: "Main",
      phone,
      isActive: true,
      createdAt: now,
    });

    await tx.insert(workers).values({
      workerId,
      gymId,
      branchId,
      fullname: name,
      phone,
      // Kept in step with phone so the column is meaningful if login-by-username
      // is ever enabled; authentication matches on phone today.
      login: phone,
      role: "owner",
      passwordHash,
      status: ACTIVE,
      // DATE column (mode "string"): store the calendar day, not an instant.
      hiredAt: now.toISOString().slice(0, 10),
      createdAt: now,
    });
  });

  const authUser: AuthUser = {
    id: workerId,
    phone,
    name,
    role: "owner",
    gymId,
    branchId,
  };

  return { user: authUser, ...signTokenPair(authUser) };
};

export const login = async (
  phone: string,
  password: string
): Promise<Session> => {
  const user = await verifyCredentials(phone, password);

  if (!user) {
    throw new UnauthorizedError("Invalid phone number or password");
  }

  return { user, ...signTokenPair(user) };
};

/** The worker behind a still-valid token, or a 401 if they are no longer one. */
const requireActiveWorker = (worker: Worker | null): AuthUser => {
  if (!worker || worker.status !== ACTIVE) {
    throw new UnauthorizedError("Account no longer exists");
  }

  return toAuthUser(worker);
};

/**
 * Re-reads the worker rather than trusting the token: a refresh token outlives
 * an access token, so the account may have been renamed, moved between
 * branches, demoted, or deactivated since it was issued.
 *
 * The presented token is **spent** — it is revoked and a fresh pair issued.
 * Rotation matters more now that the browser holds these directly: a stolen
 * refresh token and the real one cannot both keep working, so a theft surfaces
 * as the victim being signed out rather than as two silent parallel sessions.
 *
 * Spent is not the same as refused, though. Revocation happens here while the
 * replacement travels back in the response, so a response that never arrives
 * used to leave the browser holding a dead cookie and no way to learn its
 * successor — an unrecoverable sign-out caused by a dropped packet rather than
 * by anything wrong with the session. For a minute after it is spent a token
 * therefore answers with the *same* replacement instead of a 401, which makes
 * this endpoint idempotent for exactly as long as a retry takes. See
 * ROTATION_GRACE_SECONDS in lib/token-denylist.ts.
 */
export const refreshSession = async (
  refreshToken: string
): Promise<Session> => {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  // Independent lookups: the common case is a valid, un-revoked token, so pay
  // for one round trip rather than two.
  const [isDenied, worker] = await Promise.all([
    isRefreshTokenDenied(refreshToken),
    findWorkerById(payload.userId),
  ]);

  if (isDenied) {
    const successor = await successorOf(refreshToken);

    if (!successor) {
      // Revoked by signing out, or spent longer ago than the grace window.
      // Same message as a bad signature: which of the three it was is not the
      // caller's business.
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    /*
     * A repeat of an exchange that already happened. The replacement is handed
     * back unchanged rather than minted again, so the client that lost the first
     * answer and the one that received it converge on a single chain — two
     * chains would mean a stolen token could quietly run alongside the real one,
     * which is the property rotation exists to deny.
     *
     * The access token is signed fresh from a worker read a moment ago, so a
     * replay cannot resurrect stale claims.
     */
    const replayUser = requireActiveWorker(worker);

    return {
      user: replayUser,
      accessToken: signAccessToken(replayUser),
      refreshToken: successor,
    };
  }

  const authUser = requireActiveWorker(worker);
  const pair = signTokenPair(authUser);

  await Promise.all([
    denyRefreshToken(refreshToken, payload.expiresAt),
    recordRotation(refreshToken, pair.refreshToken),
  ]);

  return { user: authUser, ...pair };
};

/**
 * Revokes a refresh token. Idempotent, and silent about tokens it cannot read.
 *
 * Signing out is a request, not a question — reporting "that token was already
 * invalid" would turn this into an oracle for guessing which tokens are real,
 * and there is nothing the caller could usefully do with the answer. Access
 * tokens are not revoked: they are minutes long and stateless by design, so the
 * client drops its copy and the rest expires on its own.
 */
export const logout = async (refreshToken: string): Promise<void> => {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload) {
    return;
  }

  await denyRefreshToken(refreshToken, payload.expiresAt);
};

/**
 * Changes the signed-in worker's own password.
 *
 * The current one is re-checked against the stored hash even though the caller
 * already proved they hold a valid token: the token is minutes of ambient
 * authority on a shared desk terminal, and taking an account over should cost
 * knowing its password rather than finding it unlocked.
 *
 * Unlike `verifyCredentials` this does not hide which check failed — the caller
 * is already authenticated as this worker, so there is no account to enumerate
 * and "your current password is wrong" is the only useful thing to say.
 *
 * Sessions elsewhere are deliberately left alone: refresh tokens are not
 * enumerable, so there is no list to revoke without denying this worker's own
 * cookie and signing them out of the screen they are standing at.
 */
export const changePassword = async (
  workerId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const worker = await findWorkerById(workerId);

  if (!worker?.passwordHash || worker.status !== ACTIVE) {
    throw new UnauthorizedError("Not signed in");
  }

  const matches = await verifyPassword(currentPassword, worker.passwordHash);

  /*
   * 403 rather than 401, though it is a credential that was wrong. The SPA
   * reads 401 as "this access token has expired", refreshes and retries — so a
   * mistyped current password would rotate the session's refresh token and send
   * the same doomed request twice before showing the message.
   */
  if (!matches) {
    throw new ForbiddenError("Current password is incorrect");
  }

  await db
    .update(workers)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(workers.workerId, workerId));
};
