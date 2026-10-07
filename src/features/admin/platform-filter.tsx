"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { api } from "~/utils/api";

const ALL = "__all";

/**
 * Wadzzo admins: narrow an admin list to one platform (undefined = every
 * platform). Renders nothing for a sub-platform's admins — their lists are
 * already limited to their own platform by the server.
 */
export function PlatformFilter({ value, onChange }: { value?: string; onChange: (platformId: string | undefined) => void }) {
  const { isSuperAdmin } = usePortalAccess();
  const options = api.admin.platforms.options.useQuery(undefined, { enabled: isSuperAdmin, refetchOnWindowFocus: false });
  if (!isSuperAdmin) return null;

  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="w-full sm:w-48" aria-label="Platform">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All platforms</SelectItem>
        {options.data?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
