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

/** Carries only the subject: it is a key to mint access tokens, not an identity. */
export const signRefreshToken = (userId: string): string =>
  jwt.sign({}, config.auth.refreshSecret, {
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

/** Returns the user id the refresh token was issued for, or null. */
export const verifyRefreshToken = (token: string): string | null => {
  try {
    const claims = jwt.verify(
      token,
      // Verified against the refresh secret specifically, so an access token
      // can never be replayed as a refresh token.
      config.auth.refreshSecret
    ) as RefreshTokenClaims;

    return claims.sub;
  } catch {
    return null;
  }
};
