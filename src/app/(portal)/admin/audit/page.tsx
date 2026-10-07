import { Suspense } from "react";

import Page from "~/features/admin/audit-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Audit log" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
