/** `Date` → the value a `<input type="datetime-local">` expects, in local time. */
export function toLocalInput(d: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The reverse; null for an empty or unparsable input. */
export function fromLocalInput(v: string) {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
}

/** A readable message out of a tRPC error, preferring the first zod issue. */
export function firstError(error: {
    message: string
    data?: { zodError?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] } | null } | null
}) {
    const z = error.data?.zodError
    const field = z?.fieldErrors && Object.values(z.fieldErrors).find((v) => v?.length)?.[0]
    return field ?? z?.formErrors?.[0] ?? error.message
}
