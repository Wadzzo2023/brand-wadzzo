import { cn } from "~/lib/utils"
import { Button } from "../shadcn/ui/button"
import { useState } from "react"

interface CommentFormatterProps {
    content: string
    maxLength?: number
    className?: string
}

function formatLinks(text: string) {
    // URL pattern
    const urlPattern = /https?:\/\/[^\s]+/g

    return text.split(urlPattern).reduce((arr, part, i, parts) => {
        if (i < parts.length - 1) {
            const match = text.match(urlPattern)?.[i]
            arr.push(
                part,
                <a
                    key={i}
                    href={match}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                >
                    {match}
                </a>
            )
        } else {
            arr.push(part)
        }
        return arr
    }, [] as (string | JSX.Element)[])
}



export function CommentFormatter({ content, maxLength = 250, className }: CommentFormatterProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Process the content
    const lines = content.split('\n')
    const shouldTruncate = content.length > maxLength && !isExpanded
    const displayContent = shouldTruncate
        ? content.slice(0, maxLength) + '...'
        : content

    // Format links and mentions
    const formattedContent = formatLinks(displayContent)

    return (
        <div className={cn("space-y-1", className)}>
            <div className="whitespace-pre-line text-sm">
                {formattedContent}
            </div>
            {content.length > maxLength && (
                <Button
                    variant="link"
                    className="h-auto p-0 text-muted-foreground text-xs font-normal"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? "See less" : "See more"}
                </Button>
            )}
        </div>
    )
}


