import { Suspense } from "react";

import Page from "~/features/settings/settings-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Settings" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
