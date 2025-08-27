"use client"
import { MapPin, Search, Layers, Filter, Menu, Plus } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { CustomMapControl } from "~/components/map/search/map-control"
import { PinToggleSwitch } from "./pin-toggle-switch"

interface MapHeaderProps {
    showExpired: boolean
    onPlaceSelect: (place: { lat: number; lng: number }) => void
    onCenterChange: (center: google.maps.LatLngLiteral) => void
    setIsCordsSearch: (value: boolean) => void
    setSearchCoordinates: (coords: google.maps.LatLngLiteral | undefined) => void
    setCordSearchLocation: (coords: google.maps.LatLngLiteral | undefined) => void
    setZoom: (zoom: number) => void
    setShowExpired: (value: boolean) => void
    onManualPinClick: () => void
}

export function MapHeader({
    onPlaceSelect,
    onCenterChange,
    setIsCordsSearch,
    setSearchCoordinates,
    setCordSearchLocation,
    setZoom,
    showExpired,
    setShowExpired,
    onManualPinClick,

}: MapHeaderProps) {
    return (
        <div className="absolute top-0 left-0 right-0 z-30 p-4">
            <div className="mx-auto max-w-4xl">
                <div className="flex items-center justify-between gap-4">

                    <PinToggleSwitch showExpired={showExpired} setShowExpired={setShowExpired} />

                    <div className="flex-1 ">
                        <div className="relative">
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/30" />
                            <div className="relative flex items-center  ">
                                <Search className="absolute left-4 h-5 w-5 text-gray-400 z-10" />
                                <CustomMapControl
                                    onPlaceSelect={onPlaceSelect}
                                    onCenterChange={onCenterChange}
                                    setIsCordsSearch={setIsCordsSearch}
                                    setSearchCoordinates={setSearchCoordinates}
                                    setCordSearchLocation={setCordSearchLocation}
                                    setZoom={setZoom}
                                >
                                    <Input
                                        placeholder="Search locations, brands..."
                                        className="h-12 w-full border-0 bg-transparent pl-12 pr-4 text-gray-900 placeholder:text-gray-500 focus:ring-0 focus:outline-none rounded-2xl"
                                    />
                                </CustomMapControl>
                            </div>
                        </div>
                    </div>

                    <Button
                        variant="default"
                        size="lg"
                        className="md:px-6 px-3  md:rounded-2xl"
                        onClick={onManualPinClick}
                        aria-label="Create manual pin"
                    >
                        <Plus className="" />
                        <span className="hidden md:block"> Create Pin</span>
                    </Button>
                </div>
            </div>
        </div>
    )
}
