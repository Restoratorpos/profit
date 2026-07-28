"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

type AuthProviderProperties = {
  children: ReactNode;
  // Accepted for compatibility with the design system's provider, which passes
  // these through; Auth.js renders no hosted pages, so they are unused.
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
};

export const AuthProvider = ({ children }: AuthProviderProperties) => (
  <SessionProvider>{children}</SessionProvider>
);
