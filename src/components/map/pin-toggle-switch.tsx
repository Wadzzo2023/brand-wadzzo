"use client"
import { Eye, EyeOff } from "lucide-react"
import { Label } from "~/components/shadcn/ui/label"
import { Switch } from "~/components/shadcn/ui/switch"
import { Card } from "~/components/shadcn/ui/card"

interface PinToggleSwitchProps {
    showExpired: boolean
    setShowExpired: (value: boolean) => void
}

export function PinToggleSwitch({ showExpired, setShowExpired }: PinToggleSwitchProps) {
    return (
        <div className="items-center gap-2 hidden md:flex">
            <Card className="bg-white/90  backdrop-blur-md border border-white/30 rounded-2xl p-3 shadow-xl pointer-events-auto transition-all duration-300 hover:bg-white/95">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        {showExpired ? <Eye className="h-4 w-4 text-blue-600" /> : <EyeOff className="h-4 w-4 text-gray-500" />}
                        <Label htmlFor="pin-toggle" className="text-sm font-medium text-gray-800 cursor-pointer">
                            Show Expired
                        </Label>
                    </div>
                    <Switch
                        id="pin-toggle"
                        checked={showExpired}
                        onCheckedChange={setShowExpired}
                        className="data-[state=checked]:bg-blue-600"
                    />
                </div>


            </Card>
        </div>
    )
}
