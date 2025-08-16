import type { MapMouseEvent } from "@vis.gl/react-google-maps" // Correct import for MapMouseEvent
import type { Location, LocationGroup } from "@prisma/client" // Import PinType and other types
// Define Pin type locally for clarity, or import from map-stores if it's the canonical source
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

interface UseMapInteractionsProps {
    setManual: (value: boolean) => void
    setPosition: (pos: google.maps.LatLngLiteral | undefined) => void
    openCreatePinModal: () => void
    openPinDetailModal: (pin: Pin) => void // Expects a full Pin object
    isPinCopied: boolean
    isPinCut: boolean
    copiedPinData: Pin | null // Updated to expect Pin | null
    setMapZoom: (zoom: number) => void
    mapZoom: number
    filterNearbyPins: (center: google.maps.LatLngBoundsLiteral) => void
    centerChanged: google.maps.LatLngBoundsLiteral | null
}

export function useMapInteractions({
    setManual,
    setPosition,
    openCreatePinModal,
    openPinDetailModal,
    isPinCopied,
    isPinCut,
    copiedPinData, // Use copiedPinData
    setMapZoom,
    mapZoom,
    filterNearbyPins,
    centerChanged,
}: UseMapInteractionsProps) {
    const handleMapClick = (event: MapMouseEvent) => {
        // Corrected type here
        setManual(false)
        const position = event.detail.latLng
        if (position) {
            setPosition(position)
            if (!isPinCopied && !isPinCut) {
                openCreatePinModal()
            } else if (isPinCopied || isPinCut) {
                if (copiedPinData) {
                    // Create a new Pin object with updated coordinates
                    const newPin: Pin = {
                        ...copiedPinData,
                        latitude: position.lat,
                        longitude: position.lng,
                        // If locationGroup is not null, update its properties if necessary
                        locationGroup: copiedPinData.locationGroup
                            ? {
                                ...copiedPinData.locationGroup,
                                // Potentially update title/description if it's a "paste as new" scenario
                                // For now, just using the original locationGroup data
                            }
                            : null,
                    }
                    openPinDetailModal(newPin)
                }
            }
        }
    }

    // Then your handlers work as expected
    const handleZoomIn = () => {
        setMapZoom(Math.min(mapZoom + 1, 20));
    };

    const handleZoomOut = () => {
        setMapZoom(Math.max(mapZoom - 1, 3));
    };
    const handleDragEnd = () => {
        if (centerChanged) {
            filterNearbyPins(centerChanged)
        }
    }

    return { handleMapClick, handleZoomIn, handleZoomOut, handleDragEnd }
}
