"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import type { ChatMessage } from "~/types/pinAgent"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { ScrollArea } from "~/components/shadcn/ui/scroll-area"
import { Loader2, Send, Plus, X, Trash2 } from "lucide-react"
import { api } from "~/utils/api"
import { Dialog, DialogContent } from "../shadcn/ui/dialog"

interface CreatorChatBoxProps {
    creatorId?: string
    isOpen?: boolean
    closeChat: () => void
}

export function PinAgentChatBox({ creatorId, isOpen, closeChat }: CreatorChatBoxProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputValue, setInputValue] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [selectedPins, setSelectedPins] = useState<string[]>([])
    const [showPinSelector, setShowPinSelector] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Fetch creator's pins
    const { data: pins, isLoading: pinsLoading } = api.pinAgent.getCreatorPins.useQuery()

    // Analyze pins mutation
    const analyzeMutation = api.pinAgent.analyzePin.useMutation()

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return

        const userMessage: ChatMessage = {
            role: "user",
            content: inputValue,
            timestamp: new Date(),
        }

        setMessages((prev) => [...prev, userMessage])
        setInputValue("")
        setIsLoading(true)

        try {
            const result = await analyzeMutation.mutateAsync({
                message: inputValue,
                conversationHistory: messages,
                pinIds: selectedPins.length > 0 ? selectedPins : undefined,
            })

            const assistantMessage: ChatMessage = {
                role: "assistant",
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                content: result.response,
                timestamp: new Date(),
            }

            setMessages((prev) => [...prev, assistantMessage])
        } catch (error) {
            const errorMessage: ChatMessage = {
                role: "assistant",
                content: "Sorry, I encountered an error analyzing your pins. Please try again.",
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, errorMessage])
            console.error("Chat error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const togglePinSelection = (pinId: string) => {
        setSelectedPins((prev) => (prev.includes(pinId) ? prev.filter((id) => id !== pinId) : [...prev, pinId]))
    }

    const removePinFromSelection = (pinId: string) => {
        setSelectedPins((prev) => prev.filter((id) => id !== pinId))
    }

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const clearChat = () => {
        setMessages([])
        setSelectedPins([])
    }

    const selectedPinObjects = pins?.filter((pin) => selectedPins.includes(pin.id)) ?? []

    return (
        <Dialog open={isOpen} onOpenChange={closeChat}>
            <DialogContent className="max-w-3xl h-[90vh] w-[95vw] md:w-full p-0 gap-0 rounded-lg flex flex-col [&>button]:hidden">
                {/* Main Chat Area - Full Width */}
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">Pin Intelligence</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                Ask about consumption patterns, performance trends, and more
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {messages.length > 0 && (
                                <Button variant="destructive" size="sm" onClick={clearChat}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                            <Button variant="destructive" size="sm"
                                onClick={closeChat}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <ScrollArea className="flex-1 px-4 py-4 lg:px-6 lg:py-5 overflow-hidden">
                        <div className="space-y-4 max-w-2xl mx-auto w-full">
                            {messages.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-center py-12">
                                    <div>
                                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                            <Plus className="h-6 w-6 text-primary" />
                                        </div>
                                        <h4 className="font-semibold text-sm text-foreground mb-2">Welcome to Pin Intelligence</h4>
                                        <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                                            Select your pins using the <span className="font-medium">+</span> button and ask about consumption
                                            patterns, performance trends, consumer insights, and future predictions.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 ${message.role === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        <div
                                            className={`px-4 py-3 rounded-lg text-sm max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg ${message.role === "user"
                                                ? "bg-primary text-primary-foreground rounded-br-none"
                                                : "bg-muted text-foreground rounded-bl-none"
                                                }`}
                                        >
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <ReactMarkdown>{message.content}</ReactMarkdown>
                                            </div>
                                            {message.timestamp && (
                                                <p className="text-xs opacity-70 mt-2">
                                                    {message.timestamp.toLocaleTimeString([], {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            {isLoading && (
                                <div className="flex gap-3">
                                    <div className="bg-muted px-4 py-3 rounded-lg flex items-center gap-2">
                                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                        <span className="text-xs text-muted-foreground">Analyzing...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={scrollRef} />
                        </div>
                    </ScrollArea>

                    {/* Input Area with Pin Selection */}
                    <div className="px-4 py-3 lg:px-6 lg:py-4 border-t border-border flex-shrink-0">
                        <div className="max-w-2xl mx-auto w-full space-y-3">
                            {selectedPinObjects.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {selectedPinObjects.map((pin) => (
                                        <div
                                            key={pin.id}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs text-foreground"
                                        >
                                            <span className="truncate max-w-[150px]">{pin.title}</span>
                                            <button
                                                onClick={() => removePinFromSelection(pin.id)}
                                                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                                aria-label={`Remove ${pin.title}`}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Input Row */}
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => setShowPinSelector(true)}
                                    disabled={isLoading}
                                    size="sm"
                                    variant="outline"
                                    className="px-3"
                                    title="Add pins"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                                <Input
                                    placeholder="Ask about your pins..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    disabled={isLoading}
                                    className="flex-1 text-sm"
                                />
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={isLoading || !inputValue.trim()}
                                    size="sm"
                                    className="px-3"
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pin Selector Modal */}
                {showPinSelector && (
                    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
                        <div className="bg-background border border-border rounded-lg w-[95vw] md:w-96 max-h-[70vh] md:max-h-[60vh] flex flex-col shadow-lg animate-in fade-in slide-in-from-bottom-4 md:zoom-in-95">
                            {/* Modal Header */}
                            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                                <h3 className="font-semibold text-sm text-foreground">Select Pins</h3>
                                <button
                                    onClick={() => setShowPinSelector(false)}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Pin List */}
                            <ScrollArea className="flex-1 px-3 py-3">
                                {pinsLoading ? (
                                    <div className="flex justify-center items-center py-8">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    </div>
                                ) : pins && pins.length > 0 ? (
                                    <div className="space-y-2">
                                        {pins.map((pin) => (
                                            <button
                                                key={pin.id}
                                                onClick={() => togglePinSelection(pin.id)}
                                                className={`w-full text-left p-3 rounded-lg text-sm transition-all duration-200 ${selectedPins.includes(pin.id)
                                                    ? "bg-primary text-primary-foreground shadow-md"
                                                    : "bg-muted hover:bg-muted/80 text-foreground"
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium truncate text-sm">{pin.title}</div>
                                                        <div className="text-xs opacity-70 mt-1">
                                                            {pin.totalCollections} collection
                                                            {pin.totalCollections !== 1 ? "s" : ""}
                                                        </div>
                                                    </div>
                                                    {selectedPins.includes(pin.id) && (
                                                        <div className="w-5 h-5 rounded-full bg-current flex items-center justify-center flex-shrink-0">
                                                            <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground text-center py-8">No pins found</p>
                                )}
                            </ScrollArea>

                            {/* Modal Footer */}
                            <div className="px-3 py-3 border-t border-border flex-shrink-0 flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs bg-transparent"
                                    onClick={() => setShowPinSelector(false)}
                                >
                                    Done
                                </Button>
                                {selectedPins.length > 0 && (
                                    <div className="text-xs text-muted-foreground flex items-center">{selectedPins.length} selected</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
