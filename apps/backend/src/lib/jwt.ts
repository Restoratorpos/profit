import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config/index.js";
import type { AuthUser, UserRole } from "../types/index.js";

type AccessTokenClaims = {
  sub: string;
  phone: string;
  name: string;
  role: UserRole;
  gymId: string;
  branchId: string | null;
};

type RefreshTokenClaims = {
  sub: string;
  /** Seconds since the epoch, as JWT spec'd. Set by `expiresIn`. */
  exp: number;
};

export type RefreshTokenPayload = {
  userId: string;
  /** When this token stops being valid — the denylist entry expires with it. */
  expiresAt: Date;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Carries the whole user, so requireAuth never needs a database round-trip.
 * `gymId` rides along because every tenant-scoped query needs it on the way in.
 */
export const signAccessToken = (user: AuthUser): string =>
  jwt.sign(
    {
      phone: user.phone,
      name: user.name,
      role: user.role,
      gymId: user.gymId,
      branchId: user.branchId,
    },
    config.auth.accessSecret,
    {
      subject: user.id,
      expiresIn: config.auth.accessTtl as SignOptions["expiresIn"],
    }
  );

/**
 * Carries only the subject and a unique id: it is a key to mint access tokens,
 * not an identity.
 *
 * The `jti` is what makes rotation work. Without it the payload is just
 * `{ sub, iat, exp }`, and `iat`/`exp` are whole seconds — so refreshing twice
 * inside one second produced a byte-identical token. Since rotation revokes the
 * token it was handed, the "new" token came back already denylisted and the
 * next refresh signed the user out.
 */
export const signRefreshToken = (userId: string): string =>
  jwt.sign({ jti: randomUUID() }, config.auth.refreshSecret, {
    subject: userId,
    expiresIn: config.auth.refreshTtl as SignOptions["expiresIn"],
  });

export const signTokenPair = (user: AuthUser): TokenPair => ({
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user.id),
});

/** Returns null for anything not currently valid — expired, tampered, or malformed. */
export const verifyAccessToken = (token: string): AuthUser | null => {
  try {
    const claims = jwt.verify(
      token,
      config.auth.accessSecret
    ) as AccessTokenClaims;

    return {
      id: claims.sub,
      phone: claims.phone,
      name: claims.name,
      role: claims.role,
      gymId: claims.gymId,
      branchId: claims.branchId ?? null,
    };
  } catch {
    return null;
  }
};

/**
 * Returns who the refresh token was issued for and when it lapses, or null.
 *
 * The expiry is part of the result because revoking a refresh token means
 * remembering it until it would have expired anyway — see lib/token-denylist.ts.
 */
export const verifyRefreshToken = (
  token: string
): RefreshTokenPayload | null => {
  try {
    const claims = jwt.verify(
      token,
      // Verified against the refresh secret specifically, so an access token
      // can never be replayed as a refresh token.
      config.auth.refreshSecret
    ) as RefreshTokenClaims;

    return {
      userId: claims.sub,
      expiresAt: new Date(claims.exp * 1000),
    };
  } catch {
    return null;
  }
};
