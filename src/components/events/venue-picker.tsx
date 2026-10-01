"use client"

import { X } from "lucide-react"
import { useRef } from "react"

import { MapPicker } from "~/components/map-kit/map-picker"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { env } from "~/env"
import { Field } from "~/ui/form-page"

export interface Venue {
    venueName: string
    address: string
    latitude: number | null
    longitude: number | null
}

/** Mapbox reverse geocoding: the best address for a point, if any. */
async function addressAt(lat: number, lng: number) {
    const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse")
    url.searchParams.set("latitude", String(lat))
    url.searchParams.set("longitude", String(lng))
    url.searchParams.set("limit", "1")
    url.searchParams.set("access_token", env.NEXT_PUBLIC_MAPBOX_API)
    const res = await fetch(url)
    const data = (await res.json()) as { features?: { properties: { full_address?: string } }[] }
    return data.features?.[0]?.properties.full_address
}

/**
 * Venue fields for an event: search a place or click the map to drop the pin
 * anywhere — the address is filled in by reverse geocoding and stays
 * editable, because "Hall B, 2nd floor" is never what the geocoder says.
 */
export function VenuePicker({ value, onChange }: { value: Venue; onChange: (v: Venue) => void }) {
    const latest = useRef(value)
    latest.current = value
    const pin = value.latitude != null && value.longitude != null ? { lat: value.latitude, lng: value.longitude } : null

    return (
        <div className="space-y-4">
            <MapPicker
                value={pin}
                showInputs={false}
                mapClassName="h-64"
                onPlace={(p) => onChange({ ...latest.current, venueName: latest.current.venueName || p.name, address: p.address ? `${p.name}, ${p.address}` : p.name, latitude: p.lat, longitude: p.lng })}
                onChange={({ lat, lng }) => {
                    onChange({ ...latest.current, latitude: lat, longitude: lng })
                    void addressAt(lat, lng)
                        .then((addr) => {
                            // Only fill it if the pin hasn't moved again meanwhile.
                            if (addr && latest.current.latitude === lat && latest.current.longitude === lng) onChange({ ...latest.current, address: addr })
                        })
                        .catch(() => undefined)
                }}
            />
            {pin && (
                <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, latitude: null, longitude: null })}>
                        <X /> Remove map pin
                    </Button>
                </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Venue name" htmlFor="venue-name">
                    <Input id="venue-name" value={value.venueName} maxLength={120} placeholder="The Warehouse" onChange={(e) => onChange({ ...value, venueName: e.target.value })} />
                </Field>
                <Field label="Address" htmlFor="venue-address">
                    <Input id="venue-address" value={value.address} maxLength={300} placeholder="Street, city" onChange={(e) => onChange({ ...value, address: e.target.value })} />
                </Field>
            </div>
        </div>
    )
}
