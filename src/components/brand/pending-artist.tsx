"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { Card, CardContent, CardFooter } from "~/components/shadcn/ui/card";
import { Progress } from "~/components/shadcn/ui/progress";

export default function PendingPage({ createdAt }: { createdAt?: Date | string | null }) {
    const rawDate = createdAt ? new Date(createdAt) : new Date();
    const applicationDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    // Admin reviews typically take 2-3 business days
    const [now] = useState(() => Date.now());
    const daysSince = Math.max(0, (now - applicationDate.getTime()) / (1000 * 60 * 60 * 24));
    const progressPercent = Math.max(15, Math.min(90, Math.floor((daysSince / 3) * 100)));

    const formattedDate = applicationDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <Card className="w-full max-w-md border-primary/20 shadow-md">
            <div className="h-2 bg-primary w-full rounded-t-xl" />

            <CardContent className="pt-6 pb-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-full bg-primary/10 p-3">
                        <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Application Pending</h1>
                        <p className="text-sm text-muted-foreground">Submitted on {formattedDate}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span>Application Status</span>
                            <span className="font-medium text-primary">In Review</span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4 text-sm">
                        <p>
                            Thank you for your brand application. Our team is currently reviewing your submission. This process
                            typically takes 2-3 business days.
                        </p>
                        <p className="mt-2 text-muted-foreground">
                            You&apos;ll receive an update once a decision has been made.
                        </p>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="border-t bg-muted/10 pt-4">
                <div className="w-full flex justify-between items-center">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="https://app.wadzzo.com/support" target="_blank" rel="noopener noreferrer">
                            Contact Support
                        </Link>
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
