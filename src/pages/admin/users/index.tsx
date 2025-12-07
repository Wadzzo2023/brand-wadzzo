"use client"

import React from "react"
import { toast } from "react-hot-toast"
import { api } from "~/utils/api"
import { Button } from "~/components/shadcn/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/shadcn/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/shadcn/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/shadcn/ui/table"
import { Search, Trash2, Loader2, Users, RefreshCw } from "lucide-react"
import { Input } from "~/components/shadcn/ui/input"
import AdminLayout from "~/components/layout/adminLayout"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import { Badge } from "~/components/shadcn/ui/badge"

const UserList = () => {
    const [searchQuery, setSearchQuery] = React.useState("")
    const users = api.admin.user.getUsers.useQuery()

    const filteredUsers = React.useMemo(() => {
        if (!users.data) return []
        return users.data.filter(
            (user) =>
                user.id.toLowerCase().includes(searchQuery.toLowerCase()) ??
                user.bio?.toLowerCase().includes(searchQuery.toLowerCase()),
        )
    }, [users.data, searchQuery])

    if (users.isLoading) {
        return (
            <AdminLayout>
                <Card className="flex h-[calc(100vh-6rem)] flex-col gap-6 p-6">
                    <CardHeader className="shrink-0 space-y-4 border-b bg-muted/30 px-6 py-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <Users className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">User Management</CardTitle>
                                    <CardDescription>Manage and monitor all users</CardDescription>
                                </div>
                            </div>
                            <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Search by ID or bio..." className="pl-9" disabled />
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                        <div className="h-full overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow className="border-b-2 hover:bg-transparent">
                                        <TableHead className="w-16 font-semibold">#</TableHead>
                                        <TableHead className="font-semibold">Public Key</TableHead>
                                        <TableHead className="font-semibold">Bio</TableHead>
                                        <TableHead className="w-24 text-right font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[...Array.from({ length: 8 })].map((_, index) => (
                                        <TableRow key={index} className="border-b border-border/50">
                                            <TableCell>
                                                <Skeleton className="h-4 w-8" />
                                            </TableCell>
                                            <TableCell>
                                                <Skeleton className="h-4 w-48" />
                                            </TableCell>
                                            <TableCell>
                                                <Skeleton className="h-4 w-32" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>

                </Card>
            </AdminLayout>
        )
    }

    if (users.isError) {
        return (
            <AdminLayout>
                <div className="flex h-[calc(100vh-6rem)] flex-col items-center justify-center gap-4 p-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                        <Users className="h-8 w-8 text-destructive" />
                    </div>
                    <p className="text-lg font-medium text-destructive">Failed to load users</p>
                    <p className="text-sm text-muted-foreground">Please try again later</p>
                    <Button variant="outline" onClick={() => users.refetch()} className="mt-2">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </div>
            </AdminLayout>
        )
    }

    return (
        <AdminLayout>
            <div className="flex h-full flex-col gap-6 p-6">
                <Card className="flex flex-1 flex-col overflow-hidden border-b shadow-sm">
                    <CardHeader className="shrink-0 space-y-4 border-b bg-muted/30 px-6 py-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <Users className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">User Management</CardTitle>
                                    <CardDescription>Manage and monitor all users</CardDescription>
                                </div>
                            </div>
                            <Badge variant="secondary" className="text-sm">
                                {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
                            </Badge>
                        </div>
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search by ID or bio..."
                                className="pl-9 transition-shadow focus-visible:ring-2"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                        <div className="h-full overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow className="border-b-2 hover:bg-transparent">
                                        <TableHead className="w-16 font-semibold">#</TableHead>
                                        <TableHead className="font-semibold">Public Key</TableHead>
                                        <TableHead className="font-semibold">Bio</TableHead>
                                        <TableHead className="w-24 text-right font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user, index) => (
                                        <TableRow key={user.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                                            <TableCell>
                                                <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{user.id}</code>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {user.bio ?? <span className="italic">No bio</span>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DeleteUserButton user={user.id} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {filteredUsers.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                        <Search className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <p className="mt-4 font-medium">No users found</p>
                                    <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search query</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    )
}

const DeleteUserButton = ({ user }: { user: string }) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const deleteUser = api.admin.user.deleteUser.useMutation({
        onSuccess: () => {
            toast.success("User deleted successfully")
            setIsOpen(false)
        },
        onError: () => {
            toast.error("Failed to delete user")
        },
    })

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete User</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete this user? This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <div className="my-4 rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <code className="mt-1 block truncate font-mono text-sm">{user}</code>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={deleteUser.isLoading}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => deleteUser.mutate(user)} disabled={deleteUser.isLoading}>
                        {deleteUser.isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete User
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default UserList
