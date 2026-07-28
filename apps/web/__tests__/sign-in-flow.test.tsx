import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth/context";
import { routeTree } from "@/routeTree.gen";

/**
 * Mounts the real route tree, not a stand-in.
 *
 * The whole class of bug this covers is the one a build cannot: a route that
 * compiles, resolves every import, and then throws when it renders — leaving a
 * blank page and no network request, which looks from the server side like
 * "the user never tried to sign in".
 */
const renderApp = (initialPath: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    context: { auth: undefined as never, queryClient },
  });

  // Mirrors main.tsx: the guards read auth off the router context, so it has to
  // be injected here rather than pulled from a hook inside a route.
  const RoutedApp = () => (
    <RouterProvider context={{ auth: useAuth() }} router={router} />
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={null} restoreOnMount={false}>
        <RoutedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
};

// Hoisted so they are compiled once rather than on every assertion.
const PHONE_LABEL = /telefon/i;
const PASSWORD_LABEL = /parol/i;
const SUBMIT_LABEL = /kirish/i;

let requests: string[] = [];

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      requests.push(`${init.method ?? "GET"} ${input}`);

      // Signed out: the boot refresh finds no session.
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "unauthorized", message: "Not signed in" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sign-in", () => {
  it("renders the form for a signed-out visitor", async () => {
    renderApp("/sign-in");

    await waitFor(() =>
      expect(screen.getByLabelText(PHONE_LABEL)).toBeDefined()
    );

    expect(screen.getByLabelText(PASSWORD_LABEL)).toBeDefined();
    expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toBeDefined();
  });

  it("bounces a signed-out visitor off a guarded route onto sign-in", async () => {
    renderApp("/members");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toBeDefined()
    );
  });

  it("posts to /auth/login when the form is submitted", async () => {
    const user = userEvent.setup();

    renderApp("/sign-in");

    await waitFor(() =>
      expect(screen.getByLabelText(PASSWORD_LABEL)).toBeDefined()
    );

    await user.type(screen.getByLabelText(PHONE_LABEL), "907661770");
    await user.type(screen.getByLabelText(PASSWORD_LABEL), "1111");
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() =>
      expect(requests.some((r) => r.includes("/auth/login"))).toBe(true)
    );
  });
});

const SIGNUP_NAME = /ismingiz/i;
const SIGNUP_SUBMIT = /hisob yaratish/i;

describe("sign-up", () => {
  it("renders the tenant-registration form", async () => {
    renderApp("/sign-up");

    await waitFor(() =>
      expect(screen.getByLabelText(SIGNUP_NAME)).toBeDefined()
    );

    expect(screen.getByLabelText(PHONE_LABEL)).toBeDefined();
    expect(screen.getByLabelText(PASSWORD_LABEL)).toBeDefined();
  });

  /**
   * One call, not two. The Next version registered through a proxy and then ran
   * a separate next-auth sign-in, which could leave an account created but the
   * user not signed in. Here `mode: "cookie"` makes them the same round trip.
   */
  it("posts once to /auth/register and does not then call /auth/login", async () => {
    const user = userEvent.setup();

    renderApp("/sign-up");

    await waitFor(() =>
      expect(screen.getByLabelText(SIGNUP_NAME)).toBeDefined()
    );

    await user.type(screen.getByLabelText(SIGNUP_NAME), "Diyorbek");
    await user.type(screen.getByLabelText(PHONE_LABEL), "907661770");
    await user.type(screen.getByLabelText(PASSWORD_LABEL), "1111");
    await user.click(screen.getByRole("button", { name: SIGNUP_SUBMIT }));

    await waitFor(() =>
      expect(requests.some((r) => r.includes("/auth/register"))).toBe(true)
    );

    expect(requests.some((r) => r.includes("/auth/login"))).toBe(false);
  });

  it("does not submit when the details fail local validation", async () => {
    const user = userEvent.setup();

    renderApp("/sign-up");

    await waitFor(() =>
      expect(screen.getByLabelText(SIGNUP_NAME)).toBeDefined()
    );

    // Name too short and no phone at all — the backend would reject both, but
    // the operator should not need a round trip to find that out.
    await user.type(screen.getByLabelText(SIGNUP_NAME), "D");
    await user.click(screen.getByRole("button", { name: SIGNUP_SUBMIT }));

    expect(requests.some((r) => r.includes("/auth/register"))).toBe(false);
  });
});
