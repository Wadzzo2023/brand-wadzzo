"use client"

import { memo, useEffect, useState } from "react"
import { APIProvider, AdvancedMarker, Map } from "@vis.gl/react-google-maps"
import { useMapInteractionStore, useNearbyPinsStore } from "~/store/map-stores"
import { useSelectedAutoSuggestion } from "~/hooks/use-selectedAutoSuggestion"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { MapPin } from "lucide-react"
import Image from "next/image"
import CreatePinModal from "~/components/modals/create-pin-modal"
import { MapHeader } from "~/components/map/map-header"
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel"
import { getPinIcon } from "~/utils/map-helpers"
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal"
import { useGeolocation } from "~/hooks/use-geolocation"
import { useMapState } from "~/hooks/use-map-state"
import { useMapInteractions } from "~/hooks/use-map-interactions"
import { usePinsData } from "~/hooks/use-pins-data"
import { PinType, type Location, type LocationGroup } from "@prisma/client"
import { MapControls } from "~/components/map/map-controls"

// Define Pin type for clarity and consistency with Prisma schema
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

function MapDashboardContent() {
    const {
        duplicate,
        manual,
        setManual,
        position,
        setPosition,
        openCreatePinModal,
        openPinDetailModal,
        selectedPinForDetail,
        closePinDetailModal,
        setPrevData,
        isPinCopied,
        isPinCut,
        copiedPinData,
        setIsAutoCollect,
    } = useMapInteractionStore()

    const { setBalance } = useCreatorStorageAcc()
    const {
        mapZoom,
        setMapZoom,
        mapCenter,
        setMapCenter,
        centerChanged,
        setCenterChanged,
        isCordsSearch,
        setIsCordsSearch,
        searchCoordinates,
        setSearchCoordinates,
        cordSearchCords,
        setCordSearchCords,
    } = useMapState()
    const [showExpired, setShowExpired] = useState<boolean>(false)

    const { filterNearbyPins } = useNearbyPinsStore()
    const { selectedPlace: alreadySelectedPlace } = useSelectedAutoSuggestion()

    // Custom hooks for logic separation
    useGeolocation(setMapCenter, setMapZoom)
    usePinsData(showExpired)

    const { handleMapClick, handleZoomIn, handleZoomOut, handleDragEnd } = useMapInteractions({
        setManual,
        setPosition,
        openCreatePinModal,
        openPinDetailModal,
        isPinCopied,
        isPinCut,
        duplicate,
        copiedPinData,
        setMapZoom,
        mapZoom,
        filterNearbyPins,
        centerChanged,
    })

    // Fetch creator storage balances
    api.wallate.acc.getCreatorStorageBallances.useQuery(undefined, {
        onSuccess: (data) => {
            setBalance(data)
        },
        onError: (error) => {
            console.error("Failed to fetch creator storage balances:", error)
        },
        refetchOnWindowFocus: false,
    })

    // Effect for auto-suggestion place selection
    useEffect(() => {
        if (alreadySelectedPlace) {
            const latLng = {
                lat: alreadySelectedPlace.lat,
                lng: alreadySelectedPlace.lng,
            }
            setMapCenter(latLng)
            setMapZoom(13)
            setPosition(latLng)
        }
    }, [alreadySelectedPlace, setMapCenter, setMapZoom, setPosition])

    const handleManualPinClick = () => {
        setManual(true)
        setPosition(undefined)
        setPrevData(undefined)
        openCreatePinModal()
    }

    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY!}>
            <MapHeader
                showExpired={showExpired}
                setShowExpired={setShowExpired}
                onManualPinClick={handleManualPinClick}
                onPlaceSelect={(place) => {
                    setMapCenter({ lat: place.lat, lng: place.lng })
                    setMapZoom(13)
                    setPosition({ lat: place.lat, lng: place.lng })
                    setIsCordsSearch(false)
                }}
                onCenterChange={setMapCenter}
                setIsCordsSearch={setIsCordsSearch}
                setSearchCoordinates={setSearchCoordinates}
                setCordSearchLocation={setCordSearchCords}
                setZoom={setMapZoom}
            />

            <div className="relative h-screen w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/5 via-transparent to-transparent pointer-events-none z-10" />

                <Map
                    onCenterChanged={(center) => {
                        setMapCenter(center.detail.center)
                        setCenterChanged(center.detail.bounds)
                    }}
                    onZoomChanged={(zoom) => {
                        setMapZoom(zoom.detail.zoom)
                    }}
                    onClick={handleMapClick}
                    mapId={"bf51eea910020fa25a"}
                    className="h-full w-full transition-all duration-500 ease-out"
                    defaultCenter={{ lat: 22.54992, lng: 0 }}
                    defaultZoom={3}
                    minZoom={3}
                    zoom={mapZoom}
                    center={mapCenter}
                    gestureHandling={"greedy"}
                    disableDefaultUI={true}
                    onDragend={handleDragEnd}
                >
                    {/* Marker for search coordinates */}
                    {isCordsSearch && searchCoordinates && (
                        <AdvancedMarker position={searchCoordinates}>
                            <div className="animate-bounce">
                                <MapPin className="size-8 text-red-500 drop-shadow-lg" />
                            </div>
                        </AdvancedMarker>
                    )}

                    {/* Marker for manual coordinate search */}
                    {isCordsSearch && cordSearchCords && (
                        <AdvancedMarker position={cordSearchCords}>
                            <div className="animate-bounce">
                                <MapPin className="size-8 text-red-500 drop-shadow-lg" />
                            </div>
                        </AdvancedMarker>
                    )}

                    <MapControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
                    <MyPins
                        onPinClick={(pin) => {
                            openPinDetailModal(pin)
                            setIsAutoCollect(pin.autoCollect)
                        }}
                        showExpired={showExpired}
                    />
                </Map>
            </div>

            <NearbyLocationsPanel
                onSelectPlace={(coords) => {
                    setMapCenter(coords)
                    setMapZoom(13)
                    setPosition(coords)
                }}
            />


            <CreatePinModal />
            <PinDetailAndActionsModal />

        </APIProvider>
    )
}

