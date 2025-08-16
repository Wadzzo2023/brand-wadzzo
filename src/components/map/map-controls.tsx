"use client"
import { Plus, Minus, Navigation, RotateCcw } from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"

interface MapControlsProps {
    onZoomIn: () => void
    onZoomOut: () => void
}

export function MapControls({ onZoomIn, onZoomOut }: MapControlsProps) {
    return (
        <div className="absolute top-24 right-4 z-20 flex flex-col gap-3">
            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/30 p-2 space-y-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-10 h-10 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 hover:scale-105"
                    onClick={onZoomIn}
                    aria-label="Zoom in"
                >
                    <Plus className="w-5 h-5" />
                </Button>
                <div className="h-px bg-gray-200 mx-2" />
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-10 h-10 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 hover:scale-105"
                    onClick={onZoomOut}
                    aria-label="Zoom out"
                >
                    <Minus className="w-5 h-5" />
                </Button>
            </div>
        </div>
    )
}
