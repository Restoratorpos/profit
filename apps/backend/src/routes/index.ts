import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { authRoutes } from "./auth.js";
import { categoryRoutes, productRoutes } from "./catalog.js";
import { comboRoutes } from "./combo.js";
import { dashboardRoutes } from "./dashboard.js";
import { attendanceRoutes, deviceRoutes } from "./device.js";
import { healthRoutes } from "./health.js";
import { inventoryRoutes, supplierRoutes } from "./inventory.js";
import { memberRoutes } from "./member.js";
import { orderRoutes } from "./order.js";
import { hallRoutes, planRoutes, trainerRoutes } from "./plan.js";
import { transactionRoutes } from "./transaction.js";
import { workerRoutes } from "./worker.js";

export const routes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/dashboard", dashboardRoutes)
  .route("/categories", categoryRoutes)
  .route("/products", productRoutes)
  .route("/combos", comboRoutes)
  .route("/members", memberRoutes)
  .route("/orders", orderRoutes)
  .route("/inventory", inventoryRoutes)
  .route("/suppliers", supplierRoutes)
  .route("/devices", deviceRoutes)
  .route("/attendance", attendanceRoutes)
  .route("/workers", workerRoutes)
  .route("/plans", planRoutes)
  .route("/halls", hallRoutes)
  .route("/trainers", trainerRoutes)
  .route("/transactions", transactionRoutes);
