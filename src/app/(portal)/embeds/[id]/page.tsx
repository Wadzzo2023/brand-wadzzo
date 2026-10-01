import { Suspense } from "react";

import Page from "~/features/embeds/embed-editor-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Website Map editor" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
