import type { Metadata } from "next";
import { CatalogPage } from "../components/catalog-page";

export const metadata: Metadata = {
  title: "To'plamlar",
};

const CombosPage = () => <CatalogPage tab="combos" />;

export default CombosPage;
