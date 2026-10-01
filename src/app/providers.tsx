"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { Toaster } from "~/components/shadcn/ui/toaster";
import { TRPCReactProvider } from "~/trpc/provider";

// connect_wallet's global dialogs (wallet connect, toasts). Browser-only.
const WalletPopups = dynamic(() => import("package/connect_wallet/src/components/popup_imports"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TRPCReactProvider>
          {children}
          <Toaster />
          <WalletPopups className="font-sans" />
        </TRPCReactProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
