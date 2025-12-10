"use client"

import { useEffect, useState } from "react"
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
            setMapZoom(13)
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

export function useReverseGeolocation(lat: number, lng: number) {
    const [address, setAddress] = useState<string>('Loading address...')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchAddress = async () => {
            setLoading(true)
            const result = await reverseGeocode(lat, lng)
            setAddress(result)
            setLoading(false)
        }

        fetchAddress()
    }, [lat, lng])

    return { address, loading }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_API}`
        )

        if (!response.ok) {
            throw new Error('Mapbox API error')
        }

        const data = await response.json() as {
            features: { place_name: string }[];
        }
        const address = data.features?.[0]?.place_name ?? 'Address not found'

        return address
    } catch (error) {
        console.error('Error fetching address:', error)
        return 'Address unavailable'
    }
}
