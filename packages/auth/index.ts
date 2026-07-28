import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./config";
import { verifyCredentials } from "./lib/verify-credentials";

const credentialsSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        phone: { label: "Phone", type: "tel" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await verifyCredentials(
          parsed.data.phone,
          parsed.data.password
        );

        if (!user) {
          // Returning null makes Auth.js throw CredentialsSignin, which the
          // sign-in form renders as a generic "invalid credentials" message.
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          gymId: user.gymId,
          branchId: user.branchId,
        };
      },
    }),
  ],
});
