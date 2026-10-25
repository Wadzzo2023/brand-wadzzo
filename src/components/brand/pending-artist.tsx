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
    <Card className="w-full max-w-md overflow-hidden shadow-[8px_9px_0_0_hsl(var(--primary))]">
      <div className="bg-primary -mt-6 h-2 w-full" />

      <CardContent className="pt-6 pb-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="blob bg-primary text-primary-foreground -rotate-6 p-3">
            <Clock className="size-5" strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="display text-3xl">Application pending</h1>
            <p className="text-muted-foreground text-sm">Submitted on {formattedDate}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span>Application Status</span>
              <span className="text-primary font-medium">In Review</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          <div className="bg-muted/30 rounded-lg p-4 text-sm">
            <p>
              Thank you for your brand application. Our team is currently reviewing your submission.
              This process typically takes 2-3 business days.
            </p>
            <p className="text-muted-foreground mt-2">
              You&apos;ll receive an update once a decision has been made.
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/10 border-t pt-4">
        <div className="flex w-full items-center justify-between">
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
