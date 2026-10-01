"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Trash2, Edit, Share2 } from "lucide-react"
import { cn } from "~/lib/utils"

interface ContextMenuProps {
    handleDelete?: () => void
    handleEdit?: () => void
    handleShare?: () => void
    isLoading?: boolean
    bg?: string
    position?: "left" | "right"
    items?: {
        icon: React.ReactNode
        label: string
        onClick: () => void
        danger?: boolean
        disabled?: boolean
    }[]
}

export default function ContextMenu({
    handleDelete,
    handleEdit,
    handleShare,
    isLoading = false,
    bg = "bg-white",
    position = "right",
    items,
}: ContextMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    // Default menu items if none provided
    const defaultItems = [
        ...(handleEdit
            ? [
                {
                    icon: <Edit size={16} />,
                    label: "Edit",
                    onClick: handleEdit,
                    danger: false,
                },
            ]
            : []),
        ...(handleShare
            ? [
                {
                    icon: <Share2 size={16} />,
                    label: "Share",
                    onClick: handleShare,
                    danger: false,
                },
            ]
            : []),
        ...(handleDelete
            ? [
                {
                    icon: <Trash2 size={16} />,
                    label: "Delete",
                    onClick: handleDelete,
                    danger: true,
                    disabled: isLoading,
                },
            ]
            : []),
    ]

    const menuItems = items ?? defaultItems

    return (
        <div className="relative" ref={menuRef}>
            <motion.button
                whileTap={{ scale: 0.9 }}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Menu"
            >
                <MoreHorizontal size={18} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className={cn(
                            "absolute z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border shadow-lg",
                            bg,
                            position === "left" ? "left-0" : "right-0",
                        )}
                    >
                        <ul className="py-1">
                            {menuItems.map((item, index) => (
                                <motion.li
                                    key={index}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <button
                                        onClick={() => {
                                            if (!item.disabled) {
                                                item.onClick()
                                                setIsOpen(false)
                                            }
                                        }}
                                        disabled={item.disabled}
                                        className={cn(
                                            "flex w-full items-center px-4 py-2 text-sm transition-colors",
                                            item.danger
                                                ? "text-destructive hover:bg-destructive/10"
                                                : "text-foreground hover:bg-muted",
                                            item.disabled && "cursor-not-allowed opacity-50",
                                        )}
                                    >
                                        <span className="mr-2">
                                            {isLoading && item.danger ? (
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                                                    className="h-4 w-4"
                                                >
                                                    <svg
                                                        className="h-4 w-4 text-destructive"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <circle
                                                            className="opacity-25"
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        ></circle>
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                        ></path>
                                                    </svg>
                                                </motion.div>
                                            ) : (
                                                item.icon
                                            )}
                                        </span>
                                        {item.label}
                                    </button>
                                </motion.li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

