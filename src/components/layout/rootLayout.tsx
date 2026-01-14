"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { ConnectWalletButton } from "package/connect_wallet";
import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/shadcn/ui/card";
import { Toaster } from "~/components/shadcn/ui/toaster";
import { Navigation } from "../common/navigation";
import CreatorLayout from "./creatorLayout";

export default function RootLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  const session = useSession();

  return (
    <>
      <div className="flex h-screen ">
        <Navigation />
        <main className="flex-1 overflow-auto scrollbar-hide">
          {session.status === "unauthenticated" ? (
            <div className="flex h-full items-center justify-center">
              <Card className="w-96">
                <CardHeader>
                  <CardTitle>Connect Wallet</CardTitle>
                  <CardDescription>
                    Please connect your wallet to continue.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <ConnectWalletButton />
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="w-full  overflow-y-auto    scrollbar-hide ">
              <>
                <CreatorLayout>{children}</CreatorLayout>
              </>

              <Toaster />
            </div>
          )}
        </main>

      </div>
    </>
  );
}
