import "./styles.css";
import { AuthProvider } from "@repo/auth/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { inter } from "./fonts";

// Brand-level defaults, so a page that sets no metadata still shows the product
// name rather than the route. Deliberately no `template`: pages here get their
// titles from `@repo/seo`'s createMetadata, which already suffixes " | ProFit" —
// a template on top of that would render "Welcome back | ProFit | ProFit".
export const metadata: Metadata = {
  title: "ProFit",
  description: "Gym management.",
  applicationName: "ProFit",
};

interface RootLayoutProperties {
  readonly children: ReactNode;
}

// AuthProvider is mounted at the root, not in (authenticated): useSession() is
// called from the sidebar and would throw anywhere the provider is absent.
const RootLayout = ({ children }: RootLayoutProperties) => (
  <html
    className={cn(fonts, inter.variable)}
    lang="en"
    suppressHydrationWarning
  >
    <body>
      <AuthProvider>
        <DesignSystemProvider>{children}</DesignSystemProvider>
      </AuthProvider>
    </body>
  </html>
);

export default RootLayout;
