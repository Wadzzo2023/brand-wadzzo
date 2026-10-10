"use client";

import { useState } from "react";
import toast from "react-hot-toast";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { CenteredSpinner } from "~/ui/spinner";
import { api } from "~/utils/api";

import { HomeAreaEditor, type Area } from "./home-area-editor";

/** Settings › Home area: where the brand operates; the map assistant searches here by default. */
export function HomeAreaTab() {
  const utils = api.useUtils();
  const layers = api.homeArea.brand.useQuery({});
  const save = api.homeArea.saveBrand.useMutation({
    onSuccess: (_, v) => {
      toast.success(v.area ? "Home area saved" : "Using your platform's area again");
      void utils.homeArea.brand.invalidate();
      void utils.agent.overview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (layers.isPending) return <CenteredSpinner />;
  if (layers.isError) return <ErrorState message={layers.error.message} onRetry={() => void layers.refetch()} />;
  const { own, platform, platformName } = layers.data;

  return (
    <div className="max-w-3xl space-y-3">
      <div>
        <h2 className="font-hud text-lg font-semibold">Home area</h2>
        <p className="text-sm text-muted-foreground">Where you operate. The map assistant searches here unless you name another place.</p>
      </div>
      <HomeAreaEditor
        current={own}
        fallback={platform ? { area: platform, label: `${platformName}'s default area · set your own to use a different one` } : null}
        onSave={(area: Area | null) => save.mutateAsync({ area })}
        removeLabel={platform ? `Remove and use ${platformName}'s default` : "Remove area"}
        emptyText="Not set — the assistant will ask where to search"
      />
    </div>
  );
}

/** Admin › Home area: the default area for every brand of a platform. */
export function HomeAreaAdminPage() {
  const { isSuperAdmin } = usePortalAccess();
  const [platformId, setPlatformId] = useState<string | undefined>(undefined);
  const options = api.admin.platforms.options.useQuery(undefined, { enabled: isSuperAdmin, refetchOnWindowFocus: false });
  const utils = api.useUtils();
  const platform = api.homeArea.platform.useQuery({ platformId });
  const save = api.homeArea.savePlatform.useMutation({
    onSuccess: (_, v) => {
      toast.success(v.area ? "Default area saved" : "Default area removed");
      void utils.homeArea.platform.invalidate();
      void utils.agent.overview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <PageBody>
      <PageHeader
        eyebrow="Admin"
        title="Home area"
        description="The default area for every brand on the platform: the map assistant searches here unless a brand sets its own area or names another place."
        actions={
          isSuperAdmin && options.data ? (
            <Select value={platformId ?? platform.data?.id} onValueChange={setPlatformId}>
              <SelectTrigger className="w-48" aria-label="Platform">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                {options.data.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />
      {platform.isPending ? (
        <CenteredSpinner />
      ) : platform.isError ? (
        <ErrorState message={platform.error.message} onRetry={() => void platform.refetch()} />
      ) : (
        <HomeAreaEditor
          key={platform.data.id}
          current={platform.data.area}
          onSave={(area) => save.mutateAsync({ platformId: platform.data.id, area })}
          removeLabel="Remove default area"
          emptyText={`${platform.data.name} has no default — brands without their own area will be asked where to search`}
        />
      )}
    </PageBody>
  );
}
