import React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "~/utils/api";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/shadcn/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
    DialogClose,
    DialogDescription,
} from "~/components/shadcn/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/shadcn/ui/table";
import { Loader2, UserPlus, AlertTriangle, Users, ShieldCheck, Key, Shield, Calendar, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { addrShort } from "~/utils/utils";
import AdminLayout from '~/components/layout/adminLayout';
import { Badge } from '~/components/shadcn/ui/badge';

const AdminAddSchema = z.object({
    pubkey: z.string().length(56, { message: "Public key must be 56 characters long" }),
});

export default function AdminManagement() {
    const admins = api.wallate.admin.admins.useQuery()

    return (
        <AdminLayout>
            <div className="flex h-full flex-col gap-6 p-6">

                <Card className=" flex flex-col gap-6 p-6">
                    <CardHeader className="shrink-0 space-y-4 border-b bg-muted/30 px-6 py-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <Shield className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-xl">Admin Management</CardTitle>
                                        {admins.data && (
                                            <Badge variant="secondary" className="font-normal">
                                                {admins.data.length} {admins.data.length === 1 ? "admin" : "admins"}
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription>Manage administrator access and permissions</CardDescription>
                                </div>
                            </div>
                            <AddAdminDialog />
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 overflow-hidden p-0">
                        <AdminsList />
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>

    )
}

function AddAdminDialog() {
    const [isOpen, setIsOpen] = React.useState(false)
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<z.infer<typeof AdminAddSchema>>({
        resolver: zodResolver(AdminAddSchema),
    })

    const addAdmin = api.wallate.admin.makeAdmin.useMutation({
        onSuccess: () => {
            setIsOpen(false)
            reset()
        },
    })

    const onSubmit = (data: z.infer<typeof AdminAddSchema>) => {
        addAdmin.mutate(data.pubkey)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add Admin
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Add New Admin
                    </DialogTitle>
                    <DialogDescription>Grant administrator privileges by entering their public key below.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Enter 56-character public key"
                                {...register("pubkey")}
                                className={`pl-10 font-mono text-sm ${errors.pubkey ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            />
                        </div>
                        {errors.pubkey && <p className="text-sm text-destructive">{errors.pubkey.message}</p>}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={addAdmin.isLoading}>
                            {addAdmin.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Admin
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function AdminsList() {
    const admins = api.wallate.admin.admins.useQuery()

    if (admins.isLoading) {
        return <AdminSkeleton />
    }

    if (admins.isError) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                    <p className="font-medium text-foreground">Failed to load admins</p>
                    <p className="text-sm text-muted-foreground">Please try again later</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => admins.refetch()}>
                    Retry
                </Button>
            </div>
        )
    }

    if (!admins.data?.length) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Shield className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                    <p className="font-medium text-foreground">No admins found</p>
                    <p className="text-sm text-muted-foreground">Add your first administrator to get started</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full overflow-auto">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16">No.</TableHead>
                        <TableHead>Public Key</TableHead>
                        <TableHead className="w-32">Joined</TableHead>
                        <TableHead className="w-24 text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {admins.data.map((admin, i) => (
                        <TableRow key={admin.id} className="group">
                            <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                                <Badge variant="secondary" className="font-mono text-xs">
                                    {addrShort(admin.id, 10)}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {admin.joinedAt.getFullYear()}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <DeleteAdminButton admin={admin.id} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

function DeleteAdminButton({ admin }: { admin: string }) {
    const [isOpen, setIsOpen] = React.useState(false)

    const deleteAdmin = api.wallate.admin.deleteAdmin.useMutation({
        onSuccess: () => {
            setIsOpen(false)
        },
    })

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove admin</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Remove Admin Access
                    </DialogTitle>
                    <DialogDescription>Are you sure you want to remove admin privileges for this user?</DialogDescription>
                </DialogHeader>
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">This action cannot be undone. Admin access will be immediately revoked.</p>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => deleteAdmin.mutate(admin)} disabled={deleteAdmin.isLoading}>
                        {deleteAdmin.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Remove Admin
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function AdminSkeleton() {
    return (
        <div className="h-full p-4">
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
                        <div className="h-4 w-8 animate-pulse rounded bg-muted" />
                        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        <div className="ml-auto h-8 w-8 animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
        </div>
    )
}
