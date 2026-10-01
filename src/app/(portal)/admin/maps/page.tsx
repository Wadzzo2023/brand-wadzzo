import { Suspense } from "react";

import Page from "~/features/admin/maps-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "All maps" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
