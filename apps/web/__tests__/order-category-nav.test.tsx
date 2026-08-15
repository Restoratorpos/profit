import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { OrderComposer } from "@/features/orders/components/order-composer";
import type { PosCategory, PosProduct } from "@/features/orders/types";
import { getMessages } from "@/lib/i18n/dictionary";
import { LocaleProvider } from "@/lib/i18n/provider";

/** The default locale's copy, which is what the provider hands the page too. */
const MESSAGES = getMessages("uz");

/**
 * Drilling into a category on the till.
 *
 * The bug this guards: the way back out used to sit above the tile grid, which
 * put a control the width of a finger exactly where the tile just tapped had
 * been. The second tap of a quick double-tap landed on it and threw the desk
 * back to the categories with nothing to say why — on a POS, where fast
 * repeated tapping is the normal way to use the screen.
 *
 * So the arrow lives in the toolbar, in the slot the Bar/Do'kon tabs use, and
 * the grid is left alone. Both halves matter and both are asserted: the arrow
 * has to be out of the grid, *and* the tiles have to stay where they were.
 */

const CATEGORIES: PosCategory[] = [
  { color: null, id: "cat_1", name: "MEVALAR" },
];

const PRODUCTS: PosProduct[] = [
  {
    categoryId: "cat_1",
    color: null,
    id: "prd_1",
    kind: "product",
    name: "Olma",
    price: "50000.00",
    productType: "bar",
  },
];

const rootRoute = createRootRoute();

const renderComposer = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => (
          <OrderComposer
            categories={CATEGORIES}
            customers={[]}
            messages={MESSAGES}
            products={PRODUCTS}
          />
        ),
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>
  );
};

/** The tile wall — the one grid both categories and products are drawn into. */
const tileGrid = () => document.querySelector("div.grid");

/** The product tile carries its price as well as its name, hence the match. */
const PRODUCT_TILE = /Olma/;

/**
 * Renders and waits for the till to be on screen. `RouterProvider` draws nothing
 * until the router has loaded, so every one of these starts by finding the one
 * category tile rather than assuming it is already there.
 */
const openTill = async () => {
  renderComposer();

  return await screen.findByRole("button", { name: "MEVALAR" });
};

afterEach(cleanup);

describe("opening a category on the till", () => {
  it("puts the way back where the tabs were, not above the tiles", async () => {
    const user = userEvent.setup();

    const category = await openTill();

    // The categories: tabs on the toolbar, no way back yet.
    expect(screen.queryByRole("button", { name: "Kategoriyalar" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Bar" })).toBeDefined();

    await user.click(category);

    const back = screen.getByRole("button", { name: "Kategoriyalar" });

    // The tabs gave up the slot rather than the grid gaining a row.
    expect(screen.queryByRole("radio", { name: "Bar" })).toBeNull();
    expect(tileGrid()?.contains(back)).toBe(false);
  });

  /**
   * The half that actually stops the misclick. Whatever the toolbar does, the
   * first tile has to still be the first thing in the grid after a category
   * opens — anything inserted above it moves every tile down by its own height,
   * which is how the finger ends up somewhere it did not aim.
   */
  it("leaves the tiles where they were", async () => {
    const user = userEvent.setup();

    const category = await openTill();

    expect(tileGrid()?.firstElementChild).toBe(category);

    await user.click(category);

    const product = screen.getByRole("button", { name: PRODUCT_TILE });

    expect(tileGrid()?.firstElementChild).toBe(product);
  });

  it("goes back to the categories, and the tabs come back with them", async () => {
    const user = userEvent.setup();

    await user.click(await openTill());
    await user.click(screen.getByRole("button", { name: "Kategoriyalar" }));

    expect(screen.getByRole("radio", { name: "Bar" })).toBeDefined();
    expect(screen.getByRole("button", { name: "MEVALAR" })).toBeDefined();
  });

  /**
   * A query cuts across the grouping and shows every match flat, so the toolbar
   * must not go on claiming the operator is inside "Mevalar" while the grid is
   * showing something else.
   */
  it("returns the tabs while a search is showing matches from everywhere", async () => {
    const user = userEvent.setup();

    await user.click(await openTill());
    await user.type(screen.getByRole("textbox"), "Olma");

    expect(screen.queryByRole("button", { name: "Kategoriyalar" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Bar" })).toBeDefined();
  });
});
