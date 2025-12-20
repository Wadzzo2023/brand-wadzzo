"use client"

import { memo, useEffect, useState } from "react"
import { APIProvider, AdvancedMarker, Map, Marker } from "@vis.gl/react-google-maps"
import { useMapInteractionStore, useNearbyPinsStore } from "~/store/map-stores"
import { useSelectedAutoSuggestion } from "~/hooks/use-selectedAutoSuggestion"
import { useCreatorStorageAcc } from "~/lib/state/wallete/stellar-balances"
import { api } from "~/utils/api"
import { MapPin } from "lucide-react"
import Image from "next/image"
import { MapHeader } from "~/components/map/map-header"
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel"
import { getPinIcon } from "~/utils/map-helpers"
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal"
import { useGeolocation } from "~/hooks/use-geolocation"
import { useMapState } from "~/hooks/use-map-state"
import { useMapInteractions } from "~/hooks/use-map-interactions"
import { PinType, type Location, type LocationGroup } from "@prisma/client"
import { MapControls } from "~/components/map/map-controls"
import AgentChat from "~/components/agent/AgentChat"
import { useSelectCreatorStore } from "~/components/store/creator-selection-store"
import CreateAdminPinModal from "~/components/modals/create-admin-pin-modal"

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

function AdminMapDashboardContent() {
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

    const { filterNearbyPins, clearAdminPins } = useNearbyPinsStore()
    const { selectedPlace: alreadySelectedPlace } = useSelectedAutoSuggestion()

    // Custom hooks for logic separation
    useGeolocation(setMapCenter, setMapZoom)

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
        filterNearbyPins: (bounds) => filterNearbyPins(bounds, "admin"),
        centerChanged,
    })
    const { data: selectedCreator } = useSelectCreatorStore()

    useEffect(() => {
        return () => {
            clearAdminPins()
        }
    }, [clearAdminPins])

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

    useEffect(() => {
        if (position) {
            setMapCenter(position)
            setMapZoom(14)
        }
    }, [position])

    useEffect(() => {
        console.log(selectedCreator)
    }, [selectedCreator])

    const handleManualPinClick = () => {
        setManual(true)
        setPosition(undefined)
        setPrevData(undefined)
        openCreatePinModal()
    }

    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY!}>
            <MapHeader
                key="map-header"
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
                showCreatorList={true}
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
                    {position && !isCordsSearch && <Marker position={{ lat: position.lat, lng: position.lng }} />}
                    {isCordsSearch && searchCoordinates && (
                        <AdvancedMarker position={searchCoordinates}>
                            <div className="animate-bounce">
                                <MapPin className="size-8 text-red-500 drop-shadow-lg" />
                            </div>
                        </AdvancedMarker>
                    )}

                    {isCordsSearch && cordSearchCords && (
                        <AdvancedMarker position={cordSearchCords}>
                            <div className="animate-bounce">
                                <MapPin className="size-8 text-red-500 drop-shadow-lg" />
                            </div>
                        </AdvancedMarker>
                    )}

                    <MapControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
                    {selectedCreator && (
                        <CreatorPins
                            onPinClick={(pin) => {
                                openPinDetailModal(pin)
                                setIsAutoCollect(pin.autoCollect)
                            }}
                            creatorId={selectedCreator.id}
                            showExpired={showExpired}
                        />
                    )}
                </Map>
            </div>

            <NearbyLocationsPanel
                onSelectPlace={(coords) => {
                    setMapCenter(coords)
                    setMapZoom(13)
                    setPosition(coords)
                }}
            />

            {selectedCreator && <CreateAdminPinModal />}
            <PinDetailAndActionsModal />
            {selectedCreator && <AgentChat />}
        </APIProvider>
    )
}

export default AdminMapDashboardContent

