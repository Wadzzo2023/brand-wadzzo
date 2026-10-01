import { Suspense } from "react";

import PinManagementPage from "~/features/pins/list-view";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Pin management" };

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <PinManagementPage />
    </Suspense>
  );
}
