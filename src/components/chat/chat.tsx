"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardHeader, CardContent, CardFooter } from '~/components/shadcn//ui/card'
import { Loader2, Paperclip, Plus, Search, Send, Trash } from "lucide-react"
import { UserRole } from "@prisma/client"
import { cn } from "~/lib/utils"
import { z } from "zod"
import Link from "next/link"
import { MultiUploadS3Button } from "../common/upload-button"
import { api } from "~/utils/api"
import { addrShort } from "~/utils/utils"

import type { MutableRefObject } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar"
import { ScrollArea } from "../shadcn/ui/scroll-area"
import { Input } from "../shadcn/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { Button } from "~/components/shadcn/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/shadcn/ui/dialog"
import CustomAvatar from "../common/custom-avatar"
import { motion } from "framer-motion"
import { toast } from "../shadcn/ui/use-toast"
type BountyDoubtListItem = {
    id: number
    bountyId: number
    userId: string
    createdAt: Date
    user: {
        name: string | null
        id: string
        image: string | null
        email: string | null
    }
}

type Message = {
    role: UserRole
    message: string
}

export const SubmissionMediaInfo = z.object({
    url: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
})
type SubmissionMediaInfoType = z.TypeOf<typeof SubmissionMediaInfo>


const Chat = ({ bountyId }: { bountyId: number }) => {
    const { data: listBountyDoubt } = api.bounty.Bounty.listBountyDoubts.useQuery({
        bountyId: Number(bountyId),
    })
    const [selectedDoubt, setSelectedDoubt] = useState<BountyDoubtListItem | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    const filteredDoubts = listBountyDoubt?.filter(
        (item) =>
            item.user.id.toLowerCase().includes(searchTerm.toLowerCase()) ??
            item.user.email?.toLowerCase().includes(searchTerm.toLowerCase()),
    )

    const handleDialogSelect = (item: BountyDoubtListItem) => {
        setIsDialogOpen(false)
    }

    if (!listBountyDoubt) return null
    console.log(listBountyDoubt)
    return (
        <div className="flex w-full flex-col lg:flex-row ">
            <Tabs className="flex h-full w-full flex-col lg:flex-row" defaultValue={selectedDoubt?.id.toString()}>
                <div className="flex w-full flex-col border-r lg:w-80 ">
                    <div className="flex items-center justify-between p-4">
                        <h2 className="text-lg font-semibold">Chats</h2>
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="icon" variant="outline" className="rounded-full">
                                    <Plus className="h-4 w-4" />
                                    <span className="sr-only">New chat</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>New chat</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <Input
                                        placeholder="Search users..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="mb-4"
                                    />
                                    <ScrollArea className="h-[300px]">
                                        {filteredDoubts?.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    handleDialogSelect(item)
                                                    setSelectedDoubt(item)

                                                }}
                                                className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent cursor-pointer"
                                            >
                                                <CustomAvatar url={item.user.image} className="h-10 w-10" winnerCount={item.winnerCount} />
                                                <div>
                                                    <p className="font-medium">{addrShort(item.user.id, 5)}</p>
                                                    <p className="text-sm text-muted-foreground">{item.user.email ?? "No email"}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </ScrollArea>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <div className="px-4 pb-4 hidden lg:block">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search chats"
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <TabsList className="lg:flex h-[calc(100vh-30vh)]  hidden flex-col items-start justify-start gap-2 overflow-auto px-2">
                        {filteredDoubts?.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center">
                                <p className="text-center text-lg font-medium text-muted-foreground">No chats available</p>
                            </div>
                        ) : (
                            filteredDoubts?.map((item) => (
                                <TabsTrigger
                                    key={item.id}
                                    value={item.id.toString()}
                                    onClick={() => setSelectedDoubt(item)}
                                    className="flex w-full shadow-sm shadow-slate-300 items-center  justify-start gap-3 rounded-sm p-2 hover:bg-accent"
                                >
                                    <CustomAvatar url={item.user.image} className="h-10 w-10" winnerCount={item.winnerCount} />
                                    <div className="flex flex-col items-start overflow-hidden">
                                        <p className="font-medium">{addrShort(item.user.id, 5)}</p>
                                        <p className="w-full truncate text-sm text-muted-foreground">{item.user.email ?? "No email"}</p>
                                    </div>
                                </TabsTrigger>
                            ))
                        )}
                    </TabsList>
                </div>
                <div className="flex-1">
                    {!selectedDoubt ? (
                        <div className="flex h-full items-center justify-center">
                            <p className="text-center text-lg font-medium text-muted-foreground">
                                Select a chat or start a new conversation
                            </p>
                        </div>
                    ) : (
                        <TabsContent value={selectedDoubt.id.toString()} className="mt-0 h-full border-none p-0">
                            <ChatItem item={selectedDoubt} />
                        </TabsContent>
                    )}
                    {
                        selectedDoubt && <div className="block lg:hidden">
                            <ChatItem item={selectedDoubt} />
                        </div>
                    }
                </div>
            </Tabs>
        </div>
    )
}