export default MapDashboardContent

const MyPins = memo(function MyPins({
    onPinClick,
    showExpired,
}: {
    onPinClick: (pin: Pin) => void
    showExpired: boolean
}) {
    const { allPins, setAllPins } = useNearbyPinsStore()
    const pinsQuery = api.maps.pin.getMyPins.useQuery({ showExpired })

    useEffect(() => {
        if (pinsQuery.data) {
            setAllPins(pinsQuery.data)
        }
    }, [pinsQuery.data, setAllPins])

    if (pinsQuery.isLoading) return null

    return (
        <>
            {allPins.map((pin) => {
                const PinIcon = getPinIcon(pin.locationGroup?.type ?? PinType.OTHER)
                const isExpired = pin.locationGroup?.endDate && new Date(pin.locationGroup.endDate) < new Date()
                const isApproved = pin.locationGroup?.approved === true
                const isRemainingZero = pin.locationGroup?.remaining !== undefined && pin.locationGroup?.remaining <= 0

                return (
                    <AdvancedMarker
                        key={pin.id}
                        position={{ lat: pin.latitude, lng: pin.longitude }}
                        onClick={() => {
                            onPinClick(pin)
                        }}
                    >
                        <div
                            className={`relative flex items-center justify-center rounded-full border-3 border-white shadow-xl transition-all duration-300 hover:scale-125 hover:shadow-2xl cursor-pointer group
                ${isExpired ?? isRemainingZero ? "opacity-60 grayscale" : "opacity-100"}
                ${!isApproved ? "bg-slate-500" : "bg-white"}
                transform hover:-translate-y-1
              `}
                        >
                            {!isExpired && !isRemainingZero && isApproved && (
                                <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20" />
                            )}

                            {pin.locationGroup?.creator.profileUrl ? (
                                <Image
                                    src={pin.locationGroup.creator.profileUrl ?? "/placeholder.svg"}
                                    width={32}
                                    height={32}
                                    alt="Creator"
                                    className="h-12 w-12 rounded-full object-cover ring-2 ring-white group-hover:ring-blue-400 transition-all duration-300"
                                />
                            ) : (
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ring-2 ring-white group-hover:ring-blue-400 transition-all duration-300">
                                    <PinIcon className="h-6 w-6 text-gray-600 group-hover:text-blue-600 transition-colors duration-300" />
                                </div>
                            )}

                            {pin._count.consumers > 0 && (
                                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium shadow-lg">
                                    {pin._count.consumers > 99 ? "99+" : pin._count.consumers}
                                </div>
                            )}
                        </div>
                    </AdvancedMarker>
                )
            })}
        </>
    )
})
