import { Suspense } from "react";

import Page from "~/features/embeds/embeds-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Website Map" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
