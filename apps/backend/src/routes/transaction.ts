import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireService } from "../middleware/service.js";
import {
  createExpenseSchema,
  createIncomeSchema,
  createTransferSchema,
  transactionQuerySchema,
} from "../schemas/transaction.js";
import {
  createExpenseEntry,
  createIncomeEntry,
  createTransfer,
  listTransactionParties,
  loadTransactionPage,
  voidTransaction,
} from "../services/transaction.service.js";
import type { AppEnv } from "../types/index.js";

/**
 * Every write returns the freshly recomputed page. The balance is derived rather
 * than stored, so the desk seeing it move is the confirmation that the row
 * landed — and it saves the client a second round trip to find out.
 */
export const transactionRoutes = new Hono<AppEnv>()
  .use("*", requireService)
  .get("/", zValidator("query", transactionQuerySchema), async (c) =>
    c.json(await loadTransactionPage(c.get("gymId"), c.req.valid("query")))
  )
  .get("/parties", async (c) =>
    c.json(await listTransactionParties(c.get("gymId")))
  )
  .post("/income", zValidator("json", createIncomeSchema), async (c) => {
    await createIncomeEntry(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.body(null, 204);
  })
  .post("/expense", zValidator("json", createExpenseSchema), async (c) => {
    await createExpenseEntry(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.body(null, 204);
  })
  .post("/transfers", zValidator("json", createTransferSchema), async (c) => {
    await createTransfer(
      c.get("gymId"),
      c.req.valid("json"),
      c.get("workerId")
    );

    return c.body(null, 204);
  })
  .delete("/:id", async (c) => {
    await voidTransaction(c.get("gymId"), c.req.param("id"), c.get("workerId"));

    return c.body(null, 204);
  });
