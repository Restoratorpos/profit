import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INCOME_CATEGORIES,
  MANUAL_EXPENSE_CATEGORIES,
  MANUAL_INCOME_CATEGORIES,
} from "../src/schemas/transaction.js";
import {
  isManualRow,
  summariseCashboxes,
} from "../src/services/transaction.service.js";

/** The `today` column is irrelevant to a balance assertion; default it to zero. */
const bucket = (
  cashbox: string | null,
  total: string | null,
  today = "0.00"
) => ({ cashbox, today, total });

/**
 * Two halves, the same split the inventory suite uses. The HTTP surface is
 * tested against a mocked service — tenant scoping, validation, status codes —
 * and the balance arithmetic is tested for real, because it is the one
 * calculation on this screen that quietly gets money wrong.
 */
const service = vi.hoisted(() => ({
  createExpenseEntry: vi.fn(),
  createIncomeEntry: vi.fn(),
  createTransfer: vi.fn(),
  listTransactionParties: vi.fn(),
  loadTransactionPage: vi.fn(),
  voidTransaction: vi.fn(),
}));

vi.mock("../src/services/transaction.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/services/transaction.service.js")
    >();

  // The pure helpers stay real; only the db-touching entry points are stubbed.
  return { ...actual, ...service };
});

const { app } = await import("../src/app.js");

const TOKEN = "test-service-token-at-least-16";
const GYM = "gym_00000000000000001";
const WORKER = "wrk_0000000000000001";

const request = (
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-gym-id": GYM,
      "x-service-token": TOKEN,
      "x-worker-id": WORKER,
      ...init.headers,
    },
  });

const post = (path: string, body: unknown) =>
  request(path, { body: JSON.stringify(body), method: "POST" });

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }

  service.loadTransactionPage.mockResolvedValue({
    balances: { card: "0.00", cash: "0.00", transfer: "0.00" },
    rows: [],
    today: { expense: "0.00", income: "0.00" },
  });
  service.listTransactionParties.mockResolvedValue({
    suppliers: [],
    workers: [],
  });
});

describe("service-token auth", () => {
  it("rejects a request with no service token", async () => {
    const response = await app.request("/transactions");

    expect(response.status).toBe(401);
    expect(service.loadTransactionPage).not.toHaveBeenCalled();
  });

  it("rejects a valid token with no gym header", async () => {
    const response = await app.request("/transactions", {
      headers: { "x-service-token": TOKEN },
    });

    expect(response.status).toBe(401);
    expect(service.loadTransactionPage).not.toHaveBeenCalled();
  });
});

describe("GET /transactions", () => {
  it("passes the caller's gym, never one from the query", async () => {
    const response = await request("/transactions?limit=10");

    expect(response.status).toBe(200);
    expect(service.loadTransactionPage).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ limit: 10 })
    );
  });

  it("defaults the limit rather than reading the whole ledger", async () => {
    await request("/transactions");

    expect(service.loadTransactionPage).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ limit: 50 })
    );
  });

  it("refuses a limit above the cap", async () => {
    const response = await request("/transactions?limit=5000");

    expect(response.status).toBe(400);
    expect(service.loadTransactionPage).not.toHaveBeenCalled();
  });

  it("refuses a cashbox that is not a till", async () => {
    const response = await request("/transactions?cashbox=debt");

    expect(response.status).toBe(400);
  });

  it("narrows to one till when a tile is pinned", async () => {
    await request("/transactions?cashbox=card");

    expect(service.loadTransactionPage).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ cashbox: "card" })
    );
  });

  it("narrows to one direction when the kind toggle is set", async () => {
    await request("/transactions?kind=expense");

    expect(service.loadTransactionPage).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ kind: "expense" })
    );
  });

  it("leaves both unset when nothing is pinned", async () => {
    await request("/transactions");

    const [, query] = service.loadTransactionPage.mock.calls[0];

    expect(query.cashbox).toBeUndefined();
    expect(query.kind).toBeUndefined();
  });
});

