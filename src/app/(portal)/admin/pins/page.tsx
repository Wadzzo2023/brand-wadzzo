import { Suspense } from "react";

import Page from "~/features/admin/pins-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Pin review" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