const ChatItem = ({ item }: { item: BountyDoubtListItem }) => {
    console.log(item)
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState<boolean>(false)
    const messagesEndRef: MutableRefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null)
    const [media, setMedia] = useState<SubmissionMediaInfoType[]>([])
    const [progress, setProgress] = useState<number>(0)
    const [uploadingFile, setUploadingFile] = useState<File | null>(null)
    const inputLength = input.trim().length
    const { data: oldMessage, isSuccess: oldMessageSucess } = api.bounty.Bounty.getBountyForUserCreator.useQuery({
        bountyId: Number(item.bountyId),
        userId: item.userId,
    })
    const removeMediaItem = (index: number) => {
        setMedia((prevMedia) => prevMedia.filter((_, i) => i !== index))
    }
    const addMediaItem = (url: string, name: string, size: number, type: string) => {
        setMedia((prevMedia) => [...prevMedia, { url, name, size, type }])
    }
    const utils = api.useUtils()
    const NewMessageMutation = api.bounty.Bounty.createUpdateBountyDoubtForCreatorAndUser.useMutation()

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        // Ensure that there is either a message or media to send
        if (input.length === 0 && media.length === 0) return

        try {
            // Construct the message payload
            const messagePayload = {
                chatUserId: item.userId,
                bountyId: Number(item.bountyId),
                content: input, // Text message
                role: UserRole.CREATOR,
                media: media.length > 0 ? media : undefined,
            }

            // Make the API call to submit the message along with media
            const newMessage = await NewMessageMutation.mutateAsync(messagePayload)

            // Update the local messages state to include the new message
            setMessages((prevMessages: Message[]) => [...prevMessages, { role: UserRole.CREATOR, message: input }])

            // Clear input and media after submission
            setInput("")
            setMedia([])
        } catch (error) {
            console.error("Error sending message with media:", error)
            toast({
                title: "Error sending message",
                description: "An error occurred while sending your message. Please try again.",

            })
        }
    }

    useEffect(() => {
        if (oldMessage && oldMessageSucess) {
            setMessages(oldMessage)
        }
    }, [oldMessage, oldMessageSucess])

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }

    // Call scrollToBottom on initial render and whenever new content is added
    useEffect(() => {
        scrollToBottom()
    }, [messages, uploadingFile, media])
    return (
        <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-3 py-3">
                <Avatar>
                    <AvatarImage src={item.user.image ?? ""} alt="User avatar" />
                    <AvatarFallback>{item.user.id.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                    <h2 className="text-lg font-semibold">{addrShort(item.user.id, 5)}</h2>
                    <p className="text-sm text-muted-foreground">{item.user.email ?? "No email"}</p>
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[calc(100vh-30vh)] relative">
                    <div className="flex flex-col gap-4 p-4 ">
                        {messages?.map((message, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "flex max-w-[65%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                                    message.role === UserRole.CREATOR ? "ml-auto bg-primary " : "bg-muted",
                                )}
                            >
                                {sanitizeInput(message.message).sanitizedInput}
                                {sanitizeInput(message.message).urls?.map((url, index) => (
                                    <Link
                                        key={index}
                                        href={url}
                                        className="flex items-center gap-2 rounded-md bg-background/10 p-2 text-xs"
                                    >
                                        <Paperclip className="h-4 w-4" />
                                        <span className="truncate">{shortURL(url)}</span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                        <div className="grid grid-cols-6 gap-2   absolute -bottom-8">
                            {media.map((item, index) => (
                                <div
                                    key={index}
                                    className="ml-auto flex max-w-[75%] items-center justify-between gap-2 rounded-md bg-primary p-2 "
                                >
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate text-xs">{shortFileName(item.name)}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-full p-0"
                                        onClick={() => removeMediaItem(index)}
                                    >
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {uploadingFile && (
                            <div className="ml-auto flex max-w-[75%] flex-col gap-2 rounded-md bg-primary p-2 ">
                                <div className="flex items-center justify-between">
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate text-xs">{shortFileName(uploadingFile.name)}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-full p-0"
                                        onClick={() => setUploadingFile(null)}
                                    >
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-primary-foreground/20">
                                    <div
                                        className="h-full bg-primary-foreground transition-all duration-300 ease-in-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter className="">
                <form onSubmit={handleSubmit} className="flex w-full items-center gap-1 space-x-2 ">
                    <MultiUploadS3Button
                        variant="input"
                        className="w-10 sahd"
                        endpoint="multiBlobUploader"
                        onUploadProgress={(progress) => setProgress(progress)}
                        onClientUploadComplete={(res) => {
                            toast({
                                title: "Upload complete",
                                description: "File uploaded successfully",
                            })
                            setUploadingFile(null)
                            const data = res[0]
                            if (data?.url) {
                                addMediaItem(data.url, data.name, data.size, data.type)
                            }
                            setLoading(false)
                        }}
                        onUploadError={(error: Error) => {
                            setLoading(false)
                            toast({
                                title: "Upload failed",
                                description: "An error occurred while uploading the file",
                            })
                        }}
                    />


                    <div className="flex w-full gap-2">
                        <Input
                            id="message"
                            placeholder="Type your message..."
                            className="w-full shadow-sm shadow-slate-300"
                            autoComplete="off"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            className="shadow-sm shadow-black"
                            disabled={loading || input.trim().length === 0 || NewMessageMutation.isLoading}
                        >
                            {NewMessageMutation.isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                                >
                                    <Loader2 className="h-4 w-4" />
                                </motion.div>
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                            <span className="sr-only">Send</span>
                        </Button>
                    </div>
                </form>
            </CardFooter>
        </Card>
    )
}

const shortFileName = (fileName: string) => {
    const shortFileName = fileName.split(".")[0]
    const extension = fileName.split(".")[1]
    if (shortFileName && shortFileName.length > 20) {
        return `${shortFileName?.slice(0, 20)}...${extension}`
    }
    return fileName
}

const shortURL = (url: string) => {
    if (url.length > 30) {
        return `${url.slice(0, 30)}...`
    }
    return url
}

function sanitizeInput(input: string) {
    // Updated regex to match more general URL formats (handling more complex domains and paths)
    const regex = /https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[^\s]*)?/g

    // Find all matching URLs
    const urlMatches = input.match(regex) ?? []

    // Remove all URLs from the input string
    const sanitizedInput = input.replace(regex, "").trim()

    console.log("Sanitized Input:", sanitizedInput)
    console.log("Matched URLs:", urlMatches)

    return {
        sanitizedInput,
        urls: urlMatches.length ? urlMatches : null,
    }
}





export default Chat

