import { Suspense } from "react";

import AdminNewPinPage from "~/features/admin/new-pin-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "New pin (Admin)" };

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <AdminNewPinPage />
    </Suspense>
  );
}
