import { Suspense } from "react";

import Page from "~/features/admin/audit-page";
import { SuperAdminOnly } from "~/features/admin/super-admin-only";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Audit log" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </Suspense>
  );
}
