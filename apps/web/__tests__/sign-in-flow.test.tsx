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
      <AuthProvider initialUser={null}>
        <RoutedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
};

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
      expect(screen.getByLabelText(/telefon/i)).toBeDefined()
    );

    expect(screen.getByLabelText(/parol/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /kirish/i })).toBeDefined();
  });

  it("bounces a signed-out visitor off a guarded route onto sign-in", async () => {
    renderApp("/members");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /kirish/i })).toBeDefined()
    );
  });

  it("posts to /auth/login when the form is submitted", async () => {
    const user = userEvent.setup();

    renderApp("/sign-in");

    await waitFor(() => expect(screen.getByLabelText(/parol/i)).toBeDefined());

    await user.type(screen.getByLabelText(/telefon/i), "907661770");
    await user.type(screen.getByLabelText(/parol/i), "1111");
    await user.click(screen.getByRole("button", { name: /kirish/i }));

    await waitFor(() =>
      expect(requests.some((r) => r.includes("/auth/login"))).toBe(true)
    );
  });
});
