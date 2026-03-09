import { Client } from "@upstash/qstash"
import { env } from "~/env"

// Initialize QStash client for background jobs
export const qstash = new Client({
    token: env.QSTASH_TOKEN,
})



