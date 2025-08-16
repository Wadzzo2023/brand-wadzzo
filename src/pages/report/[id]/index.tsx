"use client" // Mark as client component due to framer-motion and hooks

import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/shadcn/ui/card" // Updated import path
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/shadcn/ui/table" // Updated import path
import { Calendar, Download, LinkIcon, MapPin } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button" // Updated import path
import { useRouter } from "next/router" // Changed from next/router to next/navigation
import { api } from "~/utils/api"
import { motion } from "framer-motion" // Import motion from framer-motion

interface Consumer {
    pubkey: string
    name: string
    consumptionDate: Date
}

export default function SinglePinPage() {
    const router = useRouter()
    const { id } = router.query

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
            <div className="container mx-auto p-4">
                <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-8 py-8">
                    <motion.div variants={itemVariants}>
                        <Card className="animate-pulse overflow-hidden rounded-xl shadow-lg">
                            <CardContent className="p-0 md:flex">
                                <div className="relative h-64 w-full rounded-t-xl bg-gray-200 md:h-auto md:w-1/2 md:rounded-l-xl md:rounded-tr-none"></div>
                                <div className="p-6 md:w-1/2 md:p-8">
                                    <div className="mb-4 h-10 w-3/4 rounded bg-gray-200"></div>
                                    <div className="mb-6 h-6 w-full rounded bg-gray-200"></div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="h-4 w-full rounded bg-gray-200"></div>
                                        <div className="h-4 w-full rounded bg-gray-200"></div>
                                        <div className="h-4 w-full rounded bg-gray-200"></div>
                                        <div className="h-4 w-full rounded bg-gray-200"></div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <div className="mb-6 flex items-center justify-between">
                            <div className="h-8 w-1/4 rounded bg-gray-200"></div>
                            <div className="h-10 w-32 rounded bg-gray-200"></div>
                        </div>
                        <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800">
                            <div className="h-12 w-full rounded-t-md bg-gray-100"></div>
                            <div className="space-y-2 p-4">
                                <div className="h-10 w-full rounded bg-gray-50"></div>
                                <div className="h-10 w-full rounded bg-gray-50"></div>
                                <div className="h-10 w-full rounded bg-gray-50"></div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
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
                                <Image
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
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800"
        >
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50">Pin Consumers</h2>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                        variant="outline"
                        onClick={() => {
                            DownloadConsumersAsCSV(consumers)
                        }}
                        className="flex items-center gap-2 border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                        <Download className="h-4 w-4" />
                        Download CSV
                    </Button>
                </motion.div>
            </div>
            <div className="overflow-x-auto">
                <Table className="w-full min-w-[600px] rounded-md border-collapse">
                    <TableHeader>
                        <TableRow className="bg-gray-100 dark:bg-gray-700">
                            <TableHead className="py-3 px-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Public Key
                            </TableHead>
                            <TableHead className="py-3 px-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Name
                            </TableHead>
                            <TableHead className="py-3 px-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Date of Consumption
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {consumers.map((consumer, index) => (
                            <motion.tr
                                key={consumer.pubkey}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: 0.05 * index }}
                                className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                            >
                                <TableCell className="py-3 px-4 font-mono text-sm text-gray-600 dark:text-gray-400">
                                    {consumer.pubkey}
                                </TableCell>
                                <TableCell className="py-3 px-4 text-sm text-gray-800 dark:text-gray-200">{consumer.name}</TableCell>
                                <TableCell className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                                    {consumer.consumptionDate.toLocaleDateString()}
                                </TableCell>
                            </motion.tr>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </motion.div>
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
