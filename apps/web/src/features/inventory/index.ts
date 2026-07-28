/** The inventory vertical's public surface: stock, history and suppliers. */
export { movementsQuery, stockQuery, suppliersQuery } from "./api";
export {
  HistoryPage,
  InventoryPage,
  SuppliersPage,
} from "./components/inventory-pages";
export type { InventoryItem, SupplierSummary } from "./types";
