"use client";

import { ShieldAlert, Mail } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/shadcn/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/shadcn/ui/card";
import { Separator } from "~/components/shadcn/ui/separator";

interface BannedCreatorCardProps {
  creatorName: string;
}

export function BannedCreatorCard({ creatorName }: BannedCreatorCardProps) {
  return (
    <Card className="border-destructive w-full max-w-md overflow-hidden">
      <CardHeader className="bg-destructive/10 pb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-destructive h-5 w-5" />
          <CardTitle>Account Restricted</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        <p>
          <strong>{creatorName}</strong>, your creator profile has been banned for violating our
          community guidelines.
        </p>
      </CardContent>

      <Separator />

      <CardFooter className="flex flex-col gap-2 pt-4">
        <Button className="w-full shadow-xs" size="lg" asChild>
          <Link href="/contact">
            <Mail className="mr-2 h-4 w-4" />
            Contact Support
          </Link>
        </Button>

        <p className="text-muted-foreground text-center text-xs">
          For questions about this ban, please contact support.
        </p>
      </CardFooter>
    </Card>
  );
}
