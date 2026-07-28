"use client";

import { useEffect } from "react";

type FontSize = "smaller" | "small" | "default" | "large" | "larger";

export function FontSizeSyncer({ fontSize }: { fontSize: FontSize }) {
  useEffect(() => {
    if (fontSize === "default") {
      document.documentElement.removeAttribute("data-font-size");
    } else {
      document.documentElement.setAttribute("data-font-size", fontSize);
    }
  }, [fontSize]);

  return null;
}
