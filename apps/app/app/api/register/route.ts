import { registerUser } from "@repo/auth/lib/register-user";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Same-origin front door for registration. The browser cannot call the backend
 * directly — AUTH_BACKEND_URL is server-only, and keeping it that way means no
 * CORS surface and one place to change if the API moves.
 *
 * Shape checks live in the backend; this only rejects outright malformed bodies.
 */
const bodySchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1),
});

export const POST = async (request: Request): Promise<NextResponse> => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check your details and try again." },
      { status: 400 }
    );
  }

  const result = await registerUser(
    parsed.data.phone,
    parsed.data.password,
    parsed.data.name
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
};
