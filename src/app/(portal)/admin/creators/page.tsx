import { Suspense } from "react";

import Page from "~/features/admin/creators-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Creators" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
