"use client"

import { memo } from "react"
import { MapPin, Users, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/shadcn/ui/card"
import { Badge } from "~/components/shadcn/ui/badge"
import { Avatar } from "~/components/shadcn/ui/avatar"
import Image from "next/image"
import { useNearbyPinsStore } from "~/store/map-stores"
import { format } from "date-fns"
import type { Location, LocationGroup } from "@prisma/client"

// Define Pin type for clarity and consistency
type Pin = Location & {
    locationGroup:
    | (LocationGroup & {
        creator: { profileUrl: string | null }
    })
    | null
    _count: {
        consumers: number
    }
}

interface NearbyLocationsPanelProps {
    onSelectPlace: (coords: { lat: number; lng: number }) => void
}

export const NearbyLocationsPanel = memo(function NearbyLocationsPanel({ onSelectPlace }: NearbyLocationsPanelProps) {
    const { nearbyPins } = useNearbyPinsStore()

    return (
        <div className="absolute  right-6 top-96 flex max-h-[500px] w-80 items-start justify-center pointer-events-none">
            <Card className="w-full max-h-full bg-white/95 backdrop-blur-md border border-white/30 shadow-2xl rounded-3xl overflow-hidden pointer-events-auto">
                <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
                    <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-blue-600" />
                        Nearby Locations
                        <Badge variant="secondary" className="ml-auto">
                            {nearbyPins.length}
                        </Badge>
                    </CardTitle>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                        {nearbyPins.length <= 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <MapPin className="w-8 h-8 text-gray-400" />
                                </div>
                                <p className="text-gray-500 font-medium">No nearby locations</p>
                                <p className="text-sm text-gray-400 mt-1">Try zooming out or moving the map</p>
                            </div>
                        ) : (
                            <div className="space-y-1 p-4">
                                {nearbyPins?.map((pin, index) => (
                                    <div
                                        onClick={() => {
                                            onSelectPlace({
                                                lat: pin.latitude,
                                                lng: pin.longitude,
                                            })
                                        }}
                                        key={pin.id}
                                        className="group flex items-start gap-3 rounded-2xl bg-white/80 backdrop-blur-sm p-4 shadow-sm border border-gray-100 transition-all duration-300 hover:bg-white hover:shadow-lg hover:scale-[1.02] cursor-pointer transform"
                                        style={{
                                            animationDelay: `${index * 50}ms`,
                                            animation: "slideInRight 0.3s ease-out forwards",
                                        }}
                                    >
                                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                                            <MapPin className="h-5 w-5 text-white" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors duration-200">
                                                {pin.locationGroup?.title ?? "Untitled Location"}
                                            </h3>

                                            <div className="flex items-center gap-2 mt-2">
                                                <Avatar className="h-6 w-6 ring-2 ring-white shadow-sm">
                                                    <Image
                                                        width={24}
                                                        height={24}
                                                        src={pin.locationGroup?.image ?? "/placeholder.svg"}
                                                        alt="Creator"
                                                        className="rounded-full object-cover"
                                                    />
                                                </Avatar>
                                                <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                    <Users className="w-3 h-3 mr-1" />
                                                    {pin._count.consumers}
                                                </Badge>
                                            </div>

                                            {pin.locationGroup?.endDate && (
                                                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                                                    <Clock className="w-3 h-3" />
                                                    <span>Ends {format(new Date(pin.locationGroup.endDate), "MMM dd, hh:mm a")}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
})
