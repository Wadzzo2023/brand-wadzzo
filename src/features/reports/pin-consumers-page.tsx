"use client" // Mark as client component due to framer-motion and hooks

import { Card, CardContent, CardTitle } from "~/components/shadcn/ui/card" // Updated import path
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "~/components/shadcn/ui/table" // Updated import path
import { Calendar, Download, LinkIcon, MapPin } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button" // Updated import path
import { useParams } from "next/navigation"
import { api } from "~/utils/api"
import { motion } from "framer-motion" // Import motion from framer-motion
import { Skeleton, TableSkeleton } from "~/ui/skeleton"

interface Consumer {
    pubkey: string
    name: string
    consumptionDate: Date
}

export default function SinglePinPage() {
    const { id } = useParams<{ id: string }>()

    const pin = api.maps.pin.getPin.useQuery(id as string)

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2,
            },
        },
    }

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
        },
    }

    if (pin.isLoading) {
        return (
            <div className="container mx-auto p-4 space-y-8 py-8">
                <Card className="overflow-hidden rounded-xl shadow-xs">
                    <CardContent className="p-0 md:flex">
                        <Skeleton className="h-64 w-full md:w-1/2 md:h-auto rounded-none" />
                        <div className="p-6 md:w-1/2 md:p-8 space-y-4">
                            <Skeleton className="h-10 w-3/4" />
                            <Skeleton className="h-6 w-full" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-8 w-44" />
                        <Skeleton className="h-9 w-32" />
                    </div>
                    <TableSkeleton rows={5} cols={3} colWidths={["w-48", "w-36", "w-28"]} />
                </div>
            </div>
        )
    }

    if (pin.error) return <p className="text-destructive">Error: {pin.error.message}</p>

    if (pin.data) {
        const demoPin = pin.data
        return (
            <motion.div
                initial="hidden"
                animate="visible"
                variants={containerVariants}
                className="container mx-auto py-8 px-4 md:px-6 lg:px-8"
            >
                <motion.section variants={itemVariants} className="mb-12">
                    <Card className="overflow-hidden rounded-xl shadow-lg">
                        <CardContent className="p-0 md:flex">
                            <div className="relative h-64 w-full md:h-auto md:w-1/2">
                                <img
                                    src={demoPin.image ?? "/placeholder.svg?height=600&width=600&query=abstract map pin"}
                                    alt={demoPin.title ?? "Pin image"}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <div className="p-6 md:w-1/2 md:p-8">
                                <CardTitle className="mb-4 text-4xl font-extrabold leading-tight text-gray-900 dark:text-gray-50">
                                    {demoPin.title}
                                </CardTitle>
                                <p className="mb-6 text-lg text-gray-600 dark:text-gray-400">{demoPin.description}</p>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <MapPin className="h-5 w-5 text-primary" />
                                        <span className="font-medium">Latitude:</span> {demoPin.latitude?.toFixed(6)}
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <MapPin className="h-5 w-5 text-primary" />
                                        <span className="font-medium">Longitude:</span> {demoPin.longitude?.toFixed(6)}
                                    </div>
                                    {demoPin.url && (
                                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                            <LinkIcon className="h-5 w-5 text-primary" />
                                            <span className="font-medium">URL:</span>{" "}
                                            <motion.a
                                                href={demoPin.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline dark:text-blue-400"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                {demoPin.url}
                                            </motion.a>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <Calendar className="h-5 w-5 text-primary" />
                                        <span className="font-medium">Start Date:</span>{" "}
                                        {demoPin.startDate ? new Date(demoPin.startDate).toLocaleDateString() : "N/A"}
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <Calendar className="h-5 w-5 text-primary" />
                                        <span className="font-medium">End Date:</span>{" "}
                                        {demoPin.endDate ? new Date(demoPin.endDate).toLocaleDateString() : "N/A"}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.section>

                <motion.section variants={itemVariants}>
                    <ConsumersTable consumers={demoPin.consumers} />
                </motion.section>
            </motion.div>
        )
    }
}

export function ConsumersTable({ consumers }: { consumers: Consumer[] }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="font-hud text-xl font-bold">Pin Consumers</h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        DownloadConsumersAsCSV(consumers)
                    }}
                    className="flex items-center gap-2"
                >
                    <Download className="h-4 w-4" />
                    Download CSV
                </Button>
            </div>
            <TableContainer>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Public Key</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Date of Consumption</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {consumers.map((consumer) => (
                            <TableRow key={consumer.pubkey}>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {consumer.pubkey}
                                </TableCell>
                                <TableCell className="font-medium">{consumer.name}</TableCell>
                                <TableCell className="text-muted-foreground">
                                    {consumer.consumptionDate.toLocaleDateString()}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </div>
    )
}

function DownloadConsumersAsCSV(consumers: Consumer[]) {
    const csvContent = [
        ["pubkey", "name", "consumption_date"], // Header row
        ...consumers.map((consumer) => [consumer.pubkey, consumer.name, consumer.consumptionDate.toDateString()]),
    ]
        .map((e) => e.join(","))
        .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", "consumers.csv")
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
