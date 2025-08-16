"use client";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React from "react";
import { ConnectWalletButton } from "package/connect_wallet";
import { Toaster } from "~/components/shadcn/ui/toaster";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/shadcn/ui/card";
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
                    {
                        session.status === "unauthenticated" ? (
                            <div className="flex items-center justify-center h-full">
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
