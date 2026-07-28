import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const title = "Welcome back";
const description = "Enter your details to sign in.";
const SignIn = dynamic(() =>
  import("@repo/auth/components/sign-in").then((mod) => mod.SignIn)
);

export const metadata: Metadata = createMetadata({ title, description });

// SignIn reads ?callbackUrl through useSearchParams, which Next requires to sit
// under a Suspense boundary.
const SignInPage = () => (
  <Suspense>
    <SignIn />
  </Suspense>
);

export default SignInPage;
