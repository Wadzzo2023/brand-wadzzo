import { Suspense } from "react";

import Page from "~/features/onboarding/onboarding-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Set up your brand" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
