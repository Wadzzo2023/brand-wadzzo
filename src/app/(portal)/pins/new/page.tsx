import { Suspense } from "react";

import NewPinPage from "~/features/pins/new-pin-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "New pin" };

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <NewPinPage />
    </Suspense>
  );
}
