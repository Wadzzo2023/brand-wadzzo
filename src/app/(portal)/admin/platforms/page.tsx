import { Suspense } from "react";

import Page from "~/features/admin/platforms-page";
import { SuperAdminOnly } from "~/features/admin/super-admin-only";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Platforms" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </Suspense>
  );
}
