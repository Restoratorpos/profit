import { Logo } from "@repo/design-system/components/logo";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="container relative grid h-dvh flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
    <div className="relative hidden h-full flex-col bg-muted p-10 lg:flex dark:border-r">
      <div className="absolute inset-0 bg-muted" />
      <div className="relative z-20 flex items-center">
        <Logo wordmarkClassName="text-lg text-foreground" />
      </div>
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="relative z-20 mt-auto">
        <p className="max-w-sm text-lg text-muted-foreground">
          Members, plans, products and orders — one desk terminal for the whole
          gym.
        </p>
      </div>
    </div>
    <div className="lg:p-8">
      <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center space-y-6">
        {children}
      </div>
    </div>
  </div>
);

export default AuthLayout;
