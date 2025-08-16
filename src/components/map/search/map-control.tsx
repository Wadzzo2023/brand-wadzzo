"use client"

import React, { useState, useRef, useEffect } from "react"
import type { Input } from "~/components/shadcn/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "~/components/shadcn/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/shadcn/ui/popover"
import { useMapsLibrary } from "@vis.gl/react-google-maps"

interface CustomMapControlProps {
    children: React.ReactNode // The Input component from shadcn/ui
    onPlaceSelect: (place: { lat: number; lng: number }) => void
    onCenterChange: (center: google.maps.LatLngLiteral) => void
    setIsCordsSearch: (value: boolean) => void
    setSearchCoordinates: (coords: google.maps.LatLngLiteral | undefined) => void
    setCordSearchLocation: (coords: google.maps.LatLngLiteral | undefined) => void
    setZoom: (zoom: number) => void
}

export function CustomMapControl({
    children,
    onPlaceSelect,
    onCenterChange,
    setIsCordsSearch,
    setSearchCoordinates,
    setCordSearchLocation,
    setZoom,
}: CustomMapControlProps) {
    const [inputValue, setInputValue] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)
    const places = useMapsLibrary("places")
    const [placeAutocomplete, setPlaceAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)

    // Initialize Google Places Autocomplete
    useEffect(() => {
        if (!places || !inputRef.current) return

        const options = {
            fields: ["geometry", "name", "formatted_address"],
        }
        setPlaceAutocomplete(new places.Autocomplete(inputRef.current, options))
    }, [places])

    // Listen for place_changed event
    useEffect(() => {
        if (!placeAutocomplete) return

        placeAutocomplete.addListener("place_changed", () => {
            const place = placeAutocomplete.getPlace()
            if (place?.geometry?.location) {
                const lat = place.geometry.location.lat()
                const lng = place.geometry.location.lng()
                const latLng = { lat, lng }

                onPlaceSelect(latLng) // Callback for selected place
                setInputValue(place.formatted_address ?? place.name ?? "") // Update input with formatted address
                onCenterChange(latLng) // Center map on selected place
                setZoom(16) // Zoom in closer
                setIsCordsSearch(false) // Not a coordinate search
                setSearchCoordinates(undefined)
                setCordSearchLocation(undefined)
            }
        })
    }, [
        onPlaceSelect,
        placeAutocomplete,
        onCenterChange,
        setZoom,
        setIsCordsSearch,
        setSearchCoordinates,
        setCordSearchLocation,
    ])

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(event.target.value)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault() // Prevent form submission if it's part of a form
            handleCoordinatesInput()
        }
    }

    const handleBlur = () => {
        // Trigger coordinate input parsing if the user types coordinates and blurs
        handleCoordinatesInput()
    }

    const handleCoordinatesInput = () => {
        const value = inputValue.trim()
        const parts = value.split(",").map((str) => str.trim())

        if (parts.length === 2) {
            const lat = Number(parts[0])
            const lng = Number(parts[1])

            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                const latLng: google.maps.LatLngLiteral = { lat, lng }
                onCenterChange(latLng)
                setIsCordsSearch(true)
                setCordSearchLocation(latLng)
                setSearchCoordinates(latLng) // Set search coordinates for marker
                setZoom(16)
                return // Exit if coordinates were successfully parsed
            }
        }
        // If it's not valid coordinates, let the Autocomplete widget handle it
    }

    // Clone the children (Input) to inject ref, onChange, onKeyDown, and onBlur
    const inputElement = React.Children.only(children) as React.ReactElement<React.ComponentProps<typeof Input>>

    return React.cloneElement(inputElement, {
        ref: inputRef,
        value: inputValue,
        onChange: handleInputChange,
        onKeyDown: handleKeyDown,
        onBlur: handleBlur,
        // The Google Autocomplete widget will handle its own popover/dropdown UI
    })
}
