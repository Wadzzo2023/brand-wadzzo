import { Suspense } from "react";

import Page from "~/features/admin/admins-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Admins" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
