"use client";

import { useState } from "react";
import { Copy, MapPin, ChevronDown } from "lucide-react";

interface Location {
    id?: string;
    title: string;
    address?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    mapsLink?: string;
}

interface LocationResultsProps {
    locations: Location[];
    title?: string;
}

export function LocationResults({ locations, title }: LocationResultsProps) {
    console.log("Rendering LocationResults with locations:", locations);
    const [expanded, setExpanded] = useState(false);
    const displayLimit = 5;
    const isLimited = locations.length > displayLimit;
    const displayedLocations = expanded ? locations : locations.slice(0, displayLimit);

    const getCoordinates = (location: Location) => {
        const lat = location.lat || location.latitude;
        const lng = location.lng || location.longitude;
        return { lat, lng };
    };

    const getLocationDisplay = (location: Location) => {
        const parts = [];
        if (location.city) parts.push(location.city);
        if (location.country) parts.push(location.country);
        return parts.join(", ") || "Location";
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!locations.length) {
        return (
            <div className="px-4 py-6 text-center">
                <p className="text-[#8e8e93] text-sm">No locations found</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 px-4">
            {/* Title */}
            {title && (
                <p className="text-white text-sm font-semibold mb-3">{title}</p>
            )}

            {/* Location List */}
            <div className="space-y-2">
                {displayedLocations.map((location, idx) => {
                    const coords = getCoordinates(location);
                    const coordsStr = coords.lat && coords.lng
                        ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
                        : null;
                    const locationDisplay = getLocationDisplay(location);

                    return (
                        <div
                            key={location.id || idx}
                            className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3
                 hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-200"
                        >
                            {/* Title with number */}
                            <div className="flex items-start gap-2 mb-1.5">
                                <span className="text-indigo-400 font-bold text-sm flex-shrink-0 min-w-5">
                                    {idx + 1}.
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-semibold text-sm">
                                        {location.title}
                                    </h3>
                                    <p className="text-[#8e8e93] text-xs mt-0.5">
                                        {locationDisplay}
                                    </p>
                                </div>
                            </div>

                            {/* Address if available */}
                            {location.address && (
                                <p className="text-[#8e8e93] text-xs ml-6 mb-2">
                                    {location.address}
                                </p>
                            )}

                            {/* Coordinates */}
                            {coordsStr && (
                                <div className="flex items-center gap-2 ml-6 mb-2">
                                    <code className="bg-white/[0.04] px-2 py-1 rounded text-xs text-[#a1a1a6] font-mono">
                                        {coordsStr}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(coordsStr)}
                                        className="text-[#8e8e93] hover:text-indigo-400 transition-colors"
                                        title="Copy coordinates"
                                    >
                                        <Copy size={13} />
                                    </button>
                                    {location.mapsLink && (
                                        <a
                                            href={location.mapsLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#8e8e93] hover:text-indigo-400 transition-colors"
                                            title="View on Google Maps"
                                        >
                                            <MapPin size={13} />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Expand Button */}
            {isLimited && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 mt-3
            text-xs font-semibold text-indigo-400 hover:text-indigo-300
            bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.08]
            rounded-lg transition-all"
                >
                    {expanded ? "Show Less" : `Show ${locations.length - displayLimit} More`}
                    <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    />
                </button>
            )}

            {/* Summary */}
            <p className="text-[#636366] text-xs text-center mt-2">
                {displayedLocations.length} of {locations.length} location{locations.length !== 1 ? "s" : ""}
            </p>
        </div>
    );
}
