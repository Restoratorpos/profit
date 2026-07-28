import NextAuth from "next-auth";
import { authConfig } from "./config";

/**
 * Built from the edge-safe config only — pulling in `./index` would drag the
 * credentials provider (and its server-only imports) into middleware.
 */
export const { auth: authMiddleware } = NextAuth(authConfig);
