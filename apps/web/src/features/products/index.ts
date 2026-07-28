/** The products (catalog) vertical's public surface. */
export {
  categoriesQuery,
  combosQuery,
  productsQuery,
  useCombos,
  useProducts,
} from "./api";
export {
  CatalogPage,
  catalogLoader,
  EditComboPage,
  NewComboPage,
} from "./components/catalog-page";
export type {
  CategoryListItem,
  ComboListItem,
  ProductListItem,
} from "./types";
