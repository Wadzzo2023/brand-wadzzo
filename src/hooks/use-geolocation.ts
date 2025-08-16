"use client"

import { useEffect } from "react"
import toast from "react-hot-toast"

type SetMapCenter = (center: google.maps.LatLngLiteral) => void
type SetMapZoom = (zoom: number) => void

export function useGeolocation(setMapCenter: SetMapCenter, setMapZoom: SetMapZoom) {
    useEffect(() => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported by your browser.")
            return
        }

        const handleSuccess = (position: GeolocationPosition) => {
            setMapCenter({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            })
            setMapZoom(13) // Zoom in closer to the user's location
        }

        const handleError = (error: GeolocationPositionError) => {
            console.error("Geolocation error:", error)
            toast.error("Permission to access location was denied or an error occurred.")
        }

        navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
        })
    }, [setMapCenter, setMapZoom])
}