describe("POST /transactions/income", () => {
  it("records a custom membership payment", async () => {
    const response = await post("/transactions/income", {
      amount: "150000",
      cashbox: "cash",
      category: "membership",
      memberId: "mem_0000000000000001",
    });

    expect(response.status).toBe(204);
    expect(service.createIncomeEntry).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({
        amount: "150000.00",
        cashbox: "cash",
        category: "membership",
      }),
      WORKER
    );
  });

  it("refuses an expense category on the income endpoint", async () => {
    const response = await post("/transactions/income", {
      amount: "1000",
      cashbox: "cash",
      category: "salary",
    });

    expect(response.status).toBe(400);
    expect(service.createIncomeEntry).not.toHaveBeenCalled();
  });

  it("refuses a zero amount — a row with no money is not a transaction", async () => {
    const response = await post("/transactions/income", {
      amount: "0",
      cashbox: "cash",
      category: "goods",
    });

    expect(response.status).toBe(400);
  });

  it("refuses a negative amount rather than flipping the sign", async () => {
    const response = await post("/transactions/income", {
      amount: "-5000",
      cashbox: "cash",
      category: "goods",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /transactions/expense", () => {
  it("records a salary against a worker", async () => {
    const response = await post("/transactions/expense", {
      amount: "3000000",
      cashbox: "card",
      category: "salary",
      workerId: "wrk_0000000000000002",
    });

    expect(response.status).toBe(204);
    expect(service.createExpenseEntry).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({
        category: "salary",
        workerId: "wrk_0000000000000002",
      }),
      WORKER
    );
  });

  it("refuses a salary with nobody attached", async () => {
    const response = await post("/transactions/expense", {
      amount: "3000000",
      cashbox: "cash",
      category: "salary",
    });

    expect(response.status).toBe(400);
    expect(service.createExpenseEntry).not.toHaveBeenCalled();
  });

  it("accepts goods bought from no supplier at all", async () => {
    const response = await post("/transactions/expense", {
      amount: "80000",
      cashbox: "cash",
      category: "supplier",
    });

    expect(response.status).toBe(204);
  });

  it("records the owner taking money out", async () => {
    const response = await post("/transactions/expense", {
      amount: "5000000",
      cashbox: "cash",
      category: "owner_draw",
    });

    expect(response.status).toBe(204);
    expect(service.createExpenseEntry).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ category: "owner_draw" }),
      WORKER
    );
  });
});

describe("POST /transactions/transfers", () => {
  it("moves money between two tills", async () => {
    const response = await post("/transactions/transfers", {
      amount: "1000000",
      from: "cash",
      to: "transfer",
    });

    expect(response.status).toBe(204);
    expect(service.createTransfer).toHaveBeenCalledWith(
      GYM,
      expect.objectContaining({ from: "cash", to: "transfer" }),
      WORKER
    );
  });

  it("refuses a transfer to the same till — nothing would move", async () => {
    const response = await post("/transactions/transfers", {
      amount: "1000000",
      from: "cash",
      to: "cash",
    });

    expect(response.status).toBe(400);
    expect(service.createTransfer).not.toHaveBeenCalled();
  });
});

