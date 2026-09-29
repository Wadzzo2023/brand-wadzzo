"use client"

import { APIProvider, Map, Marker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
import { Loader2, MapPin, Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Input } from "~/components/shadcn/ui/input"

export interface Venue {
    venueName: string
    address: string
    latitude: number | null
    longitude: number | null
}

/**
 * Venue fields for an event: search a place (Google Places), or click the map
 * to drop the pin anywhere — the address is filled in by reverse geocoding
 * and stays editable, because "Hall B, 2nd floor" is never what Google says.
 */
export function VenuePicker({ value, onChange }: { value: Venue; onChange: (v: Venue) => void }) {
    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY!}>
            <VenuePickerInner value={value} onChange={onChange} />
        </APIProvider>
    )
}

function VenuePickerInner({ value, onChange }: { value: Venue; onChange: (v: Venue) => void }) {
    const places = useMapsLibrary("places")
    const geocoding = useMapsLibrary("geocoding")
    const inputRef = useRef<HTMLInputElement>(null)
    const [resolving, setGeocoding] = useState(false)
    const latest = useRef(value)
    latest.current = value

    const hasPin = value.latitude != null && value.longitude != null
    const pin = hasPin ? { lat: value.latitude!, lng: value.longitude! } : null

    useEffect(() => {
        if (!places || !inputRef.current) return
        const ac = new places.Autocomplete(inputRef.current, {
            fields: ["geometry", "name", "formatted_address"],
        })
        const listener = ac.addListener("place_changed", () => {
            const place = ac.getPlace()
            const loc = place.geometry?.location
            if (!loc) return
            onChange({
                venueName: place.name ?? latest.current.venueName,
                address: place.formatted_address ?? "",
                latitude: loc.lat(),
                longitude: loc.lng(),
            })
            if (inputRef.current) inputRef.current.value = ""
        })
        return () => listener.remove()
        // onChange is recreated by the parent each render; `latest` covers it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [places])

    const dropPin = (lat: number, lng: number) => {
        onChange({ ...latest.current, latitude: lat, longitude: lng })
        if (!geocoding) return
        setGeocoding(true)
        new geocoding.Geocoder()
            .geocode({ location: { lat, lng } })
            .then((res) => {
                const addr = res.results[0]?.formatted_address
                if (addr) onChange({ ...latest.current, latitude: lat, longitude: lng, address: addr })
            })
            .catch(() => undefined)
            .finally(() => setGeocoding(false))
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    placeholder="Search for a venue or address"
                    className="pl-9"
                    onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                />
            </div>

            <div className="relative h-[220px] overflow-hidden rounded-xl border">
                <Map
                    defaultCenter={pin ?? { lat: 39.5, lng: -98.35 }}
                    defaultZoom={pin ? 15 : 3}
                    gestureHandling="greedy"
                    disableDefaultUI
                    zoomControl
                    clickableIcons={false}
                    onClick={(e) => {
                        const ll = e.detail.latLng
                        if (ll) dropPin(ll.lat, ll.lng)
                    }}
                    className="h-full w-full"
                >
                    {pin && (
                        <Marker
                            position={pin}
                            draggable
                            onDragEnd={(e) => {
                                const ll = e.latLng
                                if (ll) dropPin(ll.lat(), ll.lng())
                            }}
                        />
                    )}
                    <FollowPin pin={pin} />
                </Map>
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
                    {resolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                    {pin ? "Drag the pin or click to move it" : "Click the map to drop the venue pin"}
                </div>
                {pin && (
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, latitude: null, longitude: null })}
                        className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium shadow hover:bg-background"
                    >
                        <X className="h-3 w-3" /> Remove pin
                    </button>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Input
                    placeholder="Venue name (e.g. Riverside Park)"
                    value={value.venueName}
                    maxLength={120}
                    onChange={(e) => onChange({ ...value, venueName: e.target.value })}
                />
                <Input
                    placeholder="Address"
                    value={value.address}
                    maxLength={300}
                    onChange={(e) => onChange({ ...value, address: e.target.value })}
                />
            </div>
        </div>
    )
}

/** Pans to the pin when it's set from search, without fighting manual pans. */
function FollowPin({ pin }: { pin: { lat: number; lng: number } | null }) {
    const map = useMap()
    const key = pin ? `${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}` : ""
    const last = useRef("")
    useEffect(() => {
        if (!map || !pin || key === last.current) return
        last.current = key
        map.panTo(pin)
        if ((map.getZoom() ?? 0) < 13) map.setZoom(15)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, key])
    return null
}
