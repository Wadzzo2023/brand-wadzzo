import { Suspense } from "react";

import Page from "~/features/bounties/bounty-detail-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Bounty" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