const CreatorPins = memo(function CreatorPins({
    onPinClick,
    showExpired,
    creatorId,
}: {
    onPinClick: (pin: Pin) => void
    showExpired: boolean
    creatorId: string
}) {
    const { data: selectedCreator } = useSelectCreatorStore()
    const { adminPins, setAdminPins } = useNearbyPinsStore()
    const adminPinsQuery = api.maps.pin.getCreatorPins.useQuery({
        creator_id: selectedCreator ? selectedCreator.id : "",
        showExpired: showExpired,
    })

    useEffect(() => {
        // Clear pins while loading a new creator's pins to avoid stale markers
        if (adminPinsQuery.isLoading) {
            setAdminPins([])
            return
        }

        // When data arrives (or becomes empty), update the store so markers refresh
        if (adminPinsQuery.data) {
            setAdminPins(adminPinsQuery.data)
        } else {
            setAdminPins([])
        }
    }, [adminPinsQuery.data, adminPinsQuery.isLoading, setAdminPins, selectedCreator])
    // - Expired/Unapproved: opacity-50
    // - Auto-Collect: Square (rounded-none)
    // - Manual: Rounded (rounded-full)
    // - Approved: opacity-100
    // - Deleted/Hidden: border-red, opacity-40
    return (
        <>
            {adminPins.map((pin) => {
                const PinIcon = getPinIcon(pin.locationGroup?.type ?? PinType.OTHER)

                // Pin state calculations
                const isExpired = (pin.locationGroup?.endDate && new Date(pin.locationGroup.endDate) < new Date()) ?? false
                const isApproved = pin.locationGroup?.approved === true
                const isRemainingZero = pin.locationGroup?.remaining !== undefined && pin.locationGroup?.remaining <= 0
                const isHidden = pin.hidden === true
                const isAutoCollect = pin.autoCollect === true

                // Determine pin state
                const isInactive = isExpired || isRemainingZero || !isApproved
                const showAnimation = !isExpired && !isRemainingZero && isApproved && !isHidden

                // Build class names based on state
                const baseClasses = "relative flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-125 hover:shadow-2xl cursor-pointer group transform hover:-translate-y-1"

                const opacityClasses = isHidden
                    ? "opacity-40"
                    : isInactive
                        ? "opacity-50"
                        : "opacity-100"

                const shapeClasses = isAutoCollect ? "rounded-none" : "rounded-full"

                const borderClasses = isHidden
                    ? "border-dashed border-red-500 border-2"
                    : isApproved
                        ? "ring-2 ring-green-400"
                        : ""

                const filterClasses = isInactive && !isHidden ? "grayscale" : ""

                const bgClasses = !isApproved && !isHidden ? "bg-gray-500" : "bg-white/80 hover:bg-white/100"

                return (
                    <AdvancedMarker
                        key={pin.id}
                        position={{ lat: pin.latitude, lng: pin.longitude }}
                        onClick={() => onPinClick(pin)}
                    >
                        <div
                            className={`${baseClasses} ${opacityClasses} ${shapeClasses} ${borderClasses} ${filterClasses} ${bgClasses}`}
                        >
                            {/* Ping animation for active approved pins */}
                            {showAnimation && (
                                <div
                                    className={`absolute inset-0 bg-blue-400 animate-ping opacity-20 ${shapeClasses}`}
                                />
                            )}

                            {/* Pin icon or creator image */}
                            {pin.locationGroup?.creator.profileUrl ? (
                                <Image
                                    src={pin.locationGroup.creator.profileUrl ?? "/placeholder.svg"}
                                    width={32}
                                    height={32}
                                    alt="Creator"
                                    className={`h-12 w-12 ${shapeClasses} object-cover ring-2  transition-all duration-300`}
                                />
                            ) : (
                                <div className={`h-12 w-12 ${shapeClasses} bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ring-2  transition-all duration-300`}>
                                    <PinIcon className="h-6 w-6 text-gray-600  transition-colors duration-300" />
                                </div>
                            )}

                            {/* Consumer count badge */}
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
