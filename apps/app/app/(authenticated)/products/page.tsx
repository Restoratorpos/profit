import type { Metadata } from "next";
import { CatalogPage } from "./components/catalog-page";

export const metadata: Metadata = {
  title: "Mahsulotlar",
};

const ProductsPage = () => <CatalogPage tab="products" />;

export default ProductsPage;
