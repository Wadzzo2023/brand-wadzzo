"use client"

import { useCallback, useRef, useState } from "react"

export function useMapState() {
    const currentZoomRef = useRef(3)

    const [centerCommand, setCenterCommand] = useState<{
        center: google.maps.LatLngLiteral
        version: number
    }>({
        center: { lat: 22.54992, lng: 0 },
        version: 0,
    })

    const [zoomCommand, setZoomCommand] = useState<{
        zoom: number
        version: number
    }>({
        zoom: 3,
        version: 0,
    })

    const setMapCenter = useCallback((center: google.maps.LatLngLiteral) => {
        setCenterCommand(prev => ({ center, version: prev.version + 1 }))
    }, [])

    const setMapZoom = useCallback((zoom: number) => {
        currentZoomRef.current = zoom
        setZoomCommand(prev => ({ zoom, version: prev.version + 1 }))
    }, [])

    const trackZoom = useCallback((zoom: number) => {
        currentZoomRef.current = zoom
    }, [])

    const [centerChanged, setCenterChanged] = useState<google.maps.LatLngBoundsLiteral | null>(null)
    const [isCordsSearch, setIsCordsSearch] = useState<boolean>(false)
    const [searchCoordinates, setSearchCoordinates] = useState<google.maps.LatLngLiteral | undefined>()
    const [cordSearchCords, setCordSearchCords] = useState<google.maps.LatLngLiteral | undefined>()

    return {
        centerCommand,
        zoomCommand,
        currentZoomRef,
        setMapCenter,
        setMapZoom,
        trackZoom,
        centerChanged,
        setCenterChanged,
        isCordsSearch,
        setIsCordsSearch,
        searchCoordinates,
        setSearchCoordinates,
        cordSearchCords,
        setCordSearchCords,
    }
}