describe("DELETE /transactions/:id", () => {
  it("voids by the compound id, scoped to the caller's gym", async () => {
    const response = await request("/transactions/income:41", {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(service.voidTransaction).toHaveBeenCalledWith(
      GYM,
      "income:41",
      WORKER
    );
  });
});

describe("isManualRow", () => {
  it("owns a membership payment typed here, which links to nothing", () => {
    expect(isManualRow("membership", null, MANUAL_INCOME_CATEGORIES)).toBe(
      true
    );
  });

  it("disowns a plan sale's income, which links to the membership it paid for", () => {
    // Voiding this without the membership would leave it looking unpaid forever.
    expect(
      isManualRow(
        "membership",
        "mbs_0000000000000001",
        MANUAL_INCOME_CATEGORIES
      )
    ).toBe(false);
  });

  it("disowns a shop order's income outright — the category is not ours", () => {
    expect(isManualRow("order", null, MANUAL_INCOME_CATEGORIES)).toBe(false);
  });

  /**
   * `owner_deposit` was withdrawn from `INCOME_CATEGORIES` — the desk cannot
   * book the owner's own money any more. Rows written before that still have to
   * be voidable: this screen wrote them and no document elsewhere can reverse
   * them, so letting the picker's list decide would make every past deposit
   * permanent, including one typed by mistake.
   */
  it("still owns an owner deposit, though one can no longer be written", () => {
    expect(INCOME_CATEGORIES).not.toContain("owner_deposit");
    expect(isManualRow("owner_deposit", null, MANUAL_INCOME_CATEGORIES)).toBe(
      true
    );
  });

  it("owns goods bought with no delivery document behind them", () => {
    expect(isManualRow("supplier", null, MANUAL_EXPENSE_CATEGORIES)).toBe(true);
  });

  it("disowns a delivery payment — /inventory is tracking that balance", () => {
    expect(
      isManualRow("supplier", "act_0000000000000001", MANUAL_EXPENSE_CATEGORIES)
    ).toBe(false);
  });

  it("disowns a supplier return credit, which this screen never writes", () => {
    expect(isManualRow("sup_return", null, MANUAL_EXPENSE_CATEGORIES)).toBe(
      false
    );
  });

  it("owns both halves of a transfer despite their linking id", () => {
    const moveId = "mov_0000000000000001";

    expect(isManualRow("cash_move", moveId, MANUAL_INCOME_CATEGORIES)).toBe(
      true
    );
    expect(isManualRow("cash_move", moveId, MANUAL_EXPENSE_CATEGORIES)).toBe(
      true
    );
  });

  it("owns a salary and the owner's draw", () => {
    expect(isManualRow("salary", null, MANUAL_EXPENSE_CATEGORIES)).toBe(true);
    expect(isManualRow("owner_draw", null, MANUAL_EXPENSE_CATEGORIES)).toBe(
      true
    );
  });
});

describe("summariseCashboxes", () => {
  it("nets what came in against what went out, per till", () => {
    const { balances } = summariseCashboxes(
      [bucket("cash", "500000.00"), bucket("card", "250000.00")],
      [bucket("cash", "120000.00")]
    );

    expect(balances).toEqual({
      card: "250000.00",
      cash: "380000.00",
      transfer: "0.00",
    });
  });

  it("ignores debt and free — a sale on credit moved no money", () => {
    const { balances } = summariseCashboxes(
      [
        bucket("cash", "100000.00"),
        bucket("debt", "900000.00"),
        bucket("free", "450000.00"),
      ],
      []
    );

    expect(balances.cash).toBe("100000.00");
  });

  it("ignores a supplier return credit, which is not cash leaving a till", () => {
    const { balances } = summariseCashboxes(
      [bucket("cash", "100000.00")],
      [bucket("return", "70000.00")]
    );

    expect(balances.cash).toBe("100000.00");
  });

  it("reports a till paid out beyond its takings as negative", () => {
    const { balances } = summariseCashboxes(
      [bucket("cash", "50000.00")],
      [bucket("cash", "80000.00")]
    );

    expect(balances.cash).toBe("-30000.00");
  });

  it("treats a null total as nothing rather than NaN", () => {
    const { balances } = summariseCashboxes([bucket("cash", null)], []);

    expect(balances.cash).toBe("0.00");
  });

  it("returns every till even when the ledger is empty", () => {
    expect(summariseCashboxes([], [])).toEqual({
      balances: { card: "0.00", cash: "0.00", transfer: "0.00" },
      today: { expense: "0.00", income: "0.00" },
    });
  });

  it("keeps a transfer's two halves netting to zero across the pair", () => {
    // Cash banked: out of `cash`, into `transfer`. The gym is no richer.
    const { balances } = summariseCashboxes(
      [bucket("transfer", "1000000.00")],
      [bucket("cash", "1000000.00")]
    );

    expect(Number(balances.cash) + Number(balances.transfer)).toBe(0);
  });

  it("sums today's takings across every till, not per till", () => {
    const { today } = summariseCashboxes(
      [
        bucket("cash", "900000.00", "300000.00"),
        bucket("card", "50000.00", "50000.00"),
      ],
      [bucket("cash", "700000.00", "20000.00")]
    );

    expect(today).toEqual({ expense: "20000.00", income: "350000.00" });
  });

  it("reports today's two directions separately, never netted", () => {
    // A day that took 5m and paid out 5m is not a day where nothing happened.
    const { today } = summariseCashboxes(
      [bucket("cash", "5000000.00", "5000000.00")],
      [bucket("cash", "5000000.00", "5000000.00")]
    );

    expect(today).toEqual({ expense: "5000000.00", income: "5000000.00" });
  });

  it("leaves today's takings out when the money never touched a till", () => {
    const { today } = summariseCashboxes(
      [bucket("debt", "900000.00", "900000.00")],
      []
    );

    expect(today.income).toBe("0.00");
  });

  it("counts only today, not the running total behind it", () => {
    const { balances, today } = summariseCashboxes(
      [bucket("cash", "1000000.00", "40000.00")],
      []
    );

    expect(balances.cash).toBe("1000000.00");
    expect(today.income).toBe("40000.00");
  });
});
