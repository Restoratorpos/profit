import type { Metadata } from "next";
import { CatalogPage } from "../components/catalog-page";

export const metadata: Metadata = {
  title: "Masalliqlar",
};

const IngredientsPage = () => <CatalogPage tab="ingredients" />;

export default IngredientsPage;
