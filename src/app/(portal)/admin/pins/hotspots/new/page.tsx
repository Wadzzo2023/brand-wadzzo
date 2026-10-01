import { Suspense } from "react";

import AdminNewHotspotPage from "~/features/admin/new-hotspot-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "New hotspot (Admin)" };

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <AdminNewHotspotPage />
    </Suspense>
  );
}
