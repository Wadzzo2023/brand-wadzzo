"use client"

import { ShieldAlert, Mail } from "lucide-react"
import Link from "next/link"
import { Button } from "~/components/shadcn/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Separator } from "~/components/shadcn/ui/separator"

interface BannedCreatorCardProps {
    creatorName: string



}

export function BannedCreatorCard({ creatorName }: BannedCreatorCardProps) {
    return (
        <Card className="w-full max-w-md border-destructive">
            <CardHeader className="bg-destructive/10 pb-4">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-destructive" />
                    <CardTitle>Account Restricted</CardTitle>
                </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
                <p>
                    <strong>{creatorName}</strong>, your creator profile has been banned for violating our community guidelines.
                </p>


            </CardContent>

            <Separator />

            <CardFooter className="pt-4 flex flex-col gap-2">
                <Button className="w-full shadow-sm " size="lg" asChild >
                    <Link href="/contact" >
                        <Mail className="mr-2 h-4 w-4" />
                        Contact Support
                    </Link>
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                    For questions about this ban, please contact support.
                </p>
            </CardFooter>
        </Card>
    )
}

