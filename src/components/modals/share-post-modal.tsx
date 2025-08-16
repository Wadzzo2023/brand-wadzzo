"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { FacebookShareButton, TwitterShareButton, WhatsappShareButton, TelegramShareButton } from "next-share"
import { FaXTwitter } from "react-icons/fa6"
import { Check, Copy, Link } from "lucide-react"
import { cn } from "~/lib/utils"
import { env } from "~/env"
type ShareModalProps = {
    isOpen: boolean
    setIsOpen: (value: boolean) => void
    data: string
}

const ShareModal = ({ isOpen, setIsOpen, data }: ShareModalProps) => {

    const [copied, setCopied] = useState(false)

    const handleClose = () => {
        setIsOpen(false)
    }

    const fullUrl = `${env.NEXT_PUBLIC_ASSET_CODE?.toLocaleLowerCase() === "wadzzo" ? "https://app.wadzzo.com" :
        env.NEXT_PUBLIC_ASSET_CODE === "bandcoin" ? "https://bandcoin.io" : "https://app.action-tokens.com"
        }${data}`

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy text: ", err)
        }
    }

    const socialButtons = [
        {
            Component: FacebookShareButton,
            props: {
                url: fullUrl,
                quote: "Checkout my post on Wadzzo",
                hashtag: `#${env.NEXT_PUBLIC_ASSET_CODE?.toLocaleLowerCase() === "wadzzo" ? "Wadzzo" : env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "bandcoin" ? "Bandcoin" : "ACTIONVERSE"}`,
            },
            icon: (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    className="transition-all duration-300"
                >
                    <path d="M13.397 20.997v-8.196h2.765l.411-3.209h-3.176V7.548c0-.926.258-1.56 1.587-1.56h1.684V3.127A22.336 22.336 0 0 0 14.201 3c-2.444 0-4.122 1.492-4.122 4.231v2.355H7.332v3.209h2.753v8.202h3.312z"></path>
                </svg>
            ),
            bgHover: "hover:bg-[#1877f2]",
            fill: "fill-[#1877f2]",
            shadow: "shadow-blue-500/50",
        },
        {
            Component: TwitterShareButton,
            props: {
                url: fullUrl,
                title: `Checkout my post on ${env.NEXT_PUBLIC_ASSET_CODE?.toLocaleLowerCase() === "wadzzo" ? "Wadzzo" : env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "bandcoin" ? "Bandcoin" : "ACTIONVERSE"}`,
            },
            icon: <FaXTwitter className="transition-all duration-300" />,
            bgHover: "hover:bg-[#1d9bf0]",
            fill: "fill-[#1d9bf0]",
            shadow: "shadow-sky-500/50",
        },
        {
            Component: WhatsappShareButton,
            props: {
                url: fullUrl,
                title: `Checkout my post on ${env.NEXT_PUBLIC_ASSET_CODE?.toLocaleLowerCase() === "wadzzo" ? "Wadzzo" : env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "bandcoin" ? "Bandcoin" : "ACTIONVERSE"}`,
                separator: ":: ",
            },
            icon: (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    className="transition-all duration-300"
                >
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M18.403 5.633A8.919 8.919 0 0 0 12.053 3c-4.948 0-8.976 4.027-8.978 8.977 0 1.582.413 3.126 1.198 4.488L3 21.116l4.759-1.249a8.981 8.981 0 0 0 4.29 1.093h.004c4.947 0 8.975-4.027 8.977-8.977a8.926 8.926 0 0 0-2.627-6.35m-6.35 13.812h-.003a7.446 7.446 0 0 1-3.798-1.041l-.272-.162-2.824.741.753-2.753-.177-.282a7.448 7.448 0 0 1-1.141-3.971c.002-4.114 3.349-7.461 7.465-7.461a7.413 7.413 0 0 1 5.275 2.188 7.42 7.42 0 0 1 2.183 5.279c-.002 4.114-3.349 7.462-7.461 7.462m4.093-5.589c-.225-.113-1.327-.655-1.533-.73-.205-.075-.354-.112-.504.112s-.58.729-.711.879-.262.168-.486.056-.947-.349-1.804-1.113c-.667-.595-1.117-1.329-1.248-1.554s-.014-.346.099-.458c.101-.1.224-.262.336-.393.112-.131.149-.224.224-.374s.038-.281-.019-.393c-.056-.113-.505-1.217-.692-1.666-.181-.435-.366-.377-.504-.383a9.65 9.65 0 0 0-.429-.008.826.826 0 0 0-.599.28c-.206.225-.785.767-.785 1.871s.804 2.171.916 2.321c.112.15 1.582 2.415 3.832 3.387.536.231.954.369 1.279.473.537.171 1.026.146 1.413.089.431-.064 1.327-.542 1.514-1.066.187-.524.187-.973.131-1.067-.056-.094-.207-.151-.43-.263"
                    ></path>
                </svg>
            ),
            bgHover: "hover:bg-[#25D366]",
            fill: "fill-[#25D366]",
            shadow: "shadow-green-500/50",
        },
        {
            Component: TelegramShareButton,
            props: {
                url: fullUrl,
                title: `Checkout my post on ${env.NEXT_PUBLIC_ASSET_CODE?.toLocaleLowerCase() === "wadzzo" ? "Wadzzo" : env.NEXT_PUBLIC_ASSET_CODE.toLocaleLowerCase() === "bandcoin" ? "Bandcoin" : "ACTIONVERSE"}`,
            },
            icon: (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    className="transition-all duration-300"
                >
                    <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"></path>
                </svg>
            ),
            bgHover: "hover:bg-[#229ED9]",
            fill: "fill-[#229ED9]",
            shadow: "shadow-sky-500/50",
        },
    ]

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog open={isOpen} onOpenChange={handleClose}>
                    <DialogContent className="w-full max-w-md rounded-xl border-none bg-white p-0 shadow-2xl sm:max-w-md">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden rounded-xl"
                        >
                            <DialogHeader className="border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4">
                                <DialogTitle className="text-center text-xl font-bold text-gray-800">Share on Social Media</DialogTitle>
                            </DialogHeader>

                            <div className="px-6 py-5">
                                <p className="mb-4 text-sm font-medium text-gray-600">Share this link via</p>

                                <motion.div
                                    className="mb-6 flex justify-around"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.1, staggerChildren: 0.1 }}
                                >
                                    {socialButtons.map((social, index) => {
                                        const { Component, props, icon, bgHover, fill, shadow } = social
                                        return (
                                            <motion.div
                                                key={index}
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ delay: index * 0.1 }}
                                            >
                                                <Component {...props}>
                                                    <div
                                                        className={cn(
                                                            "flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-2 border-gray-100",
                                                            fill,
                                                            "shadow-lg transition-all duration-300",
                                                            bgHover,
                                                            "hover:fill-white hover:scale-110",
                                                            `hover:${shadow}`,
                                                        )}
                                                    >
                                                        {icon}
                                                    </div>
                                                </Component>
                                            </motion.div>
                                        )
                                    })}
                                </motion.div>

                                <p className="mb-3 text-sm font-medium text-gray-600">Or copy link</p>

                                <motion.div
                                    className="flex items-center overflow-hidden rounded-lg border-2 border-gray-100 bg-gray-50"
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    <div className="flex h-full items-center px-3 text-gray-400">
                                        <Link className="h-4 w-4" />
                                    </div>

                                    <input
                                        className="w-full bg-transparent py-3 px-2 text-sm text-gray-700 outline-none"
                                        type="text"
                                        readOnly
                                        value={fullUrl}
                                        aria-label="Share link"
                                    />

                                    <motion.button
                                        className={cn(
                                            "flex h-full items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-white transition-all",
                                            copied ? "bg-green-500" : "bg-indigo-500 hover:bg-indigo-600",
                                        )}
                                        onClick={handleCopy}
                                        whileTap={{ scale: 0.95 }}
                                        aria-label={copied ? "Copied" : "Copy link"}
                                    >
                                        <motion.span
                                            initial={false}
                                            animate={{
                                                rotate: copied ? 0 : 360,
                                                scale: [1, 1.2, 1],
                                            }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </motion.span>
                                        {copied ? "Copied!" : "Copy"}
                                    </motion.button>
                                </motion.div>
                            </div>
                        </motion.div>
                    </DialogContent>
                </Dialog>
            )}
        </AnimatePresence>
    )
}

export default ShareModal

