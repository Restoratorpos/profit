import { Inter } from "next/font/google";

/**
 * Self-hosted at build time by next/font, exposed as --font-inter so
 * styles.css can put it at the head of the --font-sans stack.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
