"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "~/components/shadcn/ui/button";

export default function JoinArtistPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/onboarding");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <div>
        <h2 className="font-hud text-xl font-bold">Setting up your brand</h2>
        <p className="mt-1 text-sm text-muted-foreground">Redirecting you to brand onboarding...</p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link href="/onboarding" className="gap-2">
          Continue to Onboarding <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
